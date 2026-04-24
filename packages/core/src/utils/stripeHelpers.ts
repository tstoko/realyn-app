import Stripe from "stripe";
import * as admin from "firebase-admin";

/**
 * Extract organizationId from Stripe event metadata or payment intent
 * For now, we'll try to get it from metadata, otherwise use a default
 * In production, you'd want to configure this per Stripe account
 */
/**
 * Resolve the organizationId for a Stripe webhook event.
 *
 * Checks PaymentIntent metadata then dispute metadata. Returns null when the
 * organization cannot be determined — the caller must handle unmatched events
 * (e.g. log to an unmatchedWebhookEvents collection) instead of silently
 * assigning the dispute to a random organization.
 */
export async function getOrganizationIdFromStripeEvent(
  event: Stripe.Event,
  stripe: Stripe
): Promise<string | null> {
  const dispute = event.data.object as Stripe.Dispute;
  
  // Try to get organizationId from payment intent metadata
  if (dispute.payment_intent) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        dispute.payment_intent as string
      );
      
      if (paymentIntent.metadata?.organizationId) {
        return paymentIntent.metadata.organizationId;
      }
    } catch (error) {
      console.warn("Could not retrieve payment intent:", error);
    }
  }
  
  // Try to get from dispute metadata
  if (dispute.metadata?.organizationId) {
    return dispute.metadata.organizationId;
  }

  // Try to match by Stripe account ID against organizations with connected Stripe
  // This handles the common case where metadata wasn't set but the webhook
  // is from a specific Stripe Connect account
  if (event.account) {
    const db = admin.firestore();
    const orgsSnapshot = await db.collection("organizations")
      .where("pspIntegrations.stripe.stripeUserId", "==", event.account)
      .limit(1)
      .get();

    if (!orgsSnapshot.empty) {
      const orgId = orgsSnapshot.docs[0].id;
      console.log(`[StripeWebhook] Matched organization ${orgId} via Stripe account ${event.account}`);
      return orgId;
    }
  }
  
  // Cannot determine organization — return null so the caller can handle
  // the unmatched event appropriately (log it, don't silently assign)
  console.warn(
    `[StripeWebhook] Could not determine organization for event ${event.id} ` +
    `(type: ${event.type}, dispute: ${dispute.id}). ` +
    "Event will be logged to unmatchedWebhookEvents."
  );
  return null;
}

/**
 * Extract payment metadata from Stripe PaymentIntent
 */
export async function getPaymentMetadata(
  paymentIntentId: string,
  stripe: Stripe
): Promise<{
  last4?: string;
  transactionDate?: Date;
}> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    // Get last4 from payment method if available
    let last4: string | undefined;
    if (paymentIntent.payment_method) {
      const pm = await stripe.paymentMethods.retrieve(
        paymentIntent.payment_method as string
      );
      last4 = pm.card?.last4;
    }
    
    // Transaction date is when the payment intent was created
    const transactionDate = new Date(paymentIntent.created * 1000);
    
    return {
      last4,
      transactionDate,
    };
  } catch (error) {
    console.warn("Could not retrieve payment metadata:", error);
    return {};
  }
}

