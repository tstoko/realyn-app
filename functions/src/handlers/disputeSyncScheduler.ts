/**
 * Scheduled Dispute Sync
 *
 * Daily job that pulls the latest disputes from each organization's
 * connected PSP (Adyen API sync, Stripe disputes.list catch-up) and
 * upserts them into Firestore via the unified dispute pipeline.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { syncDisputesForOrganization } from "../services/psp/adyenDisputeSync";
import { normalizeStripeDispute } from "../utils/disputeNormalizer";
import { upsertUnifiedDispute } from "../services/disputeService";
import { getPaymentMetadata } from "../utils/stripeHelpers";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

function getDb() {
  return admin.firestore();
}

interface StripeSyncResult {
  success: boolean;
  disputesSynced: number;
  disputesCreated: number;
  disputesUpdated: number;
  errors: string[];
}

/**
 * Sync recent Stripe disputes for an organization.
 * Fetches disputes updated in the last 48 hours as a safety overlap window.
 */
async function syncStripeDisputesForOrganization(
  organizationId: string,
  stripeKey: string
): Promise<StripeSyncResult> {
  const db = getDb();
  const errors: string[] = [];
  let disputesSynced = 0;
  let disputesCreated = 0;
  let disputesUpdated = 0;

  try {
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      return { success: false, disputesSynced: 0, disputesCreated: 0, disputesUpdated: 0, errors: [`Organization ${organizationId} not found`] };
    }
    const org = orgDoc.data()!;
    const stripeIntegration = org.pspIntegrations?.stripe;

    if (!stripeIntegration || stripeIntegration.status !== "connected") {
      return { success: false, disputesSynced: 0, disputesCreated: 0, disputesUpdated: 0, errors: ["Stripe integration not connected"] };
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const twoDaysAgo = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
    const disputes = await stripe.disputes.list({
      created: { gte: twoDaysAgo },
      limit: 100,
    });

    for (const dispute of disputes.data) {
      try {
        const existingQuery = await db
          .collection("disputes")
          .where("organizationId", "==", organizationId)
          .where("pspProvider", "==", "stripe")
          .where("pspDisputeId", "==", dispute.id)
          .limit(1)
          .get();

        if (existingQuery.empty) {
          disputesCreated++;
        } else {
          disputesUpdated++;
        }

        const paymentMeta = dispute.payment_intent
          ? await getPaymentMetadata(dispute.payment_intent as string, stripe)
          : {};

        const normalized = normalizeStripeDispute(
          dispute,
          organizationId,
          paymentMeta.transactionDate,
          paymentMeta.last4
        );
        await upsertUnifiedDispute(normalized);
        disputesSynced++;
      } catch (error: any) {
        errors.push(`Failed to sync Stripe dispute ${dispute.id}: ${error.message}`);
        console.error(`Failed to sync Stripe dispute ${dispute.id}:`, error);
      }
    }

    return { success: errors.length === 0, disputesSynced, disputesCreated, disputesUpdated, errors };
  } catch (error: any) {
    errors.push(`Stripe sync failed: ${error.message}`);
    console.error(`Stripe sync failed for org ${organizationId}:`, error);
    return { success: false, disputesSynced, disputesCreated, disputesUpdated, errors };
  }
}

export { syncStripeDisputesForOrganization };

export const disputeSyncScheduler = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "UTC",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [stripeSecretKey],
  },
  async () => {
    const db = getDb();

    const orgsSnap = await db.collection("organizations").get();
    if (orgsSnap.empty) {
      console.log("disputeSyncScheduler: no organizations found");
      return;
    }

    let totalSynced = 0;
    let totalErrors = 0;

    for (const orgDoc of orgsSnap.docs) {
      const org = orgDoc.data();
      const organizationId = orgDoc.id;

      // Adyen sync
      if (org.pspIntegrations?.adyen?.status === "connected") {
        try {
          const result = await syncDisputesForOrganization(organizationId);
          totalSynced += result.disputesSynced;
          if (result.errors.length > 0) {
            totalErrors += result.errors.length;
            console.warn(`Adyen sync errors for ${organizationId}:`, result.errors);
          }
          console.log(
            `disputeSyncScheduler: Adyen sync for ${organizationId}: ` +
            `${result.disputesCreated} created, ${result.disputesUpdated} updated`
          );
        } catch (error) {
          totalErrors++;
          console.error(`disputeSyncScheduler: Adyen sync failed for ${organizationId}:`, error);
        }
      }

      // Stripe catch-up sync
      if (org.pspIntegrations?.stripe?.status === "connected") {
        const stripeKey = stripeSecretKey.value().trim();
        if (stripeKey) {
          try {
            const result = await syncStripeDisputesForOrganization(organizationId, stripeKey);
            totalSynced += result.disputesSynced;
            if (result.errors.length > 0) {
              totalErrors += result.errors.length;
              console.warn(`Stripe sync errors for ${organizationId}:`, result.errors);
            }
            console.log(
              `disputeSyncScheduler: Stripe sync for ${organizationId}: ` +
              `${result.disputesCreated} created, ${result.disputesUpdated} updated`
            );
          } catch (error) {
            totalErrors++;
            console.error(`disputeSyncScheduler: Stripe sync failed for ${organizationId}:`, error);
          }
        }
      }
    }

    console.log(`disputeSyncScheduler: total synced=${totalSynced}, errors=${totalErrors}`);
  }
);
