/**
 * Data Retention Handlers
 * 
 * HTTP endpoints for GDPR data subject rights:
 * - POST /data-retention/delete-organization - Full organization data deletion (Art. 17)
 * - POST /data-retention/delete-dispute - Single dispute deletion
 * - POST /data-retention/delete-user - User account deletion
 * - POST /data-retention/anonymize-dispute - Anonymize dispute (keep record, remove PII)
 * - POST /data-retention/export-organization - Export organization data (Art. 20)
 * - POST /data-retention/export-user - Export user data (Art. 20)
 */

import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {
  deleteOrganizationData,
  deleteDisputeData,
  deleteUserData,
  anonymizeDispute,
  exportOrganizationData,
  exportUserData,
} from "../services/dataRetentionService";
import { applyRateLimit, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";

// ============================================================
// Authentication Helper
// ============================================================

/**
 * Verify the request is authenticated and authorized
 * Returns the authenticated user's UID or null if unauthorized
 */
async function verifyAuth(
  req: functions.https.Request
): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.split("Bearer ")[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error) {
    console.error("Auth verification failed:", error);
    return null;
  }
}

/**
 * Check if user has access to organization
 */
async function userHasOrgAccess(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const db = admin.firestore();
  
  // Check if user document has this organization
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data();
  return userData?.organizationId === organizationId || 
         userData?.organizationIds?.includes(organizationId) ||
         userData?.role === "admin";
}

// ============================================================
// Delete Organization Data (GDPR Article 17)
// ============================================================

/**
 * Delete all data for an organization
 * POST /data-retention/delete-organization
 * 
 * Body: { organizationId: string, confirmDeletion: boolean }
 * 
 * CAUTION: This is a destructive operation that cannot be undone.
 */
export const deleteOrganization = functions.https.onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 300, // 5 minutes for large deletions
    memory: "1GiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verify authentication
    const auth = await verifyAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { organizationId, confirmDeletion } = req.body;

    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId" });
      return;
    }

    if (!confirmDeletion) {
      res.status(400).json({ 
        error: "Deletion requires explicit confirmation",
        message: "Set confirmDeletion: true to proceed with data deletion",
      });
      return;
    }

    // Verify user has access to this organization
    const hasAccess = await userHasOrgAccess(auth.uid, organizationId);
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden: No access to this organization" });
      return;
    }

    console.log(`[DataRetention] User ${auth.uid} requested deletion for org ${organizationId}`);

    try {
      const result = await deleteOrganizationData(organizationId);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Organization data deleted successfully",
          deletedItems: result.deletedItems,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Deletion completed with errors",
          deletedItems: result.deletedItems,
          errors: result.errors,
        });
      }
    } catch (error) {
      console.error("Organization deletion error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// ============================================================
// Delete Single Dispute
// ============================================================

/**
 * Delete a single dispute and its evidence
 * POST /data-retention/delete-dispute
 * 
 * Body: { disputeId: string, organizationId: string }
 */
export const deleteDispute = functions.https.onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const auth = await verifyAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { disputeId, organizationId } = req.body;

    if (!disputeId || !organizationId) {
      res.status(400).json({ error: "Missing disputeId or organizationId" });
      return;
    }

    const hasAccess = await userHasOrgAccess(auth.uid, organizationId);
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden: No access to this organization" });
      return;
    }

    try {
      const result = await deleteDisputeData(disputeId, organizationId);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Dispute deleted successfully",
          deletedItems: result.deletedItems,
        });
      } else {
        res.status(400).json({
          success: false,
          errors: result.errors,
        });
      }
    } catch (error) {
      console.error("Dispute deletion error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================
// Delete User Account
// ============================================================

/**
 * Delete user account and associated data
 * POST /data-retention/delete-user
 * 
 * Body: { confirmDeletion: boolean }
 * 
 * Note: User can only delete their own account
 */
export const deleteUser = functions.https.onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const auth = await verifyAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Apply strict rate limiting for deletion
    const allowed = await applyRateLimit(req, res, auth.uid, RATE_LIMIT_CONFIGS.dataDeletion);
    if (!allowed) return;

    const { confirmDeletion } = req.body;

    if (!confirmDeletion) {
      res.status(400).json({ 
        error: "Deletion requires explicit confirmation",
        message: "Set confirmDeletion: true to proceed with account deletion",
      });
      return;
    }

    console.log(`[DataRetention] User ${auth.uid} requested account deletion`);

    try {
      const result = await deleteUserData(auth.uid);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: "User account deleted successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          errors: result.errors,
        });
      }
    } catch (error) {
      console.error("User deletion error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================
// Anonymize Dispute
// ============================================================

/**
 * Anonymize a dispute (keep statistics, remove PII)
 * POST /data-retention/anonymize-dispute
 * 
 * Body: { disputeId: string, organizationId: string }
 */
export const anonymizeDisputeHandler = functions.https.onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const auth = await verifyAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { disputeId, organizationId } = req.body;

    if (!disputeId || !organizationId) {
      res.status(400).json({ error: "Missing disputeId or organizationId" });
      return;
    }

    const hasAccess = await userHasOrgAccess(auth.uid, organizationId);
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden: No access to this organization" });
      return;
    }

    try {
      const result = await anonymizeDispute(disputeId, organizationId);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Dispute anonymized successfully",
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Anonymization error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================
// Export Organization Data (GDPR Article 20)
// ============================================================

/**
 * Export all organization data in portable format
 * POST /data-retention/export-organization
 * 
 * Body: { organizationId: string }
 */
export const exportOrganization = functions.https.onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const auth = await verifyAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { organizationId } = req.body;

    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId" });
      return;
    }

    const hasAccess = await userHasOrgAccess(auth.uid, organizationId);
    if (!hasAccess) {
      res.status(403).json({ error: "Forbidden: No access to this organization" });
      return;
    }

    console.log(`[DataRetention] User ${auth.uid} requested data export for org ${organizationId}`);

    try {
      const exportData = await exportOrganizationData(organizationId);
      
      // Set headers for file download
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="organization-export-${organizationId}-${Date.now()}.json"`
      );
      
      res.status(200).json(exportData);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================
// Export User Data (GDPR Article 20)
// ============================================================

/**
 * Export user's own data
 * POST /data-retention/export-user
 */
export const exportUser = functions.https.onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const auth = await verifyAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Apply rate limiting for data export
    const allowed = await applyRateLimit(req, res, auth.uid, RATE_LIMIT_CONFIGS.dataExport);
    if (!allowed) return;

    console.log(`[DataRetention] User ${auth.uid} requested personal data export`);

    try {
      const exportData = await exportUserData(auth.uid);
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="user-export-${auth.uid}-${Date.now()}.json"`
      );
      
      res.status(200).json(exportData);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
