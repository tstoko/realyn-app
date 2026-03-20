/**
 * PMS Lookup Service
 *
 * Queries Firestore for CSV-imported PMS data and matches it against disputes.
 * When OPERA Cloud (OHIP) is configured, tries the live API first for fresher
 * data, then falls back to CSV-imported Firestore data.
 * Results are cached on the dispute document to avoid repeated lookups.
 */

import * as admin from "firebase-admin";
import {findBestMatches, isAmbiguousMatch, type DisputeMatchInput} from "./disputeMatcher";
import type {PMSReservationDocument, PMSReservation, PMSFolio, PMSActivityLog} from "../../types/pmsData";
import {OperaCloudClient} from "../../integrations/operaCloud/operaClient";
import {fetchReservationEvidence, fetchFolioEvidence} from "../../integrations/operaCloud/operaEvidence";
import type {OperaCloudConfig} from "../../integrations/operaCloud/types";

export interface PMSMatchResult {
  reservation: PMSReservation;
  folio?: PMSFolio;
  activityLogs: PMSActivityLog[];
  confidence: number;
  confirmationNumber: string;
  source: "operaCloud" | "operaExport";
  ambiguous?: boolean;
}

/**
 * Find the best PMS match for a dispute. Checks cache first, tries OPERA Cloud
 * OHIP API if configured, then falls back to CSV-imported Firestore data.
 */
export async function findPMSMatchForDispute(
    disputeId: string,
    organizationId: string,
    disputeData: {
    amount?: number;
    currency?: string;
    pspTransactionDate?: any;
    pspLast4Digits?: string;
    customerName?: string;
    guestName?: string;
    confirmationNumber?: string;
    reservationId?: string;
  },
): Promise<PMSMatchResult | null> {
  const db = admin.firestore();

  // Check cache on the dispute document
  const disputeDoc = await db.collection("disputes").doc(disputeId).get();
  const dispute = disputeDoc.data();
  if (dispute?.pmsMatch) {
    console.log(`[PMSLookup] Using cached PMS match for dispute ${disputeId}`);
    return dispute.pmsMatch as PMSMatchResult;
  }

  // Try OPERA Cloud (OHIP) first if configured
  const operaResult = await findOperaCloudMatch(
      disputeId,
      organizationId,
      disputeData.confirmationNumber || disputeData.reservationId,
  );
  if (operaResult) {
    await cacheMatchResult(db, disputeId, operaResult);
    return operaResult;
  }

  // Fall back to CSV-imported Firestore data
  return findFirestoreMatch(db, disputeId, organizationId, disputeData);
}

/**
 * Try to match via OPERA Cloud OHIP API using direct reservation lookup.
 * Returns null if OHIP is not configured or lookup fails (non-blocking).
 */
async function findOperaCloudMatch(
    disputeId: string,
    organizationId: string,
    confirmationNumber?: string,
): Promise<PMSMatchResult | null> {
  if (!confirmationNumber) return null;

  const db = admin.firestore();
  const orgDoc = await db.collection("organizations").doc(organizationId).get();
  const orgData = orgDoc.data();
  const config = orgData?.operaCloudIntegration as OperaCloudConfig | undefined;

  if (!config || config.status !== "connected") return null;

  const hotelCode = config.hotelCodes?.[0];
  if (!hotelCode) return null;

  try {
    console.log(
        `[PMSLookup] Trying OPERA Cloud lookup for dispute ${disputeId}, ` +
      `confirmation=${confirmationNumber}, hotel=${hotelCode}`,
    );

    const client = new OperaCloudClient(config);
    const [reservation, folio] = await Promise.all([
      fetchReservationEvidence(client, hotelCode, confirmationNumber),
      fetchFolioEvidence(client, hotelCode, confirmationNumber).catch(() => undefined),
    ]);

    console.log(
        `[PMSLookup] OPERA Cloud match found: confirmation=${reservation.confirmationNumber}, ` +
      `guest=${reservation.guestName}`,
    );

    return {
      reservation,
      folio,
      activityLogs: [],
      confidence: 100,
      confirmationNumber: reservation.confirmationNumber,
      source: "operaCloud",
    };
  } catch (err) {
    console.error(
        `[PMSLookup] OPERA Cloud lookup failed for dispute ${disputeId}:`,
        (err as Error).message,
    );
    return null;
  }
}

/**
 * Match against CSV-imported PMS data in Firestore.
 */
async function findFirestoreMatch(
    db: admin.firestore.Firestore,
    disputeId: string,
    organizationId: string,
    disputeData: {
    amount?: number;
    currency?: string;
    pspTransactionDate?: any;
    pspLast4Digits?: string;
    customerName?: string;
    guestName?: string;
    confirmationNumber?: string;
    reservationId?: string;
  },
): Promise<PMSMatchResult | null> {
  const reservationsSnapshot = await db
      .collection("organizations")
      .doc(organizationId)
      .collection("pmsReservations")
      .get();

  if (reservationsSnapshot.empty) {
    console.log(`[PMSLookup] No PMS reservations found for org ${organizationId}`);
    return null;
  }

  const matchInput: DisputeMatchInput = {
    amount: disputeData.amount || 0,
    currency: disputeData.currency || "USD",
    transactionDate: formatTimestamp(disputeData.pspTransactionDate),
    cardLast4: disputeData.pspLast4Digits,
    guestName: disputeData.customerName || disputeData.guestName,
    confirmationNumber: disputeData.confirmationNumber || disputeData.reservationId,
  };

  const reservations: PMSReservation[] = [];
  const folios: PMSFolio[] = [];
  const activityLogMap = new Map<string, PMSActivityLog[]>();

  for (const doc of reservationsSnapshot.docs) {
    const data = doc.data() as PMSReservationDocument;
    if (data.reservation) {
      reservations.push(data.reservation);
    }
    if (data.folio) {
      folios.push(data.folio);
    }
    if (data.activityLogs && data.activityLogs.length > 0) {
      activityLogMap.set(data.reservation.confirmationNumber, data.activityLogs);
    }
  }

  console.log(`[PMSLookup] Matching dispute ${disputeId} against ${reservations.length} reservations`);

  const candidates = findBestMatches(matchInput, reservations, folios);

  if (candidates.length === 0) {
    console.log(`[PMSLookup] No match found for dispute ${disputeId}`);
    return null;
  }

  const best = candidates[0];
  console.log(
      `[PMSLookup] Best match: confirmation=${best.reservation.confirmationNumber}, ` +
    `confidence=${best.confidence}, signals=${best.signals.filter((s) => s.matched).map((s) => s.field).join(",")}`,
  );

  const ambiguous = isAmbiguousMatch(candidates);
  if (ambiguous) {
    console.log(
        `[PMSLookup] Ambiguous match for dispute ${disputeId}: ` +
      `top=${best.confidence}, runner-up=${candidates[1].confidence}`,
    );
  }

  const result: PMSMatchResult = {
    reservation: best.reservation,
    folio: best.folio,
    activityLogs: activityLogMap.get(best.reservation.confirmationNumber) || [],
    confidence: best.confidence,
    confirmationNumber: best.reservation.confirmationNumber,
    source: "operaExport",
    ambiguous,
  };

  await cacheMatchResult(db, disputeId, result);
  return result;
}

async function cacheMatchResult(
    db: admin.firestore.Firestore,
    disputeId: string,
    result: PMSMatchResult,
): Promise<void> {
  try {
    await db.collection("disputes").doc(disputeId).update({
      pmsMatch: result,
      pmsMatchedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn(`[PMSLookup] Failed to cache PMS match on dispute ${disputeId}:`, err);
  }
}

/**
 * Convert various timestamp formats to ISO date string.
 */
function formatTimestamp(ts: any): string | undefined {
  if (!ts) return undefined;
  if (ts.toDate) return ts.toDate().toISOString().split("T")[0]; // Firestore Timestamp
  if (ts instanceof Date) return ts.toISOString().split("T")[0];
  if (typeof ts === "string") return ts.split("T")[0];
  return undefined;
}
