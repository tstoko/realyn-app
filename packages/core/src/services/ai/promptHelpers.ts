/**
 * Shared prompt helpers for AI specialist modules.
 *
 * Provides a single source of truth for serializing DisputeCase fields into
 * markdown text blocks used in LLM prompts.
 */

import { DisputeCase } from "../../types/aiDispute";

export interface DisputeContextOptions {
  includePsp?: boolean;
  includeDates?: boolean;
  includeHotelProfile?: boolean;
  includeHotelPolicies?: boolean;
  includeBooking?: boolean;
  includeGuest?: boolean;
  includePayment?: boolean;
  /** Only include 3DS/AVS/CVV from payment data (omit last4, authCode) */
  paymentVerificationOnly?: boolean;
  includeUrgency?: boolean;
}

/**
 * Build the dispute-context markdown block used in specialist LLM prompts.
 *
 * Each section is opt-in via `options` so specialists that only need the
 * minimal amount/reason/claim context can omit the heavier blocks.
 *
 * Calling with an empty options object produces the minimal block:
 * amount, currency, reason, and customer explanation.
 */
export function buildDisputeContextBlock(
  disputeCase: DisputeCase,
  options: DisputeContextOptions = {}
): string {
  const parts: string[] = [];

  parts.push("## DISPUTE CONTEXT");
  parts.push(`- **Amount**: ${disputeCase.currency} ${(disputeCase.amount / 100).toFixed(2)}`);
  parts.push(`- **Reason**: ${disputeCase.reason || "Not specified"}`);

  if (options.includePsp) {
    parts.push(`- **PSP**: ${disputeCase.pspProvider}`);
  }

  if (options.includeDates) {
    if (disputeCase.transactionDate) {
      parts.push(`- **Transaction Date**: ${disputeCase.transactionDate}`);
    }
    if (disputeCase.respondByDate) {
      parts.push(`- **Respond By**: ${disputeCase.respondByDate}`);
    }
  }

  if (disputeCase.customerExplanation) {
    parts.push(`- **Customer Claim**: "${disputeCase.customerExplanation}"`);
  }
  parts.push("");

  if (options.includeUrgency && disputeCase.respondByDate) {
    try {
      const deadline = new Date(disputeCase.respondByDate);
      const hoursRemaining = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursRemaining < 48) {
        parts.push("## URGENT DEADLINE");
        if (hoursRemaining < 24) {
          parts.push(`**CRITICAL: Only ~${Math.max(1, Math.round(hoursRemaining))} hours remaining.**`);
          parts.push("Limit to 3-4 requirements. Focus ONLY on the most critical, easy-to-obtain evidence.");
          parts.push("Prioritize documents already on file and evidence that can be gathered immediately.");
        } else {
          parts.push(`**WARNING: Only ~${Math.round(hoursRemaining)} hours remaining.**`);
          parts.push("Keep requirements focused. Prioritize high-impact, readily available evidence.");
        }
        parts.push("");
      }
    } catch { /* invalid date, skip */ }
  }

  const isTicketing = disputeCase.merchantVertical === "ticketing";

  if (options.includeHotelProfile && disputeCase.hotelProfile) {
    parts.push(isTicketing ? "## MERCHANT INFORMATION" : "## HOTEL INFORMATION");
    parts.push(`- **Name**: ${disputeCase.hotelProfile.name}`);
    if (disputeCase.hotelProfile.location) {
      parts.push(`- **Location**: ${disputeCase.hotelProfile.location}`);
    }
    if (options.includeHotelPolicies && disputeCase.hotelProfile.policies) {
      parts.push("- **Policies on File**:");
      if (disputeCase.hotelProfile.policies.cancellation) {
        parts.push(`  - Cancellation: ${disputeCase.hotelProfile.policies.cancellation}`);
      }
      if (disputeCase.hotelProfile.policies.refund) {
        parts.push(`  - Refund: ${disputeCase.hotelProfile.policies.refund}`);
      }
      if (disputeCase.hotelProfile.policies.noShow) {
        parts.push(`  - No-Show: ${disputeCase.hotelProfile.policies.noShow}`);
      }
    }
    parts.push("");
  }

  if (options.includeBooking) {
    if (disputeCase.booking) {
      parts.push(isTicketing ? "## ORDER INFORMATION" : "## BOOKING INFORMATION");
      if (disputeCase.booking.guestName) parts.push(isTicketing ? `- **Buyer Name**: ${disputeCase.booking.guestName}` : `- **Guest Name**: ${disputeCase.booking.guestName}`);
      if (disputeCase.booking.checkIn) parts.push(`- **Check-in**: ${disputeCase.booking.checkIn}`);
      if (disputeCase.booking.checkOut) parts.push(`- **Check-out**: ${disputeCase.booking.checkOut}`);
      if (disputeCase.booking.roomNumber) parts.push(`- **Room**: ${disputeCase.booking.roomNumber}`);
      if (disputeCase.booking.roomType) parts.push(`- **Room Type**: ${disputeCase.booking.roomType}`);
      if (disputeCase.booking.ratePlan) parts.push(`- **Rate Plan**: ${disputeCase.booking.ratePlan}`);
      if (disputeCase.booking.totalAmount) {
        parts.push(
          `- **Total**: ${disputeCase.booking.currency || disputeCase.currency} ${(
            disputeCase.booking.totalAmount / 100
          ).toFixed(2)}`
        );
      }
      if (disputeCase.booking.status) parts.push(`- **Status**: ${disputeCase.booking.status}`);
      parts.push("");
    } else {
      parts.push(isTicketing ? "## ORDER INFORMATION" : "## BOOKING INFORMATION");
      parts.push(isTicketing ? "*No order data linked to this dispute*" : "*No booking data linked to this dispute*");
      parts.push("");
    }
  }

  if (options.includeGuest && disputeCase.guest) {
    const name = [disputeCase.guest.firstName, disputeCase.guest.lastName].filter(Boolean).join(" ");
    if (name || disputeCase.guest.email || disputeCase.guest.phone) {
      parts.push(isTicketing ? "## BUYER INFORMATION" : "## GUEST INFORMATION");
      if (name) parts.push(`- **Name**: ${name}`);
      if (disputeCase.guest.email) parts.push(`- **Email**: ${disputeCase.guest.email}`);
      if (disputeCase.guest.phone) parts.push(`- **Phone**: ${disputeCase.guest.phone}`);
      parts.push("");
    }
  }

  if (options.includePayment && disputeCase.paymentData) {
    parts.push("## PAYMENT VERIFICATION");
    if (!options.paymentVerificationOnly) {
      if (disputeCase.paymentData.last4) parts.push(`- **Card Last 4**: ${disputeCase.paymentData.last4}`);
      if (disputeCase.paymentData.authCode) parts.push(`- **Auth Code**: ${disputeCase.paymentData.authCode}`);
    }
    if (disputeCase.paymentData.avsMatch !== undefined) {
      parts.push(`- **AVS Match**: ${disputeCase.paymentData.avsMatch ? "Yes" : "No"}`);
    }
    if (disputeCase.paymentData.cvvMatch !== undefined) {
      parts.push(`- **CVV Match**: ${disputeCase.paymentData.cvvMatch ? "Yes" : "No"}`);
    }
    if (disputeCase.paymentData.threeDSecure !== undefined) {
      parts.push(`- **3D Secure**: ${disputeCase.paymentData.threeDSecure ? "Yes" : "No"}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
