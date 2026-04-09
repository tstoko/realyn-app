import type { VerticalDefinition } from "../types";

const TICKETING_EVIDENCE_TYPES = [
  "order_confirmation",
  "ticket_delivery_proof",
  "redemption_log",
  "refund_policy",
  "terms_of_service",
  "buyer_communications",
  "3d_secure_records",
  "avs_cvv_records",
  "authorization_records",
  "id_verification",
  "signed_agreements",
] as const;

export const ticketingVertical: VerticalDefinition = {
  id: "ticketing",
  displayName: "Ticketing & Events",
  evidenceTypes: TICKETING_EVIDENCE_TYPES,
  evidenceCategories: [
    "delivery",
    "policy",
    "communications",
    "payment_data",
    "other",
  ],
  autoFulfillableTags: {},
  promptLabels: {
    entityName: "merchant",
    bookingLabel: "Order",
    guestLabel: "Buyer",
    merchantLabel: "Merchant",
  },
  systemPrompts: {
    evidencePlanner: "ticketing",
    enhancedEvidencePlanner: "ticketing_enhanced",
    relevanceScorer: "ticketing",
    qualityChecker: "ticketing",
    argumentGenerator: "ticketing",
  },
  operationalSystemType: "Ticketing Platform",
};
