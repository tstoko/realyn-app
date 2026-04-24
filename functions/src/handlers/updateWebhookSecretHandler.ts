import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import { getOrganization, updateOrganization } from "../services/organizationService";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";

export const updateWebhookSecretHandler = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    if (!shouldEnableTestHandlers()) {
      res.status(403).json({ error: "Test handlers disabled in production" });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    const { organizationId, webhookSecret, secretKey, status } = req.body;

    if (!organizationId || !webhookSecret) {
      res.status(400).json({ error: "Missing organizationId or webhookSecret" });
      return;
    }

    try {
      // Get existing organization to merge properly
      const existingOrg = await getOrganization(organizationId);
      if (!existingOrg) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      // Merge with existing stripe integration
      const updateData: any = {
        pspIntegrations: {
          ...existingOrg.pspIntegrations,
          stripe: {
            ...existingOrg.pspIntegrations?.stripe,
            webhookSecret: webhookSecret,
          },
        },
      };

      if (secretKey) {
        updateData.pspIntegrations.stripe.secretKey = secretKey;
      }

      if (status) {
        updateData.pspIntegrations.stripe.status = status;
      }

      await updateOrganization(organizationId, updateData as any);

      res.json({ 
        success: true, 
        message: `Updated webhook secret for organization: ${organizationId}` 
      });
    } catch (error: any) {
      console.error("Error updating webhook secret:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

