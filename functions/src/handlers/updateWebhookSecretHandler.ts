/**
 * Temporary handler to update webhook secret for testing
 * This should be removed after testing is complete
 */

import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import { getOrganization, updateOrganization } from "../services/organizationService";

export const updateWebhookSecretHandler = onRequest(
  {
    cors: true,
    invoker: "public",
  },
  async (req: Request, res: Response) => {
    // Temporarily allow all requests for testing - REMOVE AFTER TESTING

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

