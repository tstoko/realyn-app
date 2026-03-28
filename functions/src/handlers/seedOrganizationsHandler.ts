import { onRequest } from "firebase-functions/v2/https";
import { seedOrganizations } from "../scripts/seedOrganizations";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { shouldEnableTestHandlers } from "../config/environment";

export const seedOrganizationsHandler = onRequest(
  {
    cors: true,
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

    try {
      console.log("Starting organization seed via HTTP endpoint...");
      await seedOrganizations();
      res.json({ 
        success: true, 
        message: "Organizations seeded successfully!" 
      });
    } catch (error: any) {
      console.error("Error seeding organizations:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

