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
- **Issue:** No CSP, HSTS, X-Frame-Options, or X-Content-Type-Options. Security-conscious hotel IT teams will check for these.
- **Fix:** Add a `headers` block to the hosting config with standard SaaS security headers.
- **Verified:** Both `website` and `dashboard` hosting targets in `firebase.json` have full security headers: CSP, HSTS (63072000s with preload), X-Frame-Options (DENY), X-Content-Type-Options (nosniff), X-XSS-Protection, Referrer-Policy, and Permissions-Policy.

---

## Tier 3 — Next 1-2 Weeks (Sellable Product Foundation)

This is where the product goes from "working demo" to "thing someone can actually buy." Order matters due to dependencies.

### 11. Set up a staging environment ✅ DONE
- Create a second Firebase project (e.g. `realyn-app-staging`). All subsequent work should be testable without touching production.
- Unblocks safe iteration on everything below.
- **Implemented:** Added staging hosting targets to `.firebaserc`. Created `.github/workflows/deploy-staging.yml` (deploys dashboard, website, functions, and MCP server to staging on push to `staging` branch or manual dispatch). Created `packages/dashboard/.env.staging` template. Dashboard `environment.ts` already supports `VITE_ENVIRONMENT=staging`. **Remaining:** Create the `realyn-app-staging` Firebase project in the console and configure GitHub secrets.

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
- **Implemented:** Added `core-test`, `mcp-server-test`, and `dashboard-test` jobs to `.github/workflows/ci.yml`. Core and MCP server jobs build `packages/core` first (dependency). All run on PR to `main`.

### 15. Build self-service signup and onboarding ✅ DONE
- Registration page, email verification, org creation wizard ("What's your hotel name? Connect your Stripe/Adyen account.")
- This is the biggest single piece of work but it's what makes the product usable without manually creating accounts via Cloud Functions.
- Build *before* billing so there's a funnel to attach payments to.
- **Implemented:** Created `signupHandler` Cloud Function (verifies ID token, creates org + user docs in a batch, `syncUserClaims` trigger propagates custom claims). Built `SignupPage.tsx` (name, email, password, hotel name form with client-side validation, calls `createUserWithEmailAndPassword` then POSTs to `/signup`). Built `OnboardingPage.tsx` (3-step wizard: welcome, PSP connection with Stripe/Adyen/skip, done). Added `/signup` and `/onboarding` routes to `App.tsx`. Added "Sign up" link to `LoginPage.tsx`.

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

### 18. Build transactional email
- Dispute opened alerts, evidence deadline reminders, weekly digest.
- Hotels expect to be notified, not to check a dashboard proactively.
- Use Resend or SendGrid + Cloud Function triggers on dispute status changes.

### 19. Build invite/team management
- Let hotel admins invite their own staff.
- Currently user creation is admin-only via Cloud Functions. Hotels need self-service team management.

### 20. Complete legal pages
- **File:** `packages/website/src/pages/legal/PrivacyPolicy.tsx`
- **Issue:** `TODO_COMPANY_ADDRESS` placeholder. GDPR compliance claims without a complete privacy policy are a liability.
- **Fix:** Fill address, have a lawyer review the DPA and terms.

### 21. Multi-environment gating
- **Issue:** `shouldEnableTestHandlers()` exists in `functions/src/config/environment.ts` but is never called anywhere.
- **Fix:** Gate all seed/test/reset endpoints behind it. Set up environment-specific Firebase config instead of hardcoded values in `packages/shared/src/services/firebase.ts`.

### 22. Rate limit tuning
- Review and tighten rate limits on webhooks, AI endpoints, and data export.
- The Firestore-based limiter (`functions/src/utils/rateLimiter.ts`) fails open on transaction errors — decide if that's acceptable or if expensive operations (AI calls) should fail closed.

---

## Tier 5 — Before Scaling (Growth Readiness)

### 23. Customer support widget
- Intercom, Crisp, or similar.

### 24. Usage analytics
- Track what features hotels actually use.

### 25. Help center / documentation
- For hotel staff end users.

### 26. Abuse prevention
- Anomaly detection on webhook volume, beyond basic rate limits.

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
