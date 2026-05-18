import { z } from "zod";
import type { Timestamp } from "./timestamp";
import type { EvidencePlan, EvidenceItem } from "./evidence";
import { evidencePlanSchema, evidenceItemSchema } from "./evidence";
import type { DisputeArgument, ArgumentVersion } from "./argument";
import { disputeArgumentSchema } from "./argument";

/**
 * PSP-reported dispute outcome, surfaced to the user. Independent of the
 * internal `automationStatus` and `lifecycleStatus` which track our
 * pipeline state.
 */
export const disputeStatusSchema = z.enum([
  "needs_response",
  "won",
  "lost",
  "under_review",
  "warning_closed",
]);
export type DisputeStatus = z.infer<typeof disputeStatusSchema>;

/**
 * State machine for the AI pipeline. Currently free-form across handlers
 * — W2.x replaces this with the `Action`-based state model.
 */
export const automationStatusSchema = z.enum([
  "auditing",
  "awaiting_info",
  "responding",
  "submitted",
  "manual_review",
  "unwinnable",
  "complete",
]);
export type AutomationStatus = z.infer<typeof automationStatusSchema>;

/**
 * High-level lifecycle stage shown to the operator in the dashboard.
 * Roughly maps to the union of (PSP status, automationStatus) but lives
 * separately because the operator-facing flow is allowed to diverge
 * (e.g. an internally-`submitted` dispute may still be `under_review`
 * with the PSP).
 */
export const disputeLifecycleStatusSchema = z.enum([
  "new",
  "plan_ready",
  "evidence_in_progress",
  "draft_ready",
  "submitted",
  "under_review",
  "won",
  "lost",
  "not_contested",
]);
export type DisputeLifecycleStatus = z.infer<
  typeof disputeLifecycleStatusSchema
>;

/**
 * Operator-facing review state used by the team-management surface.
 * Distinct from `automationStatus` (which is internal to the pipeline)
 * and `lifecycleStatus` (which is end-user-facing).
 */
export const internalStatusSchema = z.enum([
  "needs_review",
  "awaiting_docs",
  "ready_to_submit",
  "resolved",
  "submitted",
  "evidence_complete",
]);
export type InternalStatus = z.infer<typeof internalStatusSchema>;

/**
 * Free-form note attached to a Dispute by an operator. Kept ordered by
 * `timestamp` ascending.
 */
export interface Note {
  id: string;
  author: string;
  timestamp: Date | string;
  text: string;
}

/**
 * Category for an `AutomationStep`. Used by the audit-trail renderer to
 * pick an icon and to filter the activity log.
 */
export const auditTrailCategorySchema = z.enum([
  "dispute_received",
  "pms_matching",
  "evidence_planning",
  "evidence_upload",
  "argument_generation",
  "submission",
  "status_change",
  "user_action",
  "integration_config",
  "pms_import",
  "error",
]);
export type AuditTrailCategory = z.infer<typeof auditTrailCategorySchema>;

/**
 * Single row of the per-Dispute audit trail. The W2.2 work expands this
 * into the comprehensive `AuditEvent` model (see `./audit.ts`).
 */
export interface AutomationStep {
  timestamp: Date;
  title: string;
  description: string;
  status: "pending" | "success" | "failure" | "in_progress";
  actor?:
    | { type: "user"; userId: string; userName: string }
    | { type: "system" }
    | { type: "automation" };
  category?: AuditTrailCategory;
  metadata?: Record<string, unknown>;
  relatedResources?: {
    evidenceFileIds?: string[];
    evidencePlanId?: string;
    argumentVersionId?: string;
  };
}

/**
 * Canonical Dispute document. Persisted under `disputes/{disputeId}` in
 * Firestore and read by the dashboard, the AI pipeline, and the PSP
 * submission code paths.
 *
 * History: this shape has grown organically since v0. Field renames are
 * deliberately deferred to W1.1 so the skeleton PR stays a pure move.
 * Notable shapes worth standardising later:
 *
 *   - `stripeDisputeId`, `stripePaymentIntentId` are PSP-specific and
 *     duplicate `pspDisputeId` / `pspPaymentId`. Slated for removal once
 *     all consumers have switched.
 *   - `readinessAssessment` and `draftValidation` are inline objects.
 *     W1.x lifts them into their own ontology types.
 */
export interface Dispute {
  id: string;
  organizationId?: string;

  // Legacy Stripe fields (kept for backward compat)
  stripeDisputeId?: string;
  stripePaymentIntentId?: string;

  // PSP-agnostic fields
  pspProvider?: "stripe" | "adyen" | "unknown";
  pspDisputeId?: string;
  pspPaymentId?: string;
  pspTransactionDate?: Date | Timestamp | null;
  pspLast4Digits?: string | null;

  status: DisputeStatus;
  reason?: string | null;
  amount: number;
  currency: string;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  respondBy?: Timestamp | Date;
  customerExplanation?: string;

  automationStatus?: AutomationStatus;
  awaitingInfoFrom?: string;
  missingEvidence?: string[];
  auditTrail?: AutomationStep[];
  aiSummary?: string;
  aiDraftResponse?: string;
  isDraftApproved?: boolean;
  lifecycleStatus?: DisputeLifecycleStatus;
  internalNotes?: Note[];
  assignedTeam?: string;
  assigneeId?: string | null;
  internalStatus?: InternalStatus;

  evidencePlan?: EvidencePlan;
  evidenceItems?: EvidenceItem[];
  evidencePlanGeneratedAt?: Date;
  evidencePlanVersions?: EvidencePlan[];
  useAIPlan?: boolean;
  evidencePlanStatus?: string;
  evidencePlanError?: string | null;

  argumentDraft?: DisputeArgument;
  argumentDraftGeneratedAt?: Date;
  argumentVersions?: ArgumentVersion[];
  argumentSubmittedAt?: Date;

  readinessAssessment?: {
    caseId: string;
    assessedAt: Date | string;
    version: number;
    evidenceCompleteness: {
      requiredFulfilled: number;
      requiredTotal: number;
      optionalFulfilled: number;
      optionalTotal: number;
      percentComplete: number;
    };
    deadlineRisk: "critical" | "urgent" | "normal" | "comfortable";
    daysRemaining: number | null;
    winnability: "high" | "medium" | "low";
    recommendation: "fight" | "accept";
    draftStatus: string;
    blockingIssues: { issue: string; severity: "critical" | "major" | "minor" }[];
    overallReadiness: string;
  };
  draftValidation?: {
    caseId: string;
    validatedAt: Date | string;
    draftVersion: number;
    overallSupport: "strong" | "adequate" | "weak" | "unsupported";
    supportedClaims: { claim: string; evidenceIds: string[] }[];
    weakClaims: { claim: string; reason: string; suggestedEvidence: string[] }[];
    unsupportedClaims: { claim: string; reason: string }[];
    missingPspFields: { field: string; required: boolean }[];
    submissionRisk: "low" | "medium" | "high";
  };
}

/**
 * Zod schema for Dispute. Loose at v0 — we use `z.unknown()` for the
 * Timestamp-shaped fields and the two big inline assessment objects
 * rather than mirroring their full shape, since they are written by
 * `functions/` and not yet validated at any boundary. W1.1 lifts these
 * into their own ontology types and tightens the schema.
 *
 * Note we do NOT annotate the result as `z.ZodType<Dispute>`: the
 * loosened `z.unknown()` fields make the inferred zod output type
 * structurally incompatible with the strict `Dispute` interface, even
 * though every successful parse still produces a valid Dispute value at
 * runtime. The interface remains the source of truth; this schema is a
 * runtime safety net.
 */
export const disputeSchema = z.object({
  id: z.string(),
  organizationId: z.string().optional(),
  stripeDisputeId: z.string().optional(),
  stripePaymentIntentId: z.string().optional(),
  pspProvider: z.enum(["stripe", "adyen", "unknown"]).optional(),
  pspDisputeId: z.string().optional(),
  pspPaymentId: z.string().optional(),
  pspTransactionDate: z.unknown().optional(),
  pspLast4Digits: z.union([z.string(), z.null()]).optional(),
  status: disputeStatusSchema,
  reason: z.union([z.string(), z.null()]).optional(),
  amount: z.number(),
  currency: z.string(),
  createdAt: z.unknown(),
  updatedAt: z.unknown().optional(),
  respondBy: z.unknown().optional(),
  customerExplanation: z.string().optional(),
  automationStatus: automationStatusSchema.optional(),
  awaitingInfoFrom: z.string().optional(),
  missingEvidence: z.array(z.string()).optional(),
  auditTrail: z.array(z.unknown()).optional(),
  aiSummary: z.string().optional(),
  aiDraftResponse: z.string().optional(),
  isDraftApproved: z.boolean().optional(),
  lifecycleStatus: disputeLifecycleStatusSchema.optional(),
  internalNotes: z.array(z.unknown()).optional(),
  assignedTeam: z.string().optional(),
  assigneeId: z.union([z.string(), z.null()]).optional(),
  internalStatus: internalStatusSchema.optional(),
  evidencePlan: evidencePlanSchema.optional(),
  evidenceItems: z.array(evidenceItemSchema).optional(),
  evidencePlanGeneratedAt: z.date().optional(),
  evidencePlanVersions: z.array(evidencePlanSchema).optional(),
  useAIPlan: z.boolean().optional(),
  evidencePlanStatus: z.string().optional(),
  evidencePlanError: z.union([z.string(), z.null()]).optional(),
  argumentDraft: disputeArgumentSchema.optional(),
  argumentDraftGeneratedAt: z.date().optional(),
  argumentVersions: z.array(z.unknown()).optional(),
  argumentSubmittedAt: z.date().optional(),
  readinessAssessment: z.unknown().optional(),
  draftValidation: z.unknown().optional(),
});

/**
 * Filter / sort helpers used by the dashboard. Not part of the
 * persisted ontology — kept here so the dashboard doesn't reach into
 * `@realyn/shared` for them.
 */
export interface FilterState {
  status?: "all" | DisputeStatus;
  reason?: "all" | string;
  searchText?: string;
}

export interface SortState {
  field: keyof Dispute;
  direction: "asc" | "desc";
}
