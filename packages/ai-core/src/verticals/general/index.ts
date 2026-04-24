import type { VerticalDefinition } from "../types";

const GENERAL_EVIDENCE_TYPES = [
  "order_confirmation",
  "delivery_proof",
  "refund_policy",
  "terms_of_service",
  "customer_communications",
  "3d_secure_records",
  "avs_cvv_records",
  "authorization_records",
  "id_verification",
  "signed_agreements",
  "service_records",
  "product_description",
] as const;

export const generalVertical: VerticalDefinition = {
  id: "general",
  displayName: "General",
  evidenceTypes: GENERAL_EVIDENCE_TYPES,
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
    guestLabel: "Customer",
    merchantLabel: "Merchant",
  },
  systemPrompts: {
    evidencePlanner: "hospitality",
    enhancedEvidencePlanner: "hospitality_enhanced",
    relevanceScorer: "hospitality",
    qualityChecker: "hospitality",
    argumentGenerator: "hospitality",
  },
  operationalSystemType: "none",
};
