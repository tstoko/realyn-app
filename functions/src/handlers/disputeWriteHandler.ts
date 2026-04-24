import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";

function verifyOrgAccessForAuth(authResult: { role?: string; organizationId?: string }, disputeOrgId: string): boolean {
  if (authResult.role === "admin") return true;
  return disputeOrgId === authResult.organizationId;
}
import { applyRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";

export const disputeWriteHandler = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    const rateLimitOk = await applyRateLimit(
      req, res, getClientIP(req), RATE_LIMIT_CONFIGS.general
    );
    if (!rateLimitOk) return;

    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    const authResult = await verifyUser(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    const { action } = req.body;

    try {
      const db = admin.firestore();

      switch (action) {
        case "updateDispute": {
          const { disputeId, organizationId, updates } = req.body;
          if (!disputeId || !organizationId || !updates) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, updates" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccessForAuth(authResult, dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          const sanitizedUpdates: Record<string, any> = { ...updates };

          for (const [key, value] of Object.entries(sanitizedUpdates)) {
            if (typeof value === "string" && !isNaN(Date.parse(value)) && key.toLowerCase().includes("date")) {
              sanitizedUpdates[key] = admin.firestore.Timestamp.fromDate(new Date(value));
            }
          }

          sanitizedUpdates.updatedAt = FieldValue.serverTimestamp();

          await disputeRef.update(sanitizedUpdates);

          res.json({ success: true, disputeId });
          return;
        }

        case "updateMultipleDisputes": {
          const { disputeIds, organizationId, updates } = req.body;
          if (!disputeIds?.length || !organizationId || !updates) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeIds, organizationId, updates" });
            return;
          }

          let updatedCount = 0;

          for (const disputeId of disputeIds) {
            const disputeRef = db.collection("disputes").doc(disputeId);
            const disputeDoc = await disputeRef.get();
            if (!disputeDoc.exists) continue;

            const dispute = disputeDoc.data()!;
            if (!verifyOrgAccessForAuth(authResult, dispute.organizationId)) {
              continue;
            }

            await disputeRef.update({
              ...updates,
              updatedAt: FieldValue.serverTimestamp(),
            });
            updatedCount++;
          }

          res.json({ success: true, updatedCount });
          return;
        }

        default:
          res.status(400).json({ success: false, error: `Unknown action: ${action}` });
          return;
      }
    } catch (error: any) {
      console.error("disputeWriteHandler error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);
