import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Stripe from "stripe";
import { getOrganizationByStripeWebhook } from "../services/organizationService";
import { upsertUnifiedDispute, updateDisputeStatus, UnifiedDisputeData } from "../services/disputeService";

/**
 * Stripe webhook handler
 * Receives dispute events from Stripe and updates Cosmos DB
 */
async function stripeWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const signature = request.headers.get("stripe-signature");
  
  if (!signature) {
    return {
      status: 400,
      jsonBody: { error: "Missing stripe-signature header" },
    };
  }

  // Get raw body as Buffer for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());
  
  // Find organization by verifying webhook signature
  const result = await getOrganizationByStripeWebhook(rawBody, signature);
  
  if (!result) {
    context.warn("Could not verify webhook signature with any organization");
    return {
      status: 400,
      jsonBody: { error: "Invalid webhook signature" },
    };
  }
  
  const { organization, stripe } = result;
  
  // Parse the event
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      organization.pspIntegrations?.stripe?.webhookSecret!
    );
  } catch (err: any) {
    context.error(`Webhook signature verification failed: ${err.message}`);
    return {
      status: 400,
      jsonBody: { error: "Invalid signature" },
    };
  }

  // Process the event
  try {
    const dispute = event.data.object as Stripe.Dispute;
    
    switch (event.type) {
      case "charge.dispute.created":
      case "charge.dispute.updated":
        await handleDisputeUpsert(dispute, stripe, organization.id, context);
        break;
        
      case "charge.dispute.closed":
        await handleDisputeClosed(dispute, context);
        break;
        
      default:
        context.log(`Unhandled event type: ${event.type}`);
    }
    
    return {
      status: 200,
      jsonBody: { received: true },
    };
  } catch (error: any) {
    context.error(`Error processing webhook: ${error.message}`);
    return {
      status: 500,
      jsonBody: { error: error.message },
    };
  }
}

/**
 * Handle dispute creation or update
 */
async function handleDisputeUpsert(
  dispute: Stripe.Dispute,
  stripe: Stripe,
  organizationId: string,
  context: InvocationContext
): Promise<void> {
  // Get payment metadata for transaction date and last 4 digits
  let transactionDate = new Date(dispute.created * 1000);
  let last4: string | undefined;
  
  if (dispute.payment_intent && typeof dispute.payment_intent === "string") {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(dispute.payment_intent);
      if (paymentIntent.created) {
        transactionDate = new Date(paymentIntent.created * 1000);
      }
      if (paymentIntent.payment_method && typeof paymentIntent.payment_method === "string") {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        last4 = paymentMethod.card?.last4;
      }
    } catch (err) {
      context.warn(`Could not fetch payment metadata: ${err}`);
    }
  }
  
  const data: UnifiedDisputeData = {
    organizationId,
    pspProvider: "stripe",
    pspDisputeId: dispute.id,
    pspPaymentId: (dispute.payment_intent as string) || dispute.charge as string,
    pspTransactionDate: transactionDate,
    pspLast4Digits: last4,
    amount: dispute.amount,
    currency: dispute.currency,
    stripeStatus: mapStripeStatus(dispute.status),
    reason: dispute.reason || undefined,
    respondBy: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : undefined,
    customerExplanation: dispute.evidence_details?.submission_count?.toString() || "",
  };
  
  const disputeId = await upsertUnifiedDispute(data);
  context.log(`Processed Stripe dispute ${dispute.id} -> ${disputeId}`);
}

/**
 * Handle dispute closed event
 */
async function handleDisputeClosed(
  dispute: Stripe.Dispute,
  context: InvocationContext
): Promise<void> {
  await updateDisputeStatus("stripe", dispute.id, mapStripeStatus(dispute.status));
  context.log(`Closed Stripe dispute ${dispute.id} with status ${dispute.status}`);
}

/**
 * Map Stripe dispute status to our status
 */
function mapStripeStatus(status: Stripe.Dispute.Status): "needs_response" | "under_review" | "won" | "lost" | "warning_closed" {
  switch (status) {
    case "warning_needs_response":
    case "needs_response":
      return "needs_response";
    case "warning_under_review":
    case "under_review":
      return "under_review";
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "warning_closed":
      return "warning_closed";
    default:
      return "needs_response";
  }
}

// Register the function
app.http("stripeWebhook", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: stripeWebhook,
});

export default stripeWebhook;
