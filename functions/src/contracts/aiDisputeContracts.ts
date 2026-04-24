/**
 * API Contract Schemas — AI Dispute Handlers
 *
 * Zod schemas defining the request and response shapes for the AI dispute
 * Cloud Functions. These are the single source of truth: handlers should
 * conform to these shapes, and CI tests validate they do.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// planEvidence
// ---------------------------------------------------------------------------

export const PlanEvidenceRequestSchema = z.object({
  organizationId: z.string().min(1),
  regenerate: z.boolean().optional(),
});

export const PlanEvidenceSuccessResponseSchema = z.object({
  success: z.literal(true),
  status: z.literal("queued"),
  message: z.string(),
});

export const PlanEvidenceErrorResponseSchema = z.object({
  error: z.string(),
});

// ---------------------------------------------------------------------------
// draftArgument
// ---------------------------------------------------------------------------

export const DraftArgumentRequestSchema = z.object({
  organizationId: z.string().min(1),
  regenerate: z.boolean().optional(),
});

export const DraftArgumentSuccessResponseSchema = z.object({
  success: z.literal(true),
  argument: z.record(z.unknown()),
  cached: z.boolean(),
  version: z.number().optional(),
});

export const DraftArgumentErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

// ---------------------------------------------------------------------------
// updateEvidenceItem
// ---------------------------------------------------------------------------

export const EvidenceItemStatusSchema = z.enum([
  "pending",
  "uploaded",
  "not_available",
  "not_applicable",
]);

export const UpdateEvidenceItemRequestSchema = z.object({
  requirementId: z.string().min(1),
  status: EvidenceItemStatusSchema,
  fileId: z.string().optional(),
  fileName: z.string().optional(),
  uploadedBy: z.string().optional(),
  notes: z.string().optional(),
});

export const EvidenceProgressSchema = z.object({
  completed: z.number(),
  total: z.number(),
  requiredCompleted: z.number(),
  requiredTotal: z.number(),
  isComplete: z.boolean(),
});

export const UpdateEvidenceItemSuccessResponseSchema = z.object({
  success: z.literal(true),
  progress: EvidenceProgressSchema,
});

// ---------------------------------------------------------------------------
// getProgress
// ---------------------------------------------------------------------------

export const GetProgressSuccessResponseSchema = z.object({
  success: z.literal(true),
  progress: EvidenceProgressSchema,
});

// ---------------------------------------------------------------------------
// toggleAIPlan
// ---------------------------------------------------------------------------

export const ToggleAIPlanRequestSchema = z.object({
  organizationId: z.string().min(1),
  useAIPlan: z.boolean(),
});

export const ToggleAIPlanSuccessResponseSchema = z.object({
  success: z.literal(true),
  useAIPlan: z.boolean(),
});

// ---------------------------------------------------------------------------
// Generic error (shared by all endpoints)
// ---------------------------------------------------------------------------

export const GenericErrorResponseSchema = z.object({
  error: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred types (for type-safe use in handlers/tests)
// ---------------------------------------------------------------------------

export type PlanEvidenceRequest = z.infer<typeof PlanEvidenceRequestSchema>;
export type DraftArgumentRequest = z.infer<typeof DraftArgumentRequestSchema>;
export type UpdateEvidenceItemRequest = z.infer<typeof UpdateEvidenceItemRequestSchema>;
export type ToggleAIPlanRequest = z.infer<typeof ToggleAIPlanRequestSchema>;
export type EvidenceProgress = z.infer<typeof EvidenceProgressSchema>;
