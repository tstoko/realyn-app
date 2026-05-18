import { z } from "zod";

/**
 * Final result of a dispute from the PSP, recorded after submission.
 *
 * P0.3 status: SKELETON ONLY. The current codebase records dispute
 * outcome inline on `Dispute.status` (`won` / `lost`) and through ad-hoc
 * `automationStatus` updates. This type formalises the concept so that
 * W1.1 can promote the inline shape into a dedicated document under
 * `disputes/{id}/outcomes/{id}` with stamping for analytics.
 *
 * Do NOT consume this from production paths yet — the persistence
 * layer is not wired up. Use `Dispute.status` for the current source of
 * truth.
 */
export interface Outcome {
  disputeId: string;
  result: "won" | "lost" | "withdrawn" | "expired";
  decidedAt: Date | string;
  recoveredAmount?: number;
  currency?: string;
  evidenceSnapshotRef?: string;
  notes?: string;
}

export const outcomeSchema: z.ZodType<Outcome> = z.object({
  disputeId: z.string(),
  result: z.enum(["won", "lost", "withdrawn", "expired"]),
  decidedAt: z.union([z.date(), z.string()]),
  recoveredAmount: z.number().optional(),
  currency: z.string().optional(),
  evidenceSnapshotRef: z.string().optional(),
  notes: z.string().optional(),
});
