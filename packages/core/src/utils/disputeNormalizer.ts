import Stripe from "stripe";
import type { UnifiedDisputeData, DisputeStatus } from "../types/dispute";

/**
 * Map Stripe dispute status to unified status
 */
export function mapStripeStatus(stripeStatus: Stripe.Dispute.Status): DisputeStatus {
  const statusMap: Record<string, DisputeStatus> = {
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

/**
 * Normalize Stripe dispute to unified format
 */
export function normalizeStripeDispute(
  stripeDispute: Stripe.Dispute,
  organizationId: string,
  transactionDate?: Date,
  last4Digits?: string
): UnifiedDisputeData {
  return {
    organizationId,
    pspProvider: "stripe",
    pspDisputeId: stripeDispute.id,
    pspPaymentId: stripeDispute.payment_intent as string,
    pspTransactionDate: transactionDate || new Date(stripeDispute.created * 1000),
    pspLast4Digits: last4Digits,
    amount: stripeDispute.amount, // Already in cents
    currency: stripeDispute.currency,
    status: mapStripeStatus(stripeDispute.status),
    reason: stripeDispute.reason || null,
    respondBy: stripeDispute.evidence_details?.due_by
      ? new Date(stripeDispute.evidence_details.due_by * 1000)
      : null,
    customerExplanation: "", // Stripe doesn't provide this directly
  };
}

/**
 * Map Adyen event code to unified dispute status
 */
export function mapAdyenStatus(eventCode: string): DisputeStatus {
  // Adyen event codes for chargebacks/disputes
  const statusMap: Record<string, DisputeStatus> = {
    CHARGEBACK: "needs_response",
    SECOND_CHARGEBACK: "needs_response",
    CHARGEBACK_REVERSED: "won",
    DEFENSE_DEBIT: "lost",
    NOTIFICATION_OF_CHARGEBACK: "needs_response",
  };

  return statusMap[eventCode] || "under_review";
}

/**
 * Map Adyen reason code to dispute reason
 */
export function mapAdyenReason(reason?: string): string | null {
  if (!reason) return null;
  
  // Map Adyen reason codes to standard reasons
  const reasonMap: Record<string, string> = {
    "10.1": "fraudulent",
    "10.2": "fraudulent",
    "10.3": "fraudulent",
    "10.4": "fraudulent",
    "41": "fraudulent",
    "53": "product_not_received",
    "57": "fraudulent",
    "59": "fraudulent",
    "83": "fraudulent",
    "85": "credit_not_processed",
    "93": "fraudulent",
  };

  return reasonMap[reason] || reason;
}

/**
 * Normalize Adyen notification to unified format
 */
export function normalizeAdyenDispute(
  adyenNotification: any,
  organizationId: string
): UnifiedDisputeData {
  const item = adyenNotification.notificationItems?.[0]?.NotificationRequestItem;
  if (!item) {
    throw new Error("Invalid Adyen notification format");
  }

  const eventDate = item.eventDate ? new Date(item.eventDate) : new Date();
  const amount = item.amount?.value || 0; // Already in minor units
  const currency = item.amount?.currency?.toLowerCase() || "usd";

  return {
    organizationId,
    pspProvider: "adyen",
    pspDisputeId: item.pspReference,
    pspPaymentId: item.originalReference || item.pspReference,
    pspTransactionDate: eventDate,
    pspLast4Digits: item.additionalData?.cardSummary,
    amount,
    currency,
    status: mapAdyenStatus(item.eventCode),
    reason: mapAdyenReason(item.reason),
    respondBy: null, // Adyen provides this differently, may need to calculate
    customerExplanation: item.additionalData?.chargebackReason || "",
  };
}

