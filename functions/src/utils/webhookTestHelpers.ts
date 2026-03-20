/**
 * Test utilities for webhook testing
 */

import Stripe from "stripe";
import * as crypto from "crypto";
import * as admin from "firebase-admin";

/**
 * Generate a mock Stripe webhook event
 */
export function generateStripeWebhookEvent(
  disputeId: string,
  organizationId: string,
  options?: {
    amount?: number;
    currency?: string;
    status?: Stripe.Dispute.Status;
    paymentIntentId?: string;
    reason?: string;
  }
): Stripe.Event {
  const dispute = {
    id: disputeId,
    object: "dispute",
    amount: options?.amount || 10000, // $100.00 in cents
    currency: options?.currency || "usd",
    status: options?.status || "needs_response",
    reason: options?.reason || "fraudulent",
    created: Math.floor(Date.now() / 1000),
    payment_intent: options?.paymentIntentId || `pi_test_${Date.now()}`,
    charge: `ch_test_${Date.now()}`,
    evidence_details: {
      due_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days from now
      has_evidence: false,
      past_due: false,
      submission_count: 0,
    },
    metadata: {
      organizationId,
    },
  } as unknown as Stripe.Dispute;

  return {
    id: `evt_test_${Date.now()}`,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    type: "charge.dispute.created",
    data: {
      object: dispute,
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
  } as Stripe.Event;
}

/**
 * Generate Stripe webhook signature
 */
export function generateStripeSignature(
  payload: string,
  secret: string
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Generate a mock Adyen notification
 */
export function generateAdyenNotification(
  merchantAccount: string,
  options?: {
    pspReference?: string;
    originalReference?: string;
    amount?: number;
    currency?: string;
    eventCode?: string;
    reason?: string;
    cardSummary?: string;
  }
): any {
  const pspReference = options?.pspReference || `PSP_${Date.now()}`;
  const originalReference = options?.originalReference || `ORIG_${Date.now()}`;
  const amount = options?.amount || 10000; // in minor units
  const currency = options?.currency || "USD";
  const eventCode = options?.eventCode || "CHARGEBACK";

  return {
    notificationItems: [
      {
        NotificationRequestItem: {
          pspReference,
          originalReference,
          merchantAccountCode: merchantAccount,
          merchantReference: `MERCH_${Date.now()}`,
          amount: {
            value: amount,
            currency,
          },
          eventCode,
          eventDate: new Date().toISOString(),
          reason: options?.reason || "10.1",
          success: true,
          additionalData: {
            cardSummary: options?.cardSummary || "1234",
            chargebackReason: options?.reason || "Fraudulent transaction",
          },
        },
      },
    ],
  };
}

/**
 * Generate Adyen HMAC signature
 */
export function generateAdyenHMAC(
  notification: any,
  webhookPassword: string
): string {
  const notificationRequestItem =
    notification.notificationItems?.[0]?.NotificationRequestItem;
  if (!notificationRequestItem) {
    throw new Error("Invalid Adyen notification format");
  }

  const dataToSign = [
    notificationRequestItem.pspReference,
    notificationRequestItem.originalReference || "",
    notificationRequestItem.merchantAccountCode,
    notificationRequestItem.merchantReference || "",
    notificationRequestItem.amount?.value?.toString() || "",
    notificationRequestItem.amount?.currency || "",
    notificationRequestItem.eventCode,
    notificationRequestItem.success === true ? "true" : "false",
  ].join(":");

  return crypto
    .createHmac("sha256", webhookPassword)
    .update(dataToSign)
    .digest("base64");
}

/**
 * Verify dispute exists in Firestore
 */
export async function verifyDisputeInFirestore(
  pspProvider: "stripe" | "adyen",
  pspDisputeId: string,
  organizationId: string
): Promise<boolean> {
  const db = admin.firestore();
  const snapshot = await db
    .collection("disputes")
    .where("pspProvider", "==", pspProvider)
    .where("pspDisputeId", "==", pspDisputeId)
    .where("organizationId", "==", organizationId)
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Get dispute from Firestore
 */
export async function getDisputeFromFirestore(
  pspProvider: "stripe" | "adyen",
  pspDisputeId: string
): Promise<any | null> {
  const db = admin.firestore();
  const snapshot = await db
    .collection("disputes")
    .where("pspProvider", "==", pspProvider)
    .where("pspDisputeId", "==", pspDisputeId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

