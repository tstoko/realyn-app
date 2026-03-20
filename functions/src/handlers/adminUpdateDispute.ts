import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

/**
 * TEST-ONLY admin endpoint to update dispute fields in Firestore (bypasses rules).
 *
 * Usage: POST /adminUpdateDispute
 * Body: {
 *   disputeId: string,
 *   updates: {
 *     reason?: string,
 *     customerExplanation?: string,
 *     amount?: number,
 *     currency?: string,
 *     pspLast4Digits?: string,
 *     pspTransactionDate?: string // ISO date
 *   },
 *   auditNote?: string
 * }
 *
 * WARNING: Protect/remove in production.
 */
export const adminUpdateDispute = onRequest(
  { cors: true },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    try {
      const db = admin.firestore();
      const disputeId = String(req.body?.disputeId || "").trim();
      const updates = (req.body?.updates || {}) as Record<string, any>;
      const auditNote = req.body?.auditNote ? String(req.body.auditNote) : null;

      if (!disputeId) {
        res.status(400).json({ error: "Missing disputeId" });
        return;
      }

      const updatePayload: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (typeof updates.reason === "string") updatePayload.reason = updates.reason;
      if (typeof updates.customerExplanation === "string")
        updatePayload.customerExplanation = updates.customerExplanation;
      if (typeof updates.amount === "number") updatePayload.amount = updates.amount;
      if (typeof updates.currency === "string") updatePayload.currency = updates.currency;
      if (typeof updates.pspLast4Digits === "string")
        updatePayload.pspLast4Digits = updates.pspLast4Digits;
      if (typeof updates.pspTransactionDate === "string") {
        const d = new Date(updates.pspTransactionDate);
        if (!isNaN(d.getTime())) {
          updatePayload.pspTransactionDate = admin.firestore.Timestamp.fromDate(d);
        }
      }

      if (auditNote) {
        updatePayload.auditTrail = admin.firestore.FieldValue.arrayUnion({
          timestamp: admin.firestore.Timestamp.now(),
          title: "Admin Update",
          description: auditNote,
          status: "success",
          category: "user_action",
        });
      }

      const ref = db.collection("disputes").doc(disputeId);
      await ref.update(updatePayload);
      const updated = await ref.get();

      res.status(200).json({
        success: true,
        disputeId,
        updated: updated.data() || null,
      });
    } catch (error: any) {
      console.error("adminUpdateDispute failed:", error);
      res.status(500).json({ error: "Failed to update dispute", details: error.message });
    }
  }
);

