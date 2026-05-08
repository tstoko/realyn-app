# Partner-Readiness Plan

> **From "production-ready app" to "partner-ready platform."**
>
> **Target:** 6 weeks of focused engineering. End state — partner #1 onboardable in week 4 of their integration; platform absorbs marginal cost cleanly from partner #2 onwards.
>
> **Philosophy:** Palantir Foundry applied to your stack. The ontology is the API. All state mutations are typed, named, versioned, audited Actions. Source systems enter through Connectors that conform to a single interface. Pipelines are branchable. Audit is append-only. Sandbox-first integration. Tenant isolation by construction.
>
> **Reference points:** Plaid (sandbox + connector DX), Justt (B2B chargeback automation, public Evidence Submission API), Palantir Foundry (ontology + connectors + actions + audit).
>
> **Out of explicit scope:** any partner-specific connector implementation. Per-partner integrations remain a deliberate ~1-week sprint per partner. This plan covers the *platform-level* work that benefits every future partner equally.

---

## §0 Operating Principles

These are non-negotiable. Every PR is reviewed against them.

1. **Ontology-first.** Every entity is defined once in `@realyn/ontology`. No ad-hoc Firestore document shapes anywhere. AI specialists, dashboard, Cloud Functions all consume the same types.
2. **Connectors are the only way external data enters.** Evidence via `EvidenceSourceClient`. PSP via `PspAdapter`. Policies via `PolicyIngester`. Anything that bypasses these is a bug.
3. **Mutations are Actions.** No raw `disputeRef.update()` calls outside the action layer. An Action has: name, version, input schema, authz check, side effects, audit emission.
4. **Branchable pipelines.** Prompt version, model version, ontology version, RAG schema version stamped on every cached intermediate. A/B and rollback are trivial.
5. **Audit append-only.** Every state-changing operation writes to `auditEvents` with `{actor, entity, action, before, after, ts, requestId}`. Firestore rules enforce no deletes.
6. **Sandbox-first.** No partner reaches `live` mode until N synthetic disputes have flowed through sandbox end-to-end.
7. **Tenant isolation by construction.** A `TenantContext` is threaded through every code path. Forgetting to pass it is a type error, not a runtime bug.
8. **Fail-loud invariants.** Pipeline outputs validated against ontology schema with `zod.parse`, not `zod.safeParse`. Silent fallbacks are flagged with `isFallback: true` + emitted to telemetry.
9. **Apollo-style deployment.** dev → staging → prod is mechanical, gated, reversible. Every deploy has an ID, a manifest, a rollback plan.
10. **Contracts > tribal knowledge.** Every Connector, Action, and API endpoint has an ADR or versioned doc. New engineers onboard from docs, not Slack.

---

## §1 Phase 0 — Foundation (Days 1-3, runs in parallel)

These three are blocking-prerequisites that unlock the rest. Do them first.

### P0.1 — Provision real staging Firebase project (~half day)

**Goal:** A real `realyn-app-staging` GCP project, distinct from prod.

**Steps:**
- Create `realyn-app-staging` in GCP console
- Bind the existing GitHub Actions service account
- Configure GitHub secrets: `STAGING_VITE_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_REALYN_APP_STAGING`
- Push to `staging` branch, verify `.github/workflows/deploy-staging.yml` deploys cleanly
- Set runtime env on staging functions: `DASHBOARD_URL`, `PINECONE_INDEX_NAME=realyn-rag-staging`
- Provision a separate Pinecone index `realyn-rag-staging` (smaller, can use Starter)

**Acceptance:** Staging dashboard loads at staging URL, you can sign up, see the onboarding wizard, generate a fake AI plan in staging without touching prod.

### P0.2 — Deploy RAG to production (C7) (~half day)

**Goal:** RAG retrieval is live in prod functions.

**Steps:**
- `firebase functions:secrets:set PINECONE_API_KEY`
- Bind secret on every function that calls `retrieveRagContext`
- Deploy: `firebase deploy --only functions`
- Smoke test: trigger one dispute through `planEvidence` with `RAG_RETRIEVAL_ENABLED=true`, verify reference material appears in the cached prompt

**Acceptance:** A dispute generated in prod shows `[Visa Rule X.Y.Z]`-style citations in the argument draft.

### P0.3 — `@realyn/ontology` package skeleton (~1 day)

**Goal:** A new workspace package that becomes the single source of truth for canonical types.

**Steps:**
- `packages/ontology/` with `package.json`, `tsconfig.json`, `src/index.ts`
- Move (don't copy — move with re-exports) the canonical types from `packages/shared/src/types/`:
  - `Org`, `User`, `Dispute`, `EvidenceItem`, `EvidencePlan`, `Argument`, `Outcome`, `AuditEvent`, `Subscription`
- Each type has: zod schema, TS type, ontology version stamp
- Update `packages/shared/`, `packages/ai-core/`, `functions/`, `packages/dashboard/` to import from `@realyn/ontology`
- One round of `npx tsc --noEmit` per package to confirm no breakage
- ADR-0001: "Ontology-first architecture" in `docs/adr/0001-ontology.md`

**Palantir parallel:** This is the Foundry ontology — the contract that the entire system reads from. Once this exists, every other piece of work has a clear schema to conform to.

---

## §2 Phase 1 — Tier 1: Partner #1 Blockers (Weeks 1-3)

### Week 1: Ontology + Connector Interface

#### W1.1 — Complete the ontology package (~2 days)

Building on P0.3. Everything Tier 1 depends on knowing the canonical types are stable.

**Deliverables:**
- `packages/ontology/src/dispute.ts` — `DisputeSchema`, `DisputeStatus` enum (`pending` → `evidence_collecting` → `ai_planning` → `argument_review` → `submitted` → `won|lost|expired`), `DisputeReasonCode`
- `packages/ontology/src/evidence.ts` — `EvidenceItemSchema`, `EvidenceCategory`, `EvidenceSource`, `EvidenceFulfillmentState`
- `packages/ontology/src/org.ts` — extended `OrgSchema` with `vertical`, `evidenceSources`, `promptOverrides`, `mode` (`sandbox|live`), `ontologyVersion`
- `packages/ontology/src/audit.ts` — `AuditEventSchema`
- `packages/ontology/src/tenant.ts` — `TenantContext` type (`{orgId, userId, mode, vertical, locale, requestId}`)
- `packages/ontology/src/version.ts` — `ONTOLOGY_VERSION = "1.0.0"`, migration helpers
- All schemas use zod with `.strict()` (no extra properties allowed)
- ADR-0002: "Versioning the ontology — semver for data shapes"

**Tests:** `packages/ontology/__tests__/` — round-trip serialization, schema rejection of malformed inputs, version bump assertions.

#### W1.2 — `EvidenceSourceClient` generalization (~3 days)

**Deliverables:**
- `packages/ai-core/src/connectors/evidenceSourceClient.ts`:
  ```ts
  export interface EvidenceSourceClient<TConfig = unknown> {
    readonly sourceType: string;
    readonly vertical: Vertical;
    readonly version: string;
    testConnection(ctx: TenantContext): Promise<HealthResult>;
    listAvailableCategories(): EvidenceCategory[];
    fetchEvidence(
      request: EvidenceRequest,
      ctx: TenantContext,
    ): Promise<EvidenceArtifact[]>;
    describeCapabilities(): ConnectorCapabilities;
  }
  ```
- `EvidenceRequest` = `{disputeId, categories: EvidenceCategory[], reservationOrEntityId?: string, dateRange?: DateRange}`
- `EvidenceArtifact` = unified shape (file URL, mime type, source-specific metadata, fulfillment hash for dedup)
- `ConnectorCapabilities` = `{supportsLiveQuery, supportsHistorical, requiresPerEntityCredentials, ...}`
- A `MockEvidenceSourceClient` implementation in `packages/ai-core/src/connectors/mockSource.ts` for tests + sandbox mode
- A `ManualUploadAdapter` that conforms to the same interface (wraps the existing manual upload flow)

**Acceptance:**
- A new test in `__tests__/connectors/` verifies the mock client can satisfy a generic `EvidenceRequest` for two different verticals (hospitality, ticketing) without any vertical-specific code in the test harness
- ADR-0003: "Connector pattern — sources of evidence as typed adapters"

**Palantir parallel:** This is exactly Foundry's connector model. Each connector is a typed module that the platform discovers and orchestrates. Authors of new connectors don't need to understand the rest of the platform.

#### W1.3 — Refactor OPERA Cloud to conform (~2 days)

**Deliverables:**
- `functions/src/services/connectors/hospitality/operaCloud.ts` — refactored to `implements EvidenceSourceClient<OperaCloudConfig>`
- Hospitality-specific helpers (folio→PDF, reservation lookups) moved to private methods
- All references to `PMSLiveClient` deleted from the codebase (rename + delete the old interface)
- `evidenceAutoCollector` no longer references hospitality categories by name; it iterates `client.listAvailableCategories()` and matches against the planner's request
- `pmsLookupService` becomes `connectorRegistry` — same pattern, generic shape
- Per-vertical config files: `packages/ai-core/src/verticals/hospitality.ts`, `verticals/ticketing.ts` (skeleton only), `verticals/ecommerce.ts` (skeleton only)
- A `connectors/registry.ts` that registers known connectors at startup, indexed by `sourceType`

**Acceptance:**
- All existing OPERA Cloud tests pass against the refactored code
- A new integration test creates a synthetic ticketing org with the mock connector and runs through `evidenceAutoCollector` — proves the abstraction is real, not just renamed

---

### Week 2: Actions, Audit, Per-Tenant Config

#### W2.1 — `Action` framework (~2 days)

This is the Palantir-philosophy heart of the plan. State changes become typed, audited operations.

**Deliverables:**
- `packages/ontology/src/actions/types.ts`:
  ```ts
  export interface ActionDefinition<I, O> {
    name: string;             // "dispute.markSubmitted"
    version: string;          // "v1"
    inputSchema: z.ZodType<I>;
    outputSchema: z.ZodType<O>;
    authz: AuthzPredicate;    // (ctx, input) => Promise<boolean>
    handler: ActionHandler<I, O>;
  }
  ```
- `functions/src/actions/registry.ts` — central registry, type-safe lookup
- `functions/src/actions/runtime.ts` — wraps every Action with: authz check → input validation → handler → audit emission → output validation
- Concrete Actions (start with the critical mutation paths):
  - `dispute.create`, `dispute.assign`, `dispute.markEvidenceCollecting`, `dispute.markPlanned`, `dispute.markDrafted`, `dispute.markSubmitted`, `dispute.recordOutcome`
  - `evidence.upload`, `evidence.markFulfilled`, `evidence.delete`
  - `ai.runEvidencePlanning`, `ai.runArgumentGeneration` (wrap existing handlers)
  - `connector.connect`, `connector.disconnect`, `connector.testHealth`
- Refactor existing Cloud Functions to call `actions.dispute.create(ctx, input)` instead of direct Firestore writes

**Acceptance:**
- A grep for `firestore.*\.update\(` in business logic returns ~zero matches outside the action runtime
- A new test asserts every Action emits exactly one `AuditEvent` per invocation
- ADR-0004: "Action framework — typed, audited mutations"

#### W2.2 — Comprehensive audit trail (~1 day)

Building on W2.1's foundation.

**Deliverables:**
- Audit emitter in action runtime writes `{orgId, actor, entityType, entityId, actionName, actionVersion, before, after, requestId, ts, userAgent, ip}` to `organizations/{orgId}/auditEvents/{eventId}`
- Firestore rule: append-only (`allow create: if request.auth != null && ...; allow update, delete: if false;`)
- Index on `(entityType, entityId, ts desc)` for "show me everything that happened to this dispute"
- `auditQuery(filters, ctx)` helper in `@realyn/ai-core` — typed, paginated
- Dashboard: extend `useActivityLog` to query the new `auditEvents` collection

**Acceptance:**
- Every Action invocation generates exactly one `AuditEvent` (verified by integration test)
- An admin can pull the full state-transition history for any dispute via dashboard

#### W2.3 — Per-tenant config (~2 days)

**Deliverables:**
- Extended `OrgSchema` (in `@realyn/ontology`) with:
  - `vertical: Vertical`
  - `mode: "sandbox" | "live"`
  - `locale: BCP47Tag`, `currency: ISO4217`, `timezone: IANATimezone`
  - `evidenceSources: EvidenceSourceConnection[]` where `EvidenceSourceConnection = {sourceType, credentialsRef, enabled, lastHealthCheckAt, lastHealthStatus}`
  - `promptOverrides?: Partial<PromptOverrideMap>` (defaults to vertical template)
  - `ontologyVersion: string` (for migrations)
- `credentialsRef` is a Cloud Functions Secret Manager reference, NEVER inline credentials
- `secretsService.ts` — typed wrapper around Secret Manager: `getCredential(ref, ctx)`, `setCredential(orgId, sourceType, value)`, `deleteCredential(ref)`
- Migration script: `functions/src/scripts/migrateOrgsToV1.ts` — back-fills existing orgs with defaults from their data (vertical inferred from their seed data, etc.)
- Connector resolution: `getConnectorForOrg(orgId, sourceType)` returns the configured connector with credentials injected from Secret Manager

**Acceptance:**
- An admin can configure an org's vertical, mode, currency in the dashboard
- A connector is instantiated with credentials pulled from Secret Manager, never from Firestore plaintext
- Migration script is idempotent (running twice produces no diff)

---

### Week 3: Sandbox Mode + Tenant Isolation + Polish

#### W3.1 — Sandbox mode (~3 days)

The single most important DX feature for partner #1.

**Deliverables:**
- `Org.mode === "sandbox"` routing throughout the system:
  - PSP submissions go to `MockPspAdapter` (logs to a sandbox-only collection, returns `accepted` after configurable delay)
  - Webhooks ingest into a sandbox-only namespace
  - AI runs cost real money but are tagged `mode: "sandbox"` in cost telemetry
  - All audit events tagged `mode: "sandbox"`
- `functions/src/services/sandbox/syntheticDisputeGenerator.ts`:
  - Generates realistic synthetic disputes for a given vertical (uses your existing seed data as a template)
  - Cycles through reason codes for coverage
  - Admin endpoint: `POST /sandbox/generateDispute { orgId, vertical, reasonCode? }`
- Admin endpoint: `POST /sandbox/simulateOutcome { disputeId, outcome: "won"|"lost" }` — fires the same `dispute.recordOutcome` Action that a real PSP webhook would
- Promotion flow: `POST /org/promoteToLive` requires (a) `≥ N` sandbox disputes successfully run end-to-end, (b) connector health checks all green, (c) explicit human approval (admin role required, audit-logged)
- Dashboard: a "Sandbox" indicator in the nav bar when in sandbox mode; a "Promote to live" wizard

**Acceptance:**
- A new test org can be created in sandbox mode, run 10 synthetic disputes through end-to-end, simulate outcomes, and promote to live — all without touching real Stripe or Adyen
- ADR-0005: "Sandbox mode — partner integration test environment"

**Industry parallel:** Stripe test mode, Plaid sandbox. Both are universally understood by integration engineers.

#### W3.2 — Tenant isolation hardening (~1 day)

**Deliverables:**
- Pinecone namespace audit:
  - `rulebooks` namespace: global (one copy across all tenants — same rules apply to everyone)
  - `cases` namespace: global if anonymized, OR `cases__${orgId}` per tenant — pick one and document
  - `policies` namespace: ALWAYS `policies__${orgId}` — never share policies across tenants
- All `pineconeClient.upsert()` and `.query()` call sites pass namespace through `TenantContext`, not as a free-form string
- Firestore rule audit: write a `firestore-rules.test.ts` using `@firebase/rules-unit-testing` that explicitly attempts cross-tenant reads/writes for every collection and verifies each is denied
- Cloud Function authz audit: every authenticated handler validates `requested.orgId === ctx.user.orgId` (or admin); add a lint rule or PR template checkbox for new handlers
- ADR-0006: "Tenant isolation — namespacing strategy across Firestore, Pinecone, Cloud Functions"

**Acceptance:**
- Cross-tenant access tests cover every collection and pass
- A code-review checklist item: "Does this handler validate the requested orgId against the auth context?"

#### W3.3 — Stamp & validate AI pipeline outputs (~1 day)

Connect the dots: ontology + actions + audit means cached intermediates need stamps.

**Deliverables:**
- Every cached intermediate (claim analysis, evidence plan, argument draft) stamped with:
  ```ts
  {
    promptVersion: string;
    modelVersion: string;
    ontologyVersion: string;
    ragSchemaVersion: number;
    isFallback: boolean;          // true if specialist degraded to deterministic fallback
    generatedAt: Timestamp;
    requestId: string;
  }
  ```
- All specialist outputs validated against zod schemas before write (`.parse`, not `.safeParse`)
- `isFallback: true` outputs emit a structured warning to Cloud Logging — visible in your future cost/quality dashboard

**Acceptance:**
- A test asserts every cached output has all five stamps
- The C3 baseline can be re-run and now reports per-dispute fallback rates

---

## §3 Phase 2 — Tier 2: Platform Maturity (Weeks 4-6)

### Week 4: Partner SDK + Per-Vertical Cleanup

#### W4.1 — Partner SDK package (~3 days)

**Deliverables:**
- `@realyn/partner-sdk` workspace package, publishable to npm (or private registry)
- Re-exports: `EvidenceSourceClient` interface, all relevant ontology types, `MockEvidenceSourceClient` for tests
- Test harness: `runConnectorConformance(client)` — a Jest-runnable suite that any new connector must pass (calls every interface method, asserts shapes, asserts error handling)
- TypeScript stub generator CLI: `npx @realyn/partner-cli scaffold --vertical=ticketing --name=acme`
  - Generates a directory with: `acmeClient.ts` (stub implementation), `acmeClient.test.ts` (uses conformance suite), `README.md` (filled-in checklist)
- Worked example: `examples/acme-ticketing/` — a realistic, runnable ticketing connector against a fake Acme API
- Versioning: SDK version pinned to ontology version; major bumps signal breaking changes

#### W4.2 — Partner integration playbook (~2 days)

**Deliverables:**
- `docs/partners/integration-guide.md` — 8-12 pages, sections:
  1. Overview + architecture diagram
  2. Ontology reference (or link to it)
  3. The Connector contract (with the conformance test as the canonical spec)
  4. Sandbox walkthrough — step by step from "I have an SDK" to "I have 10 green disputes in sandbox"
  5. Going live — the promotion checklist
  6. Operational runbook — where to look when things break, how to interpret audit events
- `docs/partners/troubleshooting.md` — common failure modes (auth, throttling, schema mismatches)
- `docs/adr/0007-partner-onboarding-model.md` — the model itself documented

**Industry parallel:** Plaid's docs structure. Stripe Connect's quickstart.

### Week 5: Public REST API

#### W5.1 — Public API surface (~5 days)

**Deliverables:**
- REST API under `https://api.realyn.app/v1/` (or behind Cloud Function with the same path):
  - `POST /disputes` — create
  - `GET /disputes/:id` — read
  - `GET /disputes` — list with cursor pagination + filters
  - `POST /disputes/:id/evidence` — push evidence (file upload via signed URL)
  - `POST /disputes/:id/submit` — trigger submission (wraps existing handler)
  - `GET /disputes/:id/audit` — paginated audit history
  - `POST /sandbox/generateDispute` — sandbox-only
  - `GET /health` — liveness probe
- Auth: API keys, separate from Firebase user auth. `apiKeys` collection on `Org` with hashed key, scoped permissions, last-used timestamp, rate limit tier
- All endpoints route through the Action runtime (not a parallel code path) — same authz, audit, validation as the dashboard
- OpenAPI 3.1 spec generated from code (use `tsoa` or `zod-to-openapi`)
- Hosted spec at `https://api.realyn.app/v1/openapi.json`
- Versioning: `v1` is locked; breaking changes go to `v2`

**Acceptance:**
- A partner with a valid API key can create a dispute, push evidence, trigger submission, read status — all via curl
- Cross-tenant test: a key for org A cannot read disputes from org B
- ADR-0008: "Public API — versioning, auth, contract"

### Week 6: Dashboards + Versioning + Definition of Done

#### W6.1 — Win-rate / cost / latency dashboards (~3 days)

**Deliverables:**
- BigQuery export of `auditEvents` + LLM telemetry from Cloud Logging (existing emitter, new sink)
- Materialized views: `dispute_outcomes`, `pipeline_latency`, `ai_cost_per_dispute`, `connector_health`, `fallback_rate`
- Dashboard pages (or Looker Studio if you want to skip the build):
  - **Internal:** cross-org win rate by reason code/vertical, AI cost per dispute (rolling 30d), connector error rate, fallback rate per specialist
  - **Partner-facing:** filtered to their org — dispute volume, win rate, time-to-resolution, cost-per-dispute (if you go performance-pricing later)
- Alerting:
  - Anthropic credit balance < $X (would have caught the C3 incident)
  - Pinecone QPS approaching tier limit
  - Fallback rate > Y% in any 1-hour window
  - Connector health red for any active org

#### W6.2 — Prompt + model + ontology versioning hardening (~1 day)

- Pinnable per-tenant: an org can request `promptVersion: "frozen-2026-04-15"` for compliance reasons
- A/B framework: route N% of an org's disputes through prompt vN+1, compare outcomes
- ADR-0009: "Versioning prompts, models, and ontology — branching strategy"

#### W6.3 — Definition-of-done validation (~1 day)

Run the full DoD checklist (§4 below) against the platform. Fix anything red.

---

## §4 Definition of Done — "Partner-Ready"

A partner-readiness review must pass ALL of these. Each is a yes/no question.

**Ontology**
- [ ] `@realyn/ontology` is the only source of canonical types; no ad-hoc shapes in business logic
- [ ] `ONTOLOGY_VERSION` is stamped on every persisted document
- [ ] zod schemas reject malformed inputs at every boundary

**Connectors**
- [ ] `EvidenceSourceClient` interface exists and is documented
- [ ] OPERA Cloud connector implements it
- [ ] Mock connector exists and is used in sandbox mode + tests
- [ ] Conformance test suite exists and any new connector can be validated by running it

**Actions + Audit**
- [ ] Every state-changing operation goes through the Action runtime
- [ ] Every Action emits exactly one append-only `AuditEvent`
- [ ] Audit history is queryable per dispute, per org, per actor
- [ ] Firestore rules enforce append-only

**Per-Tenant**
- [ ] `Org` carries `vertical`, `mode`, `evidenceSources`, `promptOverrides`, `ontologyVersion`
- [ ] Connector credentials live in Secret Manager, never in Firestore plaintext
- [ ] Migration script back-fills existing orgs

**Sandbox**
- [ ] `Org.mode = "sandbox"` routes PSP calls to mock; AI runs are real but tagged
- [ ] Synthetic dispute generator produces realistic test data per vertical
- [ ] Promotion to `live` requires N sandbox disputes + admin approval + audit event

**Tenant Isolation**
- [ ] Pinecone namespacing strategy documented per namespace
- [ ] Cross-tenant read/write tests exist for every Firestore collection and pass
- [ ] Every Cloud Function handler validates `requested.orgId` matches `ctx.user.orgId`

**Pipeline Hygiene**
- [ ] Every cached intermediate stamped with `{promptVersion, modelVersion, ontologyVersion, ragSchemaVersion, isFallback}`
- [ ] Specialist outputs validated against schema with `.parse` (fail-loud)
- [ ] `isFallback: true` emits a structured telemetry event

**Public API**
- [ ] REST API under `/v1/` with documented OpenAPI spec
- [ ] API key auth, scoped per org, rate-limited
- [ ] Endpoints route through the same Action runtime as the dashboard

**Partner DX**
- [ ] `@realyn/partner-sdk` is publishable and documented
- [ ] Stub generator CLI works
- [ ] `docs/partners/integration-guide.md` exists, reviewed by someone who hasn't seen the codebase
- [ ] Worked example connector compiles and runs

**Operational**
- [ ] Staging environment is provisioned and deploys cleanly from `staging` branch
- [ ] RAG is live in prod
- [ ] Dashboards exist for win rate, cost, latency, fallback rate, connector health
- [ ] Alerts on Anthropic credit, Pinecone QPS, fallback rate

**Governance**
- [ ] ADRs 0001-0009 written and committed
- [ ] PR template enforces ontology / Action / audit checklist

---

## §5 Cross-Cutting Concerns

### Branching strategy
- `main` = prod
- `staging` = staging (auto-deployed)
- `cursor/*` = feature branches stacked off whatever's most recent (current pattern)
- Each Phase 1 / Phase 2 work item is its own PR off the most recent stacked branch
- ADRs land alongside the code that implements them — never separately

### Testing discipline
- **Ontology:** schema round-trip tests, version assertions
- **Connectors:** conformance suite, plus per-connector integration tests against real APIs (in staging only)
- **Actions:** every action has a test that asserts (a) audit emission, (b) authz enforcement, (c) input validation, (d) idempotency where applicable
- **Tenant isolation:** explicit cross-tenant access denial tests
- **Sandbox:** end-to-end test that runs a synthetic dispute through the full pipeline
- **API:** contract tests against the OpenAPI spec
- CI gates all of the above on every PR

### Observability evolution
- All new code uses structured logging via existing `logger.ts`
- Telemetry events are typed (extend `emitLLMTelemetry` pattern)
- BigQuery sink is set up in W6.1 — backfill from Cloud Logging if needed for historicals

### Security posture
- No new endpoints without authz tests
- No new fields on `Org` carrying credentials inline
- Secret Manager for everything sensitive
- SOC-2 audit trail (you're getting this for free from the Action framework)

---

## §6 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| EvidenceSourceClient generalization reveals deeper hospitality coupling than expected | Medium | 1-week slip | Time-box at 1 week. If not done, ship interface + deprecate `PMSLiveClient` as alias for now; finish refactor in week 4 |
| Action framework refactor breaks existing handlers | Medium | 2-3 day slip | Land Action runtime in W2.1 with first handler converted. Convert remaining handlers incrementally over W2-W3, not big-bang |
| Audit volume balloons Firestore costs | Low | Ongoing cost | Audit events go to subcollection (already cheap); long-term move to BigQuery via stream when volume justifies |
| Migration script corrupts existing org data | Medium | Critical (data loss) | Test against staging first, dry-run mode required, snapshot Firestore before running in prod |
| Sandbox mode leaks into prod (real Stripe call from sandbox org) | Low | Critical (charges to wrong account) | Type-level guard: `LiveOnlyAction` vs `AnyModeAction`. PSP adapters refuse to run if `ctx.mode !== "live"`. Test that asserts this |
| Public API rate limits set wrong → DoS | Low | Service degradation | Conservative defaults (10 req/min/key), Cloud Armor / API Gateway in front, monitor |
| Partner SDK ABI breaks in minor version | Medium | Partner integration breaks | Semver discipline + ontology version pin in SDK + CI test against last 2 ontology versions |
| Inngest decision deferred too long → hit 5-min timeout in prod | Medium | Reliability hit | Track p95 pipeline latency in dashboards (W6.1). If approaching 4 min for any tenant, escalate Inngest decision to "do now" |

---

## §7 What's Explicitly Out of Scope (For This Plan)

To keep this honest:

- Per-partner connector implementations (the 1-week sprint per partner, by design)
- Inngest / durable workflow migration (decided in §6 as monitor-and-escalate)
- Multi-vendor LLM resilience (deferred — separate ADR if revived; see [`post-hardening-plan.md`](post-hardening-plan.md) "Out of scope")
- Pinecone Standard tier upgrade (deferred — see [`post-hardening-plan.md`](post-hardening-plan.md) "Out of scope")
- Customer support widget, help center, in-app onboarding tour (Tier 5)
- Risk scoring / "is this dispute worth fighting" model (post-launch)
- Past-case RAG ingestion (Phase 2 RAG — needs partner data first)
- Per-merchant policy ingestion (Phase 3 RAG — needs partner)
- Vision optimization / argument-generator decoupling (separate refactor, not partner-blocking)

---

## §8 Sequenced Gantt — single-thread effort

```
Week 0  ┃ P0.1 staging │ P0.2 RAG deploy │ P0.3 ontology skeleton
        ┃─────────────────────────────────────────────────────────
Week 1  ┃ W1.1 ontology complete  │ W1.2 EvidenceSourceClient interface
        ┃                         │ W1.3 OPERA refactor
Week 2  ┃ W2.1 Action framework   │ W2.2 audit trail │ W2.3 per-tenant config
Week 3  ┃ W3.1 sandbox mode       │ W3.2 tenant isolation │ W3.3 pipeline stamps
        ┃─── PARTNER #1 ONBOARDABLE HERE ───
Week 4  ┃ W4.1 Partner SDK        │ W4.2 integration playbook
Week 5  ┃ W5.1 Public REST API
Week 6  ┃ W6.1 dashboards         │ W6.2 versioning hardening │ W6.3 DoD audit
        ┃─── PARTNER #2+ ONBOARDABLE WITHOUT ARCHITECTURAL REWORK ───
```

---

## §9 Cross-References

- [`docs/rag-phase-1-handoff.md`](rag-phase-1-handoff.md) — current RAG state; P0.2 here completes C7 from that doc
- [`docs/post-hardening-plan.md`](post-hardening-plan.md) — workstreams A (ops) and C (RAG); §7 above lists items deferred from there
- [`PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md) — Tiers 1-4 are complete; this plan is the bridge from "production-ready app" to "partner-ready platform"
- ADRs (to be written): `docs/adr/0001-ontology.md` through `docs/adr/0009-versioning-strategy.md`

---

## §10 Status

- **Author:** Cursor agent (2026-05-08)
- **Status:** Draft, awaiting approval
- **Owner:** TBD (the engineer who will lead the 6-week effort)
- **Branch:** `cursor/rag-phase-1-provisioning-4164` (this doc lives in the same stacked-PR chain as the RAG work)

### Phase 0 progress

- **P0.1 — staging provisioning:** ⏸️ Not started. Blocked on `FIREBASE_TOKEN` / ADC in Cursor secrets + GitHub Actions service-account configuration.
- **P0.2 — deploy RAG to prod (= RAG C7):** 🟡 **Code-side done** on branch `cursor/rag-phase-1-c7-bind-pinecone-secret` (PR #14). `secrets: [..., "PINECONE_API_KEY"]` bound on `onEvidencePlanQueued` and `draftArgument` in `functions/src/handlers/aiDisputeHandlers.ts`; functions Jest 369/369 + ai-core 63/63 green. Remaining: `firebase functions:secrets:set` + `firebase deploy` from a workstation or Cloud Agent with `FIREBASE_TOKEN` / ADC. See `docs/rag-phase-1-handoff.md` "Deploy steps for C7" for exact commands.
- **P0.3 — `@realyn/ontology` skeleton:** ⏸️ Not started. Fully unblocked from a local agent today; recommended as the next standalone PR off the same branch tip.

### Recommended next actions

1. Review this plan; flag any items to cut, defer, or expand
2. Greenlight Phase 0 (P0.1 staging + P0.2 RAG deploy + P0.3 ontology skeleton) — these are unblocking, low-risk, run in parallel
3. Add `FIREBASE_TOKEN` (or `GOOGLE_APPLICATION_CREDENTIALS_JSON`) to Cursor secrets to unblock the P0.2 deploy step and the P0.1 staging provisioning
4. Draft ADRs 0001 (ontology-first) and 0002 (ontology versioning) before Week 1 code lands
5. Track progress in this doc; update §10 status as items move from `[ ]` to `[x]` in the Definition of Done
