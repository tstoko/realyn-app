/**
 * Unified dispute type that all PSPs normalize to
 */

export type PSPProvider = "stripe" | "adyen";
export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost" | "warning_closed";

export interface UnifiedDisputeData {
  organizationId: string;
  pspProvider: PSPProvider;
  pspDisputeId: string;
  pspPaymentId: string;
  pspTransactionDate: Date;
  pspLast4Digits?: string;
  amount: number; // in cents/minor units
  currency: string;
  status: DisputeStatus; // Unified status across all PSPs
  reason: string | null;
  respondBy: Date | null;
  customerExplanation: string;
}

