import { onRequest } from "firebase-functions/v2/https";
import { seedOrganizations } from "../scripts/seedOrganizations";
import { Request, Response } from "express";

/**
 * HTTP endpoint to seed organizations
 * Call this once via: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/seedOrganizations
 * Or use Firebase CLI: firebase functions:call seedOrganizations
 */
export const seedOrganizationsHandler = onRequest(
  {
    cors: true,
    invoker: "public", // Temporarily allow public access for seeding
  },
  async (req: Request, res: Response) => {
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

