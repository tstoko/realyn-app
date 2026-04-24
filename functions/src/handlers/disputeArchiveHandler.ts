import * as functions from "firebase-functions/v2";
import { Request, Response } from "express";
import { autoArchiveDisputes, getArchivedDisputes } from "../services/disputeHistoryService";
import { verifyUserInOrganization, sendAuthError } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";

/**
 * Manual trigger to archive disputes for an organization
 * POST /archive-disputes
 */
export const archiveOrganizationDisputes = functions.https.onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { organizationId } = req.body;

      if (!organizationId) {
        res.status(400).json({ error: "Missing organizationId" });
        return;
      }

      const authResult = await verifyUserInOrganization(req, organizationId);
      if (!authResult.success) {
        sendAuthError(res, authResult);
        return;
      }

      const archivedCount = await autoArchiveDisputes(organizationId);

      res.json({
        success: true,
        archivedCount,
        message: `Archived ${archivedCount} disputes for organization ${organizationId}`,
      });
    } catch (error) {
      console.error("Error archiving disputes:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Get archived disputes for an organization
 * GET /archived-disputes?organizationId=xxx&limit=100
 */
export const getArchivedDisputesHandler = functions.https.onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const organizationId = req.query.organizationId as string;
      const limit = req.query.limit 
        ? parseInt(req.query.limit as string, 10) 
        : 100;

      if (!organizationId) {
        res.status(400).json({ error: "Missing organizationId query parameter" });
        return;
      }

      const authResult = await verifyUserInOrganization(req, organizationId);
      if (!authResult.success) {
        sendAuthError(res, authResult);
        return;
      }

      const archivedDisputes = await getArchivedDisputes(organizationId, limit);

      res.json({
        success: true,
        disputes: archivedDisputes,
        count: archivedDisputes.length,
      });
    } catch (error) {
      console.error("Error fetching archived disputes:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

