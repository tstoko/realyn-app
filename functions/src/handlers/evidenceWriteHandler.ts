import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";

export const evidenceWriteHandler = onRequest(
  { cors: ALLOWED_ORIGINS },
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

    function verifyOrgAccess(disputeOrgId: string): boolean {
      if (authResult.role === "admin") return true;
      return disputeOrgId === authResult.organizationId;
    }

    try {
      const db = admin.firestore();

      switch (action) {
        case "registerEvidenceFile": {
          const { disputeId, organizationId, evidenceFile } = req.body;
          if (!disputeId || !organizationId || !evidenceFile?.id) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, evidenceFile" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await db.collection("disputes").doc(disputeId)
            .collection("evidence").doc(evidenceFile.id)
            .set(evidenceFile);

          await disputeRef.update({
            evidenceFiles: FieldValue.arrayUnion(evidenceFile.id),
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true, evidenceFileId: evidenceFile.id });
          return;
        }

        case "removeEvidenceFile": {
          const { disputeId, organizationId, evidenceFileId } = req.body;
          if (!disputeId || !organizationId || !evidenceFileId) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, evidenceFileId" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await db.collection("disputes").doc(disputeId)
            .collection("evidence").doc(evidenceFileId)
            .delete();

          await disputeRef.update({
            evidenceFiles: FieldValue.arrayRemove(evidenceFileId),
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true });
          return;
        }

        case "updateEvidenceItemWithFile": {
          const { disputeId, organizationId, requirementId, fileId, fileName, uploadedBy } = req.body;
          if (!disputeId || !organizationId || !requirementId || !fileId || !fileName) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, requirementId, fileId, fileName" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          const evidenceItems: any[] = dispute.evidenceItems || [];
          let statusChanged = false;
          const updatedItems = evidenceItems.map((item: any) => {
            if (item.requirementId === requirementId) {
              statusChanged = item.status !== "uploaded";
              return {
                ...item,
                status: "uploaded",
                fileId,
                fileName,
                uploadedAt: new Date().toISOString(),
                uploadedBy: uploadedBy || authResult.uid,
              };
            }
            return item;
          });

          const updatePayload: Record<string, any> = {
            evidenceItems: updatedItems,
            updatedAt: FieldValue.serverTimestamp(),
          };

          const requirements = dispute.evidencePlan?.requirements || [];
          const requiredIds = requirements
            .filter((r: any) => r.required !== false)
            .map((r: any) => r.id);
          const allRequiredComplete = requiredIds.every((id: string) =>
            updatedItems.some((item: any) => item.requirementId === id && (item.status === "uploaded" || item.status === "not_available"))
          );

          if (allRequiredComplete) {
            updatePayload.lifecycleStatus = "evidence_complete";
            updatePayload.internalStatus = "evidence_complete";
          }

          if (statusChanged) {
            updatePayload.auditTrail = FieldValue.arrayUnion({
              timestamp: new Date().toISOString(),
              title: "Evidence Uploaded",
              description: `File "${fileName}" uploaded for requirement ${requirementId}`,
              status: "success",
              category: "evidence",
              actor: authResult.email || authResult.uid,
            });
          }

          await disputeRef.update(updatePayload);

          res.json({ success: true, allRequiredComplete });
          return;
        }

        case "updateEvidenceItems": {
          const { disputeId, organizationId, evidenceItems } = req.body;
          if (!disputeId || !organizationId || !evidenceItems) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, evidenceItems" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await disputeRef.update({
            evidenceItems,
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true });
          return;
        }

        case "markRequirementUploaded": {
          const { disputeId, organizationId, requirementId, fileId, fileName, uploadedBy } = req.body;
          if (!disputeId || !organizationId || !requirementId || !fileId || !fileName) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, requirementId, fileId, fileName" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          const evidenceItems: any[] = dispute.evidenceItems || [];
          const updatedItems = evidenceItems.map((item: any) => {
            if (item.requirementId === requirementId) {
              return {
                ...item,
                status: "uploaded",
                fileId,
                fileName,
                uploadedAt: new Date().toISOString(),
                uploadedBy: uploadedBy || authResult.uid,
              };
            }
            return item;
          });

          const updatePayload: Record<string, any> = {
            evidenceItems: updatedItems,
            updatedAt: FieldValue.serverTimestamp(),
          };

          const requirements = dispute.evidencePlan?.requirements || [];
          const requiredIds = requirements
            .filter((r: any) => r.required !== false)
            .map((r: any) => r.id);
          const allRequiredComplete = requiredIds.every((id: string) =>
            updatedItems.some((item: any) => item.requirementId === id && (item.status === "uploaded" || item.status === "not_available"))
          );

          if (allRequiredComplete) {
            updatePayload.lifecycleStatus = "evidence_complete";
            updatePayload.internalStatus = "evidence_complete";
          }

          await disputeRef.update(updatePayload);

          res.json({ success: true, allRequiredComplete });
          return;
        }

        case "markRequirementNotAvailable": {
          const { disputeId, organizationId, requirementId, notes } = req.body;
          if (!disputeId || !organizationId || !requirementId) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, requirementId" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          const evidenceItems: any[] = dispute.evidenceItems || [];
          const updatedItems = evidenceItems.map((item: any) => {
            if (item.requirementId === requirementId) {
              return {
                ...item,
                status: "not_available",
                notes: notes || null,
                updatedAt: new Date().toISOString(),
              };
            }
            return item;
          });

          await disputeRef.update({
            evidenceItems: updatedItems,
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true });
          return;
        }

        case "addAuditEntry": {
          const { disputeId, organizationId, entry } = req.body;
          if (!disputeId || !organizationId || !entry?.title || !entry?.description || !entry?.status) {
            res.status(400).json({ success: false, error: "Missing required fields: disputeId, organizationId, entry (with title, description, status)" });
            return;
          }

          const disputeRef = db.collection("disputes").doc(disputeId);
          const disputeDoc = await disputeRef.get();
          if (!disputeDoc.exists) {
            res.status(404).json({ success: false, error: "Dispute not found" });
            return;
          }

          const dispute = disputeDoc.data()!;
          if (!verifyOrgAccess(dispute.organizationId)) {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          const auditEntry = {
            timestamp: new Date().toISOString(),
            title: entry.title,
            description: entry.description,
            status: entry.status,
            actor: entry.actor || authResult.email || authResult.uid,
            category: entry.category || "user_action",
            metadata: entry.metadata || null,
            relatedResources: entry.relatedResources || null,
          };

          await disputeRef.update({
            auditTrail: FieldValue.arrayUnion(auditEntry),
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
      console.error("evidenceWriteHandler error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);
