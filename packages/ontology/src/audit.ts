import { z } from "zod";

/**
 * Canonical audit event for the platform.
 *
 * P0.3 status: SKELETON ONLY. Today's audit trail lives in two places:
 *   - `Dispute.auditTrail: AutomationStep[]` (per-dispute, human-facing)
 *   - Cloud Logging structured events (per-function, observability)
 *
 * W2.2 in the partner-readiness plan unifies these into an append-only
 * `auditEvents` Firestore collection with `{actor, entity, action, before,
 * after, ts, requestId}`. This type is the contract that work targets.
 *
 * Do NOT write to this shape from production paths yet — the
 * persistence layer and security rules are not wired up.
 */
export interface AuditEvent {
  id: string;
  /** UTC instant the event occurred. */
  ts: Date | string;
  /** Who triggered the action — system, automation, or specific user. */
  actor:
    | { type: "user"; userId: string; userName?: string }
    | { type: "system" }
    | { type: "automation"; component: string };
  /** Canonical entity name + id touched by the action. */
  entity: {
    type: string;
    id: string;
    organizationId?: string;
  };
  /** Canonical name of the Action that produced the event (W2.1). */
  action: string;
  /** Inputs to the Action — small, redacted of PII. */
  input?: Record<string, unknown>;
  /** Document state before the Action ran, or null for creates. */
  before?: Record<string, unknown> | null;
  /** Document state after the Action ran, or null for deletes. */
  after?: Record<string, unknown> | null;
  /** Correlator linking to the originating HTTP request / job. */
  requestId?: string;
}

export const auditEventSchema: z.ZodType<AuditEvent> = z.object({
  id: z.string(),
  ts: z.union([z.date(), z.string()]),
  actor: z.union([
    z.object({
      type: z.literal("user"),
      userId: z.string(),
      userName: z.string().optional(),
    }),
    z.object({ type: z.literal("system") }),
    z.object({
      type: z.literal("automation"),
      component: z.string(),
    }),
  ]),
  entity: z.object({
    type: z.string(),
    id: z.string(),
    organizationId: z.string().optional(),
  }),
  action: z.string(),
  input: z.record(z.unknown()).optional(),
  before: z.union([z.record(z.unknown()), z.null()]).optional(),
  after: z.union([z.record(z.unknown()), z.null()]).optional(),
  requestId: z.string().optional(),
});
