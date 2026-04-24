/**
 * API Contract Schemas — Dispute Submission Handlers
 *
 * Zod schemas defining request/response shapes for the PSP submission
 * Cloud Functions (Stripe, Adyen, and unified).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared request
// ---------------------------------------------------------------------------

export const SubmitDisputeRequestSchema = z.object({
  disputeId: z.string().min(1),
  organizationId: z.string().min(1),
  evidence: z
    .object({
      textEvidence: z.record(z.unknown()).optional(),
      customerCommunication: z.string().optional(),
      customerSignature: z.string().optional(),
      receipt: z.string().optional(),
      serviceDocumentation: z.string().optional(),
      uncategorizedFile: z.string().optional(),
      productDescription: z.string().optional(),
      accessActivityLog: z.string().optional(),
      customerPurchaseIp: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Stripe success response
// ---------------------------------------------------------------------------

export const StripeSubmitSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  disputeStatus: z.string(),
  evidenceFilesSubmitted: z.number(),
});

// ---------------------------------------------------------------------------
// Adyen success response
// ---------------------------------------------------------------------------

export const AdyenSubmitSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  defenseReference: z.string(),
  evidenceFilesSubmitted: z.number(),
});

// ---------------------------------------------------------------------------
// Unified submit success response
// ---------------------------------------------------------------------------

export const UnifiedSubmitSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  disputeStatus: z.string().optional(),
  evidenceFilesSubmitted: z.number(),
  pspResponseId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Shared error response
// ---------------------------------------------------------------------------

export const SubmitDisputeErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.string().optional(),
  errorCode: z.union([z.string(), z.number()]).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SubmitDisputeRequest = z.infer<typeof SubmitDisputeRequestSchema>;
