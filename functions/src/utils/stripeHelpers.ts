import Stripe from "stripe";
import * as admin from "firebase-admin";

/**
 * Extract organizationId from Stripe event metadata or payment intent
 * For now, we'll try to get it from metadata, otherwise use a default
 * In production, you'd want to configure this per Stripe account
 */
export async function getOrganizationIdFromStripeEvent(
  event: Stripe.Event,
  stripe: Stripe
): Promise<string> {
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
  
  // Default: use first organization or a default
  // In production, you'd want to configure this properly
  const db = admin.firestore();
  const orgs = await db.collection("organizations").limit(1).get();
  if (!orgs.empty) {
    return orgs.docs[0].id;
  }
  
  // Fallback to default_org if no organizations exist
  return "default_org";
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

