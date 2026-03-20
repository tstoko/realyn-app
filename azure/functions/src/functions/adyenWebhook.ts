import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getOrganizationByAdyenMerchant, Organization } from "../services/organizationService";
import { upsertUnifiedDispute, updateDisputeStatus, UnifiedDisputeData } from "../services/disputeService";
import * as crypto from "crypto";

interface AdyenNotificationItem {
  NotificationRequestItem: {
    additionalData?: Record<string, string>;
    amount: { currency: string; value: number };
    eventCode: string;
    eventDate: string;
    merchantAccountCode: string;
    merchantReference?: string;
    operations?: string[];
    originalReference?: string;
    paymentMethod?: string;
    pspReference: string;
    reason?: string;
    success: string;
  };
}

interface AdyenWebhookPayload {
  live: string;
  notificationItems: AdyenNotificationItem[];
}

/**
 * Adyen webhook handler
 */
async function adyenWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Parse request body
  let payload: AdyenWebhookPayload;
  try {
    payload = await request.json() as AdyenWebhookPayload;
  } catch {
    return {
      status: 400,
      jsonBody: { error: "Invalid JSON payload" },
    };
  }

  if (!payload.notificationItems || !Array.isArray(payload.notificationItems)) {
    return {
      status: 400,
      jsonBody: { error: "Missing notificationItems" },
    };
  }

  // Process each notification
  for (const item of payload.notificationItems) {
    const notification = item.NotificationRequestItem;
    const merchantAccount = notification.merchantAccountCode;
    
    // Find organization by merchant account
    const organization = await getOrganizationByAdyenMerchant(merchantAccount);
    
    if (!organization) {
      context.warn(`No organization found for merchant account: ${merchantAccount}`);
      continue;
    }
    
    // Verify webhook authentication if configured
    if (!await verifyWebhookAuth(request, organization)) {
      context.warn(`Webhook authentication failed for organization: ${organization.id}`);
      continue;
    }

    // Process based on event code
    try {
      await processNotification(notification, organization, context);
    } catch (error: any) {
      context.error(`Error processing notification: ${error.message}`);
    }
  }

  // Adyen expects "[accepted]" response
  return {
    status: 200,
    body: "[accepted]",
  };
}

/**
 * Verify Adyen webhook authentication
 */
async function verifyWebhookAuth(request: HttpRequest, organization: Organization): Promise<boolean> {
  const adyenConfig = organization.pspIntegrations?.adyen;
  
  if (!adyenConfig?.webhookUsername || !adyenConfig?.webhookPassword) {
    // No authentication configured, allow all
    return true;
  }
  
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }
  
  const base64Credentials = authHeader.slice(6);
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
  const [username, password] = credentials.split(":");
  
  return username === adyenConfig.webhookUsername && password === adyenConfig.webhookPassword;
}

/**
 * Process Adyen notification
 */
async function processNotification(
  notification: AdyenNotificationItem["NotificationRequestItem"],
  organization: Organization,
  context: InvocationContext
): Promise<void> {
  const eventCode = notification.eventCode;
  
  // Handle dispute-related events
  if (eventCode.startsWith("CHARGEBACK") || eventCode.startsWith("REQUEST_FOR_INFORMATION") || 
      eventCode.startsWith("NOTIFICATION_OF_CHARGEBACK") || eventCode.startsWith("SECOND_CHARGEBACK")) {
    
    const data: UnifiedDisputeData = {
      organizationId: organization.id,
      pspProvider: "adyen",
      pspDisputeId: notification.pspReference,
      pspPaymentId: notification.originalReference || notification.pspReference,
      pspTransactionDate: new Date(notification.eventDate),
      pspLast4Digits: notification.additionalData?.cardSummary,
      amount: notification.amount.value,
      currency: notification.amount.currency,
      stripeStatus: mapAdyenStatus(eventCode),
      reason: notification.reason,
      customerExplanation: notification.additionalData?.disputeReason || "",
    };
    
    // Calculate respond by date if available
    const defenseDeadline = notification.additionalData?.defenseDeadline;
    if (defenseDeadline) {
      data.respondBy = new Date(defenseDeadline);
    }
    
    const disputeId = await upsertUnifiedDispute(data);
    context.log(`Processed Adyen dispute ${notification.pspReference} -> ${disputeId}`);
    
  } else if (eventCode === "CHARGEBACK_REVERSED") {
    await updateDisputeStatus("adyen", notification.pspReference, "won");
    context.log(`Adyen dispute ${notification.pspReference} reversed (won)`);
    
  } else {
    context.log(`Ignoring Adyen event: ${eventCode}`);
  }
}

/**
 * Map Adyen event code to our status
 */
function mapAdyenStatus(eventCode: string): "needs_response" | "under_review" | "won" | "lost" {
  switch (eventCode) {
    case "REQUEST_FOR_INFORMATION":
    case "NOTIFICATION_OF_CHARGEBACK":
      return "needs_response";
    case "CHARGEBACK":
    case "SECOND_CHARGEBACK":
      return "lost";
    case "CHARGEBACK_REVERSED":
      return "won";
    default:
      return "needs_response";
  }
}

// Register the function
app.http("adyenWebhook", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: adyenWebhook,
});

export default adyenWebhook;
