import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { Request, Response } from "express";
import { applyRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import { ALLOWED_ORIGINS } from "../config/environment";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app",
  });
}

const db = admin.firestore();

const billingStripeKey = defineSecret("STRIPE_BILLING_SECRET_KEY");
const billingWebhookSecret = defineSecret("STRIPE_BILLING_WEBHOOK_SECRET");

function getBillingStripe(): Stripe {
  return new Stripe(billingStripeKey.value().trim(), { apiVersion: "2023-10-16" });
}

async function verifyAuthToken(req: Request): Promise<{ uid: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
    return { uid: decoded.uid, email: decoded.email || "" };
  } catch {
    return null;
  }
}

async function getOrgForUser(uid: string): Promise<{ orgId: string; orgName: string } | null> {
  const userDoc = await db.collection("users").doc(uid).get();
  const data = userDoc.data();
  if (!data?.organizationId) return null;
  const orgDoc = await db.collection("organizations").doc(data.organizationId).get();
  return {
    orgId: data.organizationId,
    orgName: orgDoc.data()?.name || data.organizationId,
  };
}

async function handleCreateCheckoutSession(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await verifyAuthToken(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const org = await getOrgForUser(user.uid);
  if (!org) {
    res.status(400).json({ error: "No organization found for user" });
    return;
  }

  const { priceId, planId } = req.body;
  if (!priceId) {
    res.status(400).json({ error: "Missing priceId" });
    return;
  }

  const stripe = getBillingStripe();

  const orgDoc = await db.collection("organizations").doc(org.orgId).get();
  const orgData = orgDoc.data();
  let customerId = orgData?.subscription?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org.orgName,
      metadata: { organizationId: org.orgId, createdBy: user.uid },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${req.headers.origin || "https://dashboard.realyn.com"}/billing?success=true`,
    cancel_url: `${req.headers.origin || "https://dashboard.realyn.com"}/billing?canceled=true`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { organizationId: org.orgId, planId: planId || "unknown" },
    },
    metadata: { organizationId: org.orgId, planId: planId || "unknown" },
  });

  res.json({ url: session.url });
}

async function handleBillingWebhook(req: Request, res: Response): Promise<void> {
  const rateLimitOk = await applyRateLimit(
    req, res, getClientIP(req), RATE_LIMIT_CONFIGS.webhook
  );
  if (!rateLimitOk) return;

  const stripe = getBillingStripe();
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "Unable to verify webhook signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      billingWebhookSecret.value().trim()
    ) as Stripe.Event;
  } catch (err: any) {
    console.error("Billing webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organizationId;
        if (!orgId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await updateSubscriptionInFirestore(orgId, subscription, session.customer as string);
        console.log(`Checkout completed for org ${orgId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.organizationId;
        if (!orgId) break;
        await updateSubscriptionInFirestore(orgId, subscription);
        console.log(`Subscription updated for org ${orgId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.organizationId;
        if (!orgId) break;
        await db.collection("organizations").doc(orgId).update({
          "subscription.status": "canceled",
          "subscription.cancelAtPeriodEnd": false,
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Subscription canceled for org ${orgId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;
        const subscription = await stripe.subscriptions.retrieve(subId);
        const orgId = subscription.metadata?.organizationId;
        if (!orgId) break;
        await db.collection("organizations").doc(orgId).update({
          "subscription.status": "past_due",
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Payment failed for org ${orgId}`);
        break;
      }

      default:
        console.log(`Unhandled billing event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Error processing billing webhook:", error);
    res.status(500).json({ error: error.message });
  }
}

async function updateSubscriptionInFirestore(
  orgId: string,
  subscription: Stripe.Subscription,
  customerId?: string
): Promise<void> {
  const planId =
    subscription.metadata?.planId ||
    subscription.items.data[0]?.price?.lookup_key ||
    subscription.items.data[0]?.price?.id ||
    "unknown";
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

  const update: Record<string, unknown> = {
    "subscription.planId": planId,
    "subscription.stripeSubscriptionId": subscription.id,
    "subscription.status": subscription.status,
    "subscription.currentPeriodEnd": currentPeriodEnd,
    "subscription.cancelAtPeriodEnd": subscription.cancel_at_period_end,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (customerId) {
    update["subscription.stripeCustomerId"] = customerId;
  }

  await db.collection("organizations").doc(orgId).update(update);
}

async function handleCreateBillingPortalSession(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await verifyAuthToken(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const org = await getOrgForUser(user.uid);
  if (!org) {
    res.status(400).json({ error: "No organization found" });
    return;
  }

  const orgDoc = await db.collection("organizations").doc(org.orgId).get();
  const customerId = orgDoc.data()?.subscription?.stripeCustomerId;

  if (!customerId) {
    res.status(400).json({ error: "No billing account found. Please subscribe first." });
    return;
  }

  const stripe = getBillingStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${req.headers.origin || "https://dashboard.realyn.com"}/billing`,
  });

  res.json({ url: session.url });
}

export const createCheckoutSession = onRequest(
  { cors: ALLOWED_ORIGINS, secrets: [billingStripeKey] },
  handleCreateCheckoutSession
);

export const billingWebhook = onRequest(
  { cors: false, secrets: [billingStripeKey, billingWebhookSecret] },
  handleBillingWebhook
);

export const createBillingPortalSession = onRequest(
  { cors: ALLOWED_ORIGINS, secrets: [billingStripeKey] },
  handleCreateBillingPortalSession
);
