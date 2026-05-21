import { z } from "zod";

/**
 * Result variants for a finalised Outcome. Roughly maps to PSP status
 * after submission but is stored separately so analytics can join on a
 * single enum rather than parsing per-PSP status strings.
 */
export const outcomeResultSchema = z.enum([
  "won",
  "lost",
  "withdrawn",
  "expired",
]);
export type OutcomeResult = z.infer<typeof outcomeResultSchema>;

/**
 * Final result of a dispute from the PSP, recorded after submission.
 *
 * The current codebase records dispute outcome inline on
 * `Dispute.status` (`won` / `lost`) and through ad-hoc
 * `automationStatus` updates. This type formalises the concept; W2.x
 * will promote it into a dedicated subcollection under
 * `disputes/{id}/outcomes/{outcomeId}` so multiple decisions on the
 * same dispute (e.g. arbitration after a first lost decision) are
 * representable.
 *
 * Schema is **strict** — no historical data exists yet, so we can lock
 * the shape from day one.
 *
 * Do NOT consume this from production paths yet; persistence is not
 * wired up. Use `Dispute.status` as the current source of truth.
 */
export interface Outcome {
  disputeId: string;
  result: OutcomeResult;
  /** UTC instant the PSP recorded the decision. */
  decidedAt: Date | string;
  /**
   * Amount the merchant recovered, in the smallest currency unit (e.g.
   * cents). Defined only for `won` outcomes. Other results MUST omit
   * the field — enforced by the schema.
   */
  recoveredAmount?: number;
  /** ISO-4217 currency of `recoveredAmount`. Required when amount set. */
  currency?: string;
  /** Snapshot of the evidence bundle submitted at decision time. */
  evidenceSnapshotRef?: string;
  notes?: string;
}

export const outcomeSchema = z
  .object({
    disputeId: z.string().min(1),
    result: outcomeResultSchema,
    decidedAt: z.union([z.date(), z.string().min(1)]),
    recoveredAmount: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .length(3, "ISO-4217 currency code must be 3 letters")
      .optional(),
    evidenceSnapshotRef: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .refine(
    (o) => o.recoveredAmount === undefined || o.currency !== undefined,
    {
      message:
        "currency is required when recoveredAmount is set (ISO-4217 code).",
      path: ["currency"],
    },
  )
  .refine(
    (o) => o.result === "won" || o.recoveredAmount === undefined,
    {
      message:
        "recoveredAmount is only valid on `won` outcomes; remove it for lost/withdrawn/expired.",
      path: ["recoveredAmount"],
    },
  ) satisfies z.ZodType<Outcome>;
