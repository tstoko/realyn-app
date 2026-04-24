# Production Readiness Roadmap

> **Status:** Not yet ready to sell. The core product logic is solid — dispute ingestion, AI evidence planning, multi-PSP support, dashboard UI — but critical security, commercial infrastructure, and hardening work remains.

---

## Tier 1 — Fix Today

Your production Firebase project is live and vulnerable right now. Anyone with your project ID (public in client-side JS) can read all disputes or seed junk data.

### 1. Lock down Firestore rules ✅ DONE
- **File:** `firestore.rules`
- **Issue:** `disputes` and `evidence` collections have `allow read: if true` — any unauthenticated user can read every dispute document (guest names, payment details, amounts, evidence metadata).
- **Fix:** Scope dispute/evidence reads to authenticated users within their organization.
- **Implemented:** Added `userCanReadOrg(orgId)` helper (mirrors `storage.rules`) that grants access when `role == 'admin'`, `organizationId` matches, or `organizationIds` contains the org. Disputes require `request.auth != null`, `resource.data.organizationId != null`, and `userCanReadOrg(...)`. Evidence uses `userCanReadDispute(disputeId)` to fetch parent dispute and check org. Writes remain `false` (Cloud Functions use admin SDK).

### 2. Remove or auth-gate seed/test endpoints ✅ DONE
- **Files:** `functions/src/handlers/seedPitchDemo.ts`, `seedOrganizationsHandler.ts`, `seedUsersHandler.ts`, `seedTestDisputes.ts`, `seedCustomDispute.ts`, `seedDemoData.ts`, `resetTestEnvironment.ts`, `adminUpdateDispute.ts`, `updateWebhookSecretHandler.ts`, `clearDisputes.ts`
- **Issue:** `seedPitchDemo` is deployed and unauthenticated. Other seed/test handlers will become exposed once wired up in step 4.
- **Fix:** Wrap all seed/test endpoints in `shouldEnableTestHandlers()` or `verifyAdmin`. Do this *before* step 4.
- **Implemented:** `seedPitchDemo` uses `verifyAdmin` (Bearer token required; admins only) — needed for production demos. All other seed/test handlers use `requireTestHandlerAdmin` in `functions/src/utils/authMiddleware.ts`, which combines `shouldEnableTestHandlers()` + `verifyAdmin`: disabled in production (403), admin-only in dev/emulator. Removed `invoker: "public"` from seedOrganizationsHandler, seedUsersHandler, and updateWebhookSecretHandler.

### 3. Add auth to AI handlers ✅ DONE
- **File:** `functions/src/handlers/aiDisputeHandlers.ts`
- **Issue:** `planEvidence`, `draftArgument`, `toggleAIPlan` lack `verifyUser`. Each call burns Anthropic API credits. `toggleAIPlan` allows `organizationId` to be omitted, skipping the org check entirely.
- **Fix:** Add `authMiddleware.verifyUserInOrganization` to all AI endpoints. Do this *before* step 4.
- **Implemented:** `planEvidence` and `draftArgument` call `verifyUserInOrganization(req, organizationId)` after validating IDs and **before** rate limits, Firestore updates, or LLM work; rate limiting uses the authenticated UID. `toggleAIPlan` requires `organizationId` in the body, runs `verifyUserInOrganization`, then always checks `dispute.organizationId === organizationId`. Dashboard: `packages/dashboard/src/services/cloudFunctionAuth.ts` plus Bearer tokens on `generateEvidencePlan`, `updateEvidenceItemStatus`, `getEvidenceProgress`, `toggleAIPlanMode` (`aiDisputeService.ts`), and `generateArgument` (`argumentService.ts`).

### 4. Wire up all Cloud Functions in `index.ts` ✅ DONE
- **File:** `functions/src/index.ts`
- **Issue:** Only 3 functions are exported (`stripeWebhook`, `testOperaCloudConnection`, `seedPitchDemo`). All other handlers — dispute submission, Adyen webhook, user management, AI evidence, CSV import, data retention, archive — are implemented but not registered. The product literally doesn't work without them.
- **Fix:** Re-export every handler the dashboard calls. Do this *after* steps 2-3 so you don't expose unprotected endpoints.
- **Implemented:** Re-exported AI handlers (`planEvidence`, `updateEvidenceItem`, `getProgress`, `toggleAIPlan`, `draftArgument`), PSP test/submit (`testStripeConnection`, `testAdyenConnection`, `submitStripeDisputeResponse`, `submitAdyenDisputeResponse`), `adyenWebhook`, `adyenManualSync`, user management handlers, GDPR/data retention HTTP handlers plus `dataRetentionCleanup` schedule, archive handlers, and gated seed/admin/test handlers. Dashboard CSV import calls `/processCSVImport`; exported `processCSVImportHandler` as `processCSVImport` so the URL matches without a frontend change. **Deploy:** run `firebase deploy --only functions` (or full deploy) so these endpoints exist in the Firebase project.

### 5. Remove debug localhost fetch ✅ DONE
- **File:** `packages/dashboard/src/services/aiDisputeService.ts`
- **Issue:** `generateEvidencePlan` contains a `fetch` to `127.0.0.1:7783` that will silently fail or throw in production.
- **Fix:** Remove the debug fetch call.
- **Implemented:** Removed all `#region agent log` debug `fetch` calls to `127.0.0.1:7783` from `generateEvidencePlan`.

### 6. Deploy storage rules ✅ DONE
- **File:** `firebase.json`
- **Issue:** No `"storage"` block in `firebase.json`, so `storage.rules` may not be pushed on `firebase deploy`. Security rules could be stale or defaults.
- **Fix:** Add the storage config block to `firebase.json`.
- **Implemented:** Added `"storage": { "rules": "storage.rules" }` to `firebase.json`. **Deploy:** run `firebase deploy --only storage` (or full deploy) so remote rules are updated; the config change alone does not push rules.

---

## Tier 2 — Fix This Week

Broken functionality and correctness issues that will confuse or break things for anyone using the app.

### 7. Fix collection naming mismatch ✅ DONE
- **Files:** `functions/src/services/disputeHistoryService.ts` (uses `disputes_history`), `functions/src/services/dataRetentionService.ts` (references `disputeHistory`)
- **Issue:** Data retention cleanup silently misses archived disputes, or archives go to the wrong collection.
- **Fix:** Pick one name, update all references.
- **Verified:** The Firestore collection name `disputes_history` is used consistently in all service files. `disputeHistory` only appears as a TypeScript property name on `DeletionResult.deletedItems`, not as a collection reference.

### 8. Add `framer-motion` to dashboard dependencies ✅ DONE
- **File:** `packages/dashboard/package.json`
- **Issue:** `LoginPage.tsx` imports `framer-motion` which isn't declared — it works by accident via workspace hoisting. Clean install or CI build will break.
- **Fix:** `npm install framer-motion` in the dashboard package.
- **Verified:** No `framer-motion` imports exist anywhere in `packages/dashboard/src`. The dependency was already removed from the codebase.

### 9. Replace mock activity log with real data ✅ DONE
- **File:** `packages/dashboard/src/hooks/useActivityLog.ts`
- **Issue:** Returns hardcoded mock entries. A paying customer seeing fake data destroys trust instantly.
- **Fix:** Wire to the `auditLog` subcollection that already exists under organizations, or hide the Activity page behind a feature flag until real data is available.
- **Verified:** `useActivityLog.ts` subscribes to live Firestore `organizations/{orgId}/auditLog` via `onSnapshot` with `orderBy('timestamp', 'desc')`. No mock data remains.

### 10. Add security headers to Firebase Hosting ✅ DONE
- **File:** `firebase.json`
- **Issue:** No CSP, HSTS, X-Frame-Options, or X-Content-Type-Options. Security-conscious merchant IT teams will check for these.
- **Fix:** Add a `headers` block to the hosting config with standard SaaS security headers.
- **Verified:** Both `website` and `dashboard` hosting targets in `firebase.json` have full security headers: CSP, HSTS (63072000s with preload), X-Frame-Options (DENY), X-Content-Type-Options (nosniff), X-XSS-Protection, Referrer-Policy, and Permissions-Policy.

---

## Tier 3 — Next 1-2 Weeks (Sellable Product Foundation)

This is where the product goes from "working demo" to "thing someone can actually buy." Order matters due to dependencies.

### 11. Set up a staging environment ✅ DONE
- Create a second Firebase project (e.g. `realyn-app-staging`). All subsequent work should be testable without touching production.
- Unblocks safe iteration on everything below.
- **Implemented:** Added staging hosting targets to `.firebaserc`. Created `.github/workflows/deploy-staging.yml` (deploys dashboard, website, and functions to staging on push to `staging` branch or manual dispatch). Created `packages/dashboard/.env.staging` template. Dashboard `environment.ts` already supports `VITE_ENVIRONMENT=staging`. **Remaining:** Create the `realyn-app-staging` Firebase project in the console and configure GitHub secrets.

### 12. Automate dashboard CI/CD ✅ DONE
- **File:** `.github/workflows/deploy-dashboard.yml`
- **Issue:** Dashboard workflow is `workflow_dispatch` only (manual). Website already auto-deploys on push to `main`.
- **Fix:** Change trigger to push-on-main with path filters matching the website workflow pattern.
- **Verified:** `deploy-dashboard.yml` already triggers on `push` to `main` with path filters for `packages/dashboard/**`, `packages/shared/**`, `package.json`, and `package-lock.json`, plus `workflow_dispatch` for manual runs.

### 13. Add basic test suite ✅ DONE
- **Dashboard:** Auth flow (login/logout/protected routes), dispute list loading, evidence upload. Use Vitest.
- **Functions:** Stripe/Adyen webhook handlers, auth middleware, dispute upsert logic. Jest config already exists.
- **Goal:** Confidence that the critical money path doesn't break when you ship. Not 90% coverage — critical paths only.
- **Implemented:** Wired `packages/core` tests to Jest (added `jest`, `ts-jest`, `@types/jest`, `jest.config.js`, `"test": "jest"` script). Set up Vitest in dashboard (added `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`; configured `vite.config.ts` test block and `src/test/setup.ts`). Wrote critical-path dashboard tests: `LoginPage.test.tsx`, `ProtectedRoute.test.tsx`, `DisputeTable.test.tsx`. Added `"test": "turbo test"` to root `package.json` and `test` task to `turbo.json`.

### 14. Add CI test and lint gates ✅ DONE
- **File:** New or updated `.github/workflows/` files
- Wire tests from step 13 into GitHub Actions so PRs can't merge broken code. ~30-line workflow file.
- **Implemented:** Added `core-test` and `dashboard-test` jobs to `.github/workflows/ci.yml`. The `core-test` job builds `packages/core` first (dependency). All run on PR to `main`.

### 15. Build self-service signup and onboarding ✅ DONE
- Registration page, email verification, org creation wizard ("Business / property name? Connect your Stripe/Adyen account.")
- This is the biggest single piece of work but it's what makes the product usable without manually creating accounts via Cloud Functions.
- Build *before* billing so there's a funnel to attach payments to.
- **Implemented:** Created `signupHandler` Cloud Function (verifies ID token, creates org + user docs in a batch, `syncUserClaims` trigger propagates custom claims). Built `SignupPage.tsx` (name, email, password, business/property name field with client-side validation — UI may still label this “hotel” in places, calls `createUserWithEmailAndPassword` then POSTs to `/signup`). Built `OnboardingPage.tsx` (3-step wizard: welcome, PSP connection with Stripe/Adyen/skip, done). Added `/signup` and `/onboarding` routes to `App.tsx`. Added "Sign up" link to `LoginPage.tsx`.

### 16. Build billing (Stripe Checkout + subscriptions) ✅ DONE
- Plan selection, checkout session, webhook for subscription status, customer portal for managing payment method/invoices.
- Depends on onboarding (step 15) so there's a place to put the paywall.
- **Implemented:** Defined `Plan`, `Subscription`, and `PlanFeatures` types in `packages/shared/src/billing.ts` with two plans (Starter $49/mo, Professional $149/mo). Extended `Organization` type with `subscription` field. Built `billingHandlers.ts` with `createCheckoutSession` (creates Stripe customer + checkout session with 14-day trial), `billingWebhook` (handles `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`), and `createBillingPortalSession`. Built `PlanSelector.tsx` (plan cards with monthly/yearly toggle), `BillingSettings.tsx` (current plan status + manage billing button), and `BillingPage.tsx`. Added `/billing` route to dashboard. Uses separate `STRIPE_BILLING_SECRET_KEY` secret to isolate billing Stripe from PSP dispute Stripe. **Remaining:** Create Stripe products/prices and set `VITE_STRIPE_PRICE_*` env vars.

### 17. Wire up Sentry (or equivalent) ✅ DONE
- **File:** `functions/src/utils/errorReporting.ts` (placeholder already exists)
- Connect to a real Sentry project, add the browser SDK to the dashboard, configure alerts.
- Do this before real customers so you catch issues before they report them.
- **Implemented:** Added `@sentry/node` to `functions/package.json`. Created `functions/src/utils/withErrorReporting.ts` wrapper that catches unhandled errors and reports via `ErrorReporter` (which forwards to Sentry when `SENTRY_DSN` is set). Added `@sentry/react` to `packages/dashboard/package.json`. Initialized Sentry in `packages/dashboard/src/index.tsx` (conditional on `VITE_SENTRY_DSN` env var) with `Sentry.ErrorBoundary` wrapping the app. Both are no-ops when DSN is not configured. **Remaining:** Create Sentry projects and set `SENTRY_DSN` / `VITE_SENTRY_DSN` env vars.

---

## Tier 4 — Weeks 3-4 (Production Polish)

### 18. Transactional email — implemented (hardening done)
- **Implemented:** Resend in [`functions/src/services/emailService.ts`](functions/src/services/emailService.ts); dispute create + outcome emails via [`functions/src/handlers/disputeNotificationTrigger.ts`](functions/src/handlers/disputeNotificationTrigger.ts); daily deadline reminders via [`functions/src/handlers/deadlineReminderScheduler.ts`](functions/src/handlers/deadlineReminderScheduler.ts) with **48h dedupe** using field `lastDeadlineReminderSentAt` on dispute docs; Gen2 **`RESEND_API_KEY` secret** bound to email-sending functions; invite email on [`createInvite`](functions/src/handlers/inviteHandlers.ts) rolls back the invite doc if send fails (503). **Dashboard base URL:** set runtime env `DASHBOARD_URL` on each affected Cloud Run service (triggers, scheduler, `createInvite`) so staging links match hosting — see checklist below and [`functions/.env.example`](functions/.env.example).
- **Remaining (optional):** Weekly digest email (not built); legal review of notification copy.

### 19. Invite / team management — implemented
- **Implemented:** Invites (`createInvite`, `listInvites`, `revokeInvite`, `acceptInvite`) plus org team APIs [`listTeamMembers`, `removeTeamMember`, `updateTeamMemberRole`](functions/src/handlers/teamHandlers.ts); dashboard [`TeamManagementPage.tsx`](packages/dashboard/src/features/team/TeamManagementPage.tsx) lists members, roles, remove; rate limits on invite/accept/team HTTP handlers. Global-admin user CRUD remains in [`userManagementHandler.ts`](functions/src/handlers/userManagementHandler.ts) for platform operators.

### 20. Legal pages — address filled; counsel external
- **Implemented:** Registered-office style text in [`packages/website/src/config/companyInfo.ts`](packages/website/src/config/companyInfo.ts) (consumed by Privacy / Terms). **Remaining:** Replace with your entity’s real Companies House / formation details; have counsel review Privacy, Terms, and DPA before claiming full GDPR compliance in sales.

### 21. Multi-environment — docs corrected
- **`shouldEnableTestHandlers()`** is used across seed handlers and [`requireTestHandlerAdmin`](functions/src/utils/authMiddleware.ts); the earlier roadmap line was stale.
- **Client Firebase config** is Vite-driven in [`packages/shared/src/services/firebase.ts`](packages/shared/src/services/firebase.ts) (no hardcoded production project).
- **Remaining ops:** Per-environment `DASHBOARD_URL` and secrets on deployed Functions; staging Firebase project + GitHub secrets as in Tier 3 §11.

### 22. Rate limit tuning — documented + presets extended
- **Policy:** Webhooks stay **fail-open**; AI, signup, invites, CSV import, export, deletion stay **fail-closed** (see [`functions/docs/RATE_LIMITS.md`](functions/docs/RATE_LIMITS.md)).
- **Changes:** Dedicated presets `signup`, `invite`, `inviteAccept`, `csvImport`; signup uses fail-closed IP limit; CSV import keyed per org (`org:{organizationId}`) instead of reusing `ai` limits.

---

## RAG Phase 1 — scaffolding shipped, waiting on content + wiring

Everything code-side is in place for retrieval-augmented generation. The
remaining work is content (rulebook PDFs) and pipeline wiring (injecting
retrieved context into the specialist prompts).

### 23. RAG infrastructure — done
- **Pinecone Serverless index** — target config locked in [`packages/ai-core/src/config/ragConfig.ts`](packages/ai-core/src/config/ragConfig.ts). Setup is idempotent via `npm run rag:setup` in `functions/`.
- **Embedding provider** — Pinecone Inference (`multilingual-e5-large`, 1024-dim cosine). One API key covers embedding + vector storage. Full rationale in [`docs/embedding-provider-setup.md`](docs/embedding-provider-setup.md).
- **Retrieval service** — `retrieveRulebookContext` / `retrieveSimilarCases` / `retrievePolicyContext` in [`packages/ai-core/src/services/ragService.ts`](packages/ai-core/src/services/ragService.ts). Fail-safe: returns empty result on error so RAG never blocks the deterministic pipeline.
- **Ingestion pipeline** — [`functions/src/scripts/ingestRulebooks.ts`](functions/src/scripts/ingestRulebooks.ts): PDF → heading-aware chunks → embed → upsert with deterministic content-addressed IDs, dry-run and sample modes.
- **Smoke test** — [`functions/src/scripts/testRagRetrieval.ts`](functions/src/scripts/testRagRetrieval.ts).
- **Eval workflow** — [`docs/eval/`](docs/eval/README.md) template for before/after comparisons.

### 24. RAG Phase 1 — remaining
- [ ] `npm run rag:setup` against the production Pinecone project.
- [ ] Source rulebook PDFs (public `Visa Public Rules` + MC Chargeback Guide as a starting point; acquirer-provided or licensed versions later).
- [ ] Capture a pre-RAG baseline per [`docs/eval/rag-baseline-template.md`](docs/eval/rag-baseline-template.md) on ~5–10 representative disputes.
- [ ] Ingest via `npm run rag:ingest`.
- [ ] Wire `retrieveRulebookContext` into [`packages/ai-core/src/services/evidencePlanner.ts`](packages/ai-core/src/services/evidencePlanner.ts) (evidence requirements) and [`packages/ai-core/src/services/argumentGenerator.ts`](packages/ai-core/src/services/argumentGenerator.ts) (argument drafting) — retrieved context is injected as a `## REFERENCE MATERIAL` section via `formatRetrievedContext`.
- [ ] Re-run the eval; compare to baseline.
- [ ] Add `PINECONE_API_KEY` to the Cloud Functions runtime checklist below.

### 25. RAG Phase 2/3 (future, out of scope here)
- Past-case ingestion (`cases` namespace) — anonymised won/lost disputes to surface successful argument patterns.
- Org policy ingestion (`policies` namespace) — merchant refund/cancellation policy documents stored alongside their uploaded evidence.

---

## Tier 5 — Before Scaling (Growth Readiness)

### 23. Customer support widget
- Intercom, Crisp, or similar.

### 24. Usage analytics
- Track what features customers actually use.

### 25. Help center / documentation
- For merchant staff end users (hospitality, ticketing, and other verticals).

### 26. Abuse prevention
- Anomaly detection on webhook volume, beyond basic rate limits.

---

## CI/CD and runtime secrets checklist

Use this when wiring **staging** (`realyn-app-staging`) or **production** so hosted builds and Functions are not missing env.

### GitHub Actions (dashboard Vite build)

| Item | Production workflow | Staging workflow |
|------|---------------------|------------------|
| Firebase web app | Secrets `DASHBOARD_VITE_FIREBASE_API_KEY`, `DASHBOARD_VITE_FIREBASE_MESSAGING_SENDER_ID`, `DASHBOARD_VITE_FIREBASE_APP_ID` | `STAGING_VITE_FIREBASE_*` (same suffixes) |
| Stripe price IDs (billing UI) | `DASHBOARD_VITE_STRIPE_PRICE_STARTER_MONTHLY` / `_YEARLY`, `DASHBOARD_VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY` / `_YEARLY` | `STAGING_VITE_STRIPE_PRICE_*` |
| Sentry (optional) | `DASHBOARD_VITE_SENTRY_DSN` | `STAGING_VITE_SENTRY_DSN` |
| Website URL (optional) | Variable `DASHBOARD_VITE_WEBSITE_URL` (defaults to `https://realyn.app`) | Variable `STAGING_VITE_WEBSITE_URL` (see workflow default) |
| Hosting deploy SA | `FIREBASE_SERVICE_ACCOUNT_REALYN_APP` | `FIREBASE_SERVICE_ACCOUNT_REALYN_APP_STAGING` |

Workflow files: [`.github/workflows/deploy-dashboard.yml`](.github/workflows/deploy-dashboard.yml), [`.github/workflows/deploy-staging.yml`](.github/workflows/deploy-staging.yml). Local templates: [`packages/dashboard/.env.example`](packages/dashboard/.env.example), [`packages/dashboard/.env.staging`](packages/dashboard/.env.staging).

### Cloud Functions (runtime)

| Item | Notes |
|------|--------|
| `SENTRY_DSN` | Read in [`functions/src/utils/errorReporting.ts`](functions/src/utils/errorReporting.ts). Set on the deployed Gen2 environment (Google Cloud Console → Cloud Run service for each function, or your usual Firebase/GCP env mechanism). Not injected by the hosting workflows above. |
| `RESEND_API_KEY` | Secret for Resend; bound on [`disputeNotificationTrigger`](functions/src/handlers/disputeNotificationTrigger.ts), [`deadlineReminderScheduler`](functions/src/handlers/deadlineReminderScheduler.ts), and [`createInvite`](functions/src/handlers/inviteHandlers.ts). `firebase functions:secrets:set RESEND_API_KEY`. |
| `DASHBOARD_URL` | Non-secret env: base URL for email and invite links. Set per Cloud Run service (production vs staging dashboard). See [`functions/src/config/emailAndDashboardParams.ts`](functions/src/config/emailAndDashboardParams.ts) and [`functions/.env.example`](functions/.env.example). |
| `PINECONE_API_KEY` | Secret for Pinecone Serverless (RAG retrieval + ingestion). Bind on any function that calls `retrieveRagContext` or related helpers; also required by the `rag:setup` / `rag:ingest` / `rag:test` scripts. `firebase functions:secrets:set PINECONE_API_KEY`. |
| `PINECONE_INDEX_NAME` | Optional non-secret env: override the default `realyn-rag` index. Use distinct names per environment (e.g. `realyn-rag-staging`) to prevent staging ingestion from writing into the production index. |
| Other secrets | `defineSecret` values in [`functions/src/index.ts`](functions/src/index.ts) (e.g. Stripe, Anthropic) — set via `firebase functions:secrets:set` as already documented for your project. |

---

## Summary

| When | Items | What | Why |
|------|-------|------|-----|
| Today | 1-6 | Security lockdown | You're exposed right now |
| This week | 7-10 | Bug fixes | Broken functionality |
| Week 1-2 | 11-17 | Commercial foundation | Makes the product sellable |
| Week 3-4 | 18-22 | Production polish | Makes it professional |
| After launch | 23-26 | Growth | Scale and retention |

**Critical path to first revenue:** Security lockdown (1-6) → Staging env (11) → Onboarding (15) → Billing (16)

**Estimated timeline to minimum viable commercial product:** 4-6 focused weeks assuming full-time effort.
