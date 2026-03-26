/**
 * Evidence Auto-Collector
 *
 * After the AI evidence plan is generated, this service checks if PMS data
 * (from OPERA Cloud OHIP API or CSV/XML/delimited file imports) can fulfil
 * any of the requirements. For each fulfillable item it generates a formatted
 * PDF, uploads it to Firebase Storage, and marks the evidence item as
 * "uploaded".
 *
 * The existing lifecycle transition logic in evidencePlanningService.ts
 * automatically advances the dispute to draft_ready once all required
 * items are filled, triggering AI argument generation.
 */

import * as admin from "firebase-admin";
import {findPMSMatchForDispute, type PMSMatchResult} from "./pmsLookupService";
import {
  generateFolioPDF,
  generateCheckInOutPDF,
  generateActivityLogPDF,
  generateEvidencePacketPDF,
} from "./pdfGenerator";
import {updateEvidenceItemStatus} from "../ai/evidencePlanningService";
import {registerEvidenceFile} from "../evidenceService";
import {createSystemAuditEntry, createErrorAuditEntry} from "../../utils/auditTrailHelper";
import type {EvidencePlan, EvidenceItem, EvidenceRequirement} from "../../types/aiDispute";

// Tags that can be auto-fulfilled from PMS CSV data
const AUTO_FULFILLABLE_TAGS: Record<string, (match: PMSMatchResult) => boolean> = {
  folio: (m) => !!m.folio,
  reservation_folio: (m) => !!m.folio,
  checkin_checkout_records: (m) => !!m.reservation,
  registration_card: () => false, // Physical document, cannot auto-fill
  keycard_logs: (m) => m.activityLogs.some((l) => l.action.includes("key")),
  authorization_records: (m) => !!m.folio?.lines.some((l) => l.category === "payment"),
  guest_activity_log: (m) => m.activityLogs.length > 0,
};

// Categories that hint at PMS-fulfillable requirements
const PMS_FULFILLABLE_LABELS: Record<string, (match: PMSMatchResult) => boolean> = {
  "folio": (m) => !!m.folio,
  "invoice": (m) => !!m.folio,
  "check-in": (m) => !!m.reservation,
  "check-out": (m) => !!m.reservation,
  "reservation": (m) => !!m.reservation,
  "activity log": (m) => m.activityLogs.length > 0,
};

export interface AutoCollectResult {
  disputeId: string;
  itemsFulfilled: string[];
  itemsSkipped: string[];
  errors: string[];
}

/**
 * Auto-collect evidence from PMS CSV data for a given dispute.
 * Called after evidence plan generation (Step 8 in the pipeline).
 */
export async function autoCollectFromPMS(
    disputeId: string,
    organizationId: string,
    plan: EvidencePlan,
    evidenceItems: EvidenceItem[],
): Promise<AutoCollectResult> {
  const result: AutoCollectResult = {
    disputeId,
    itemsFulfilled: [],
    itemsSkipped: [],
    errors: [],
  };

  // Look up PMS match for this dispute
  const disputeDoc = await admin.firestore().collection("disputes").doc(disputeId).get();
  const disputeData = disputeDoc.data();
  if (!disputeData) {
    result.errors.push("Dispute document not found");
    return result;
  }

  const pmsMatch = await findPMSMatchForDispute(disputeId, organizationId, {
    amount: disputeData.amount,
    currency: disputeData.currency,
    pspTransactionDate: disputeData.pspTransactionDate,
    pspLast4Digits: disputeData.pspLast4Digits,
    customerName: disputeData.customerName || disputeData.guestName,
    confirmationNumber: disputeData.confirmationNumber || disputeData.reservationId,
  });

  if (!pmsMatch) {
    console.log(`[AutoCollect] No PMS match for dispute ${disputeId}, skipping auto-collection`);
    return result;
  }

  if (pmsMatch.ambiguous) {
    console.log(`[AutoCollect] Ambiguous PMS match for dispute ${disputeId}, skipping auto-collection`);
    await createSystemAuditEntry(
        disputeId,
        "PMS Match Ambiguous",
        "Multiple reservations matched with similar confidence. Manual review needed.",
        "pms_matching",
        {pmsMatchConfidence: "low"},
    );
    return result;
  }

  console.log(
      `[AutoCollect] Found PMS match for dispute ${disputeId}: ` +
    `confirmation=${pmsMatch.confirmationNumber}, confidence=${pmsMatch.confidence}, source=${pmsMatch.source}`,
  );

  const source = pmsMatch.source || "operaExport";

  // Get hotel name for PDF provenance
  const orgDoc = await admin.firestore().collection("organizations").doc(organizationId).get();
  const hotelName = orgDoc.data()?.name || "Hotel";
  const provenance = {
    hotelName,
    importDate: new Date().toISOString().split("T")[0],
    sourceHashPrefix: pmsMatch.confirmationNumber,
    source,
  };

  // Process each pending evidence item
  for (const item of evidenceItems) {
    if (item.status !== "pending") {
      result.itemsSkipped.push(item.requirementId);
      continue;
    }

    const requirement = plan.requirements.find((r) => r.id === item.requirementId);
    if (!requirement) {
      result.itemsSkipped.push(item.requirementId);
      continue;
    }

    const canFulfill = canAutoFulfill(requirement, pmsMatch);
    if (!canFulfill) {
      result.itemsSkipped.push(item.requirementId);
      continue;
    }

    try {
      const {pdfBuffer, fileName} = await generateEvidencePDF(requirement, pmsMatch, provenance);

      // Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const timestamp = Date.now();
      const basePath = `organizations/${organizationId}/disputes/${disputeId}`;
      const storagePath = `${basePath}/evidence/pms_data/${timestamp}_${fileName}`;

      const file = bucket.file(storagePath);
      await file.save(pdfBuffer, {
        metadata: {
          contentType: "application/pdf",
          metadata: {
            source,
            confirmationNumber: pmsMatch.confirmationNumber,
            confidence: String(pmsMatch.confidence),
          },
        },
      });

      const [signedUrl] = await file.getSignedUrl({action: "read", expires: "2099-12-31"});

      // Register in the evidence subcollection so downstream consumers
      // (getEvidenceFiles, getEnrichedEvidence, PSP mappers) can find it
      const evidenceDocId = await registerEvidenceFile({
        disputeId,
        fileName,
        fileSize: pdfBuffer.length,
        fileType: "application/pdf",
        storagePath,
        downloadURL: signedUrl,
        uploadedBy: "system:pms_auto_collect",
        category: "pms",
        requirementId: requirement.id,
      });

      // Mark the evidence item as uploaded (pass the Firestore doc ID, not the storage path)
      const success = await updateEvidenceItemStatus(
          disputeId,
          requirement.id,
          "uploaded",
          evidenceDocId,
          fileName,
          "system:pms_auto_collect",
          `Auto-collected from PMS data (source: ${source}, ` +
          `confirmation: ${pmsMatch.confirmationNumber}, ` +
          `confidence: ${pmsMatch.confidence}%)`,
      );

      if (success) {
        result.itemsFulfilled.push(requirement.id);
        console.log(`[AutoCollect] Fulfilled evidence item ${requirement.id} for dispute ${disputeId}`);
      } else {
        result.errors.push(`Failed to update status for ${requirement.id}`);
      }
    } catch (err) {
      const msg = `Error fulfilling ${requirement.id}: ${(err as Error).message}`;
      console.error(`[AutoCollect] ${msg}`);
      result.errors.push(msg);
      await createErrorAuditEntry(
          disputeId,
          "PMS Evidence Auto-Collection Failed",
          msg,
          "PMS_AUTO_COLLECT_ERROR",
          (err as Error).message,
      );
    }
  }

  // Generate combined evidence packet as a supplementary artifact
  try {
    const packetBuffer = await generateEvidencePacketPDF(
        pmsMatch.reservation,
        pmsMatch.folio,
        pmsMatch.activityLogs,
        provenance,
    );

    const bucket = admin.storage().bucket();
    const packetTimestamp = Date.now();
    const packetBase = `organizations/${organizationId}/disputes/${disputeId}`;
    const packetPath = `${packetBase}/evidence/pms_data/${packetTimestamp}_EvidencePacket.pdf`;
    const packetFile = bucket.file(packetPath);
    await packetFile.save(packetBuffer, {
      metadata: {
        contentType: "application/pdf",
        metadata: {
          source,
          confirmationNumber: pmsMatch.confirmationNumber,
          type: "evidence_packet",
        },
      },
    });

    const [packetSignedUrl] = await packetFile.getSignedUrl({action: "read", expires: "2099-12-31"});

    // Register the evidence packet in the subcollection so it's visible to
    // AI argument generation and PSP submission
    await registerEvidenceFile({
      disputeId,
      fileName: "EvidencePacket.pdf",
      fileSize: packetBuffer.length,
      fileType: "application/pdf",
      storagePath: packetPath,
      downloadURL: packetSignedUrl,
      uploadedBy: "system:pms_auto_collect",
      category: "pms",
    });

    console.log(`[AutoCollect] Generated and registered evidence packet for dispute ${disputeId}`);
  } catch (err) {
    console.error(`[AutoCollect] Failed to generate evidence packet: ${(err as Error).message}`);
    await createErrorAuditEntry(
        disputeId,
        "Evidence Packet Generation Failed",
        `Failed to generate combined evidence packet: ${(err as Error).message}`,
        "EVIDENCE_PACKET_ERROR",
        (err as Error).message,
    );
  }

  console.log(
      `[AutoCollect] Dispute ${disputeId}: fulfilled=${result.itemsFulfilled.length}, ` +
    `skipped=${result.itemsSkipped.length}, errors=${result.errors.length}`,
  );

  return result;
}

/**
 * Check if a requirement can be auto-fulfilled from PMS data.
 */
function canAutoFulfill(requirement: EvidenceRequirement, match: PMSMatchResult): boolean {
  // Check by tag first (most reliable)
  if (requirement.tag) {
    const tagCheck = AUTO_FULFILLABLE_TAGS[requirement.tag];
    if (tagCheck) return tagCheck(match);
  }

  // Fall back to label-based matching
  const labelLower = requirement.label.toLowerCase();
  for (const [keyword, check] of Object.entries(PMS_FULFILLABLE_LABELS)) {
    if (labelLower.includes(keyword)) {
      return check(match);
    }
  }

  // Check by category
  if (requirement.category === "pms_data") {
    return !!match.reservation;
  }

  return false;
}

/**
 * Generate the appropriate PDF based on the requirement type.
 */
async function generateEvidencePDF(
    requirement: EvidenceRequirement,
    match: PMSMatchResult,
    provenance: { hotelName: string; importDate: string; sourceHashPrefix: string; source?: string },
): Promise<{ pdfBuffer: Buffer; fileName: string }> {
  const tag = requirement.tag || "";
  const labelLower = requirement.label.toLowerCase();

  // Folio / invoice
  const isFolio = tag === "folio" || tag === "reservation_folio" ||
      labelLower.includes("folio") || labelLower.includes("invoice");
  if (isFolio) {
    if (!match.folio) throw new Error("No folio data available");
    const pdfBuffer = await generateFolioPDF(match.folio, provenance);
    return {pdfBuffer, fileName: `Folio_${match.confirmationNumber}.pdf`};
  }

  // Check-in/out records / reservation confirmation
  if (tag === "checkin_checkout_records" || labelLower.includes("check-in") ||
      labelLower.includes("check-out") || labelLower.includes("reservation")) {
    const pdfBuffer = await generateCheckInOutPDF(match.reservation, provenance);
    return {pdfBuffer, fileName: `Reservation_${match.confirmationNumber}.pdf`};
  }

  // Activity log / keycard logs
  if (tag === "keycard_logs" || tag === "guest_activity_log" ||
      labelLower.includes("activity") || labelLower.includes("keycard") || labelLower.includes("key card")) {
    const pdfBuffer = await generateActivityLogPDF(
        match.activityLogs,
        match.confirmationNumber,
        provenance,
    );
    return {pdfBuffer, fileName: `ActivityLog_${match.confirmationNumber}.pdf`};
  }

  // Authorization / payment records
  if (tag === "authorization_records" || labelLower.includes("authorization") || labelLower.includes("payment")) {
    if (!match.folio) throw new Error("No folio data for payment records");
    const paymentFolio = {
      ...match.folio,
      lines: match.folio.lines.filter((l) => l.category === "payment"),
    };
    const pdfBuffer = await generateFolioPDF(paymentFolio, provenance);
    return {pdfBuffer, fileName: `PaymentRecords_${match.confirmationNumber}.pdf`};
  }

  // Default: generate reservation confirmation as general PMS evidence
  const pdfBuffer = await generateCheckInOutPDF(match.reservation, provenance);
  return {pdfBuffer, fileName: `PMSRecord_${match.confirmationNumber}.pdf`};
}
