import { z } from "zod";

/**
 * Coarse category for an evidence requirement. The set is intentionally
 * vertical-agnostic — ticketing and hospitality both populate the same
 * categories from their own sources.
 */
export const evidenceCategorySchema = z.enum([
  "pms_data",
  "policy",
  "proof_of_stay",
  "communications",
  "payment_data",
  "incident_reports",
  "delivery",
  "other",
]);
export type EvidenceCategory = z.infer<typeof evidenceCategorySchema>;

/**
 * Fulfillment status of a single EvidenceRequirement. Drives the
 * dashboard's evidence checklist and the planner's "can we submit yet"
 * decision.
 */
export const evidenceRequirementStatusSchema = z.enum([
  "pending",
  "uploaded",
  "not_available",
  "not_applicable",
]);
export type EvidenceRequirementStatus = z.infer<
  typeof evidenceRequirementStatusSchema
>;

export interface EvidenceRequirement {
  id: string;
  category: EvidenceCategory;
  label: string;
  tag?: string;
  description: string;
  example?: string;
  sourceHint?: string;
  instructions?: string;
  required: boolean;
  priority: number;
}

export const evidenceRequirementSchema: z.ZodType<EvidenceRequirement> =
  z.object({
    id: z.string(),
    category: evidenceCategorySchema,
    label: z.string(),
    tag: z.string().optional(),
    description: z.string(),
    example: z.string().optional(),
    sourceHint: z.string().optional(),
    instructions: z.string().optional(),
    required: z.boolean(),
    priority: z.number(),
  });

/**
 * An actual evidence artifact attached to a requirement. The `fileId` /
 * `fileName` pair points at Cloud Storage; persistence of the file
 * itself is outside this schema.
 */
export interface EvidenceItem {
  requirementId: string;
  status: EvidenceRequirementStatus;
  fileId?: string;
  fileName?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  notes?: string;
}

export const evidenceItemSchema: z.ZodType<EvidenceItem> = z.object({
  requirementId: z.string(),
  status: evidenceRequirementStatusSchema,
  fileId: z.string().optional(),
  fileName: z.string().optional(),
  uploadedAt: z.string().optional(),
  uploadedBy: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Card networks we generate evidence plans for. `unknown` is the
 * fallback for documents that pre-date the field.
 */
export const cardNetworkSchema = z.enum([
  "visa",
  "mastercard",
  "amex",
  "discover",
  "unknown",
]);
export type CardNetwork = z.infer<typeof cardNetworkSchema>;

/**
 * Whether the planner recommends fighting or accepting the dispute.
 */
export const planRecommendationSchema = z.enum(["fight", "accept"]);
export type PlanRecommendation = z.infer<typeof planRecommendationSchema>;

/**
 * Planner's confidence the dispute can be won given the available
 * evidence and the dispute's facts.
 */
export const winnabilitySchema = z.enum(["high", "medium", "low"]);
export type Winnability = z.infer<typeof winnabilitySchema>;

/**
 * Output of the evidence planner: list of required artifacts + the
 * fight/accept decision and winnability assessment. Persisted on the
 * parent Dispute document under `evidencePlan`.
 */
export interface EvidencePlan {
  disputeCategory: string;
  disputeSubtype?: string;
  reasonCode?: string;
  network?: CardNetwork;
  recommendation: PlanRecommendation;
  winnability: Winnability;
  winnabilityReason: string;
  requirements: EvidenceRequirement[];
  summary: string;
  generatedAt?: string;
  model?: string;
}

export const evidencePlanSchema: z.ZodType<EvidencePlan> = z.object({
  disputeCategory: z.string(),
  disputeSubtype: z.string().optional(),
  reasonCode: z.string().optional(),
  network: cardNetworkSchema.optional(),
  recommendation: planRecommendationSchema,
  winnability: winnabilitySchema,
  winnabilityReason: z.string(),
  requirements: z.array(evidenceRequirementSchema),
  summary: z.string(),
  generatedAt: z.string().optional(),
  model: z.string().optional(),
});
