# ADR-0002 — Versioning the ontology

- **Status:** Accepted
- **Date:** 2026-05-21
- **Owners:** Platform
- **Supersedes:** none
- **Plan reference:** [`partner-readiness-plan.md`](../partner-readiness-plan.md) §W1.1

## Context

ADR-0001 established `@realyn/ontology` as the single source of truth for canonical domain types. The skeleton (PR #26) moved types into the package with permissive zod schemas — `.passthrough()` semantics by default, no `.strict()` — to land the package without breaking existing Firestore documents that carry historical fields.

The partner-readiness plan §W1.1 calls out "all schemas use zod with `.strict()` (no extra properties allowed)" as a deliverable. Taken literally, that would reject every Firestore document written before the schemas existed, which would break the dashboard for every user the moment validation went live.

We need a clear policy for two related questions:

1. **When does the version number bump?** Consumers (dashboard, ai-core, functions) need to know whether a given ontology release is safe to upgrade to silently or whether their persisted data needs migration.
2. **When can we strictify an existing schema?** `.strict()` on a schema that has lived in production is a breaking change for any document written before that strictification. We need a rollout path.

## Decision

### Versioning

`ONTOLOGY_VERSION` follows semver with the bumping policy below. Persisted documents stamp this value so migration tooling can identify documents written under older surfaces.

| Bump  | When                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| MAJOR | Removing or breaking-renaming a canonical type. Strictifying an existing schema in a way that rejects historical data. Changing the discriminant or shape of a discriminated union. |
| MINOR | Adding a new canonical type. Adding a new optional field. Adding a new enum variant in a backward-compatible way. Introducing a new strict schema for a not-yet-persisted shape (e.g. `AuditEvent`, `Outcome`, `TenantContext`). |
| PATCH | Doc-only updates. Schema tightening that does not break existing data (e.g. adding `.min(1)` to a field guaranteed non-empty in practice). Non-breaking type widening. |

The 0.x range is **pre-stable**. Minor bumps in 0.x MAY include additive breaking changes (e.g. adding a required field with a documented default) as long as a documented data-fill plan exists. The 1.0 release is the snapshot of shapes the Action framework (W2.1) commits to long-term; after 1.0, the MAJOR rules above are absolute.

This PR bumps `0.1.0 → 0.2.0` (MINOR): three new canonical types (`TenantContext`, hardened `AuditEvent`, hardened `Outcome`) and one new enum (`DisputeWorkflowStatus`), no removals or renames.

### Strictness rollout

Schemas in `@realyn/ontology` are partitioned into two tiers:

**Tier A — strict from day one.** Schemas for shapes that have no production data yet, where we can lock the contract from the start. As of `0.2.0`:

- `tenantContextSchema`
- `auditEventSchema` (W2.2 collection does not yet exist in prod)
- `outcomeSchema` (W2.x will promote into its own subcollection)
- `disputeWorkflowStatusSchema` (additive enum; not consumed yet)

Tier A schemas use `.strict()` on every object — including nested objects — and `.discriminatedUnion()` over discriminating fields. Unknown fields are a parse error, not a silent strip.

**Tier B — permissive, with a documented strictification path.** Schemas for shapes that already have persisted data in Firestore. As of `0.2.0`:

- `userSchema`
- `disputeSchema`
- `organizationSchema`
- `evidencePlanSchema`, `evidenceItemSchema`, `disputeArgumentSchema` (cached intermediates carry pipeline-stamp fields that vary by release)

Tier B schemas omit `.strict()`. Unknown fields are passed through silently. The interface remains the source of truth; the schema is a runtime safety net for the fields it does enumerate.

A Tier B schema graduates to Tier A only after **all three** of the following are met:

1. A data audit script has scanned every document in the relevant collection and reported the union of all field names actually present.
2. A migration script has back-filled / removed any fields the new strict schema would reject. The migration is idempotent (re-running produces no diff).
3. The graduation lands in a `0.x` MINOR bump (pre-1.0) or a `x.0.0` MAJOR bump (post-1.0).

This sequencing is what lets us land "strict schemas everywhere" as a destination without breaking prod the day the schemas are written.

### Mandatory stamps

Every persisted document SHOULD eventually carry an `ontologyVersion` stamp (`OntologyVersionStamp`). In `0.2.0` the stamp remains optional — it becomes mandatory in W2.x when the Action framework writes every persistent mutation and can guarantee the stamp is present on the way in.

Until then, documents without a stamp are treated as "ontology unknown — fall back to permissive parse with logging".

### Pipeline-stamp distinction (W3.3)

Note that the partner-readiness plan §W3.3 introduces a separate set of stamps for AI pipeline outputs — `promptVersion`, `modelVersion`, `ontologyVersion`, `ragSchemaVersion`, `isFallback`, `generatedAt`, `requestId`. The `ontologyVersion` in that set is the same value defined here; the other stamps are pipeline-internal and orthogonal to the ontology surface.

## Consequences

### Positive

- Consumers can pin against a specific MINOR and know that an additive MINOR upgrade will not require schema changes on the document side.
- A new entity (e.g. partner SDK adds a connector capability shape) can be introduced as a strict schema from day one without retrofitting historical data.
- Strictification of existing schemas becomes a documented, scripted process — not a "merge a one-line PR and watch prod ignite" moment.
- The 0.x → 1.0 transition has a clear definition of done: every Tier B schema has graduated to Tier A.

### Negative

- Tier B schemas remain weaker than Tier A indefinitely (until graduated). A field added to a Tier B interface but not to its zod schema will silently parse — the type system is the only enforcement.
- Two flavours of "strict" in the codebase means contributors need to know which tier a schema lives in before reasoning about it. Mitigation: each schema file calls this out in its top-of-file doc comment.

### Risks

- **Drift between interface and schema in Tier B.** Without `.strict()`, a typo in the schema (e.g. `dispute_status` vs `disputeStatus`) won't be caught at parse time. Mitigation: per-package round-trip tests that take a representative interface value and assert `schema.parse(value)` succeeds.
- **0.x minor bumps with additive breaking changes are still breaking changes.** A consumer that imports a renamed type will break on `0.2.0 → 0.3.0` even though semver "says" minor is safe. Mitigation: every 0.x MINOR PR explicitly lists breaking renames in its description; releases without renames flag "no breakage" so the consumer can fast-forward.

## Rollout

This ADR is meta — there is no code rollout. The bumping policy applies starting `0.2.0` (this PR). The strictness rollout begins now with the Tier A schemas listed above; Tier B graduations are scheduled per the partner-readiness-plan §W2.x once the W2.3 migration framework exists.

## Alternatives considered

**`.strict()` on every schema today.** Rejected — would reject prod data. Cannot be deployed without a simultaneous migration of every Firestore collection, which is W2.3 work that hasn't been done.

**Drop zod entirely; rely on TypeScript types.** Rejected — types disappear at runtime. We need parse-time enforcement for documents that cross the Firestore boundary, and we need it to fail-loud per §0 principle #8.

**Per-tenant ontology versions.** Rejected as premature — adds a dimension we don't yet need. Single global `ONTOLOGY_VERSION` until we have a concrete migration scenario that demands otherwise.

**Use a different versioning scheme (CalVer, date-based).** Rejected — consumers (dashboard, ai-core, functions) already npm-resolve `@realyn/ontology` through workspace `file:` deps; semver is the universal vocabulary npm tooling speaks. CalVer adds cognitive load without solving a real problem here.
