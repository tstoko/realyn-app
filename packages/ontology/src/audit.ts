import { z } from "zod";

/**
 * Canonical audit event for the platform.
 *
 * The current production audit trail still lives in two places:
 *   - `Dispute.auditTrail: AutomationStep[]` (per-dispute, human-facing)
 *   - Cloud Logging structured events (per-function, observability)
 *
 * W2.2 in the partner-readiness plan unifies these into an
 * append-only `organizations/{orgId}/auditEvents/{eventId}` Firestore
 * collection. This is the contract that work targets.
 *
 * Schema is **strict** (`.strict()`): every AuditEvent ever written
 * MUST conform to exactly this shape. We can afford strictness here
 * because there is no historical data in this collection yet — it does
 * not exist in prod.
 *
 * Do NOT write to this shape from production paths yet — the
 * persistence layer and security rules are not wired up (W2.2).
 */
export interface AuditEvent {
  id: string;
  /** UTC instant the event occurred (ISO-8601 string or Date). */
  ts: Date | string;
  /** Who triggered the action — system, automation, or specific user. */
  actor: AuditActor;
  /** Canonical entity name + id touched by the action. */
  entity: {
    type: string;
    id: string;
    organizationId?: string;
  };
  /** Canonical name of the Action that produced the event (W2.1). */
  action: string;
  /** Version of the Action definition that ran (W2.1). */
  actionVersion?: string;
  /** Inputs to the Action — small, redacted of PII. */
  input?: Record<string, unknown>;
  /** Document state before the Action ran, or null for creates. */
  before?: Record<string, unknown> | null;
  /** Document state after the Action ran, or null for deletes. */
  after?: Record<string, unknown> | null;
  /** Correlator linking to the originating HTTP request / job. */
  requestId?: string;
  /**
   * Operating mode of the originating Organization at the time of the
   * event. Sandbox events are tagged so analytics can exclude them
   * cleanly from real-money rollups. See §W3.1.
   */
  mode?: "sandbox" | "live";
}

export type AuditActor =
  | { type: "user"; userId: string; userName?: string }
  | { type: "system" }
  | { type: "automation"; component: string };

const auditActorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("user"),
      userId: z.string().min(1),
      userName: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal("system") }).strict(),
  z
    .object({
      type: z.literal("automation"),
      component: z.string().min(1),
    })
    .strict(),
]) satisfies z.ZodType<AuditActor>;

export const auditEventSchema = z
  .object({
    id: z.string().min(1),
    ts: z.union([z.date(), z.string().min(1)]),
    actor: auditActorSchema,
    entity: z
      .object({
        type: z.string().min(1),
        id: z.string().min(1),
        organizationId: z.string().optional(),
      })
      .strict(),
    action: z.string().min(1),
    actionVersion: z.string().optional(),
    input: z.record(z.unknown()).optional(),
    before: z.union([z.record(z.unknown()), z.null()]).optional(),
    after: z.union([z.record(z.unknown()), z.null()]).optional(),
    requestId: z.string().optional(),
    mode: z.enum(["sandbox", "live"]).optional(),
  })
  .strict() satisfies z.ZodType<AuditEvent>;
