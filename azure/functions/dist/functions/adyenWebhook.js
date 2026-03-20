"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const organizationService_1 = require("../services/organizationService");
const disputeService_1 = require("../services/disputeService");
/**
 * Adyen webhook handler
 */
async function adyenWebhook(request, context) {
    // Parse request body
    let payload;
    try {
        payload = await request.json();
    }
    catch {
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
        const organization = await (0, organizationService_1.getOrganizationByAdyenMerchant)(merchantAccount);
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
        }
        catch (error) {
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
async function verifyWebhookAuth(request, organization) {
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
async function processNotification(notification, organization, context) {
    const eventCode = notification.eventCode;
    // Handle dispute-related events
    if (eventCode.startsWith("CHARGEBACK") || eventCode.startsWith("REQUEST_FOR_INFORMATION") ||
        eventCode.startsWith("NOTIFICATION_OF_CHARGEBACK") || eventCode.startsWith("SECOND_CHARGEBACK")) {
        const data = {
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
        const disputeId = await (0, disputeService_1.upsertUnifiedDispute)(data);
        context.log(`Processed Adyen dispute ${notification.pspReference} -> ${disputeId}`);
    }
    else if (eventCode === "CHARGEBACK_REVERSED") {
        await (0, disputeService_1.updateDisputeStatus)("adyen", notification.pspReference, "won");
        context.log(`Adyen dispute ${notification.pspReference} reversed (won)`);
    }
    else {
        context.log(`Ignoring Adyen event: ${eventCode}`);
    }
}
/**
 * Map Adyen event code to our status
 */
function mapAdyenStatus(eventCode) {
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
functions_1.app.http("adyenWebhook", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: adyenWebhook,
});
exports.default = adyenWebhook;
//# sourceMappingURL=adyenWebhook.js.map