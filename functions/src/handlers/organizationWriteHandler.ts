import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { verifyUser, verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { savePspIntegrations, saveOperaCloudIntegration } from "../services/integrationWriteService";
import { applyRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import { ALLOWED_ORIGINS } from "../config/environment";

export const organizationWriteHandler = onRequest(
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

    const { action } = req.body;

    try {
      const db = admin.firestore();

      switch (action) {
        case "saveOrganization": {
          const adminAuth = await verifyAdmin(req);
          if (!adminAuth.success) {
            sendAuthError(res, adminAuth);
            return;
          }

          const { organization } = req.body;
          if (!organization?.id) {
            res.status(400).json({ success: false, error: "Missing required field: organization (with id)" });
            return;
          }

          await db.collection("organizations").doc(organization.id).set(
            {
              ...organization,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          res.json({ success: true, organizationId: organization.id });
          return;
        }

        case "updateOrganizationDocuments": {
          const authResult = await verifyUser(req);
          if (!authResult.success) {
            sendAuthError(res, authResult);
            return;
          }

          const { organizationId, documents } = req.body;
          if (!organizationId || !documents) {
            res.status(400).json({ success: false, error: "Missing required fields: organizationId, documents" });
            return;
          }

          if (authResult.organizationId !== organizationId && authResult.role !== "admin") {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await db.collection("organizations").doc(organizationId).update({
            documents,
            updatedAt: FieldValue.serverTimestamp(),
          });

          res.json({ success: true });
          return;
        }

        case "updateOrganizationIntegrations": {
          const authResult = await verifyUser(req);
          if (!authResult.success) {
            sendAuthError(res, authResult);
            return;
          }

          const { organizationId, pspIntegrations } = req.body;
          if (!organizationId || !pspIntegrations) {
            res.status(400).json({ success: false, error: "Missing required fields: organizationId, pspIntegrations" });
            return;
          }

          if (authResult.organizationId !== organizationId && authResult.role !== "admin") {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await savePspIntegrations(organizationId, pspIntegrations);

          res.json({ success: true });
          return;
        }

        case "saveOperaCloudConfig": {
          const authResult = await verifyUser(req);
          if (!authResult.success) {
            sendAuthError(res, authResult);
            return;
          }

          const { organizationId, config } = req.body;
          if (!organizationId || !config) {
            res.status(400).json({ success: false, error: "Missing required fields: organizationId, config" });
            return;
          }

          if (authResult.organizationId !== organizationId && authResult.role !== "admin") {
            res.status(403).json({ success: false, error: "Access denied: organization mismatch" });
            return;
          }

          await saveOperaCloudIntegration(organizationId, config);

          res.json({ success: true });
          return;
        }

        default:
          res.status(400).json({ success: false, error: `Unknown action: ${action}` });
          return;
      }
    } catch (error: any) {
      console.error("organizationWriteHandler error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);
