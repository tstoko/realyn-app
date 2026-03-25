import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { Request, Response } from "express";
import { getOrganizationIdFromStripeEvent, getPaymentMetadata } from "./utils/stripeHelpers";
import { normalizeStripeDispute } from "./utils/disputeNormalizer";
import { upsertUnifiedDispute, updateDisputeStatus as updateUnifiedDisputeStatus } from "./services/disputeService";

admin.initializeApp();

// Define secrets
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const webhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

/**
 * Stripe webhook handler for dispute events
 * Note: Firebase Functions v2 parses JSON bodies automatically, so signature verification
 * is skipped when raw body is unavailable. For production, consider using v1 functions
 * or Cloud Run for proper signature verification.
 */
export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, webhookSecret],
    cors: false,
  },
  async (req: Request, res: Response) => {
    // Validate configuration
    const stripeKey = stripeSecretKey.value().trim();
    const webhookKey = webhookSecret.value().trim();
    
    if (!stripeKey || !webhookKey) {
      console.error("Missing Stripe configuration");
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      res.status(400).json({ error: "Missing signature header" });
      return;
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Attempt to get raw body for signature verification
    let event: Stripe.Event;
    const rawBody = getRawBody(req);

    if (rawBody) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookKey) as Stripe.Event;
      } catch (error: any) {
        console.error("Signature verification failed:", error.message);
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    } else {
      console.error("Raw body unavailable - cannot verify webhook signature. Use Firebase Functions v1 or Cloud Run for proper signature verification.");
      res.status(400).json({ error: "Unable to verify webhook signature" });
      return;
    }

    // Process event
    try {
      await processStripeEvent(event, stripe);
      res.json({ received: true });
    } catch (error: any) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Extract raw body from request if available
 */
function getRawBody(req: Request): Buffer | null {
  // Try different methods to get raw body
  if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
    return (req as any).rawBody;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return null;
}

/**
 * Process Stripe webhook events using the unified dispute pipeline
 */
async function processStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  switch (event.type) {
    case "charge.dispute.created":
    case "charge.dispute.updated": {
      const organizationId = await getOrganizationIdFromStripeEvent(event, stripe);
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
      console.log(`Upserted Stripe dispute ${dispute.id} for org ${organizationId}`);
      break;
    }
    case "charge.dispute.closed": {
      const { mapStripeStatus } = await import("./utils/disputeNormalizer");
      await updateUnifiedDisputeStatus("stripe", dispute.id, mapStripeStatus(dispute.status));
      console.log(`Closed Stripe dispute: ${dispute.id}`);
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

export { testOperaCloudConnection } from "./handlers/operaCloudConnectionTest";
export { seedPitchDemo } from "./handlers/seedPitchDemo";
export { processCSVImportHandler as processCSVImport } from "./handlers/csvImportHandler";
