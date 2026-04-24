/**
 * Data Retention Service
 * 
 * Implements GDPR data subject rights:
 * - Article 17: Right to Erasure ("Right to be Forgotten")
 * - Article 20: Right to Data Portability
 * 
 * This service handles:
 * - Complete data deletion for organizations
 * - Individual dispute deletion
 * - User account deletion
 * - Data anonymization (keeping records without PII)
 * - Data export for portability
 */

import * as admin from "firebase-admin";
import type { Organization } from "../types/organization";
import { PII_PLACEHOLDERS } from "../utils/piiSanitizer";

// ============================================================
// Types
// ============================================================

export interface DeletionResult {
  success: boolean;
  deletedItems: {
    organizations?: number;
    disputes?: number;
    evidenceFiles?: number;
    evidenceStorageFiles?: number;
    users?: number;
    disputeHistory?: number;
  };
  errors: string[];
}

export interface DataExport {
  exportedAt: string;
  organizationId?: string;
  userId?: string;
  data: {
    organization?: Organization | null;
    disputes?: any[];
    evidence?: any[];
    user?: any;
    auditLog?: any[];
  };
}

// ============================================================
// Helper Functions
// ============================================================

function getDb() {
  return admin.firestore();
}

function getStorage() {
  return admin.storage().bucket();
}

/**
 * Delete all documents in a collection query (batch delete)
 */
async function deleteQueryBatch(
  query: admin.firestore.Query,
  resolve: (count: number) => void,
  reject: (error: Error) => void,
  count = 0
): Promise<void> {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    resolve(count);
    return;
  }

  const batch = getDb().batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recursively delete next batch
  const newCount = count + snapshot.size;
  
  // Add a small delay to avoid overwhelming Firestore
  await new Promise(resolve => setTimeout(resolve, 100));
  
  await deleteQueryBatch(query.limit(500), resolve, reject, newCount);
}

/**
 * Delete all documents matching a query
 */
async function deleteAllDocsInQuery(query: admin.firestore.Query): Promise<number> {
  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

// ============================================================
// Organization Data Deletion (GDPR Article 17)
// ============================================================

/**
 * Delete ALL data for an organization
 * This is a complete data erasure request (GDPR Art. 17)
 * 
 * Deletes:
 * - Organization document
 * - All disputes for the organization
 * - All evidence files (Firestore documents)
 * - All evidence files (Cloud Storage)
 * - All dispute history records
 */
export async function deleteOrganizationData(
  organizationId: string
): Promise<DeletionResult> {
  const db = getDb();
  const bucket = getStorage();
  const result: DeletionResult = {
    success: false,
    deletedItems: {},
    errors: [],
  };

  console.log(`[DataRetention] Starting full deletion for organization: ${organizationId}`);

  try {
    // 1. Get all disputes for this organization
    const disputesQuery = db
      .collection("disputes")
      .where("organizationId", "==", organizationId);
    const disputesSnapshot = await disputesQuery.get();
    const disputeIds = disputesSnapshot.docs.map(doc => doc.id);

    // 2. Delete evidence files from Cloud Storage for each dispute
    let storageFilesDeleted = 0;
    for (const disputeId of disputeIds) {
      try {
        const [files] = await bucket.getFiles({
          prefix: `organizations/${organizationId}/disputes/${disputeId}/evidence/`,
        });
        
        for (const file of files) {
          await file.delete();
          storageFilesDeleted++;
        }
      } catch (error) {
        console.warn(`Failed to delete storage files for dispute ${disputeId}:`, error);
        // Continue with other deletions
      }
    }
    result.deletedItems.evidenceStorageFiles = storageFilesDeleted;
    console.log(`[DataRetention] Deleted ${storageFilesDeleted} storage files`);

    // 3. Delete evidence documents from Firestore for each dispute
    let evidenceDocsDeleted = 0;
    for (const disputeId of disputeIds) {
      const evidenceQuery = db
        .collection("disputes")
        .doc(disputeId)
        .collection("evidence");
      const deleted = await deleteAllDocsInQuery(evidenceQuery);
      evidenceDocsDeleted += deleted;
    }
    result.deletedItems.evidenceFiles = evidenceDocsDeleted;
    console.log(`[DataRetention] Deleted ${evidenceDocsDeleted} evidence documents`);

    // 4. Delete dispute history records
    let historyDeleted = 0;
    for (const disputeId of disputeIds) {
      const historyQuery = db
        .collection("disputes_history")
        .where("disputeId", "==", disputeId);
      historyDeleted += await deleteAllDocsInQuery(historyQuery);
    }
    result.deletedItems.disputeHistory = historyDeleted;
    console.log(`[DataRetention] Deleted ${historyDeleted} history records`);

    // 5. Delete all disputes
    const disputesDeleted = await deleteAllDocsInQuery(disputesQuery);
    result.deletedItems.disputes = disputesDeleted;
    console.log(`[DataRetention] Deleted ${disputesDeleted} disputes`);

    // 6. Delete PMS import data
    try {
      const pmsImportsQuery = db.collection("organizations").doc(organizationId).collection("pmsImports");
      const pmsImportsDeleted = await deleteAllDocsInQuery(pmsImportsQuery);
      console.log(`[DataRetention] Deleted ${pmsImportsDeleted} PMS import records`);

      const pmsReservationsQuery = db.collection("organizations").doc(organizationId).collection("pmsReservations");
      const pmsReservationsDeleted = await deleteAllDocsInQuery(pmsReservationsQuery);
      console.log(`[DataRetention] Deleted ${pmsReservationsDeleted} PMS reservation records`);
    } catch (error) {
      console.warn(`[DataRetention] Failed to delete PMS data for org ${organizationId}:`, error);
    }

    // 7. Delete org audit log
    try {
      const auditLogQuery = db.collection("organizations").doc(organizationId).collection("auditLog");
      const auditLogDeleted = await deleteAllDocsInQuery(auditLogQuery);
      console.log(`[DataRetention] Deleted ${auditLogDeleted} audit log entries`);
    } catch (error) {
      console.warn(`[DataRetention] Failed to delete audit log for org ${organizationId}:`, error);
    }

    // 8. Delete the organization document
    await db.collection("organizations").doc(organizationId).delete();
    result.deletedItems.organizations = 1;
    console.log(`[DataRetention] Deleted organization document`);

    result.success = true;
    console.log(`[DataRetention] Successfully completed deletion for organization: ${organizationId}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Organization deletion failed: ${errorMessage}`);
    console.error(`[DataRetention] Error deleting organization ${organizationId}:`, error);
  }

  return result;
}

// ============================================================
// Single Dispute Deletion
// ============================================================

/**
 * Delete a single dispute and its associated data
 */
export async function deleteDisputeData(
  disputeId: string,
  organizationId: string
): Promise<DeletionResult> {
  const db = getDb();
  const bucket = getStorage();
  const result: DeletionResult = {
    success: false,
    deletedItems: {},
    errors: [],
  };

  console.log(`[DataRetention] Deleting dispute: ${disputeId}`);

  try {
    // Verify the dispute belongs to the organization
    const disputeDoc = await db.collection("disputes").doc(disputeId).get();
    if (!disputeDoc.exists) {
      result.errors.push("Dispute not found");
      return result;
    }

    const disputeData = disputeDoc.data();
    if (disputeData?.organizationId !== organizationId) {
      result.errors.push("Dispute does not belong to this organization");
      return result;
    }

    // 1. Delete evidence from Cloud Storage
    try {
      const [files] = await bucket.getFiles({
        prefix: `organizations/${organizationId}/disputes/${disputeId}/evidence/`,
      });
      
      for (const file of files) {
        await file.delete();
      }
      result.deletedItems.evidenceStorageFiles = files.length;
    } catch (error) {
      console.warn(`Failed to delete storage files:`, error);
    }

    // 2. Delete evidence documents
    const evidenceQuery = db
      .collection("disputes")
      .doc(disputeId)
      .collection("evidence");
    result.deletedItems.evidenceFiles = await deleteAllDocsInQuery(evidenceQuery);

    // 3. Delete dispute history
    const historyQuery = db
      .collection("disputes_history")
      .where("disputeId", "==", disputeId);
    result.deletedItems.disputeHistory = await deleteAllDocsInQuery(historyQuery);

    // 4. Delete the dispute document
    await db.collection("disputes").doc(disputeId).delete();
    result.deletedItems.disputes = 1;

    result.success = true;
    console.log(`[DataRetention] Successfully deleted dispute: ${disputeId}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Dispute deletion failed: ${errorMessage}`);
    console.error(`[DataRetention] Error deleting dispute ${disputeId}:`, error);
  }

  return result;
}

// ============================================================
// User Deletion
// ============================================================

/**
 * Delete a user account and associated data
 */
export async function deleteUserData(userId: string): Promise<DeletionResult> {
  const db = getDb();
  const result: DeletionResult = {
    success: false,
    deletedItems: {},
    errors: [],
  };

  console.log(`[DataRetention] Deleting user: ${userId}`);

  try {
    // 1. Delete user document from Firestore
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      await db.collection("users").doc(userId).delete();
      result.deletedItems.users = 1;
    }

    // 2. Delete Firebase Auth user
    try {
      await admin.auth().deleteUser(userId);
    } catch (authError) {
      // User may not exist in Auth (could be just a Firestore record)
      console.warn(`Could not delete Auth user ${userId}:`, authError);
    }

    result.success = true;
    console.log(`[DataRetention] Successfully deleted user: ${userId}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`User deletion failed: ${errorMessage}`);
    console.error(`[DataRetention] Error deleting user ${userId}:`, error);
  }

  return result;
}

// ============================================================
// Data Anonymization
// ============================================================

/**
 * Anonymize a dispute - keep the record but remove all PII
 * Useful when you need to retain dispute statistics without personal data
 */
export async function anonymizeDispute(
  disputeId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    const disputeRef = db.collection("disputes").doc(disputeId);
    const disputeDoc = await disputeRef.get();
    
    if (!disputeDoc.exists) {
      return { success: false, error: "Dispute not found" };
    }

    const disputeData = disputeDoc.data();
    if (disputeData?.organizationId !== organizationId) {
      return { success: false, error: "Dispute does not belong to this organization" };
    }

    // Anonymize PII fields
    const anonymizedData: Record<string, any> = {
      // Replace customer explanation (may contain PII)
      customerExplanation: disputeData.customerExplanation 
        ? PII_PLACEHOLDERS.REDACTED 
        : null,
      
      // Remove card data
      pspLast4Digits: PII_PLACEHOLDERS.CARD_LAST4,
      
      // Mark as anonymized
      anonymizedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await disputeRef.update(anonymizedData);

    // Also delete evidence files (they contain PII)
    const evidenceQuery = disputeRef.collection("evidence");
    await deleteAllDocsInQuery(evidenceQuery);

    // Delete storage files
    const bucket = getStorage();
    try {
      const [files] = await bucket.getFiles({
        prefix: `organizations/${organizationId}/disputes/${disputeId}/evidence/`,
      });
      for (const file of files) {
        await file.delete();
      }
    } catch (error) {
      console.warn(`Failed to delete storage files during anonymization:`, error);
    }

    console.log(`[DataRetention] Successfully anonymized dispute: ${disputeId}`);
    return { success: true };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[DataRetention] Error anonymizing dispute ${disputeId}:`, error);
    return { success: false, error: errorMessage };
  }
}

// ============================================================
// Data Export (GDPR Article 20 - Portability)
// ============================================================

/**
 * Export all data for an organization in a portable format
 */
export async function exportOrganizationData(
  organizationId: string
): Promise<DataExport> {
  const db = getDb();
  const exportData: DataExport = {
    exportedAt: new Date().toISOString(),
    organizationId,
    data: {},
  };

  try {
    // 1. Export organization data
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (orgDoc.exists) {
      const orgData = orgDoc.data() as Organization;
      // Don't export encrypted credentials for security
      exportData.data.organization = {
        ...orgData,
        id: orgDoc.id,
        // Redact sensitive fields
        pspIntegrations: orgData.pspIntegrations ? {
          stripe: orgData.pspIntegrations.stripe ? {
            ...orgData.pspIntegrations.stripe,
            secretKey: "[REDACTED]",
            accessToken: orgData.pspIntegrations.stripe.accessToken ? "[REDACTED]" : undefined,
            webhookSecret: orgData.pspIntegrations.stripe.webhookSecret ? "[REDACTED]" : undefined,
          } : undefined,
          adyen: orgData.pspIntegrations.adyen ? {
            ...orgData.pspIntegrations.adyen,
            apiKey: "[REDACTED]",
            webhookUsername: orgData.pspIntegrations.adyen.webhookUsername ? "[REDACTED]" : undefined,
            webhookPassword: orgData.pspIntegrations.adyen.webhookPassword ? "[REDACTED]" : undefined,
          } : undefined,
        } : undefined,
      };
    }

    // 2. Export disputes
    const disputesSnapshot = await db
      .collection("disputes")
      .where("organizationId", "==", organizationId)
      .get();
    
    exportData.data.disputes = disputesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Timestamps to ISO strings
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
      respondBy: doc.data().respondBy?.toDate?.()?.toISOString() || null,
    }));

    // 3. Export evidence metadata (not actual files)
    exportData.data.evidence = [];
    for (const disputeDoc of disputesSnapshot.docs) {
      const evidenceSnapshot = await db
        .collection("disputes")
        .doc(disputeDoc.id)
        .collection("evidence")
        .get();
      
      for (const evidenceDoc of evidenceSnapshot.docs) {
        exportData.data.evidence.push({
          disputeId: disputeDoc.id,
          id: evidenceDoc.id,
          ...evidenceDoc.data(),
          // Don't include download URLs (they expire)
          downloadURL: "[EXCLUDED]",
          uploadedAt: evidenceDoc.data().uploadedAt?.toDate?.()?.toISOString() || null,
        });
      }
    }

    // 4. Export org audit log
    try {
      const auditLogSnapshot = await db
        .collection("organizations").doc(organizationId)
        .collection("auditLog").orderBy("timestamp", "desc").get();
      exportData.data.auditLog = auditLogSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || null,
      }));
    } catch (error) {
      console.warn("[DataRetention] Failed to export audit log:", error);
    }

    console.log(`[DataRetention] Exported data for organization: ${organizationId}`);
    
  } catch (error) {
    console.error(`[DataRetention] Error exporting organization data:`, error);
  }

  return exportData;
}

/**
 * Export all data for a user
 */
export async function exportUserData(userId: string): Promise<DataExport> {
  const db = getDb();
  const exportData: DataExport = {
    exportedAt: new Date().toISOString(),
    userId,
    data: {},
  };

  try {
    // Export user document
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      exportData.data.user = {
        id: userDoc.id,
        ...userDoc.data(),
        createdAt: userDoc.data()?.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: userDoc.data()?.updatedAt?.toDate?.()?.toISOString() || null,
      };
    }

    console.log(`[DataRetention] Exported data for user: ${userId}`);
    
  } catch (error) {
    console.error(`[DataRetention] Error exporting user data:`, error);
  }

  return exportData;
}

// ============================================================
// PMS Data Retention Cleanup
// ============================================================

const PMS_RETENTION_GRACE_PERIOD_DAYS = 90;

/**
 * Clean up PMS import data for resolved disputes past the retention period.
 *
 * Finds PMS reservations whose linked disputes have been resolved for at
 * least 90 days and removes the reservation data. Import metadata documents
 * are kept for audit trail but have their parsed data counts zeroed.
 */
export async function cleanupExpiredPMSData(): Promise<{
  organizationsChecked: number;
  reservationsDeleted: number;
  errors: string[];
}> {
  const db = getDb();
  const result = { organizationsChecked: 0, reservationsDeleted: 0, errors: [] as string[] };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PMS_RETENTION_GRACE_PERIOD_DAYS);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

  try {
    // Find all organizations that have PMS integrations
    const orgsSnapshot = await db
      .collection("organizations")
      .where("pmsIntegration.type", "!=", "none")
      .get();

    for (const orgDoc of orgsSnapshot.docs) {
      result.organizationsChecked++;
      const orgId = orgDoc.id;

      try {
        // Find resolved disputes for this org that are past the grace period
        const resolvedDisputes = await db
          .collection("disputes")
          .where("organizationId", "==", orgId)
          .where("internalStatus", "in", ["won", "lost", "closed", "resolved"])
          .get();

        // Collect confirmation numbers from PMS matches on expired disputes
        const expiredConfirmationNumbers = new Set<string>();

        for (const disputeDoc of resolvedDisputes.docs) {
          const dispute = disputeDoc.data();
          const resolvedAt = dispute.updatedAt || dispute.resolvedAt;
          if (!resolvedAt) continue;

          const resolvedTimestamp = resolvedAt.toDate
            ? resolvedAt
            : admin.firestore.Timestamp.fromDate(new Date(resolvedAt));

          if (resolvedTimestamp <= cutoffTimestamp && dispute.pmsMatch?.confirmationNumber) {
            expiredConfirmationNumbers.add(dispute.pmsMatch.confirmationNumber);
          }
        }

        if (expiredConfirmationNumbers.size === 0) continue;

        // Check that these confirmation numbers are not linked to any active disputes
        const activeDisputes = await db
          .collection("disputes")
          .where("organizationId", "==", orgId)
          .where("internalStatus", "not-in", ["won", "lost", "closed", "resolved"])
          .get();

        const activeConfirmationNumbers = new Set<string>();
        for (const doc of activeDisputes.docs) {
          const cn = doc.data().pmsMatch?.confirmationNumber;
          if (cn) activeConfirmationNumbers.add(cn);
        }

        // Only delete reservations not linked to any active dispute
        for (const cn of expiredConfirmationNumbers) {
          if (activeConfirmationNumbers.has(cn)) continue;

          try {
            await db
              .collection("organizations")
              .doc(orgId)
              .collection("pmsReservations")
              .doc(cn)
              .delete();
            result.reservationsDeleted++;
          } catch (err) {
            result.errors.push(`Failed to delete reservation ${cn} for org ${orgId}: ${(err as Error).message}`);
          }
        }

        console.log(
          `[DataRetention] PMS cleanup for org ${orgId}: deleted ${expiredConfirmationNumbers.size - activeConfirmationNumbers.size} reservations`
        );
      } catch (err) {
        result.errors.push(`Error processing org ${orgId}: ${(err as Error).message}`);
      }
    }
  } catch (error) {
    result.errors.push(`PMS cleanup failed: ${(error as Error).message}`);
    console.error("[DataRetention] PMS cleanup error:", error);
  }

  console.log(
    `[DataRetention] PMS cleanup complete: ${result.organizationsChecked} orgs checked, ` +
    `${result.reservationsDeleted} reservations deleted, ${result.errors.length} errors`
  );

  return result;
}
