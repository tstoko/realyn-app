import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import { resetTestEnvironment } from "../scripts/resetTestEnvironment";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";

export const resetTestEnvironmentHandler = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (!shouldEnableTestHandlers()) {
      res.status(403).json({ error: "Test handlers disabled in production" });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      console.log(`Admin ${authResult.uid} initiated test environment reset via HTTP endpoint...`);
      
      const summary = await resetTestEnvironment();

      res.status(200).json({
        success: true,
        message: "Test environment reset completed",
        summary: {
          disputesDeleted: summary.disputesDeleted,
          guestsDeleted: summary.guestsDeleted,
          bookingsDeleted: summary.bookingsDeleted,
          organizationsDeleted: summary.organizationsDeleted,
          firestoreUsersDeleted: summary.firestoreUsersDeleted,
          authUsersDeleted: summary.authUsersDeleted,
          testOrgCreated: summary.testOrgCreated,
          adminPreserved: summary.adminPreserved,
          errors: summary.errors,
        },
        organizationId: "test_stripe_org",
      });
    } catch (error: any) {
      console.error("Error resetting test environment:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to reset test environment",
      });
    }
  }
);

