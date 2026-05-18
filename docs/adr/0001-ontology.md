# ADR-0001 — Ontology-first architecture

- **Status:** Accepted (skeleton landed in PR opening this ADR)
- **Date:** 2026-05-17
- **Owners:** Platform
- **Supersedes:** none
- **Plan reference:** [`partner-readiness-plan.md`](../partner-readiness-plan.md) §P0.3 (this PR), §W1.1 (follow-up that completes the surface)

## Context

The Realyn platform currently has three independent copies of the
canonical domain types:

| Location | Surface | Notes |
| --- | --- | --- |
| `packages/shared/src/types.ts` | `Dispute`, `EvidencePlan`, `Organization`, … | Frontend shape. Imports `Timestamp` from `firebase/firestore`. Read by dashboard, website. |
| `functions/src/types/*.ts` | `aiDispute.ts`, `organization.ts`, `dispute.ts`, … | Backend shape. Hand-rolled to mirror `shared/types.ts` where the dashboard needs to round-trip data. Imports from `firebase-admin/firestore`. |
| `packages/ai-core/src/types/*.ts` | `aiDispute.ts`, `knowledgeBase.ts`, `rag.ts` | Pipeline shape. SDK-independent because ai-core ships as a portable npm package consumed by Functions via `file:` install. |

These three surfaces drift. A field added in one is forgotten in
another; a rename happens in `shared` and silently breaks a serialized
write in `functions`. There is no validation at the boundaries because
there is no single schema to validate against. This is the root cause
of several recent production incidents (e.g. `evidencePlanError` field
typed as `string` in one place and `string | null` in another, leading
to silent `undefined` writes that downstream code couldn't tell apart
from `not-yet-set`).

The partner-readiness plan ([`partner-readiness-plan.md`](../partner-readiness-plan.md))
calls out **ontology-first** as principle #1:

> Every entity is defined once in `@realyn/ontology`. No ad-hoc Firestore
> document shapes anywhere. AI specialists, dashboard, Cloud Functions
> all consume the same types.

This is also the Palantir Foundry model: the ontology is the platform's
API. All persistence, all RPC, all UI binds against the same shapes.

## Decision

Introduce a new workspace package, **`@realyn/ontology`**, that holds
the canonical type definitions and zod schemas for every persisted
entity across the platform.

### Package shape (this PR — P0.3 skeleton)

- New workspace package at `packages/ontology/`
  - `package.json` — source-only (`main: src/index.ts`), no build step
    yet. Mirrors `@realyn/shared`'s consumption pattern.
  - `tsconfig.json` — `strict: true`, no firebase deps
  - `src/version.ts` — `ONTOLOGY_VERSION = "0.1.0"`
  - `src/timestamp.ts` — **structural** Timestamp interface compatible
    with both `firebase/firestore` and `firebase-admin/firestore`
    Timestamp classes
  - `src/user.ts`, `src/dispute.ts`, `src/evidence.ts`,
    `src/argument.ts`, `src/org.ts`, `src/billing.ts` — moved verbatim
    from `packages/shared/src/types.ts` and `packages/shared/src/billing.ts`
  - `src/outcome.ts`, `src/audit.ts` — minimal placeholders for the W1.1
    work (concepts named in the plan; no production consumers yet)
- Each of the seven canonical entities (User, Dispute, EvidenceItem,
  EvidencePlan, DisputeArgument, Organization, Subscription) ships with
  a TS interface AND a zod schema. The pair is colocated in the same
  file so renames stay atomic.
- `@realyn/shared/types.ts` and `@realyn/shared/billing.ts` collapse
  into re-export shims (`export * from "@realyn/ontology"`). Every
  existing consumer that does `import { Dispute } from '@realyn/shared'`
  continues to work without changes.

### What this PR explicitly does NOT do

The skeleton stops at the boundary of `@realyn/shared` to keep the diff
small and reviewable. The full migration is W1.1 in the partner-
readiness plan and will land in subsequent PRs:

- `functions/` continues to use its hand-rolled types in
  `functions/src/types/`. Unifying these requires either (a) building
  `@realyn/ontology` to `dist/` and consuming it via `file:` install the
  way Functions consumes `@realyn/ai-core` today, or (b) restructuring
  Functions into a workspace package. Both have meaningful complexity
  and deserve their own PR.
- `@realyn/ai-core` continues to use its own pipeline types in
  `packages/ai-core/src/types/`. These are deliberately portable (no
  firebase dep) and overlap conceptually but not structurally with the
  Firestore-facing types in `@realyn/ontology`. W1.1 reconciles them.
- `Outcome` and `AuditEvent` are defined in `@realyn/ontology` as
  placeholders but are NOT yet persisted. The persistence layer lands
  in W2.1 (Action framework) and W2.2 (audit trail).
- Zod schemas are deliberately loose at v0:
  - The two largest schemas (`disputeSchema`, `organizationSchema`)
    drop the `z.ZodType<X>` annotation and use `z.unknown()` for the
    inline assessment objects, PSP credentials, and Timestamp-shaped
    fields. The TS interfaces remain the source of truth; schemas are a
    best-effort runtime safety net until W1.1 hardens them.
  - `.strict()` is not applied anywhere yet (the plan calls for this in
    W1.1). Reason: existing Firestore documents predate this schema and
    likely carry fields we have not catalogued. Hardening to `.strict()`
    requires a data audit first.

### Bumping policy (`ONTOLOGY_VERSION`)

- **MAJOR**: removing or breaking-renaming a canonical type
- **MINOR**: adding a new canonical type, or adding a new required field
  with a default
- **PATCH**: doc-only updates, schema tightening that does not break
  existing data, non-breaking type widening

Currently `0.1.0`. The surface is intentionally unstable until 1.0;
expect renames as W1.1 consolidates the three duplicate type
hierarchies.

## Consequences

### Positive

- Single source of truth for the seven canonical entities (the rest
  follow in W1.1).
- New code can validate at boundaries with `disputeSchema.parse(data)`
  rather than trusting whatever shape Firestore returned.
- Renames become atomic — moving a field in `@realyn/ontology` triggers
  a compile error in every consumer at once.
- The ontology has zero firebase dependency, so future consumers
  (Functions, ai-core, potential public partner SDK) don't have to pick
  a side between client / admin SDKs.
- Sets up the contract that W1.x / W2.x work targets: per-tenant
  `Org` extension, `TenantContext`, Action framework, audit trail.

### Negative

- Adds a workspace package. Three packages currently live under
  `packages/*`; this brings it to four. Trivial overhead but worth
  noting for monorepo onboarding.
- The skeleton is intentionally incomplete — until W1.1, anyone
  consuming the ontology has to know that `functions/` and `ai-core/`
  still use their hand-rolled types. Until then the canonical-source-
  of-truth claim is aspirational for those consumers.
- Two zod schemas use `z.unknown()` for fields the runtime hasn't
  catalogued. Calling `.parse(data)` will succeed even when those
  fields are garbage — the contract is loose by design at v0. W1.1
  tightens this.

### Risks / open questions

- The structural Timestamp may surface latent assignability bugs in
  rare places where existing code assumed it had a firebase-class
  Timestamp specifically. Caught by typecheck at the consumer; if a
  dashboard build regresses on Timestamp, revisit. (Initial typecheck
  pass for `@realyn/dashboard` is clean.)
- The `@realyn/ontology` -> `@realyn/shared` -> consumers chain creates
  a transitive dep. Removing the `@realyn/shared` re-export shim later
  will be a breaking change for any consumer that hasn't migrated to
  `@realyn/ontology` directly. We accept that cost and will deprecate
  the shim before 1.0.

## Roll-out plan

| Phase | Scope | PR |
| --- | --- | --- |
| **P0.3 (this PR)** | Skeleton + 7 canonical types + back-compat shim | this PR |
| **W1.1** | Migrate `functions/` and `@realyn/ai-core` to consume `@realyn/ontology` directly. Tighten schemas with `.strict()`. Add ADR-0002 (versioning). | next |
| **W2.1** | Wire `AuditEvent` and `Outcome` to real persistence. Action framework consumes ontology types as Action I/O schemas. | follow-up |
| **W2.3** | Extend `Organization` with `vertical`, `mode`, `evidenceSources`, `promptOverrides`, `ontologyVersion`. ADR-0006 covers tenant isolation. | follow-up |
| **1.0** | Remove the `@realyn/shared` re-export shim. All consumers import from `@realyn/ontology` directly. Schemas are `.strict()`. `ONTOLOGY_VERSION` stamped on every persisted document. | after partner #1 onboarding |

## Alternatives considered

### Keep the three duplicate type hierarchies, fix drift case-by-case

Rejected. The current pain is precisely that drift is invisible until
production. Centralising the schema is the only way to make drift a
compile error.

### Generate types from JSON Schema or protobuf, not hand-written TS + zod

Rejected for v0. We have TypeScript everywhere; the dev ergonomics of a
TS-first ontology are worth more than the polyglot benefits of a
schema-first toolchain. Revisit if a non-TS partner SDK becomes a
priority — until then, the partner SDK in W4.1 is also TS.

### Put the ontology inside `@realyn/ai-core`

Rejected. `@realyn/ai-core` ships to Functions as a packed tarball and
has its own portability constraints (no firebase, no React). Putting
the dashboard's canonical types inside it would either pull React /
firebase into ai-core (bad) or force the dashboard to consume a
build-artifact (worse DX). A separate workspace package is the right
boundary.
