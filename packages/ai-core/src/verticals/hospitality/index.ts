import type { VerticalDefinition } from "../types";

const HOTEL_EVIDENCE_TYPES = [
  "registration_card",
  "folio",
  "cancellation_policy",
  "refund_policy",
  "terms_of_service",
  "booking_confirmation",
  "check_in_records",
  "check_out_records",
  "key_card_logs",
  "housekeeping_records",
  "guest_communications",
  "3d_secure_records",
  "avs_cvv_records",
  "authorization_records",
  "id_verification",
  "signed_agreements",
] as const;

const AUTO_FULFILLABLE_TAGS: Record<string, (match: any) => boolean> = {
  folio: (m) => !!m.folio,
  reservation_folio: (m) => !!m.folio,
  checkin_checkout_records: (m) => !!m.reservation,
  registration_card: () => false,
  keycard_logs: (m) => m.activityLogs?.some((l: any) => l.action?.includes("key")),
  authorization_records: (m) => !!m.folio?.lines?.some((l: any) => l.category === "payment"),
  guest_activity_log: (m) => m.activityLogs?.length > 0,
};

export const hospitalityVertical: VerticalDefinition = {
  id: "hospitality",
  displayName: "Hospitality",
  evidenceTypes: HOTEL_EVIDENCE_TYPES,
  evidenceCategories: [
    "pms_data",
    "policy",
    "proof_of_stay",
    "communications",
    "payment_data",
    "incident_reports",
    "other",
  ],
  autoFulfillableTags: AUTO_FULFILLABLE_TAGS,
  promptLabels: {
    entityName: "hotel",
    bookingLabel: "Booking",
    guestLabel: "Guest",
    merchantLabel: "Hotel",
  },
  systemPrompts: {
    evidencePlanner: "hospitality",
    enhancedEvidencePlanner: "hospitality_enhanced",
    relevanceScorer: "hospitality",
    qualityChecker: "hospitality",
    argumentGenerator: "hospitality",
  },
  operationalSystemType: "PMS",
};
