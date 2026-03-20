/**
 * Manual Adyen Dispute Sync Handler
 * Allows manual triggering of dispute sync from frontend
 */

import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import { syncDisputesForOrganization } from "../services/psp/adyenDisputeSync";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";

export const adyenManualSync = onRequest(
  {
    cors: true,
  },
  async (req: Request, res: Response): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Verify authentication
    const authResult = await verifyUser(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    const { organizationId } = req.body;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        message: "Missing organizationId",
      });
      return;
    }

    try {
      const result = await syncDisputesForOrganization(organizationId);

      res.status(200).json({
        success: result.success,
        message: `Synced ${result.disputesSynced} disputes (${result.disputesCreated} created, ${result.disputesUpdated} updated)`,
        disputesSynced: result.disputesSynced,
        disputesCreated: result.disputesCreated,
        disputesUpdated: result.disputesUpdated,
        errors: result.errors,
      });
    } catch (error: any) {
      console.error("Error in manual Adyen sync:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to sync disputes",
        error: error.message,
      });
    }
  }
);

