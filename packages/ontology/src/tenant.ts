import { z } from "zod";

/**
 * Operating mode of an Organization. `sandbox` short-circuits live PSP /
 * webhook integrations and routes submissions to mock adapters; `live`
 * is the real production path. See partner-readiness-plan §W3.1 for the
 * full sandbox model.
 */
export const tenantModeSchema = z.enum(["sandbox", "live"]);
export type TenantMode = z.infer<typeof tenantModeSchema>;

/**
 * Industry vertical of an Organization. Drives which evidence
 * categories, prompt templates, KB rules, and connectors apply. The
 * vertical registry in `@realyn/ai-core` is keyed off this enum.
 *
 * `general` is the catch-all for orgs that have not yet been classified
 * — used during onboarding before the operator picks a vertical.
 */
export const tenantVerticalSchema = z.enum([
  "hospitality",
  "ticketing",
  "general",
]);
export type TenantVertical = z.infer<typeof tenantVerticalSchema>;

/**
 * Per-request operating context that must be threaded through every
 * code path that touches per-tenant state. Forgetting to pass it should
 * be a type error, not a runtime bug — see §0 operating principle #7
 * of the partner-readiness plan.
 *
 * Currently introduced as a typed contract; W2.x consumes it from
 * every Action handler, every connector call, and every dashboard
 * mutation. The dashboard's `useTenantContext` hook will return this
 * shape once it lands.
 *
 * `requestId` is the correlator that ties together: the originating
 * HTTP request, all downstream Firestore writes, every AuditEvent
 * emitted, and every Cloud Logging line. It is a string the caller
 * generates (typically `crypto.randomUUID()`) — the ontology does not
 * mint these so any environment (CF, dashboard, CLI) can.
 */
export interface TenantContext {
  organizationId: string;
  userId: string;
  mode: TenantMode;
  vertical: TenantVertical;
  /** BCP-47 language tag (e.g. "en-GB", "es-ES"). */
  locale: string;
  /**
   * Correlator for this request / job. Echoed onto every AuditEvent and
   * structured log line emitted while serving this request.
   */
  requestId: string;
  /**
   * Optional currency the org defaults to for non-dispute-currency
   * display (e.g. dashboard rollups). Dispute amounts are always in the
   * dispute's own currency; this is operator-facing display only.
   */
  defaultCurrency?: string;
  /** IANA timezone (e.g. "Europe/London"). Operator-facing display only. */
  timezone?: string;
}

export const tenantContextSchema = z
  .object({
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    mode: tenantModeSchema,
    vertical: tenantVerticalSchema,
    locale: z.string().min(2),
    requestId: z.string().min(1),
    defaultCurrency: z.string().optional(),
    timezone: z.string().optional(),
  })
  .strict() satisfies z.ZodType<TenantContext>;
