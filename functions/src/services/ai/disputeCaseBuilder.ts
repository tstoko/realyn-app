import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { DisputeCase, DisputeCaseSchema } from "../../types/aiDispute";
import { findPMSMatchForDispute } from "../pms/pmsLookupService";

// ============================================================
// DisputeCase Builder
// Assembles complete case data from Firestore collections
// ============================================================

/**
 * Build a DisputeCase object from Firestore data
 * Joins data from disputes and organizations collections
 */
export async function buildDisputeCase(
  disputeId: string,
  organizationId: string
): Promise<DisputeCase | null> {
  const db = admin.firestore();

  try {
    // Fetch the dispute document
    const disputeDoc = await db.collection("disputes").doc(disputeId).get();
    if (!disputeDoc.exists) {
      console.error(`Dispute not found: ${disputeId}`);
      return null;
    }

    const dispute = disputeDoc.data();
    if (!dispute) {
      console.error(`Dispute data is empty: ${disputeId}`);
      return null;
    }

    // Verify organization matches
    if (dispute.organizationId !== organizationId) {
      console.error(`Organization mismatch for dispute ${disputeId}`);
      return null;
    }

    // Fetch organization for hotel profile
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    const organization = orgDoc.exists ? orgDoc.data() : null;

    // Check if folio evidence has been uploaded for this dispute
    let hasFolio = false;
    let folioUrl: string | undefined = undefined;
    
    // Check evidenceItems for uploaded folio
    if (dispute.evidenceItems && Array.isArray(dispute.evidenceItems)) {
      const folioEvidence = dispute.evidenceItems.find(
        (item: any) => item.requirementId?.includes('folio') && item.status === 'uploaded'
      );
      if (folioEvidence) {
        hasFolio = true;
        folioUrl = folioEvidence.fileUrl;
      }
    }

    // Attempt to enrich from CSV-imported PMS data
    const pmsMatch = await findPMSMatchForDispute(disputeId, organizationId, {
      amount: dispute.amount,
      currency: dispute.currency,
      pspTransactionDate: dispute.pspTransactionDate,
      pspLast4Digits: dispute.pspLast4Digits,
      customerName: dispute.customerName || dispute.guestName,
    });

    const disputeCase: DisputeCase = {
      // Dispute identification
      disputeId: disputeId,
      organizationId: organizationId,

      // PSP information
      pspProvider: dispute.pspProvider || "stripe",
      pspDisputeId: dispute.pspDisputeId,
      pspReasonCode: extractReasonCode(dispute.reason),

      // Amount and timing
      amount: dispute.amount || 0,
      currency: dispute.currency || "USD",
      transactionDate: formatDate(dispute.pspTransactionDate),
      respondByDate: formatDate(dispute.respondBy),

      // Dispute details
      reason: dispute.reason || null,
      customerExplanation: dispute.customerExplanation || "",

      // Hotel profile from organization
      hotelProfile: organization
        ? {
            name: organization.name || "",
            location: organization.location || "",
            policies: extractPolicies(organization),
          }
        : undefined,

      // Booking data: prefer PMS CSV data, then dispute doc, then metadata
      booking: pmsMatch
        ? {
            checkIn: pmsMatch.reservation.checkIn,
            checkOut: pmsMatch.reservation.checkOut,
            roomNumber: pmsMatch.reservation.roomNumber,
            roomType: pmsMatch.reservation.roomType,
            ratePlan: pmsMatch.reservation.ratePlan,
            totalAmount: pmsMatch.reservation.totalAmount,
            currency: pmsMatch.reservation.currency,
            status: pmsMatch.reservation.status,
            guestName: pmsMatch.reservation.guestName,
            confirmationNumber: pmsMatch.confirmationNumber,
          }
        : dispute.booking || dispute.metadata?.booking || undefined,
      
      // Guest data: prefer PMS CSV data, then dispute doc, then derived
      guest: pmsMatch
        ? {
            firstName: extractFirstName(pmsMatch.reservation.guestName),
            lastName: extractLastName(pmsMatch.reservation.guestName),
            email: pmsMatch.reservation.guestEmail,
            phone: pmsMatch.reservation.guestPhone,
          }
        : dispute.guest || extractGuestInfo(dispute),

      // Payment verification data (from dispute or payment gateway)
      paymentData: {
        last4: dispute.pspLast4Digits,
        authCode: dispute.authorizationCode,
        avsMatch: resolveBoolean(dispute.avsResult, "pass") 
          ?? resolveBoolean(dispute.paymentMethodDetails?.avsCheck, "pass"),
        cvvMatch: resolveBoolean(dispute.cvcResult, "pass")
          ?? resolveBoolean(dispute.paymentMethodDetails?.cvcCheck, "pass"),
        threeDSecure: dispute.threeDSecureResult === "authenticated"
          || !!dispute.paymentMethodDetails?.threeDSecure
          || undefined,
      },
    };

    // Track folio and PMS match metadata for downstream pipeline steps
    (disputeCase as any).hasFolio = hasFolio || !!(pmsMatch?.folio);
    (disputeCase as any).folioUrl = folioUrl;
    if (pmsMatch) {
      (disputeCase as any).pmsMatch = pmsMatch;
    }

    // Validate with Zod schema
    const validated = DisputeCaseSchema.safeParse(disputeCase);
    if (!validated.success) {
      console.warn("DisputeCase validation warnings:", validated.error.errors);
      // Return the case anyway, it's just missing optional fields
    }

    return disputeCase;
  } catch (error) {
    console.error("Error building DisputeCase:", error);
    return null;
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Extract first name from "Last, First" or "First Last" format.
 */
function extractFirstName(fullName: string): string | undefined {
  if (!fullName) return undefined;
  if (fullName.includes(",")) {
    const parts = fullName.split(",").map(s => s.trim());
    return parts[1] || parts[0];
  }
  const parts = fullName.trim().split(/\s+/);
  return parts[0];
}

/**
 * Extract last name from "Last, First" or "First Last" format.
 */
function extractLastName(fullName: string): string | undefined {
  if (!fullName) return undefined;
  if (fullName.includes(",")) {
    return fullName.split(",")[0].trim();
  }
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : undefined;
}

/**
 * Extract guest info from dispute document fields
 */
function extractGuestInfo(dispute: admin.firestore.DocumentData): { firstName?: string; lastName?: string; email?: string; phone?: string } | undefined {
  const name = dispute.customerName || dispute.guestName;
  const email = dispute.customerEmail || dispute.receipt_email;
  const phone = dispute.customerPhone;

  if (!name && !email && !phone) return undefined;

  const nameParts = name ? String(name).trim().split(/\s+/) : [];
  return {
    firstName: nameParts.length > 0 ? nameParts[0] : undefined,
    lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined,
    email: email || undefined,
    phone: phone || undefined,
  };
}

/**
 * Resolve a string check result (e.g. "pass", "fail") to boolean, or undefined
 */
function resolveBoolean(value: string | undefined | null, passValue: string): boolean | undefined {
  if (!value) return undefined;
  return value.toLowerCase() === passValue;
}

/**
 * Extract reason code from dispute reason string
 * Handles various formats from different PSPs
 */
function extractReasonCode(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined;

  // Stripe uses descriptive strings like "fraudulent", "product_not_received"
  // Keep as-is for now, the code mapping will handle conversion
  return reason;
}

/**
 * Format date to ISO string
 */
function formatDate(
  date: Date | Timestamp | string | null | undefined
): string | undefined {
  if (!date) return undefined;

  if (date instanceof Timestamp) {
    return date.toDate().toISOString();
  }

  if (date instanceof Date) {
    return date.toISOString();
  }

  if (typeof date === "string") {
    return date;
  }

  return undefined;
}

/**
 * Extract policies from organization documents
 */
function extractPolicies(
  organization: admin.firestore.DocumentData
): { cancellation?: string; refund?: string; noShow?: string } | undefined {
  if (!organization.documents || !Array.isArray(organization.documents)) {
    return undefined;
  }

  const policies: { cancellation?: string; refund?: string; noShow?: string } = {};

  for (const doc of organization.documents) {
    if (doc.category === "Cancellation Policy") {
      policies.cancellation = doc.name || "Cancellation policy on file";
    } else if (doc.category === "Terms of Service") {
      policies.refund = doc.name || "Terms of service on file";
    }
  }

  // Check automation settings for no-show info
  if (organization.automationSettings?.autoMarkNotContested !== undefined) {
    policies.noShow = "No-show policy configured";
  }

  return Object.keys(policies).length > 0 ? policies : undefined;
}

/**
 * Build a minimal DisputeCase for testing or when data is limited
 */
export function buildMinimalDisputeCase(
  disputeId: string,
  organizationId: string,
  disputeData: {
    amount: number;
    currency: string;
    reason?: string;
    customerExplanation?: string;
    pspProvider?: "stripe" | "adyen";
    pspDisputeId?: string;
  }
): DisputeCase {
  return {
    disputeId,
    organizationId,
    pspProvider: disputeData.pspProvider || "stripe",
    pspDisputeId: disputeData.pspDisputeId || disputeId,
    amount: disputeData.amount,
    currency: disputeData.currency,
    reason: disputeData.reason || null,
    customerExplanation: disputeData.customerExplanation || "",
  };
}

/**
 * Check if folio is available for a dispute case
 */
export function hasFolioAvailable(disputeCase: DisputeCase): boolean {
  return (disputeCase as any).hasFolio === true;
}

/**
 * Get folio URL from dispute case if available
 */
export function getFolioUrl(disputeCase: DisputeCase): string | undefined {
  return (disputeCase as any).folioUrl;
}

/**
 * Summarize a DisputeCase for logging
 */
export function summarizeDisputeCase(disputeCase: DisputeCase): string {
  const parts = [
    `ID: ${disputeCase.disputeId}`,
    `Amount: ${disputeCase.currency} ${(disputeCase.amount / 100).toFixed(2)}`,
    `Reason: ${disputeCase.reason || "unknown"}`,
  ];

  if (hasFolioAvailable(disputeCase)) {
    parts.push(`Folio: available`);
  }

  return parts.join(" | ");
}

