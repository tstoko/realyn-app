/**
 * PII Sanitizer Utility
 * 
 * Redacts Personally Identifiable Information (PII) before sending data
 * to third-party AI services like OpenAI.
 * 
 * GDPR Compliance: This module implements data minimization (Art. 5(1)(c))
 * by ensuring only necessary, non-identifying data is shared with sub-processors.
 */

import type { DisputeCase, GuestInfo, BookingInfo } from "../types/aiDispute";

// ============================================================
// PII Detection Patterns
// ============================================================

// Email pattern - matches most email formats
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Phone patterns - international and various formats
const PHONE_PATTERNS = [
  /\+?\d{1,4}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g, // International
  /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, // US format
  /\d{10,15}/g, // Plain digits (10-15 digit phone numbers)
];

// Credit card patterns
const CARD_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Full card number
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4}\b/g, // Partial card
];


// ============================================================
// Sanitization Placeholders
// ============================================================

export const PII_PLACEHOLDERS = {
  NAME: "[CUSTOMER]",
  FIRST_NAME: "[FIRST_NAME]",
  LAST_NAME: "[LAST_NAME]",
  EMAIL: "[EMAIL]",
  PHONE: "[PHONE]",
  CARD: "[CARD_XXXX]",
  CARD_LAST4: "[LAST4]",
  REDACTED: "[REDACTED]",
} as const;

// ============================================================
// Individual Sanitization Functions
// ============================================================

/**
 * Sanitize a name field
 * @param name - The name to sanitize
 * @param placeholder - Optional custom placeholder
 */
export function sanitizeName(
  name: string | undefined | null,
  placeholder: string = PII_PLACEHOLDERS.NAME
): string | undefined {
  if (!name || name.trim() === "") {
    return undefined;
  }
  return placeholder;
}

/**
 * Sanitize an email address
 * Can optionally mask instead of fully redact (e.g., "j***@***.com")
 */
export function sanitizeEmail(
  email: string | undefined | null,
  mask: boolean = false
): string | undefined {
  if (!email || email.trim() === "") {
    return undefined;
  }
  
  if (mask) {
    // Mask format: first letter + *** @ domain first letter + ***.tld
    const parts = email.split("@");
    if (parts.length === 2) {
      const localPart = parts[0];
      const domainParts = parts[1].split(".");
      const tld = domainParts.pop() || "com";
      return `${localPart[0]}***@***.${tld}`;
    }
  }
  
  return PII_PLACEHOLDERS.EMAIL;
}

/**
 * Sanitize a phone number
 */
export function sanitizePhone(
  phone: string | undefined | null
): string | undefined {
  if (!phone || phone.trim() === "") {
    return undefined;
  }
  return PII_PLACEHOLDERS.PHONE;
}

/**
 * Sanitize card last 4 digits
 * For dispute purposes, we may want to keep a reference that it exists
 */
export function sanitizeCardLast4(
  last4: string | undefined | null
): string | undefined {
  if (!last4 || last4.trim() === "") {
    return undefined;
  }
  return PII_PLACEHOLDERS.CARD_LAST4;
}

/**
 * Sanitize free text content by detecting and replacing PII patterns
 * This is used for customer explanations, PDF content, etc.
 */
export function sanitizeText(text: string | undefined | null): string {
  if (!text) {
    return "";
  }

  let sanitized = text;

  // Replace email addresses
  sanitized = sanitized.replace(EMAIL_PATTERN, PII_PLACEHOLDERS.EMAIL);

  // Replace phone numbers (multiple patterns)
  for (const pattern of PHONE_PATTERNS) {
    sanitized = sanitized.replace(pattern, PII_PLACEHOLDERS.PHONE);
  }

  // Replace credit card numbers
  for (const pattern of CARD_PATTERNS) {
    sanitized = sanitized.replace(pattern, PII_PLACEHOLDERS.CARD);
  }

  return sanitized;
}

/**
 * Sanitize PDF content - more aggressive pattern matching
 * PDF text may contain various PII formats
 */
export function sanitizePdfContent(pdfText: string | undefined | null): string {
  if (!pdfText) {
    return "";
  }

  let sanitized = sanitizeText(pdfText);

  // Additional PDF-specific patterns
  // Guest name fields often appear as "Guest: Name" or "Name: John Smith"
  sanitized = sanitized.replace(
    /(?:Guest|Customer|Name|Cardholder|Guest Name|Customer Name):\s*[A-Za-z\s'-]+/gi,
    (match) => {
      const prefix = match.split(":")[0];
      return `${prefix}: ${PII_PLACEHOLDERS.NAME}`;
    }
  );

  // Email fields
  sanitized = sanitized.replace(
    /(?:Email|E-mail|Contact):\s*[^\s,]+@[^\s,]+/gi,
    (match) => {
      const prefix = match.split(":")[0];
      return `${prefix}: ${PII_PLACEHOLDERS.EMAIL}`;
    }
  );

  // Phone fields
  sanitized = sanitized.replace(
    /(?:Phone|Tel|Mobile|Contact Number):\s*[\d\s\-\(\)\+]+/gi,
    (match) => {
      const prefix = match.split(":")[0];
      return `${prefix}: ${PII_PLACEHOLDERS.PHONE}`;
    }
  );

  return sanitized;
}

// ============================================================
// Composite Sanitization Functions
// ============================================================

/**
 * Sanitize guest information
 */
export function sanitizeGuestInfo(
  guest: GuestInfo | null | undefined
): GuestInfo | undefined {
  if (!guest) {
    return undefined;
  }

  return {
    firstName: sanitizeName(guest.firstName, PII_PLACEHOLDERS.FIRST_NAME),
    lastName: sanitizeName(guest.lastName, PII_PLACEHOLDERS.LAST_NAME),
    email: sanitizeEmail(guest.email),
    phone: sanitizePhone(guest.phone),
  };
}

/**
 * Sanitize booking information
 * Keeps non-PII fields like dates, room type, amounts
 */
export function sanitizeBookingInfo(
  booking: BookingInfo | null | undefined
): BookingInfo | undefined {
  if (!booking) {
    return undefined;
  }

  return {
    // Keep these - they're not PII
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    roomNumber: booking.roomNumber, // Room numbers are generally not PII
    roomType: booking.roomType,
    ratePlan: booking.ratePlan,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    status: booking.status,
    // Sanitize guest name
    guestName: sanitizeName(booking.guestName),
  };
}

/**
 * Sanitize a complete DisputeCase before sending to AI
 * This is the main entry point for sanitization
 */
export function sanitizeDisputeCase(disputeCase: DisputeCase): DisputeCase {
  return {
    // Core dispute info - keep as-is (not PII)
    disputeId: disputeCase.disputeId,
    organizationId: disputeCase.organizationId,
    pspProvider: disputeCase.pspProvider,
    pspDisputeId: disputeCase.pspDisputeId,
    pspReasonCode: disputeCase.pspReasonCode,

    // Dispute details - keep non-PII, sanitize text fields
    amount: disputeCase.amount,
    currency: disputeCase.currency,
    reason: disputeCase.reason,
    customerExplanation: sanitizeText(disputeCase.customerExplanation),
    transactionDate: disputeCase.transactionDate,
    respondByDate: disputeCase.respondByDate,

    // Linked data - sanitize PII
    hotelProfile: disputeCase.hotelProfile, // Hotel info is not customer PII
    booking: sanitizeBookingInfo(disputeCase.booking),
    guest: sanitizeGuestInfo(disputeCase.guest),
    
    // Payment data - sanitize card digits
    paymentData: disputeCase.paymentData ? {
      last4: sanitizeCardLast4(disputeCase.paymentData.last4),
      authCode: disputeCase.paymentData.authCode, // Auth codes are not PII
      avsMatch: disputeCase.paymentData.avsMatch,
      cvvMatch: disputeCase.paymentData.cvvMatch,
      threeDSecure: disputeCase.paymentData.threeDSecure,
    } : undefined,
  };
}

// ============================================================
// Logging and Audit Functions
// ============================================================

/**
 * Log what PII was sanitized (for audit trail)
 * Does not log actual PII values
 */
export function logSanitizationSummary(
  original: DisputeCase,
  sanitized: DisputeCase
): void {
  const piiFound: string[] = [];

  if (original.guest?.firstName && sanitized.guest?.firstName === PII_PLACEHOLDERS.FIRST_NAME) {
    piiFound.push("guest.firstName");
  }
  if (original.guest?.lastName && sanitized.guest?.lastName === PII_PLACEHOLDERS.LAST_NAME) {
    piiFound.push("guest.lastName");
  }
  if (original.guest?.email && sanitized.guest?.email === PII_PLACEHOLDERS.EMAIL) {
    piiFound.push("guest.email");
  }
  if (original.guest?.phone && sanitized.guest?.phone === PII_PLACEHOLDERS.PHONE) {
    piiFound.push("guest.phone");
  }
  if (original.booking?.guestName && sanitized.booking?.guestName === PII_PLACEHOLDERS.NAME) {
    piiFound.push("booking.guestName");
  }
  if (original.paymentData?.last4 && sanitized.paymentData?.last4 === PII_PLACEHOLDERS.CARD_LAST4) {
    piiFound.push("paymentData.last4");
  }
  if (original.customerExplanation !== sanitized.customerExplanation) {
    piiFound.push("customerExplanation (text patterns)");
  }

  if (piiFound.length > 0) {
    console.log(`[PII Sanitizer] Redacted ${piiFound.length} PII fields: ${piiFound.join(", ")}`);
  } else {
    console.log("[PII Sanitizer] No PII detected in dispute case");
  }
}

/**
 * Sanitize and log in one call - convenience function
 */
export function sanitizeDisputeCaseWithLog(disputeCase: DisputeCase): DisputeCase {
  const sanitized = sanitizeDisputeCase(disputeCase);
  logSanitizationSummary(disputeCase, sanitized);
  return sanitized;
}
