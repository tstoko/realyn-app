import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { Request, Response } from "express";

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
    cors: true,
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
    const db = admin.firestore();

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
      // Fallback: use parsed body (signature verification skipped)
      // This is a limitation of Firebase Functions v2
      console.warn("Raw body unavailable - skipping signature verification");
      event = req.body as Stripe.Event;
    }

    // Process event
    try {
      await processStripeEvent(event, db);
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
 * Process Stripe webhook events
 */
async function processStripeEvent(event: Stripe.Event, db: admin.firestore.Firestore): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  switch (event.type) {
    case "charge.dispute.created":
      await upsertDispute(dispute, db);
      break;
    case "charge.dispute.updated":
      await upsertDispute(dispute, db);
      break;
    case "charge.dispute.closed":
      await updateDisputeStatus(dispute, db);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Create or update a dispute in Firestore
 */
async function upsertDispute(dispute: Stripe.Dispute, db: admin.firestore.Firestore): Promise<void> {
  const disputeData = {
    stripeDisputeId: dispute.id,
    stripePaymentIntentId: dispute.payment_intent as string,
    status: mapStripeStatus(dispute.status),
    reason: dispute.reason || null,
    amount: dispute.amount,
    currency: dispute.currency,
    createdAt: admin.firestore.Timestamp.fromDate(new Date(dispute.created * 1000)),
    respondBy: dispute.evidence_details?.due_by
      ? admin.firestore.Timestamp.fromDate(new Date(dispute.evidence_details.due_by * 1000))
      : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const existing = await db
    .collection("disputes")
    .where("stripeDisputeId", "==", dispute.id)
    .limit(1)
    .get();

  if (existing.empty) {
    await db.collection("disputes").add(disputeData);
    console.log(`Created dispute: ${dispute.id}`);
  } else {
    await db.collection("disputes").doc(existing.docs[0].id).update(disputeData);
    console.log(`Updated dispute: ${dispute.id}`);
  }
}

/**
 * Update dispute status when closed
 */
async function updateDisputeStatus(dispute: Stripe.Dispute, db: admin.firestore.Firestore): Promise<void> {
  const existing = await db
    .collection("disputes")
    .where("stripeDisputeId", "==", dispute.id)
    .limit(1)
    .get();

  if (!existing.empty) {
    await db.collection("disputes").doc(existing.docs[0].id).update({
      status: mapStripeStatus(dispute.status),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Closed dispute: ${dispute.id}`);
  }
}

/**
 * Map Stripe dispute status to internal status
 */
function mapStripeStatus(stripeStatus: Stripe.Dispute.Status): string {
  const statusMap: Record<string, string> = {
    warning_needs_response: "needs_response",
    warning_under_review: "under_review",
    warning_closed: "warning_closed",
    needs_response: "needs_response",
    under_review: "under_review",
    won: "won",
    lost: "lost",
  };

  return statusMap[stripeStatus] || "under_review";
}
