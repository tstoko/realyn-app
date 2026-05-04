# Post-hardening Plan — Ops Follow-ups, Deferred Audit Items, and RAG Phase 1

> **Baseline:** `main` @ `bb7105b` (pre-RAG hardening landed: Sentry removed,
> `azure/` deleted, `protobufjs` CVE patched, billing idempotent and using
> `getDashboardBaseUrl`, data retention paginated, 500 leaks closed, signed-URL
> logging redacted, AI handlers given explicit memory/timeout, `.env.example`
> expanded).
>
> **This doc is a checklist, not a vision document.** Every item has: why, exact
> change, verification, rollback, estimate. Tick boxes as you go. When an item
> needs a product decision, the decision is called out explicitly so it doesn’t
> stall implementation.

**Scope:** everything between the pre-RAG hardening commit and "RAG retrieval is
running in production prompts and we have a measurable lift over baseline."
After that, see [`PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md) §25
(Phase 2/3) and Tier 5.

---

## Table of contents

- [Workstream A — Operational follow-ups (do this week)](#workstream-a--operational-follow-ups-do-this-week)
  - [A1. Deploy the new Firestore composite index](#a1-deploy-the-new-firestore-composite-index)
  - [A2. Set `DASHBOARD_URL` on billing Cloud Run services](#a2-set-dashboard_url-on-billing-cloud-run-services)
  - [A3. Remove dead Sentry GitHub secrets](#a3-remove-dead-sentry-github-secrets)
  - [A4. Smoke-test the changed surfaces in staging](#a4-smoke-test-the-changed-surfaces-in-staging)
  - [A5. Clean up Finder-duplicated `* 2` files in `docs/`](#a5-clean-up-finder-duplicated--2-files-in-docs)
- [Workstream B — Deferred audit items (decision-gated)](#workstream-b--deferred-audit-items-decision-gated)
  - [B1. Bump `@anthropic-ai/sdk` 0.39 → latest](#b1-bump-anthropic-aisdk-039--latest)
  - [B2. Tighten Firestore rules on knowledge-base collections](#b2-tighten-firestore-rules-on-knowledge-base-collections)
  - [B3. Decide the future of `packages/core/`](#b3-decide-the-future-of-packagescore)
  - [B4. Handler test coverage backfill](#b4-handler-test-coverage-backfill)
- [Workstream C — RAG Phase 1 (the actual next product work)](#workstream-c--rag-phase-1-the-actual-next-product-work)
  - [C1. Provision the Pinecone index](#c1-provision-the-pinecone-index)
  - [C2. Source rulebook PDFs and stage them locally](#c2-source-rulebook-pdfs-and-stage-them-locally)
  - [C3. Capture the pre-RAG baseline (DO NOT SKIP)](#c3-capture-the-pre-rag-baseline-do-not-skip)
  - [C4. Dry-run ingestion and chunk inspection](#c4-dry-run-ingestion-and-chunk-inspection)
  - [C5. Real ingestion](#c5-real-ingestion)
  - [C6. Wire retrieval into evidence planning and argument drafting](#c6-wire-retrieval-into-evidence-planning-and-argument-drafting)
  - [C7. Bind `PINECONE_API_KEY` on Cloud Functions and deploy](#c7-bind-pinecone_api_key-on-cloud-functions-and-deploy)
  - [C8. Re-run eval and compare to baseline](#c8-re-run-eval-and-compare-to-baseline)
  - [C9. Production cutover and rollback path](#c9-production-cutover-and-rollback-path)
- [Sequencing and ownership](#sequencing-and-ownership)
- [Verification matrix](#verification-matrix)
- [Risks and mitigations](#risks-and-mitigations)
- [Out of scope (explicit, for later)](#out-of-scope-explicit-for-later)

---

## Workstream A — Operational follow-ups (do this week)

These are the loose ends the hardening commit created. They are small, but if
left undone the next scheduled run / next billing checkout / next CI build will
visibly misbehave.

### A1. Deploy the new Firestore composite index

**Why.** [`functions/src/handlers/dataRetentionScheduler.ts`](../functions/src/handlers/dataRetentionScheduler.ts)
now paginates with `where("status", "==", X).where("updatedAt", "<", cutoff).orderBy("updatedAt", "asc").startAfter(...)`.
Without the matching composite index in
[`firestore.indexes.json`](../firestore.indexes.json) deployed, the next
scheduled run (daily 02:00 UTC) errors with
`FAILED_PRECONDITION: The query requires an index`.

**Change.** No code change — index already in `firestore.indexes.json`. Just
deploy it.

```bash
firebase deploy --only firestore:indexes --project realyn-app
firebase deploy --only firestore:indexes --project realyn-app-staging
```

**Verification.**
- `firebase firestore:indexes --project realyn-app` lists
  `disputes (status ASC, updatedAt ASC)` as `READY`.
- Manually trigger the scheduler in staging:
  `gcloud scheduler jobs run firebase-schedule-dataRetentionCleanup-* --location=us-central1`
  and confirm logs show no `FAILED_PRECONDITION`.

**Rollback.** Composite indexes are additive; rolling back is just removing the
index, which won’t break the previous (single-field) query path either.

**Estimate.** 10 min + index build time (typically <5 min for a small
collection, longer once `disputes` grows).

**Status:** [ ] staging  [ ] production
*(Requires `firebase` CLI + a logged-in account with deploy access on
both projects. Cannot be executed by an autonomous agent without
credentials. Run from a developer workstation.)*

---

### A2. Set `DASHBOARD_URL` on billing Cloud Run services

**Why.** [`functions/src/handlers/billingHandlers.ts`](../functions/src/handlers/billingHandlers.ts)
no longer uses `req.headers.origin` for Stripe Checkout `success_url` /
`cancel_url` and Customer Portal `return_url`. It uses `getDashboardBaseUrl()`,
which reads `process.env.DASHBOARD_URL` and falls back to
`https://dashboard.realyn.app`. If staging’s billing functions don’t have
`DASHBOARD_URL` set, staging users hit production after Checkout.

**Change.** Set the env var on each Cloud Run service that hosts a billing
handler. The list of services to set:

- `createcheckoutsession`
- `billingwebhook`
- `createbillingportalsession`

Per environment:

| Env | `DASHBOARD_URL` value |
|-----|-----------------------|
| Production | `https://dashboard.realyn.app` |
| Staging | `https://realyn-app-staging-dashboard.web.app` (or whatever the staging hosting URL actually is) |

```bash
# Production
gcloud run services update createcheckoutsession \
  --region=us-central1 --project=realyn-app \
  --update-env-vars=DASHBOARD_URL=https://dashboard.realyn.app
gcloud run services update billingwebhook \
  --region=us-central1 --project=realyn-app \
  --update-env-vars=DASHBOARD_URL=https://dashboard.realyn.app
gcloud run services update createbillingportalsession \
  --region=us-central1 --project=realyn-app \
  --update-env-vars=DASHBOARD_URL=https://dashboard.realyn.app

# Staging — replace URL with the actual hosting URL
gcloud run services update createcheckoutsession \
  --region=us-central1 --project=realyn-app-staging \
  --update-env-vars=DASHBOARD_URL=https://realyn-app-staging-dashboard.web.app
# ...same for the other two services
```

> **Note:** the same flag should also be set on the email-sending services
> (`disputeNotificationTrigger`, `deadlineReminderScheduler`, `createInvite`)
> so invite/email links go to the right environment. If they were already set
> as part of Tier 4 §18, just **verify** here; otherwise add them.

**Verification.**
- `gcloud run services describe createcheckoutsession --region=us-central1 --project=realyn-app-staging --format='value(spec.template.spec.containers[0].env)'`
  shows `DASHBOARD_URL=...`.
- In staging, click "Upgrade" in the dashboard, complete a Stripe test
  Checkout, confirm redirect lands back on the staging hosting URL (not prod).

**Rollback.** Unset with
`gcloud run services update <svc> --remove-env-vars=DASHBOARD_URL`. The default
falls back to production URL — undesirable in staging but not destructive.

**Estimate.** 20 min including verification.

**Status:** [ ] staging  [ ] production
*(Requires `gcloud` + project owner permissions on both Cloud projects.
Run from a developer workstation. Test coverage for the redirect URL
contract was added in §B4 — see
`functions/src/handlers/__tests__/billingHandlers.test.ts`
"Checkout & Portal redirect URLs use DASHBOARD_URL", which pins both the
DASHBOARD_URL-set path and the production fallback so the regression A2
is meant to prevent will fail in CI before it reaches staging.)*

---

### A3. Remove dead Sentry GitHub secrets

**Why.** Sentry SDKs and DSN env vars are gone from code and workflows, but
the GitHub Actions secrets `DASHBOARD_VITE_SENTRY_DSN` and
`STAGING_VITE_SENTRY_DSN` (or whatever they’re named in the repo) are still
sitting in the repo settings. They’re unused and confuse audits.

**Change.** Delete the secrets in **Settings → Secrets and variables →
Actions** for the repo.

```bash
gh secret list
gh secret delete DASHBOARD_VITE_SENTRY_DSN
gh secret delete STAGING_VITE_SENTRY_DSN
```

**Verification.** `gh secret list` no longer shows them. Re-run the latest
deploy workflow once and confirm no warnings about missing secrets.

**Rollback.** None needed — secrets are dead.

**Estimate.** 5 min.

**Status:** [x] verified — no Sentry secrets exist at any scope
*(Verified 2026-05-02 from a workstation `gh` session (scope `repo`).
`gh secret list` at repo Actions, dependabot, and codespaces scopes
returns zero `*SENTRY*` entries. The named targets
(`DASHBOARD_VITE_SENTRY_DSN`, `STAGING_VITE_SENTRY_DSN`) are not present
— either deleted in an earlier sweep or never created. Workflow-side
scan also clean: `Grep "SENTRY|sentry" .github/workflows/` returns no
matches. The dedicated `GH_ADMIN_TOKEN` PAT mentioned in the RAG
handoff doc was not needed in the end and can be revoked.)*

---

### A4. Smoke-test the changed surfaces in staging

**Why.** The hardening commit touched billing, webhooks, AI handlers, the data
retention scheduler, and the dashboard. None of those have automated end-to-end
tests, so a manual smoke pass in staging is cheap insurance.

**Change.** Run this checklist against `realyn-app-staging`:

- [ ] **Stripe billing webhook idempotency.** Trigger the same
  `checkout.session.completed` event twice via Stripe CLI
  (`stripe events resend evt_...`). Confirm via Firestore that
  `_processedWebhookEvents/{eventId}` has one doc and that the org
  subscription state didn’t double-update.
- [ ] **Adyen webhook 500 path.** Force a failure (e.g. drop DB connection or
  send malformed payload that gets past HMAC). Confirm response body is
  `{ "error": "Internal server error", "errorId": "<8-hex>" }` and that
  Cloud Logging has the matching `errorId` line.
- [ ] **AI handler 500 path.** Same as above for `planEvidence`. Same shape.
- [ ] **Evidence PDF download path.** Trigger an evidence plan against a
  dispute that has a PDF attachment; confirm logs show
  `disputeId=... fileId=... fileName=...` and **no signed URLs in logs**
  (regex: rg `https://storage\.googleapis\.com/.*signed` against the log).
- [ ] **Billing redirect after Checkout.** See A2 verification.
- [ ] **Daily reminder dedupe.** Manually trigger
  `deadlineReminderScheduler` twice within 48h on the same set of disputes;
  the second run should send zero emails (look for
  `lastDeadlineReminderSentAt` on dispute docs).

**Estimate.** 1–2 hours.

**Status:** [ ]
*(Requires staging Firebase project credentials and Stripe CLI. Cannot be
executed by an autonomous agent without those credentials. Some of the
checklist items now have automated coverage that will fail in CI before
the manual smoke is needed: billing webhook idempotency + signature path
+ generic-500 error shape are pinned in
`functions/src/handlers/__tests__/billingHandlers.test.ts`. AI handler
generic-500 path is pinned in
`functions/src/handlers/__tests__/aiDisputeHandlers.test.ts`.)*

---

### A5. Clean up Finder-duplicated `* 2` files in `docs/`

**Why.** `docs/` currently contains:

```
docs/embedding-provider-setup 2.md
docs/new-company-demo-prompt 2.md
docs/rag-implementation-guide 2.md
docs/nimax-stakeholder-screenshots 2/
```

These are macOS Finder duplicates from a botched copy. They’re tracked by
`git status` as untracked files (not in the repo), but they pollute search
results and `ls` output, and have caused `npm install ENOTEMPTY` errors twice
in this repo already when the same pattern leaked into `node_modules`.

**Change.**
```bash
find docs -depth -type f -name '* 2.md' -print -delete
find docs -depth -type d -name '* 2'    -print -exec rm -rf {} +
# Quick sanity check — the originals should still be present
ls docs/embedding-provider-setup.md docs/rag-implementation-guide.md
```

**Verification.** `ls docs | rg ' 2'` returns nothing.

**Rollback.** Originals are unaffected. If a duplicate had unique edits (it
shouldn’t), recover from `git stash` / iCloud Trash.

**Estimate.** 2 min.

**Status:** [x] verified clean
*(Both `find docs -depth -type f -name '* 2.md'` and
`find docs -depth -type d -name '* 2'` return no results on `main` as of
commit `bb7105b` and on the post-hardening branches. Nothing to delete.)*

---

## Workstream B — Deferred audit items (decision-gated)

These came out of the pre-RAG audit. Each is a real concern but each requires a
product/engineering decision before implementation is worth doing. Don’t do
these as a batch — each one wants its own PR for clean review.

### B1. Bump `@anthropic-ai/sdk` 0.39 → latest

**Why.** The SDK is pinned at `^0.39.0` in both
[`functions/package.json`](../functions/package.json) and
[`packages/ai-core/package.json`](../packages/ai-core/package.json). Anthropic
has shipped major shape changes since (response format, tool use, streaming
APIs). Doing the bump as part of RAG wiring conflates two diffs — a model
behaviour change and an SDK change — making regression analysis impossible.

**Recommended timing.** *Just before* C6 (RAG wiring), as its own commit, with
its own eval check (re-run a small slice of the C3 baseline against the
upgraded SDK to confirm no regression in deterministic output).

**Change.**
1. `cd packages/ai-core && npm install @anthropic-ai/sdk@latest`
2. `cd functions && npm install @anthropic-ai/sdk@latest`
3. Update both call sites:
   - [`packages/ai-core/src/services/llmService.ts`](../packages/ai-core/src/services/llmService.ts)
   - any other call sites — `rg "@anthropic-ai/sdk" -t ts`
4. Adjust `messages.create` invocation, response parsing (`.content[0].text`
   vs new shape), and tool-use blocks per the
   [Anthropic SDK migration guide](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/MIGRATION.md).
5. Re-run unit tests + a smoke eval (1–2 disputes) to confirm output shape
   hasn’t shifted.

**Verification.**
- `npm run typecheck` clean in both packages.
- `npm run test` clean in `functions/` and `packages/dashboard`.
- A 1–2 dispute manual eval shows roughly the same evidence plan and argument
  text as before the bump (model output is non-deterministic; expect minor
  wording diffs but same structure and same evidence items called out).

**Rollback.** `git revert` the SDK bump commit. Pin back to `^0.39.0`.

**Estimate.** 2–4 hours including testing.

**Decision required.** None — proceed when ready.

**Status:** [x] done
*(Pinned to `^0.91.1` across `packages/ai-core`, `functions/`. The
`messages.create` surface used by `callLLM` / `callLLMWithVision`
(content blocks, usage shape, system prompt, vision URL source) is
unchanged so no call sites needed adapting. Functions Jest: 338/338
green pre-bump and post-bump (368 after §B4).)*

---

### B2. Tighten Firestore rules on knowledge-base collections

**Why.** Today, [`firestore.rules`](../firestore.rules) has these collections
readable by **any authenticated user**, regardless of organization:

| Collection | Current rule | Acceptable? |
|------------|--------------|-------------|
| `rulesets` | `allow read: if isAuthenticated()` | Yes — public scheme reference data |
| `schemeRules` | `allow read: if isAuthenticated()` | Yes — same |
| `evidenceRequirements` | `allow read: if isAuthenticated()` | Yes — same |
| `pspFormats` | `allow read: if isAuthenticated()` | Yes — same |
| `winPatterns` | `allow read: if isAuthenticated()` | **No, if patterns derive from another tenant’s won/lost disputes** — that’s cross-tenant leakage |

The Phase 2 RAG plan introduces `cases` and `policies` namespaces in Pinecone
where the same question is sharper: cases are per-tenant data and **must** be
namespace-scoped on the read side as well.

**Decision (post-hardening sweep).**

Resolved: the current rule (`allow read: if isAuthenticated()`) is correct
for `winPatterns` because the data model is structurally anonymous and
cross-tenant by construction:

- Doc ID is `{network}_{reasonCode}_{verticalId}` (see
  [`packages/ai-core/src/types/knowledgeBase.ts`](../packages/ai-core/src/types/knowledgeBase.ts)
  `winPatternDocId`). There is no `organizationId` in the key and none in
  the `WinPattern` interface (`reasonCode`, `network`, `verticalId`,
  `evidenceCombination: string[]`, `argumentPatterns: string[]`,
  `winCount`, `lossCount`, `winRate`, `sampleSize`, `lastUpdated`).
- `evidenceCombination` stores evidence-category strings (e.g. `pms_data`,
  `policy`), not file names or content.
- `argumentPatterns` stores argument-paragraph headings produced by the LLM
  (e.g. `"Service Provided"`, `"Cancellation Policy"`), not body text and
  not tenant-identifying content.
- Updates are produced by `recordDisputeOutcome` in
  [`functions/src/services/winPatternService.ts`](../functions/src/services/winPatternService.ts),
  which never writes `organizationId` and only ever increments aggregate
  counters.

This means `winPatterns` is best modelled as a **shared, write-only-via-
admin-SDK reference table** alongside `schemeRules`, `evidenceRequirements`,
`pspFormats`, and `evidenceOutputTemplates`. All five collections have the
same `allow read: if isAuthenticated()` rule today and that's correct.

**Phase-2 cross-tenant decision (`cases` namespace in Pinecone).** The
design is locked: per-organization Pinecone namespace, server-side filter
on every retrieval query. The retrieval-side enforcement already exists in
[`packages/ai-core/src/services/ragService.ts`](../packages/ai-core/src/services/ragService.ts)
`buildFilter('cases')`, which emits `organizationId: { $eq: f.organizationId }`
when an `organizationId` filter is provided in the call. The remaining
Phase-2 work (tracked in [`docs/rag-implementation-guide.md`](rag-implementation-guide.md)
Phase 2) is to make that filter **mandatory** at the call site, e.g. with a
typed wrapper that won't compile without an `organizationId`.

**Defensive guardrail (cheap, do now).** Add a comment in
[`firestore.rules`](../firestore.rules) above the `winPatterns` block that
spells out the contract: "no `organizationId` field, no PII, aggregated
across all tenants". Future changes that add per-tenant data to the
collection MUST then either change the rule or migrate to a new
collection. Done in this PR.

**Verification.** A Firestore rules emulator test would only assert "any
authenticated user can read", which is already the behaviour. Worth adding
when the rule changes shape; not required to assert the current decision.

**Rollback.** N/A — no rule change.

**Estimate.** Decision was 30 min of analysis; the comment-based guardrail
adds 5 min.

**Decision required.** Resolved.

**Status:** [x] resolved (no rule change; data-model invariants documented
in `firestore.rules` and here)

---

### B3. Decide the future of `packages/core/`

**Why.** Earlier audit notes flagged `packages/core/` as orphaned. It’s not —
[`AGENTS.md`](../AGENTS.md) explicitly documents it as a Jest test sandbox
mirroring the `ai-core + adapters` pattern, and `.github/workflows/ci.yml`
runs its tests. It is, however, **redundant** with `packages/ai-core` plus
`functions/`, and dependency drift between the two has happened before
(`@anthropic-ai/sdk`, `pdf-parse`, etc.).

**Decision required (engineering).** Pick one:

1. **Keep `packages/core/` as the canonical Jest sandbox.**
   - Add a CI guardrail: a `version-drift.test.ts` that fails if
     `@anthropic-ai/sdk`, `pdf-parse`, `firebase-admin`, `firebase-functions`
     versions diverge between `packages/core/package.json` and either
     `packages/ai-core/package.json` or `functions/package.json`.
   - Document the contract (what tests live there, why not in `functions/`).
2. **Fold its tests into `functions/__tests__/` and delete the package.**
   - Smaller surface area, one fewer place to keep dependencies aligned.
   - Migration: move test files, drop `packages/core` from the workspace,
     drop `core-test` job from CI, run `rm -rf packages/core`, regenerate
     lockfile.
3. **Defer.** Status quo, accept drift risk, revisit after RAG Phase 1.

**Recommendation.** **Option 2** — there’s no production consumer of
`@realyn/core`; the same tests run faster co-located in `functions/`. Do this
in its own PR after C8.

**Verification.** Whichever option:
- `npm run test` passes from the root.
- CI is green on a feature branch.
- No `import.*@realyn/core` left anywhere outside `packages/core/` and
  `package-lock.json`.

**Rollback.** `git revert` the deletion PR.

**Estimate.** 1 hour for option 1; 3–4 hours for option 2.

**Decision required.** Yes — see above.

**Status:** [x] done (Option 2 chosen)
*(`packages/core/` deleted entirely. Single non-trivial diff in the
evidencePlanning integration test was ported into
`functions/src/services/ai/__tests__/evidencePlanning.integration.test.ts`
so no test coverage was lost. CI workflow updated to drop
`typecheck-core` and `core-test` jobs. AGENTS.md updated to reflect that
the test sandbox is `packages/ai-core` (Jest) plus `functions/`. Verified
no remaining `@realyn/core` references outside `AGENTS.md` and this
plan doc. Test counts after this commit: ai-core 28, functions 368.)*

---

### B4. Handler test coverage backfill

**Why.** The pre-RAG audit found these handlers have no dedicated unit tests:

- `signupHandler`
- `inviteHandlers` (createInvite, listInvites, revokeInvite, acceptInvite)
- `teamHandlers` (listTeamMembers, removeTeamMember, updateTeamMemberRole)
- `billingHandlers` (createCheckoutSession, billingWebhook, createBillingPortalSession) — **including the new idempotency path**
- `aiDisputeHandlers` (planEvidence, draftArgument, toggleAIPlan)

`adyenWebhook` and `stripeWebhook` (PSP) have tests; nothing else does.

**Recommended scope.** Cover only the **critical money/auth paths** —
billing webhooks and AI handlers. Don’t aim for a coverage number; aim for:

- **Billing:** webhook idempotency contract (same event ID processed twice ⇒
  one DB write), signature verification path, redirect URL builder uses
  `DASHBOARD_URL`, error path returns generic 500 + `errorId`.
- **AI handlers:** auth gate (`verifyUserInOrganization`) is hit before
  rate-limit / Firestore work, error path returns generic 500.
- **Signup/invite/team:** smoke tests only — happy path returns 200, missing
  org returns 403.

**Change.** New test files under `functions/src/handlers/__tests__/`,
patterned on the existing
[`adyenWebhook.test.ts`](../functions/src/handlers/__tests__/adyenWebhook.test.ts)
(mock req/res, mock `firebase-admin`, assert response status + body shape).

**Verification.** `cd functions && npm test` shows the new test files passing.
CI `core-test` / `functions-test` jobs go green.

**Estimate.** 1–2 days, can be split into smaller PRs (e.g. one per handler
group).

**Decision required.** Priority only — slot before or after RAG Phase 1.

**Recommendation.** After RAG Phase 1. The product needs the RAG signal more
than it needs another test file *right now*; both are work and you can only
do one at a time.

**Status:** [x] done (billing + AI handler critical paths covered)
*(New test files:
`functions/src/handlers/__tests__/billingHandlers.test.ts` (12 tests)
covers signature verification, idempotency contract on
`_processedWebhookEvents`, internal-error generic-500 + redaction, and
the `DASHBOARD_URL` redirect contract for both Checkout and Portal.
`functions/src/handlers/__tests__/aiDisputeHandlers.test.ts` (18 tests)
covers `planEvidence` / `draftArgument` / `toggleAIPlan`: auth gate,
plan-limit gate, validation, atomic queue/claim, cached draft path, and
internal-error generic-500 + redaction. Signup / invite / team handlers
remain on the post-RAG backlog — out of scope for this commit.)*

---

## Workstream C — RAG Phase 1 (the actual next product work)

This is the unblocked sequence after `PINECONE_API_KEY` is set in the
Pinecone dashboard. Each step is gated by the previous.

### C1. Provision the Pinecone index

**Why.** The index has to exist before any ingestion. The setup script is
idempotent and safe to re-run.

**Pre-reqs.**
- `PINECONE_API_KEY` from the Pinecone console saved in
  `functions/.env` (local) and as a Firebase secret (later, see C7).
- Decide index name per environment. Default is `realyn-rag` from
  [`packages/ai-core/src/config/ragConfig.ts`](../packages/ai-core/src/config/ragConfig.ts).
  Override with `PINECONE_INDEX_NAME` to avoid prod/staging colliding:

| Env | `PINECONE_INDEX_NAME` |
|-----|------------------------|
| Local dev | `realyn-rag-dev` |
| Staging | `realyn-rag-staging` |
| Production | `realyn-rag` |

**Change.**
```bash
cd functions
echo "PINECONE_API_KEY=pcsk_..."          >> .env
echo "PINECONE_INDEX_NAME=realyn-rag-dev" >> .env
npm run rag:setup
```

The script (
[`functions/src/scripts/setupPineconeIndex.ts`](../functions/src/scripts/setupPineconeIndex.ts))
will:
1. Connect to the configured Pinecone region/cloud
   (`gcp / us-central1` per `ragConfig.ts`).
2. Check if the index exists.
3. Create it with `dimension: 1024`, `metric: cosine`, `serverless` if missing.
4. Wait until `READY` and exit.

**Verification.**
- Pinecone console shows the index in `READY` state with the right
  dimension and metric.
- `npm run rag:test` (uses
  [`functions/src/scripts/testRagRetrieval.ts`](../functions/src/scripts/testRagRetrieval.ts))
  succeeds with a "no matches" result on an empty index.

**Rollback.** Delete the index in the Pinecone console. No code state to
roll back.

**Estimate.** 15 min.

**Status:** [ ] dev  [ ] staging  [ ] production

---

### C2. Source rulebook PDFs and stage them locally

**Why.** Ingestion is the messy part. Get the corpus right before touching
the prompt-wiring step.

**Sources for Phase 1 (public, free of licensing risk):**

| Doc | Network | Notes |
|-----|---------|-------|
| **Visa Public Rules** (most recent edition) | Visa | Public PDF, ~1500 pages. Sufficient for evidence-requirement retrieval on Visa disputes. |
| **Mastercard Chargeback Guide** | Mastercard | Public version is the merchant-facing summary. Internal Chargeback Manual is licensed; treat as Phase 2. |
| **Visa Core Rules and Visa Product and Service Rules** (licensed) | Visa | If you have an acquirer or Visa Online entitlement, drop them in too. **Don’t commit** — they’re per-merchant licensed. |

**Storage layout (gitignored):**
```
data/rulebooks/
  visa/
    visa-public-rules-2024.pdf
  mastercard/
    mastercard-chargeback-guide-2024.pdf
```

Both `data/rulebooks/` and `functions/data/` are in
[`.gitignore`](../.gitignore) already (verified during hardening).

**Verification.**
- `ls data/rulebooks/visa/*.pdf` returns the file.
- `pdftotext` (or `pdfinfo`) opens the file without errors. If the PDF is
  scanned-image rather than text, ingestion will produce empty chunks —
  flag and OCR it with `ocrmypdf` first.

**Rollback.** Delete the file. Nothing committed.

**Estimate.** 30 min including download + sanity check.

**Status:** [ ] visa  [ ] mastercard

---

### C3. Capture the pre-RAG baseline (DO NOT SKIP)

**Why.** Once retrieval is wired, you can never reconstruct "what the model
said before RAG" for the same input. You must capture the baseline *before*
ingestion or the eval is worthless.

**Change.**

1. Pick the test set:
   - 5–10 disputes total, drawn from production or staging.
   - Mix: Visa + Mastercard, mix of reason codes (10.4, 13.1, 13.2 are good
     starting points), mix of "we won" and "we lost" outcomes if you have
     historicals.
   - Anonymise cardholder data if you’re writing this into a doc that may be
     reviewed externally.

2. Copy the template:
   ```bash
   cp docs/eval/rag-baseline-template.md \
      docs/eval/$(date +%Y-%m)-rag-phase1-baseline.md
   ```

3. For each dispute, **before any RAG wiring**, capture:
   - The reason code, network, amount, date.
   - The current evidence plan output from `evidencePlanner.ts`.
   - The current argument draft from `argumentGenerator.ts`.
   - A 1–5 grade on **(a) coverage** (does the evidence list match what the
     scheme rule actually wants?), **(b) accuracy** (are the cited rules
     real?), **(c) tone**.

4. Commit the filled-in baseline doc to the repo on a feature branch (so it
   shows up in the eventual RAG-wiring PR diff for reference).

**Verification.** The doc has a row per dispute and a per-axis average score.

**Rollback.** N/A — adding a doc.

**Estimate.** 2–4 hours depending on how many disputes you grade. Don’t cheap
out here; this is the only ground truth you’ll have.

**Status:** [ ] not started

---

### C4. Dry-run ingestion and chunk inspection

**Why.** Heading-aware chunking
([`functions/src/scripts/lib/textChunker.ts`](../functions/src/scripts/lib/textChunker.ts))
is heuristic. PDFs with multi-column layout, sidebars, or footnotes can
produce nonsense chunks (mid-sentence splits, headers stuck to body, etc.).
Dry-run first.

**Change.**
```bash
cd functions
npm run rag:ingest -- \
  --file /abs/path/to/data/rulebooks/visa/visa-public-rules-2024.pdf \
  --network visa \
  --name "Visa Public Rules" \
  --version 2024-04-15 \
  --dry-run \
  --sample 20
```

Flags:
- `--dry-run`: parse + chunk + log, **don’t embed, don’t upsert**.
- `--sample N`: print the first N chunks (heading + first 200 chars + token
  count) for eyeball inspection.

**What to look for in the sample output.**

| Sign | Meaning | Action |
|------|---------|--------|
| Chunks ~500–800 tokens, each starts with a heading | Healthy | Proceed |
| Chunks all 50 tokens or all 2000 tokens | Heading detection broken | Tweak `detectHeading` heuristic in `textChunker.ts` |
| Chunk text is `'\u0000\u0000...'` or empty | Scanned PDF | OCR the PDF before re-running |
| Headings include "Page 14 of 1500" or `Visa Confidential` footer | Footer/header noise | Add a regex strip in `normalise(raw)` |
| Two unrelated rules concatenated into one chunk | Boundary too coarse | Lower `CHUNK_TARGET_TOKENS` in `ragConfig.ts` |

**Verification.** A 20-chunk sample reads as coherent rule text.

**Rollback.** `--dry-run` makes no remote state. Nothing to roll back.

**Estimate.** 30 min – 2 hours depending on how many tweaks the chunker
needs.

**Status:** [ ] visa  [ ] mastercard

---

### C5. Real ingestion

**Why.** You want vectors in Pinecone.

**Change.** Same command as C4, drop `--dry-run`:

```bash
cd functions
npm run rag:ingest -- \
  --file /abs/path/to/data/rulebooks/visa/visa-public-rules-2024.pdf \
  --network visa \
  --name "Visa Public Rules" \
  --version 2024-04-15
```

Repeat for Mastercard.

**What the ingestion script does** (
[`functions/src/scripts/ingestRulebooks.ts`](../functions/src/scripts/ingestRulebooks.ts)):
1. Parses PDF with `pdf-parse`.
2. Normalises and heading-chunks via `lib/textChunker.ts`.
3. Validates each chunk’s metadata against the
   `RulebookMetadataSchema` Zod schema.
4. Embeds with Pinecone Inference (`multilingual-e5-large`,
   `inputType=document`) in batches of `UPSERT_BATCH_SIZE` (90).
5. Upserts with deterministic content-addressed IDs (so re-running on the
   same PDF version is a no-op, and a new version doesn’t collide with the
   old one).

**Verification.**
- Pinecone console: index stats shows ~1000–10000 vectors in the
  `rulebooks` namespace.
- `npm run rag:test` returns coherent results for canned queries
  (`"chargeback for non-receipt of merchandise"`, `"compelling evidence rule
  10.4"`, etc.).
- Hit-rate sanity: each top-3 result should obviously relate to the query
  topic. If you get garbage, go back to C4 and tighten chunking.

**Rollback.** `pinecone delete-by-id` or just delete the namespace and
re-ingest. Idempotent.

**Estimate.** 30–60 min per PDF (mostly waiting on embedding throughput).

**Status:** [ ] visa  [ ] mastercard

---

### C6. Wire retrieval into evidence planning and argument drafting

This is the actual product change. Code-side scope is small and well-fenced;
the hard part is prompt design and eval discipline.

**Files touched:**

- [`packages/ai-core/src/services/evidencePlanner.ts`](../packages/ai-core/src/services/evidencePlanner.ts)
- [`packages/ai-core/src/services/argumentGenerator.ts`](../packages/ai-core/src/services/argumentGenerator.ts)

**Change pattern (apply to both):**

```ts
import { retrieveRulebookContext, formatRetrievedContext } from "@realyn/ai-core";

// Inside the existing function, before building the prompt:
const ragResult = await retrieveRulebookContext({
  query: buildRetrievalQuery(dispute), // see below
  network: dispute.scheme,             // "visa" | "mastercard"
  topK: 5,
  minScore: 0.65,
});

const referenceMaterial = ragResult.chunks.length
  ? `\n\n## REFERENCE MATERIAL\n${formatRetrievedContext(ragResult.chunks)}\n`
  : "";

const userPrompt = `${existingPromptBody}${referenceMaterial}`;
```

**`buildRetrievalQuery(dispute)`** is a small helper; recommended shape:

```ts
function buildRetrievalQuery(d: Dispute): string {
  return [
    `Network ${d.scheme}, reason code ${d.reasonCode}`,
    d.reasonCodeDescription,
    `Dispute amount ${d.amount} ${d.currency}`,
    d.merchantCategory ? `MCC ${d.merchantCategory}` : "",
  ].filter(Boolean).join(". ");
}
```

**Prompt placement.** Inject `## REFERENCE MATERIAL` **after** the
deterministic dispute facts and **before** the instruction-to-LLM. The
specialist prompt should already say something like:

> "If REFERENCE MATERIAL is provided, ground your evidence list / argument
> in those rule excerpts and cite the section number where applicable. If a
> requested evidence item is not supported by REFERENCE MATERIAL or
> deterministic facts, omit it."

**Fail-safe.** `retrieveRulebookContext` is already implemented to return
`{ chunks: [], totalScore: 0, durationMs: ... }` on any error (see
[`packages/ai-core/src/services/ragService.ts`](../packages/ai-core/src/services/ragService.ts)).
That means the deterministic pipeline still works if Pinecone is down.
**Don’t add a `throw`** — the empty-chunks path is the rollback.

**Telemetry.** `retrieveRagContext` already emits
`ragRetrievalLatencyMs` / `chunksReturned` / `totalScore` to the existing
telemetry sink. Add a single log line per retrieval call with
`disputeId` + `chunksReturned` + `topScore` so you can grep for retrieval
failures in production.

**Tests.** Add unit tests in
`packages/ai-core/src/services/__tests__/`:
- `evidencePlanner.test.ts` — mock the vector store via
  `configureVectorStore({ query: jest.fn(...) })`, assert the prompt
  includes `## REFERENCE MATERIAL` when chunks are returned and **does not**
  include it when the mock returns `[]`.
- `argumentGenerator.test.ts` — same shape.

**Verification.**
- `npm run typecheck` and `npm run test` clean in `packages/ai-core` and
  `functions/`.
- A manual run against one of the C3 baseline disputes shows the prompt now
  includes a `## REFERENCE MATERIAL` section pointing at real rule excerpts.

**Rollback.** Feature flag the call:

```ts
const ragEnabled = process.env.RAG_RETRIEVAL_ENABLED !== "false";
const ragResult = ragEnabled
  ? await retrieveRulebookContext(...)
  : { chunks: [], totalScore: 0, durationMs: 0 };
```

Set `RAG_RETRIEVAL_ENABLED=false` on the affected Cloud Run services to
revert behaviour without redeploying code.

**Estimate.** 1 day end-to-end (code + tests + manual sanity check).

**Status:** [x] evidencePlanner  [x] argumentGenerator
*(Implemented as
[`packages/ai-core/src/services/ragPromptInjection.ts`](../packages/ai-core/src/services/ragPromptInjection.ts):
single source of truth for retrieval query construction (PII-free), the
`## REFERENCE MATERIAL` block format, the `RAG_RETRIEVAL_ENABLED`
feature flag, and the structured `[rag]` log line. Wired into
`generateEvidencePlan` and `generateDisputeArgument`; both fall back to
the deterministic pipeline on any retrieval error. 28 unit tests across
3 ai-core suites pin: feature-flag gate, PII-safe query builder, fail-
safe contract on store errors, and prompt-presence/absence of
`## REFERENCE MATERIAL` for both planner and generator.

The Cloud Functions side is already wired: `functions/src/services/ai/ragService.ts`
runs `configureVectorStore(pineconeVectorStore)` at module init, so once
`PINECONE_API_KEY` is bound on the deployed handlers (§C7) and rulebooks
are ingested into the index (§C5), retrieval will activate automatically
without further code changes. Until then, the empty-chunks path keeps
behaviour identical to pre-RAG.)*

---

### C7. Bind `PINECONE_API_KEY` on Cloud Functions and deploy

**Why.** Once retrieval is wired, the Cloud Functions running
`evidencePlanner` / `argumentGenerator` need the Pinecone secret at runtime.

**Change.**

1. Set the secret per environment:
   ```bash
   firebase functions:secrets:set PINECONE_API_KEY --project=realyn-app-staging
   firebase functions:secrets:set PINECONE_API_KEY --project=realyn-app
   ```

2. Set the index-name env var per environment (non-secret):
   ```bash
   gcloud run services update planevidence \
     --region=us-central1 --project=realyn-app-staging \
     --update-env-vars=PINECONE_INDEX_NAME=realyn-rag-staging
   gcloud run services update draftargument \
     --region=us-central1 --project=realyn-app-staging \
     --update-env-vars=PINECONE_INDEX_NAME=realyn-rag-staging
   # ... and the same for production with PINECONE_INDEX_NAME=realyn-rag
   ```

3. Bind the secret on the relevant function definitions in
   [`functions/src/handlers/aiDisputeHandlers.ts`](../functions/src/handlers/aiDisputeHandlers.ts)
   in their `onRequest({ secrets: [...] })` options. There’s already a
   pattern for `RESEND_API_KEY` and `STRIPE_*`; mirror it.

4. Deploy:
   ```bash
   firebase deploy --only functions:planEvidence,functions:draftArgument \
     --project=realyn-app-staging
   ```

**Verification.** Hit `planEvidence` in staging, watch logs for
`ragRetrievalLatencyMs` lines. If you see "Pinecone client init failed", the
secret isn’t bound or wasn’t set correctly.

**Rollback.** See C6 — flip `RAG_RETRIEVAL_ENABLED=false`.

**Estimate.** 30 min.

**Status:** [ ] staging  [ ] production

---

### C8. Re-run eval and compare to baseline

**Why.** The whole point. Without this, "we shipped RAG" is faith-based.

**Change.**

1. Run the same 5–10 disputes from C3 through the now-RAG-wired pipeline.
2. Open `docs/eval/<your-baseline-doc>.md` and fill in the post-RAG columns
   (same axes: coverage, accuracy, tone).
3. Compute deltas. The headline numbers you care about:
   - **Coverage delta** — does RAG surface evidence items the deterministic
     pipeline missed?
   - **Citation accuracy** — when the model cites a rule section, is it
     real and from the retrieved chunks (not hallucinated)?
   - **Latency cost** — `ragRetrievalLatencyMs` per call (target <500ms p95
     for `topK=5`).

**What "good" looks like for Phase 1.**
- Coverage +1 evidence item average per dispute.
- Citation accuracy ≥95% (manually checked against the cited section).
- p95 latency overhead <800ms over current `planEvidence` latency.

**If the numbers are flat or worse:**
- Most likely cause: chunks are too coarse or too noisy. Go back to C4 and
  re-chunk with smaller `CHUNK_TARGET_TOKENS`.
- Second most likely: query is bad. Tweak `buildRetrievalQuery` to include
  more dispute-specific context.
- Third: prompt isn’t telling the model to actually use REFERENCE MATERIAL.
  Strengthen the instruction in the specialist prompt.

**Estimate.** 4 hours grading + write-up.

**Status:** [ ] not started

---

### C9. Production cutover and rollback path

**Why.** Once staging eval is positive, production is the same code with
different envs.

**Change.**

1. Repeat C1, C5, C7 against production (`realyn-app`, `realyn-rag` index).
2. Deploy `planEvidence` + `draftArgument` to production with
   `RAG_RETRIEVAL_ENABLED=true` (or simply unset, since the C6 flag
   defaults to enabled).
3. Watch for 24h: `ragRetrievalLatencyMs`, error rate on `planEvidence`,
   any uptick in 500s.

**Rollback.**

| Severity | Action |
|----------|--------|
| Pinecone down, retrieval failing fast | No-op — fail-safe returns empty chunks, deterministic pipeline keeps working. Logs will be noisy; that’s fine. |
| RAG making outputs *worse* (hallucinations spike, off-topic citations) | `gcloud run services update planevidence --update-env-vars=RAG_RETRIEVAL_ENABLED=false` (and for `draftargument`). Takes effect on next request. |
| Both (sustained Pinecone outage with bad cached state) | Same as above + `firebase functions:secrets:unset PINECONE_API_KEY` to make the failure mode explicit in logs. |

**Estimate.** 30 min cutover + 24h soak.

**Status:** [ ] not started

---

## Sequencing and ownership

A sane order, assuming one engineer at a time:

```
A1 ──┬──► A4 ───────────────────────────► (ops slate clean)
A2 ──┤
A3 ──┤
A5 ──┘

C1 ──► C2 ──► C3 ──► C4 ──► C5 ──► B1 ──► C6 ──► C7 ──► C8 ──► C9
                                    │                                   │
                                    └─ B3 (option 2) ────► B4 ◄────────┘
                                                          (optional, post-cutover)

B2 — kick off in parallel with C1–C5; needs decision before C6.
```

**Why this order:**
- Ops follow-ups (A1–A5) are short and parallelisable; do them first so the
  hardening commit is fully landed in production.
- The RAG path (C1–C9) has hard dependencies between every step. C3 must be
  before C5 (or you lose the baseline). B1 (Anthropic SDK) slots between C5
  and C6 so the SDK regression check doesn’t conflate with RAG wiring.
- B2 (KB Firestore rules) is a must-decide-before-C6 item because the
  Phase 2 namespace design depends on the answer; doing it early surfaces
  the question. Implementation can wait if the answer is "current rules
  are fine for Phase 1, revisit for Phase 2."
- B3 (`packages/core/`) and B4 (handler tests) are pure cleanup; do them
  after the RAG cutover.

---

## Verification matrix

| Item | Type | Verifier | Owner |
|------|------|----------|-------|
| A1 | Manual + scheduler trigger | Cloud Logging shows scheduler ran without `FAILED_PRECONDITION` | Ops |
| A2 | Manual checkout flow | Stripe test Checkout redirects to staging URL | Ops |
| A3 | `gh secret list` diff | Old secrets not present | Ops |
| A4 | Manual smoke checklist | All checklist items pass | Eng |
| A5 | `ls docs \| rg ' 2'` | Empty | Eng |
| B1 | Unit + 2-dispute manual eval | Outputs structurally unchanged | Eng |
| B2 | Firestore rules emulator test | Cross-tenant read denied | Eng + Product |
| B3 | CI green on feature branch | All tests pass after migration | Eng |
| B4 | New `__tests__` files green | `npm test` shows new passing files | Eng |
| C1 | Pinecone console + `rag:test` | Index `READY`, smoke query works | Eng |
| C2 | `pdfinfo` + manual page check | PDF opens, has extractable text | Eng |
| C3 | Filled-in eval doc | Per-axis grades captured | Eng |
| C4 | 20-chunk sample readout | Chunks coherent | Eng |
| C5 | Pinecone stats + `rag:test` | Vector count plausible, top-3 sane | Eng |
| C6 | Unit tests + manual prompt diff | `## REFERENCE MATERIAL` appears | Eng |
| C7 | Cloud Logging for `ragRetrievalLatencyMs` | Lines appear post-deploy | Eng |
| C8 | Filled-in post-RAG columns | Coverage/accuracy delta measured | Eng + Product |
| C9 | 24h soak | Error rate stable, latency within budget | Eng |

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pinecone Inference quality below baseline on rulebook text | Medium | Phase 1 doesn’t deliver a measurable lift | C8 catches it; switch path documented in [`embedding-provider-setup.md`](embedding-provider-setup.md) (move to Voyage `voyage-3-large`). Re-ingest cost is hours, not days. |
| Heading-aware chunker mangles a specific PDF section | Medium | Bad retrieval results for that scheme | C4 dry-run catches it; tune `CHUNK_TARGET_TOKENS` and `detectHeading`. |
| Anthropic SDK upgrade breaks output shape | Low | Eval looks "different" for reasons unrelated to RAG | B1 done as its own commit before C6 isolates the diff. |
| `DASHBOARD_URL` left unset on staging billing | Medium | Test users redirected to prod after Checkout | A2 + smoke test in A4. |
| Firestore index missed | Low | Daily scheduler errors at 02:00 UTC | A1 + run scheduler manually post-deploy. |
| Cross-tenant `winPatterns` leakage | Unknown — depends on data model | High if applicable | B2 forces the decision before Phase 2. |
| RAG retrieval latency drags `planEvidence` over Cloud Run timeout | Low | 5xx on AI handlers | C6 sets `topK=5`, latency budget <800ms; `timeoutSeconds: 60` already configured in handler options. |

---

## Out of scope (explicit, for later)

These are deliberately *not* in this plan. They’re here so they’re not
forgotten and so future-you doesn’t re-discover them as new findings.

- **Phase 2 RAG: `cases` namespace.** Per-tenant ingestion of anonymised
  won/lost disputes. Requires the B2 decision and a separate ingestion
  pipeline. Tracked in [`PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md)
  §25.
- **Phase 3 RAG: `policies` namespace.** Merchant refund/cancellation
  policies. Requires a customer-facing upload flow.
- **Per-tenant Pinecone namespacing.** Phase 2/3 prerequisite.
- **Eval automation.** Today the eval is a manual markdown checklist. A
  scripted regression eval (golden disputes + assertions) is a separate
  workstream once Phase 1 lands.
- **Customer support widget, usage analytics, help centre.**
  [`PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md) Tier 5.
- **Anomaly detection on webhook volume.** Tier 5.
- **AI cost / token observability.** Today, per-call cost and latency are
  emitted from `packages/ai-core/src/services/llmService.ts` via
  `emitLLMTelemetry` and `cloudLoggingEmitter`, but nothing aggregates the
  output into a dashboard or alerts on it. Pinecone usage is only visible
  on the Pinecone web console. The Anthropic credit-balance issue
  surfaced during the C3 baseline capture (2026-05-02) was discovered by
  receiving `400 invalid_request_error` responses on every call —  not by a
  billing alert. Concrete asks:
  - Wire `emitLLMTelemetry` to a structured sink (BigQuery view from Cloud
    Logging is the cheapest path; Honeycomb/Datadog if either is already
    in use). Build a per-dispute cost view (model × stage × org).
  - Add a "monthly spend > $X" alert on the Anthropic console and a
    "credit balance < $Y" auto-recharge / alert.
  - Add a Pinecone QPS + monthly-cost dashboard tile (their API exposes
    usage via the management plane).
  - Worth doing before C8 / production cutover so we have at least one
    full month of cost-per-dispute data before the AI bill compounds.
- **Multi-vendor LLM resilience.** Today the entire AI pipeline calls
  `api.anthropic.com` directly via `@anthropic-ai/sdk` with no failover.
  When Anthropic has an outage, evidence planning and argument drafting
  go dark across every tenant simultaneously. The "two AI vendors max
  (Anthropic + Pinecone)" rule documented in
  `packages/ai-core/src/config/ragConfig.ts` and the RAG handoff doc was
  a deliberate 2026-Q2 simplification by the user, *not* a permanent
  posture — it's appropriate for the current scale but it's a single point
  of failure. Concrete asks:
  - Define an `LLMProvider` abstraction in `@realyn/ai-core` (the
    existing `callLLM` / `callLLMWithVision` interface is already close;
    extract the `client.messages.create` call behind a port).
  - Add a secondary adapter (AWS Bedrock-Claude is the smallest delta,
    same model family; Groq-hosted Llama for triage-only is the cheaper
    fallback — both work).
  - Wire health-check + automatic failover in `llmService` so a Claude
    5xx routes to the secondary for the next N seconds. Keep the
    primary/secondary choice configurable per-tenant for compliance use
    cases.
  - Requires explicit user sign-off because it expands the credentials
    surface, the test matrix, and the SLA story. Right size of decision
    for an ADR (per the §B3 / cross-references "out of scope" pattern).
- **Pinecone Standard tier upgrade — delete `embedWithRetry`.** The
  `embedWithRetry()` helper in `packages/ai-core/src/services/embedding
  Service.ts` (and its sparse-side twin in `sparseEmbeddingService.ts`)
  exists exclusively because Pinecone Starter caps Inference at
  ~250K tokens/min/model/input-type. Without the hand-tuned 30/60/90/120s
  backoff, the PR #13 Mastercard ingest would have crashed on
  `RESOURCE_EXHAUSTED` mid-run. This is load-bearing complexity in
  service of saving roughly Pinecone's Standard base fee (~$70/mo). For a
  chargeback platform, that's rounding error. Concrete asks:
  - Upgrade the Pinecone organisation to Standard via the Pinecone
    console (single-click; same project, same index).
  - Verify the new throttle on the Pinecone usage dashboard (Standard
    tier limits are documented at https://docs.pinecone.io/reference/api/limits ;
    Inference limits are higher and per-org rather than per-input-type).
  - Delete `embedWithRetry` from both files; collapse callers back to the
    underlying `pinecone.inference.embed(...)` call.
  - Update `docs/rag-phase-1-handoff.md` §"Free-tier vs paid-tier
    deployment" to reflect Standard tier and remove the GCP co-location
    upgrade recipe (or rewrite it as "consider GCP if Cloud Functions
    egress becomes a concern").
  - Worth pairing with the AI cost observability item above so the
    upgrade's real cost is visible from day one.

---

## Cross-references

- [`PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md) — high-level
  product roadmap and Tier 4/5 items.
- [`docs/rag-implementation-guide.md`](rag-implementation-guide.md) —
  RAG architecture, locked decisions, scaffolding inventory.
- [`docs/embedding-provider-setup.md`](embedding-provider-setup.md) —
  Pinecone Inference vs Voyage AI vs OpenAI tradeoffs and switching guide.
- [`docs/eval/README.md`](eval/README.md) — eval workflow.
- [`docs/eval/rag-baseline-template.md`](eval/rag-baseline-template.md) —
  copy-paste template for C3 / C8.
- [`functions/docs/RATE_LIMITS.md`](../functions/docs/RATE_LIMITS.md) —
  rate limit policy.
- [`AGENTS.md`](../AGENTS.md) — repo conventions, including the rationale
  for `packages/core/` (relevant to B3).
