import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyUser, verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { encrypt } from "../utils/encryption";

const FieldValue = admin.firestore.FieldValue;

export const organizationWriteHandler = onRequest(
  { cors: true },
  async (req: Request, res: Response) => {
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

          await db.collection("organizations").doc(organizationId).update({
            pspIntegrations,
            updatedAt: FieldValue.serverTimestamp(),
          });

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

          const safeConfig: Record<string, any> = {};
          if (config.gatewayUrl !== undefined) safeConfig.gatewayUrl = config.gatewayUrl;
          if (config.authMode !== undefined) safeConfig.authMode = config.authMode;
          if (config.oauthClientId !== undefined) safeConfig.oauthClientId = config.oauthClientId;
          if (config.oauthClientSecret !== undefined) safeConfig.oauthClientSecret = encrypt(config.oauthClientSecret);
          if (config.appKey !== undefined) safeConfig.appKey = encrypt(config.appKey);
          if (config.enterpriseId !== undefined) safeConfig.enterpriseId = config.enterpriseId;
          if (config.hotelCodes !== undefined) safeConfig.hotelCodes = config.hotelCodes;
          if (config.integrationUsername !== undefined) safeConfig.integrationUsername = config.integrationUsername;
          if (config.integrationPassword !== undefined) safeConfig.integrationPassword = encrypt(config.integrationPassword);
          if (config.status !== undefined) safeConfig.status = config.status;
          if (config.lastTestedAt !== undefined) safeConfig.lastTestedAt = config.lastTestedAt;

          await db.collection("organizations").doc(organizationId).update({
            operaCloudIntegration: safeConfig,
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
      console.error("organizationWriteHandler error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);
