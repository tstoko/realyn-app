import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";

const FieldValue = admin.firestore.FieldValue;

export const argumentWriteHandler = onRequest(
  { cors: true },
  async (req: Request, res: Response) => {
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
        case "saveArgumentDraft": {
          const { disputeId, argument, organizationId } = req.body;
          if (!disputeId || !argument || !organizationId) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, argument, organizationId" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (dispute.organizationId !== organizationId && authResult.role !== "admin") {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          const existingVersions: any[] = dispute.argumentVersions || [];
          const nextVersion = existingVersions.length > 0
            ? Math.max(...existingVersions.map((v: any) => v.version)) + 1
            : 1;

          const updatedVersions = existingVersions.map((v: any) => ({
            ...v,
            isCurrent: false,
          }));

          updatedVersions.push({
            argument,
            generatedAt: new Date(),
            version: nextVersion,
            isCurrent: true,
            isSubmitted: false,
          });

          await disputeRef.update({
            argumentDraft: argument,
            argumentVersions: updatedVersions,
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true, version: nextVersion });
          return;
        }

        case "clearArgumentDraft": {
          const { disputeId, organizationId } = req.body;
          if (!disputeId || !organizationId) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (dispute.organizationId !== organizationId && authResult.role !== "admin") {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await disputeRef.update({
            argumentDraft: null,
            argumentDraftGeneratedAt: null,
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true });
          return;
        }

        case "markArgumentSubmitted": {
          const { disputeId, organizationId } = req.body;
          if (!disputeId || !organizationId) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (dispute.organizationId !== organizationId && authResult.role !== "admin") {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await disputeRef.update({
            argumentSubmittedAt: FieldValue.serverTimestamp(),
            lifecycleStatus: "submitted",
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true });
          return;
        }

        default:
          res.status(400).json({ success: false, error: `Unknown action: ${action}` });
          return;
      }
    } catch (error: any) {
      console.error("argumentWriteHandler error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);
