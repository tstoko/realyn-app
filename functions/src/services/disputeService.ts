import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { UnifiedDisputeData } from "../types/dispute";
import { archiveDispute } from "./disputeHistoryService";
import { assertDisputeQuota } from "../utils/planEnforcement";

// Get Firestore instance (will be initialized by index.ts)
function getDb() {
  return admin.firestore();
}

/**
 * Unified function to upsert disputes from any PSP
 * Returns the document ID of the created/updated dispute
 */
export async function upsertUnifiedDispute(
  normalized: UnifiedDisputeData
): Promise<string> {
  const db = getDb();
  const disputeData = {
    // Organization and PSP info
    organizationId: normalized.organizationId,
    pspProvider: normalized.pspProvider,
    pspDisputeId: normalized.pspDisputeId,
    pspPaymentId: normalized.pspPaymentId,
    pspTransactionDate: admin.firestore.Timestamp.fromDate(normalized.pspTransactionDate),
    pspLast4Digits: normalized.pspLast4Digits || null,
    
    // Unified dispute data
    status: normalized.status,
    reason: normalized.reason,
    amount: normalized.amount,
    currency: normalized.currency,
    createdAt: admin.firestore.Timestamp.fromDate(normalized.pspTransactionDate),
    respondBy: normalized.respondBy
      ? admin.firestore.Timestamp.fromDate(normalized.respondBy)
      : null,
    customerExplanation: normalized.customerExplanation,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Use a deterministic doc ID derived from PSP provider + dispute ID to prevent duplicates
  const disputeDocId = `${normalized.pspProvider}_${normalized.pspDisputeId}`;
  const docRef = db.collection("disputes").doc(disputeDocId);
  const existing = await docRef.get();

  if (!existing.exists) {
    let quotaExceeded = false;
    try {
      const quota = await assertDisputeQuota(normalized.organizationId);
      quotaExceeded = quota.quotaExceeded;
    } catch {
      // Quota check failure must not block webhook-driven dispute ingestion
    }

    await docRef.set({
      ...disputeData,
      lifecycleStatus: "new",
      automationStatus: "auditing",
      internalStatus: "needs_review",
      auditTrail: [],
      ...(quotaExceeded ? { quotaExceeded: true } : {}),
    });
    console.log(
      `Created ${normalized.pspProvider} dispute: ${normalized.pspDisputeId} for organization: ${normalized.organizationId}`
    );
  } else {
    await docRef.set(disputeData, { merge: true });
    console.log(
      `Updated ${normalized.pspProvider} dispute: ${normalized.pspDisputeId} for organization: ${normalized.organizationId}`
    );
  }
  
  // Archive dispute asynchronously (non-blocking)
  // This ensures we have a complete history of all disputes
  archiveDispute(disputeDocId).catch((error) => {
    console.error(`Failed to archive dispute ${disputeDocId}:`, error);
    // Don't fail the dispute upsert if archiving fails
  });
  
  return disputeDocId;
}

/**
 * Update dispute status
 */
export async function updateDisputeStatus(
  pspProvider: "stripe" | "adyen",
  pspDisputeId: string,
  newStatus: string
): Promise<void> {
  const db = getDb();
  const disputeDocId = `${pspProvider}_${pspDisputeId}`;
  const docRef = db.collection("disputes").doc(disputeDocId);
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    const dispute = docSnap.data();
    let lifecycleStatus = dispute?.lifecycleStatus;

    if (newStatus === 'won') {
      lifecycleStatus = 'won';
    } else if (newStatus === 'lost') {
      lifecycleStatus = 'lost';
    } else if (newStatus === 'under_review') {
      lifecycleStatus = 'under_review';
    }

    await docRef.update({
      status: newStatus,
      lifecycleStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`Updated ${pspProvider} dispute: ${pspDisputeId} to status ${newStatus}`);
  } else {
    // Fallback: try query-based lookup for legacy docs created before deterministic IDs
    const existing = await db
      .collection("disputes")
      .where("pspProvider", "==", pspProvider)
      .where("pspDisputeId", "==", pspDisputeId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const legacyDoc = existing.docs[0];
      const dispute = legacyDoc.data();
      let lifecycleStatus = dispute.lifecycleStatus;

      if (newStatus === 'won') lifecycleStatus = 'won';
      else if (newStatus === 'lost') lifecycleStatus = 'lost';
      else if (newStatus === 'under_review') lifecycleStatus = 'under_review';

      await db.collection("disputes").doc(legacyDoc.id).update({
        status: newStatus,
        lifecycleStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Updated legacy ${pspProvider} dispute: ${pspDisputeId} to status ${newStatus}`);
    }
  }
}

