/**
 * Unified Manual Dispute Sync Handler
 *
 * Allows manual triggering of dispute sync from the dashboard for both
 * Adyen and Stripe. Rate-limited to 5 requests per hour per organization.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { Request, Response } from "express";
import { syncDisputesForOrganization } from "../services/psp/adyenDisputeSync";
import { syncStripeDisputesForOrganization } from "./disputeSyncScheduler";
import { verifyUserInOrganization, sendAuthError } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";
import { getRateLimiter, type RateLimitConfig } from "../utils/rateLimiter";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

const DISPUTE_SYNC_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowSeconds: 3600,
  keyType: "custom",
  failMode: "closed",
};

export const disputeManualSync = onRequest(
  {
    cors: ALLOWED_ORIGINS,
    secrets: [stripeSecretKey],
  },
  async (req: Request, res: Response): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { organizationId } = req.body;

    if (!organizationId) {
      res.status(400).json({ success: false, message: "Missing organizationId" });
      return;
    }

    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    // Rate limit per organization
    const limiter = getRateLimiter();
    const rateLimitResult = await limiter.checkLimit(
      `disputeSync:${organizationId}`,
      DISPUTE_SYNC_RATE_LIMIT
    );

    res.setHeader("X-RateLimit-Limit", DISPUTE_SYNC_RATE_LIMIT.maxRequests);
    res.setHeader("X-RateLimit-Remaining", rateLimitResult.remaining);
    res.setHeader("X-RateLimit-Reset", Math.floor(rateLimitResult.resetAt.getTime() / 1000));

    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", rateLimitResult.retryAfter || DISPUTE_SYNC_RATE_LIMIT.windowSeconds);
      res.status(429).json({
        success: false,
        message: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
        retryAfter: rateLimitResult.retryAfter,
      });
      return;
    }

    const results: {
      adyen?: { synced: number; created: number; updated: number; errors: string[] };
      stripe?: { synced: number; created: number; updated: number; errors: string[] };
    } = {};
    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];

    try {
      // Get the organization to check connected PSPs
      const admin = await import("firebase-admin");
      const orgDoc = await admin.firestore().collection("organizations").doc(organizationId).get();
      if (!orgDoc.exists) {
        res.status(404).json({ success: false, message: "Organization not found" });
        return;
      }
      const org = orgDoc.data()!;

      // Adyen sync
      if (org.pspIntegrations?.adyen?.status === "connected") {
        try {
          const result = await syncDisputesForOrganization(organizationId);
          results.adyen = {
            synced: result.disputesSynced,
            created: result.disputesCreated,
            updated: result.disputesUpdated,
            errors: result.errors,
          };
          totalSynced += result.disputesSynced;
          totalCreated += result.disputesCreated;
          totalUpdated += result.disputesUpdated;
          allErrors.push(...result.errors);
        } catch (error: any) {
          allErrors.push(`Adyen sync failed: ${error.message}`);
        }
      }

      // Stripe sync
      if (org.pspIntegrations?.stripe?.status === "connected") {
        const stripeKey = stripeSecretKey.value().trim();
        if (stripeKey) {
          try {
            const result = await syncStripeDisputesForOrganization(organizationId, stripeKey);
            results.stripe = {
              synced: result.disputesSynced,
              created: result.disputesCreated,
              updated: result.disputesUpdated,
              errors: result.errors,
            };
            totalSynced += result.disputesSynced;
            totalCreated += result.disputesCreated;
            totalUpdated += result.disputesUpdated;
            allErrors.push(...result.errors);
          } catch (error: any) {
            allErrors.push(`Stripe sync failed: ${error.message}`);
          }
        } else {
          allErrors.push("Stripe secret key not configured");
        }
      }

      if (!results.adyen && !results.stripe) {
        res.status(200).json({
          success: true,
          message: "No connected PSP integrations found for this organization",
          disputesSynced: 0,
          disputesCreated: 0,
          disputesUpdated: 0,
        });
        return;
      }

      res.status(200).json({
        success: allErrors.length === 0,
        message: `Synced ${totalSynced} disputes (${totalCreated} created, ${totalUpdated} updated)`,
        disputesSynced: totalSynced,
        disputesCreated: totalCreated,
        disputesUpdated: totalUpdated,
        results,
        errors: allErrors.length > 0 ? allErrors : undefined,
      });
    } catch (error: any) {
      console.error("Error in manual dispute sync:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to sync disputes",
        error: error.message,
      });
    }
  }
);
