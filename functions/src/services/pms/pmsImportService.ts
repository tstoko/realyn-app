/**
 * PMS Import Service
 *
 * Orchestrates the full file import flow: detect format → parse → sanitize →
 * match → store.  Supports CSV, XML, and delimited (pipe/tab/semicolon) files.
 * This is the backend service called by the Cloud Function handler.
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {XMLParser} from "fast-xml-parser";
import {OperaCSVParser} from "./parsers/operaCsvParser";
import {OperaXMLParser} from "./parsers/operaXmlParser";
import {parseCSVBuffer} from "./parsers/csvUtils";
import {detectDelimiter, parseDelimitedBuffer} from "./parsers/delimitedUtils";
import {sanitizeRowValues} from "./sanitizer";
import type {PMSParser} from "./parsers/types";
import type {
  PMSImportDocument,
  PMSReservationDocument,
  PMSFolio,
  PMSActivityLog,
  PMSSource,
} from "../../types/pmsData";
import {logOrgAuditEvent} from "../../utils/orgAuditLogger";

// Available parsers (add new PMS parsers here)
const PARSERS: PMSParser[] = [new OperaXMLParser(), new OperaCSVParser()];

export interface ImportSummary {
  importId: string;
  source: PMSSource;
  fileHash: string;
  reservationCount: number;
  folioCount: number;
  activityLogCount: number;
  warnings: string[];
  rowsParsed: number;
  rowsSkipped: number;
}

/**
 * Detect which parser handles the given headers.
 */
function detectParser(headers: string[]): PMSParser | null {
  for (const parser of PARSERS) {
    if (parser.canParse(headers)) return parser;
  }
  return null;
}

/**
 * Process a raw file buffer: detect format, parse, sanitize, store in Firestore.
 */
export async function processFileImport(
    organizationId: string,
    fileBuffer: Buffer,
    fileName: string,
    uploadedBy: string,
): Promise<ImportSummary> {
  const db = admin.firestore();

  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  console.log(`[PMSImport] Org: ${organizationId}, File: ${fileName}, Hash: ${fileHash.substring(0, 12)}...`);

  // Check for duplicate import
  const existingImport = await db
      .collection("organizations")
      .doc(organizationId)
      .collection("pmsImports")
      .where("fileHash", "==", fileHash)
      .limit(1)
      .get();

  if (!existingImport.empty) {
    console.log(`[PMSImport] Duplicate file detected (hash: ${fileHash.substring(0, 12)}), skipping`);
    const existing = existingImport.docs[0].data() as PMSImportDocument;
    return {
      importId: existing.id,
      source: existing.source,
      fileHash,
      reservationCount: existing.reservationCount,
      folioCount: existing.folioCount,
      activityLogCount: existing.activityLogCount,
      warnings: ["This file has already been imported."],
      rowsParsed: existing.rowsParsed,
      rowsSkipped: existing.rowsSkipped,
    };
  }

  // ---- Format detection ----
  let headers: string[];
  let rows: string[][];
  const text = fileBuffer.toString("utf-8").trimStart();

  if (text.startsWith("<?xml") || /^<[a-zA-Z]/.test(text)) {
    // XML format
    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
    });
    const xmlData = xmlParser.parse(text);
    const operaXml = PARSERS.find((p) => p.pmsType === "opera_xml") as OperaXMLParser | undefined;
    if (operaXml) {
      operaXml.setParsedXML(xmlData);
    }
    headers = ["__XML__"];
    rows = [];
  } else {
    const delimiter = detectDelimiter(text);
    if (delimiter !== ",") {
      ({headers, rows} = parseDelimitedBuffer(fileBuffer));
    } else {
      ({headers, rows} = parseCSVBuffer(fileBuffer));
    }
  }

  const isXml = headers.length === 1 && headers[0] === "__XML__";

  if (!isXml && (headers.length === 0 || rows.length === 0)) {
    throw new Error("File is empty or has no data rows");
  }

  if (!isXml) {
    console.log(`[PMSImport] Parsed ${rows.length} rows, ${headers.length} columns`);
  } else {
    console.log(`[PMSImport] Detected XML format`);
  }

  // Detect parser
  const parser = detectParser(headers);
  if (!parser) {
    throw new Error(
      isXml ?
        "Unrecognised XML format. Expected OPERA Cloud XML export." :
        `Unrecognised file format. Headers: [${headers.slice(0, 5).join(", ")}...]. ` +
          "Expected Opera PMS export columns.",
    );
  }
  console.log(`[PMSImport] Detected format: ${parser.pmsType}`);

  // Sanitize rows (PAN stripping) before parsing — only for tabular data
  let sanitizedRows = rows;
  if (!isXml) {
    sanitizedRows = rows.map((row) => {
      const rowObj: Record<string, string> = {};
      headers.forEach((h, i) => {
        rowObj[h] = row[i] || "";
      });
      const sanitized = sanitizeRowValues(rowObj);
      return headers.map((h) => sanitized[h] || "");
    });
  }

  // Parse data
  const reservations = parser.parseReservations(headers, sanitizedRows);
  const folios = parser.parseFolios(headers, sanitizedRows);
  const activityLogs = parser.parseActivityLogs(headers, sanitizedRows);

  const rowsSkipped = isXml ?
    0 :
    rows.length - Math.max(reservations.length, folios.length, activityLogs.length);

  const warnings: string[] = [];
  if (reservations.length === 0 && folios.length === 0 && activityLogs.length === 0) {
    warnings.push("No data could be extracted from the file. Check that the format matches an Opera export.");
  }

  console.log(
      `[PMSImport] Extracted: ${reservations.length} reservations, ` +
    `${folios.length} folios, ${activityLogs.length} activity logs`,
  );

  // Store in Firestore
  const sourceType = parser.pmsType as PMSSource["type"];
  const source: PMSSource = {type: sourceType, fileName};
  const importId = db.collection("organizations").doc(organizationId).collection("pmsImports").doc().id;

  const importDoc: PMSImportDocument = {
    id: importId,
    source,
    fileHash,
    importedAt: new Date(),
    importedBy: uploadedBy,
    reservationCount: reservations.length,
    folioCount: folios.length,
    activityLogCount: activityLogs.length,
    warnings,
    rowsParsed: isXml ? 0 : rows.length,
    rowsSkipped: Math.max(0, rowsSkipped),
  };

  const batch = db.batch();

  batch.set(
      db.collection("organizations").doc(organizationId).collection("pmsImports").doc(importId),
      importDoc,
  );

  // Store reservations (indexed by confirmation number)
  const folioMap = new Map<string, PMSFolio>();
  for (const f of folios) {
    folioMap.set(f.confirmationNumber, f);
  }

  const logsByConfirmation = new Map<string, PMSActivityLog[]>();
  for (const log of activityLogs) {
    if (log.confirmationNumber) {
      const existing = logsByConfirmation.get(log.confirmationNumber) || [];
      existing.push(log);
      logsByConfirmation.set(log.confirmationNumber, existing);
    }
  }

  for (const reservation of reservations) {
    const resDoc: PMSReservationDocument = {
      reservation,
      folio: folioMap.get(reservation.confirmationNumber),
      activityLogs: logsByConfirmation.get(reservation.confirmationNumber) || [],
      sourceImportId: importId,
      importedAt: new Date(),
      organizationId,
    };

    batch.set(
        db.collection("organizations").doc(organizationId)
            .collection("pmsReservations").doc(reservation.confirmationNumber),
        resDoc,
    );
  }

  // Store folios that don't have matching reservations (standalone folio export)
  for (const folio of folios) {
    if (!reservations.some((r) => r.confirmationNumber === folio.confirmationNumber)) {
      const resDocRef = db.collection("organizations").doc(organizationId)
          .collection("pmsReservations").doc(folio.confirmationNumber);
      const existing = await resDocRef.get();
      if (existing.exists) {
        batch.update(resDocRef, {folio, sourceImportId: importId});
      }
    }
  }

  // Update organization PMS integration metadata
  batch.update(db.collection("organizations").doc(organizationId), {
    "pmsIntegration.type": sourceType,
    "pmsIntegration.lastImportAt": FieldValue.serverTimestamp(),
    "pmsIntegration.lastImportId": importId,
    "pmsIntegration.reservationCount": FieldValue.increment(reservations.length),
    "updatedAt": FieldValue.serverTimestamp(),
  });

  await batch.commit();
  console.log(`[PMSImport] Stored import ${importId} with ${reservations.length} reservations`);

  await logOrgAuditEvent(organizationId, {
    action: "pms_file_import",
    actor: {type: "user", userId: uploadedBy},
    details: {
      importId,
      fileName,
      source: sourceType,
      reservationCount: reservations.length,
      folioCount: folios.length,
      activityLogCount: activityLogs.length,
    },
    status: "success",
  });

  return {
    importId,
    source,
    fileHash,
    reservationCount: reservations.length,
    folioCount: folios.length,
    activityLogCount: activityLogs.length,
    warnings,
    rowsParsed: isXml ? 0 : rows.length,
    rowsSkipped: Math.max(0, rowsSkipped),
  };
}

/** Backward-compatible alias. */
export const processCSVImport = processFileImport;
