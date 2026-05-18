import { z } from "zod";

/**
 * One row of the chronological narrative the argument generator emits.
 * `evidenceId` (when present) points at an `EvidenceItem.requirementId`
 * so the dashboard can render a clickable timeline.
 */
export interface TimelineEvent {
  date: string;
  description: string;
  evidenceId?: string;
}

export const timelineEventSchema: z.ZodType<TimelineEvent> = z.object({
  date: z.string(),
  description: z.string(),
  evidenceId: z.string().optional(),
});

/**
 * Heading + body for one section of the generated argument. The
 * argument generator emits a small, fixed set of paragraphs; the
 * specific headings depend on the dispute reason code.
 */
export interface ArgumentParagraph {
  heading: string;
  content: string;
  evidenceReferences?: string[];
}

export const argumentParagraphSchema: z.ZodType<ArgumentParagraph> = z.object({
  heading: z.string(),
  content: z.string(),
  evidenceReferences: z.array(z.string()).optional(),
});

/**
 * Canonical output of the argument generator. Persisted on Dispute
 * documents under `argumentDraft` and `argumentVersions[]`.
 *
 * The flat string fields at the bottom (customerName, billingAddress,
 * etc.) are the PSP-specific "evidence field" inputs Stripe/Adyen
 * require alongside the narrative. They live here for now because the
 * existing PSP submission pipeline reads them off the argument; W1.x
 * is expected to lift them into a separate `PspEvidenceFields` ontology
 * object.
 */
export interface DisputeArgument {
  executiveSummary: string;
  timeline: TimelineEvent[];
  paragraphs: ArgumentParagraph[];
  customerClaimRebuttal?: string;
  conclusion: string;
  uncategorizedText?: string;
  productDescription?: string;
  customerName?: string;
  customerEmail?: string;
  billingAddress?: string;
  shippingAddress?: string;
  customerSignature?: string;
  receipt?: string;
  serviceDates?: string;
  cancellationPolicy?: string;
  cancellationPolicyDisclosure?: string;
  refundPolicy?: string;
  refundPolicyDisclosure?: string;
  refundRefusalExplanation?: string;
  customerCommunication?: string;
  generatedAt?: string | Date;
  model?: string;
  version?: number;
}

export const disputeArgumentSchema: z.ZodType<DisputeArgument> = z.object({
  executiveSummary: z.string(),
  timeline: z.array(timelineEventSchema),
  paragraphs: z.array(argumentParagraphSchema),
  customerClaimRebuttal: z.string().optional(),
  conclusion: z.string(),
  uncategorizedText: z.string().optional(),
  productDescription: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  customerSignature: z.string().optional(),
  receipt: z.string().optional(),
  serviceDates: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  cancellationPolicyDisclosure: z.string().optional(),
  refundPolicy: z.string().optional(),
  refundPolicyDisclosure: z.string().optional(),
  refundRefusalExplanation: z.string().optional(),
  customerCommunication: z.string().optional(),
  generatedAt: z.union([z.string(), z.date()]).optional(),
  model: z.string().optional(),
  version: z.number().optional(),
});

/**
 * Versioned wrapper around a DisputeArgument. The argument history
 * lives on Dispute under `argumentVersions[]`. Exactly one version per
 * Dispute has `isCurrent: true`; at most one has `isSubmitted: true`.
 */
export interface ArgumentVersion {
  argument: DisputeArgument;
  generatedAt: Date;
  version: number;
  isCurrent: boolean;
  isSubmitted: boolean;
  submittedAt?: Date;
}
