import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import { verifyAdyenSignature, getOrganizationFromAdyenNotification } from "../utils/adyenHelpers";
import { normalizeAdyenDispute } from "../utils/disputeNormalizer";
import { upsertUnifiedDispute } from "../services/disputeService";
import { recordDisputeOutcome } from "../services/winPatternService";
import { applyRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";

/**
 * Adyen webhook handler for dispute events
 */
export const adyenWebhook = onRequest(
  {
    cors: false,
  },
  async (req: Request, res: Response) => {
    const rateLimitOk = await applyRateLimit(
      req, res, getClientIP(req), RATE_LIMIT_CONFIGS.webhook
    );
    if (!rateLimitOk) return;

    try {
      const notification = req.body;

      const notificationRequestItem = notification.notificationItems?.[0]?.NotificationRequestItem;
      const hmacSignature =
        notificationRequestItem?.additionalData?.hmacSignature ||
        (req.headers["x-adyen-signature"] as string);

      if (!hmacSignature) {
        console.warn("Adyen webhook: Missing HMAC signature in additionalData and header");
        res.status(400).json({ error: "Missing HMAC signature" });
        return;
      }

      const merchantAccount = notification.notificationItems?.[0]?.NotificationRequestItem?.merchantAccountCode;
      console.log(`Adyen webhook: Received notification for merchant account: ${merchantAccount || 'unknown'}`);

      // Get organization and webhook password
      const orgData = await getOrganizationFromAdyenNotification(notification);
      if (!orgData) {
        console.error(`Adyen webhook: Organization not found for merchant: ${merchantAccount}`);
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      console.log(`Adyen webhook: Found organization: ${orgData.organizationId}`);

      // Verify HMAC signature
      const isValid = verifyAdyenSignature(
        notification,
        hmacSignature,
        orgData.webhookPassword
      );

      if (!isValid) {
        console.error(`Adyen webhook: Invalid signature for organization: ${orgData.organizationId}`);
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      console.log(`Adyen webhook: ✅ Signature verified for organization: ${orgData.organizationId}`);

      const notificationItem = notification.notificationItems?.[0]?.NotificationRequestItem;

      if (!notificationItem) {
        console.error("Adyen webhook: Invalid notification format - missing NotificationRequestItem");
        res.status(400).json({ error: "Invalid notification format" });
        return;
      }

      // Process dispute-related events
      const eventCode = notificationItem.eventCode;
      console.log(`Adyen webhook: Processing event: ${eventCode} for organization: ${orgData.organizationId}`);
      
      const disputeEvents = [
        "CHARGEBACK",
        "SECOND_CHARGEBACK",
        "CHARGEBACK_REVERSED",
        "DEFENSE_DEBIT",
        "NOTIFICATION_OF_CHARGEBACK",
      ];

      if (disputeEvents.includes(eventCode)) {
        // Normalize and store dispute using unified service
        const normalized = normalizeAdyenDispute(notification, orgData.organizationId);
        const disputeDocId = await upsertUnifiedDispute(normalized);
        console.log(`Adyen webhook: ✅ Created/updated dispute ${normalized.pspDisputeId} for organization: ${orgData.organizationId}`);

        const outcomeMap: Record<string, "won" | "lost"> = {
          CHARGEBACK_REVERSED: "won",
          DEFENSE_DEBIT: "lost",
        };
        const outcome = outcomeMap[eventCode];
        if (outcome) {
          recordDisputeOutcome(disputeDocId, outcome).catch((err) => {
            console.error(`[WinPattern] Failed to record Adyen outcome for ${disputeDocId}:`, err);
          });
        }
      } else {
        console.log(`Adyen webhook: Event ${eventCode} is not a dispute event, skipping`);
      }

      // Always return [accepted] for Adyen
      res.status(200).send("[accepted]");
    } catch (error: any) {
      console.error("Error processing Adyen webhook:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

