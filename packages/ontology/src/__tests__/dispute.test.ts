/**
 * Workflow status enum + back-compat shape tests for the Dispute
 * ontology. The full Dispute schema is intentionally still loose at v0
 * — see `dispute.ts` and `docs/adr/0002-ontology-versioning.md` for why
 * `.strict()` on Dispute / Organization / User is deferred to W2.3.
 *
 * These tests pin the additive, forward-only contracts that ARE strict
 * in this PR.
 */
import {
  disputeWorkflowStatusSchema,
  disputeStatusSchema,
  automationStatusSchema,
  disputeLifecycleStatusSchema,
  internalStatusSchema,
  type DisputeWorkflowStatus,
} from "../dispute";

describe("disputeWorkflowStatusSchema", () => {
  const expectedVariants: DisputeWorkflowStatus[] = [
    "pending",
    "evidence_collecting",
    "ai_planning",
    "argument_review",
    "submitted",
    "won",
    "lost",
    "expired",
  ];

  test.each(expectedVariants)("accepts %s", (v) => {
    expect(disputeWorkflowStatusSchema.parse(v)).toBe(v);
  });

  test("rejects unknown variants", () => {
    expect(() => disputeWorkflowStatusSchema.parse("settled")).toThrow();
    expect(() => disputeWorkflowStatusSchema.parse("")).toThrow();
    expect(() => disputeWorkflowStatusSchema.parse(null)).toThrow();
  });

  test("covers exactly the variants the partner-readiness plan W1.1 specifies", () => {
    // Hard pin — adding a new variant here is intentional, and bumps
    // ONTOLOGY_VERSION minor per the bumping policy.
    expect(disputeWorkflowStatusSchema.options.slice().sort()).toEqual(
      expectedVariants.slice().sort(),
    );
  });
});

describe("legacy status enums (back-compat)", () => {
  // These schemas remain loose at the Dispute level (no .strict() on
  // disputeSchema yet) — but the individual enum gates are still firm.
  // Pinning them here prevents accidental variant churn during W2.x
  // refactors.

  test("disputeStatusSchema accepts PSP-reported statuses only", () => {
    for (const v of [
      "needs_response",
      "won",
      "lost",
      "under_review",
      "warning_closed",
    ]) {
      expect(disputeStatusSchema.parse(v)).toBe(v);
    }
    expect(() => disputeStatusSchema.parse("submitted")).toThrow();
  });

  test("automationStatusSchema is independent of disputeStatusSchema", () => {
    expect(automationStatusSchema.parse("responding")).toBe("responding");
    // `responding` is automation-only; not a PSP status
    expect(() => disputeStatusSchema.parse("responding")).toThrow();
  });

  test("lifecycle / internal enums each guard their own surface", () => {
    expect(disputeLifecycleStatusSchema.parse("plan_ready")).toBe(
      "plan_ready",
    );
    expect(internalStatusSchema.parse("awaiting_docs")).toBe(
      "awaiting_docs",
    );
  });
});
