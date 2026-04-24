/**
 * HTTP handler: seed Knowledge Base collections from static disputeCodeMapping
 * data + curated PSP format rules + evidence requirements for hotel-relevant codes.
 *
 * Admin-only. Idempotent — uses set() so re-running overwrites with the latest data.
 *
 * Collections seeded:
 *   schemeRules/{network}_{reasonCode}
 *   evidenceRequirements/{network}_{reasonCode}_{verticalId}
 *   pspFormats/{pspProvider}_{evidenceSlot}
 *   winPatterns/{network}_{reasonCode}_{verticalId}  (starter entries for high-win codes)
 *
 * Deploy: `firebase deploy --only functions:seedKnowledgeBase`
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";
import {
  ALL_DISPUTE_CODES,
  type DisputeCodeInfo,
} from "@realyn/ai-core/config/disputeCodeMapping";
import type {
  SchemeRule,
  EvidenceRequirementRule,
  EvidenceRequirementItem,
  PSPFormatRule,
  WinPattern,
  CardNetwork,
} from "@realyn/ai-core/types/knowledgeBase";
import {
  KB_COLLECTIONS,
  schemeRuleDocId,
  evidenceRequirementDocId,
  pspFormatDocId,
  winPatternDocId,
} from "@realyn/ai-core/types/knowledgeBase";

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Scheme rules: derive from DisputeCodeInfo, adding scheme-specific fields
// where known for the most hotel-relevant codes.
// ---------------------------------------------------------------------------

const MERCHANT_OBLIGATIONS: Record<string, string> = {
  "10.4": "Prove the cardholder authorized the CNP transaction (3DS, AVS, CVV match, IP/device data).",
  "12.5": "Prove the charged amount matches the agreed-upon rate confirmed at booking.",
  "12.6": "Prove each charge is for a separate service and no duplicate processing occurred.",
  "13.1": "Prove the service was delivered — guest checked in and stayed.",
  "13.3": "Prove the service was as described at the time of booking.",
  "13.6": "Prove the refund was processed, or that no refund was owed.",
  "13.7": "Prove the cancellation policy was disclosed, accepted by guest, and properly applied.",
  "4834": "Prove transaction was processed correctly — no duplicate, correct amount and currency.",
  "4837": "Prove cardholder authorized the transaction or participated in the stay.",
  "4853": "Prove goods/services were delivered as described, or cancellation policy was disclosed and applied.",
  "4860": "Prove the credit was processed, or no credit was owed per the agreed terms.",
  "C02": "Prove the refund was processed or no refund was contractually required.",
  "C05": "Prove the service was delivered or the cancellation policy was properly enforced.",
  "C08": "Prove the guest received the service (check-in records, folio, keycard logs).",
  "C18": "Prove a valid no-show/cancellation policy was disclosed and the guest did not cancel within the allowed window.",
  "F29": "Prove the cardholder authorized the transaction — booking IP, 3DS, AVS/CVV match, guest communications.",
  "AA": "Prove the charge is recognizable — booking confirmation sent to cardholder's email, signed reg card.",
  "UA": "Prove the cardholder authorized the transaction through available verification methods.",
};

const CARDHOLDER_BURDENS: Record<string, string> = {
  "10.4": "Cardholder claims they did not authorize or participate in this online/phone transaction.",
  "12.5": "Cardholder claims the amount charged differs from the amount they agreed to pay.",
  "12.6": "Cardholder claims they were charged twice for the same service, or paid via another method.",
  "13.1": "Cardholder claims they never received the goods or services paid for.",
  "13.3": "Cardholder claims the goods or services were materially different from what was described.",
  "13.6": "Cardholder claims a refund or credit was promised but never received.",
  "13.7": "Cardholder claims they cancelled the reservation but were still charged.",
  "4837": "Cardholder claims they did not authorize the transaction.",
  "4853": "Cardholder claims goods/services were not received, not as described, or were cancelled.",
  "C05": "Cardmember claims services were cancelled or never received.",
  "C08": "Cardmember claims the service was never received.",
  "C18": "Cardmember claims they cancelled the reservation or disputes the no-show charge.",
  "F29": "Cardmember denies authorizing the card-not-present transaction.",
};

const TIME_LIMITS: Record<string, { days: number; fromEvent: string }> = {
  "visa": { days: 30, fromEvent: "date merchant received chargeback notification" },
  "mastercard": { days: 45, fromEvent: "date of chargeback" },
  "amex": { days: 20, fromEvent: "date of chargeback letter" },
  "discover": { days: 30, fromEvent: "date of chargeback notification" },
};

function buildSchemeRule(info: DisputeCodeInfo): SchemeRule {
  const limit = TIME_LIMITS[info.network] || { days: 30, fromEvent: "chargeback notification date" };
  return {
    code: info.code,
    network: info.network,
    category: info.category,
    subcategory: info.subcategory,
    description: info.description,
    merchantObligation: MERCHANT_OBLIGATIONS[info.code] || "",
    cardholderBurden: CARDHOLDER_BURDENS[info.code] || "",
    timeLimit: limit,
    citations: [],
    submissionConstraints: [],
    hotelRelevance: info.hotelRelevance,
    commonInHotels: info.commonInHotels,
    defaultRecommendation: info.defaultRecommendation,
    defaultWinnability: info.defaultWinnability,
    requiredEvidence: info.requiredEvidence,
    optionalEvidence: info.optionalEvidence,
    effectiveDate: "2024-01-01",
  };
}

// ---------------------------------------------------------------------------
// Evidence requirements: curated per reason-code × hospitality vertical
// for the codes most common in hotels.
// ---------------------------------------------------------------------------

const HOSPITALITY_REQUIREMENTS: Record<string, EvidenceRequirementItem[]> = {
  "13.1": [
    { evidenceType: "reservation_folio", category: "pms_data", priority: "critical", rationale: "Folio proves guest was checked in and shows all charges.", tips: ["Export complete folio with check-in/check-out dates", "Ensure guest name and room number are visible"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "check_in_records", category: "proof_of_stay", priority: "critical", rationale: "System timestamps proving guest physically arrived.", tips: ["Include PMS activity log timestamps", "Export keycard access logs if available"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "keycard_access_logs", category: "proof_of_stay", priority: "high", rationale: "Electronic door lock logs are strong evidence of physical occupancy.", tips: ["Export logs showing room entry during stay dates"], canAutoFulfill: false, sourceSystem: "lock_system" },
    { evidenceType: "booking_confirmation", category: "communications", priority: "high", rationale: "Confirmation email links the cardholder to the reservation.", tips: ["Include email headers showing delivery"], canAutoFulfill: true, sourceSystem: "booking_engine" },
  ],
  "13.7": [
    { evidenceType: "cancellation_policy", category: "policy", priority: "critical", rationale: "Must prove the policy was disclosed before or at booking.", tips: ["Screenshot the policy from your booking engine", "Include the terms acceptance checkbox or timestamp"], canAutoFulfill: false },
    { evidenceType: "terms_acceptance_proof", category: "policy", priority: "critical", rationale: "Proves guest explicitly accepted cancellation terms.", tips: ["Export booking engine logs showing terms acceptance"], canAutoFulfill: true, sourceSystem: "booking_engine" },
    { evidenceType: "reservation_folio", category: "pms_data", priority: "high", rationale: "Shows the no-show or late-cancel charge was applied per policy.", tips: ["Include the charge line item referencing the cancellation fee"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "guest_communications", category: "communications", priority: "high", rationale: "Any correspondence about the booking or cancellation attempt.", tips: ["Include email thread with timestamps"], canAutoFulfill: false },
  ],
  "13.6": [
    { evidenceType: "refund_records", category: "payment_data", priority: "critical", rationale: "If refund was issued, transaction records prove it.", tips: ["Export refund transaction from payment gateway"], canAutoFulfill: true, sourceSystem: "payment_gateway" },
    { evidenceType: "policy_terms", category: "policy", priority: "high", rationale: "If no refund was owed, the terms prove it.", tips: ["Include the no-refund or non-refundable rate terms"], canAutoFulfill: false },
    { evidenceType: "guest_communications", category: "communications", priority: "high", rationale: "Correspondence about the refund request and outcome.", tips: ["Include complete email thread"], canAutoFulfill: false },
  ],
  "10.4": [
    { evidenceType: "authorization_records", category: "payment_data", priority: "critical", rationale: "Auth code, AVS, CVV match prove legitimate transaction.", tips: ["Export full auth response from gateway"], canAutoFulfill: true, sourceSystem: "payment_gateway" },
    { evidenceType: "3ds_verification", category: "payment_data", priority: "critical", rationale: "3D Secure shifts liability to issuer for CNP fraud.", tips: ["Include 3DS transaction ID and authentication result"], canAutoFulfill: true, sourceSystem: "payment_gateway" },
    { evidenceType: "reservation_folio", category: "pms_data", priority: "high", rationale: "Folio links the charge to an actual stay.", tips: ["Include check-in/check-out dates and guest name"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "booking_confirmation", category: "communications", priority: "high", rationale: "Confirmation sent to cardholder's email proves their involvement.", tips: ["Include email headers and IP address of booking if available"], canAutoFulfill: true, sourceSystem: "booking_engine" },
  ],
  "12.6": [
    { evidenceType: "reservation_folio", category: "pms_data", priority: "critical", rationale: "Folio itemization proves each charge is for a distinct service.", tips: ["Highlight separate line items if multiple charges"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "authorization_records", category: "payment_data", priority: "critical", rationale: "Separate auth codes prove each charge was independently authorized.", tips: ["Export auth records for each transaction"], canAutoFulfill: true, sourceSystem: "payment_gateway" },
    { evidenceType: "guest_communications", category: "communications", priority: "medium", rationale: "Correspondence may clarify that charges are for separate services.", tips: ["Include any emails discussing additional charges"], canAutoFulfill: false },
  ],
  "4837": [
    { evidenceType: "reservation_folio", category: "pms_data", priority: "critical", rationale: "Folio and registration card prove cardholder stayed.", tips: ["Include signed registration card if available"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "check_in_records", category: "proof_of_stay", priority: "critical", rationale: "System records proving physical presence.", tips: ["Export check-in timestamp and ID verification records"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "authorization_records", category: "payment_data", priority: "high", rationale: "Auth code, AVS/CVV results support legitimate transaction.", tips: ["Export full gateway authorization response"], canAutoFulfill: true, sourceSystem: "payment_gateway" },
  ],
  "4853": [
    { evidenceType: "reservation_folio", category: "pms_data", priority: "critical", rationale: "Proves service was delivered as booked.", tips: ["Include complete folio with all service details"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "cancellation_policy", category: "policy", priority: "critical", rationale: "If cancellation dispute, policy proves terms were disclosed.", tips: ["Include booking-time policy text and acceptance proof"], canAutoFulfill: false },
    { evidenceType: "guest_communications", category: "communications", priority: "high", rationale: "Booking confirmation and any service-related correspondence.", tips: ["Include full email thread"], canAutoFulfill: false },
    { evidenceType: "check_in_records", category: "proof_of_stay", priority: "high", rationale: "If non-receipt claim, prove the guest stayed.", tips: ["Export PMS check-in/check-out logs"], canAutoFulfill: true, sourceSystem: "pms" },
  ],
  "C18": [
    { evidenceType: "cancellation_policy", category: "policy", priority: "critical", rationale: "Must prove the no-show/cancellation policy was disclosed and accepted.", tips: ["Include booking-time disclosure and acceptance proof"], canAutoFulfill: false },
    { evidenceType: "reservation_folio", category: "pms_data", priority: "critical", rationale: "Shows the reservation details and the no-show charge.", tips: ["Include the no-show fee line item"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "guest_communications", category: "communications", priority: "high", rationale: "Booking confirmation showing terms, any cancellation attempt communications.", tips: ["Include timestamps on all communications"], canAutoFulfill: false },
  ],
  "C08": [
    { evidenceType: "reservation_folio", category: "pms_data", priority: "critical", rationale: "Folio proves the guest checked in and services were rendered.", tips: ["Include full folio with check-in/check-out dates"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "check_in_records", category: "proof_of_stay", priority: "critical", rationale: "System records proving guest physically arrived and stayed.", tips: ["Export PMS activity logs with timestamps"], canAutoFulfill: true, sourceSystem: "pms" },
    { evidenceType: "keycard_access_logs", category: "proof_of_stay", priority: "high", rationale: "Door lock logs provide strong evidence of physical occupancy.", tips: ["Export logs for the room during stay dates"], canAutoFulfill: false, sourceSystem: "lock_system" },
  ],
};

function buildEvidenceRequirement(
  code: string,
  network: CardNetwork,
  verticalId: string,
  items: EvidenceRequirementItem[],
): EvidenceRequirementRule {
  return {
    reasonCode: code,
    network,
    verticalId,
    requirements: items,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// PSP format rules: Stripe and Adyen evidence slots
// ---------------------------------------------------------------------------

const STRIPE_FORMAT_RULES: Omit<PSPFormatRule, "pspProvider">[] = [
  { evidenceSlot: "cancellation_policy", apiFieldName: "evidence.cancellation_policy", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Your cancellation policy as shown to the customer." },
  { evidenceSlot: "cancellation_policy_disclosure", apiFieldName: "evidence.cancellation_policy_disclosure", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Proof the customer was shown the cancellation policy before purchase." },
  { evidenceSlot: "customer_communication", apiFieldName: "evidence.customer_communication", acceptedFormats: ["pdf", "image"], maxSizeBytes: 52428800, isRequired: false, description: "Communications with the customer proving they received the product or service." },
  { evidenceSlot: "customer_email_address", apiFieldName: "evidence.customer_email_address", acceptedFormats: ["text"], maxSizeBytes: 500, isRequired: false, description: "The email address of the customer." },
  { evidenceSlot: "customer_name", apiFieldName: "evidence.customer_name", acceptedFormats: ["text"], maxSizeBytes: 500, isRequired: false, description: "The name of the customer." },
  { evidenceSlot: "customer_signature", apiFieldName: "evidence.customer_signature", acceptedFormats: ["pdf", "image"], maxSizeBytes: 52428800, isRequired: false, description: "A signed document (registration card, etc.) from the customer." },
  { evidenceSlot: "duplicate_charge_documentation", apiFieldName: "evidence.duplicate_charge_documentation", acceptedFormats: ["pdf", "image"], maxSizeBytes: 52428800, isRequired: false, description: "Proof that charges are for separate products or services." },
  { evidenceSlot: "duplicate_charge_explanation", apiFieldName: "evidence.duplicate_charge_explanation", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Explanation of why the charge is not a duplicate." },
  { evidenceSlot: "duplicate_charge_id", apiFieldName: "evidence.duplicate_charge_id", acceptedFormats: ["text"], maxSizeBytes: 500, isRequired: false, description: "The charge ID for the previous (non-disputed) payment." },
  { evidenceSlot: "product_description", apiFieldName: "evidence.product_description", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Description of the product or service provided." },
  { evidenceSlot: "receipt", apiFieldName: "evidence.receipt", acceptedFormats: ["pdf", "image"], maxSizeBytes: 52428800, isRequired: false, description: "A receipt or invoice for the charge." },
  { evidenceSlot: "refund_policy", apiFieldName: "evidence.refund_policy", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Your refund policy as shown to the customer." },
  { evidenceSlot: "refund_policy_disclosure", apiFieldName: "evidence.refund_policy_disclosure", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Proof the customer was shown the refund policy before purchase." },
  { evidenceSlot: "refund_refusal_explanation", apiFieldName: "evidence.refund_refusal_explanation", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Explanation of why the customer is not entitled to a refund." },
  { evidenceSlot: "service_date", apiFieldName: "evidence.service_date", acceptedFormats: ["text"], maxSizeBytes: 500, isRequired: false, description: "The date the service was provided (e.g. check-in date)." },
  { evidenceSlot: "service_documentation", apiFieldName: "evidence.service_documentation", acceptedFormats: ["pdf", "image"], maxSizeBytes: 52428800, isRequired: false, description: "Documentation showing the service was provided (folio, confirmation, etc.)." },
  { evidenceSlot: "uncategorized_file", apiFieldName: "evidence.uncategorized_file", acceptedFormats: ["pdf", "image"], maxSizeBytes: 52428800, isRequired: false, description: "Any other evidence file." },
  { evidenceSlot: "uncategorized_text", apiFieldName: "evidence.uncategorized_text", acceptedFormats: ["text"], maxSizeBytes: 20480, isRequired: false, description: "Any other evidence text." },
];

const ADYEN_FORMAT_RULES: Omit<PSPFormatRule, "pspProvider">[] = [
  { evidenceSlot: "defenseDocument", apiFieldName: "defenseDocument", acceptedFormats: ["pdf", "image"], maxSizeBytes: 10485760, isRequired: true, description: "Combined evidence document for the dispute defense (max 10 MB)." },
  { evidenceSlot: "defenseReason", apiFieldName: "defenseReason", acceptedFormats: ["text"], maxSizeBytes: 5000, isRequired: true, description: "The defense reason code matching the dispute reason." },
];

// ---------------------------------------------------------------------------
// Win patterns: starter entries for the highest-win hotel codes.
// These are seeded with small sample sizes so the AI treats them as hints
// rather than authoritative; real outcome data accumulates over time.
// ---------------------------------------------------------------------------

interface StarterWinPattern {
  code: string;
  network: CardNetwork;
  evidenceCombination: string[];
  argumentPatterns: string[];
  winRate: number;
}

const STARTER_WIN_PATTERNS: StarterWinPattern[] = [
  {
    code: "13.1",
    network: "visa",
    evidenceCombination: ["reservation_folio", "check_in_records", "keycard_access_logs"],
    argumentPatterns: ["prove_service_delivery", "physical_occupancy_evidence"],
    winRate: 0.85,
  },
  {
    code: "13.7",
    network: "visa",
    evidenceCombination: ["cancellation_policy", "terms_acceptance_proof", "reservation_folio"],
    argumentPatterns: ["policy_disclosure_at_booking", "terms_acceptance_timestamp"],
    winRate: 0.80,
  },
  {
    code: "13.6",
    network: "visa",
    evidenceCombination: ["refund_records", "policy_terms", "guest_communications"],
    argumentPatterns: ["refund_already_processed", "non_refundable_rate_terms"],
    winRate: 0.82,
  },
  {
    code: "12.6",
    network: "visa",
    evidenceCombination: ["reservation_folio", "authorization_records"],
    argumentPatterns: ["separate_services_separate_charges", "distinct_auth_codes"],
    winRate: 0.88,
  },
  {
    code: "4853",
    network: "mastercard",
    evidenceCombination: ["reservation_folio", "cancellation_policy", "check_in_records"],
    argumentPatterns: ["service_delivered_as_described", "policy_properly_disclosed"],
    winRate: 0.72,
  },
  {
    code: "C18",
    network: "amex",
    evidenceCombination: ["cancellation_policy", "reservation_folio", "guest_communications"],
    argumentPatterns: ["no_show_policy_enforced", "policy_disclosed_at_booking"],
    winRate: 0.78,
  },
  {
    code: "C08",
    network: "amex",
    evidenceCombination: ["reservation_folio", "check_in_records", "keycard_access_logs"],
    argumentPatterns: ["prove_service_delivery", "physical_occupancy_evidence"],
    winRate: 0.83,
  },
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const seedKnowledgeBase = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req, res) => {
    if (!shouldEnableTestHandlers()) {
      res.status(403).json({ error: "Seed handlers are disabled in production." });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      const counts = { schemeRules: 0, evidenceRequirements: 0, pspFormats: 0, winPatterns: 0 };
      const BATCH_LIMIT = 450;
      let batch = db.batch();
      let opsInBatch = 0;

      const flushBatch = async () => {
        if (opsInBatch > 0) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      };

      const addToBatch = async (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => {
        batch.set(ref, data);
        opsInBatch++;
        if (opsInBatch >= BATCH_LIMIT) {
          await flushBatch();
        }
      };

      // 1. Scheme Rules — one per dispute code
      for (const info of Object.values(ALL_DISPUTE_CODES)) {
        const rule = buildSchemeRule(info);
        const docId = schemeRuleDocId(rule.network, rule.code);
        const ref = db.collection(KB_COLLECTIONS.SCHEME_RULES).doc(docId);
        await addToBatch(ref, rule as unknown as Record<string, unknown>);
        counts.schemeRules++;
      }

      // 2. Evidence Requirements — hospitality vertical for curated codes
      for (const [code, items] of Object.entries(HOSPITALITY_REQUIREMENTS)) {
        const codeInfo = ALL_DISPUTE_CODES[code];
        if (!codeInfo) continue;
        const rule = buildEvidenceRequirement(code, codeInfo.network, "hospitality", items);
        const docId = evidenceRequirementDocId(codeInfo.network, code, "hospitality");
        const ref = db.collection(KB_COLLECTIONS.EVIDENCE_REQUIREMENTS).doc(docId);
        await addToBatch(ref, rule as unknown as Record<string, unknown>);
        counts.evidenceRequirements++;
      }

      // 3. PSP Format Rules — Stripe
      for (const rule of STRIPE_FORMAT_RULES) {
        const full: PSPFormatRule = { ...rule, pspProvider: "stripe" };
        const docId = pspFormatDocId("stripe", rule.evidenceSlot);
        const ref = db.collection(KB_COLLECTIONS.PSP_FORMATS).doc(docId);
        await addToBatch(ref, full as unknown as Record<string, unknown>);
        counts.pspFormats++;
      }

      // 3b. PSP Format Rules — Adyen
      for (const rule of ADYEN_FORMAT_RULES) {
        const full: PSPFormatRule = { ...rule, pspProvider: "adyen" };
        const docId = pspFormatDocId("adyen", rule.evidenceSlot);
        const ref = db.collection(KB_COLLECTIONS.PSP_FORMATS).doc(docId);
        await addToBatch(ref, full as unknown as Record<string, unknown>);
        counts.pspFormats++;
      }

      // 4. Win Patterns — starter entries for hospitality
      for (const wp of STARTER_WIN_PATTERNS) {
        const sampleSize = 20;
        const winCount = Math.round(wp.winRate * sampleSize);
        const pattern: WinPattern = {
          reasonCode: wp.code,
          network: wp.network,
          verticalId: "hospitality",
          evidenceCombination: wp.evidenceCombination,
          argumentPatterns: wp.argumentPatterns,
          winCount,
          lossCount: sampleSize - winCount,
          winRate: wp.winRate,
          sampleSize,
          lastUpdated: new Date().toISOString(),
        };
        const docId = winPatternDocId(wp.network, wp.code, "hospitality");
        const ref = db.collection(KB_COLLECTIONS.WIN_PATTERNS).doc(docId);
        await addToBatch(ref, pattern as unknown as Record<string, unknown>);
        counts.winPatterns++;
      }

      await flushBatch();

      console.log("Knowledge Base seeded:", counts);
      res.json({ success: true, counts });
    } catch (error) {
      console.error("Error seeding Knowledge Base:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  },
);
