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

### 7. Fix collection naming mismatch
- **Files:** `functions/src/services/disputeHistoryService.ts` (uses `disputes_history`), `functions/src/services/dataRetentionService.ts` (references `disputeHistory`)
- **Issue:** Data retention cleanup silently misses archived disputes, or archives go to the wrong collection.
- **Fix:** Pick one name, update all references.

### 8. Add `framer-motion` to dashboard dependencies
- **File:** `packages/dashboard/package.json`
- **Issue:** `LoginPage.tsx` imports `framer-motion` which isn't declared — it works by accident via workspace hoisting. Clean install or CI build will break.
- **Fix:** `npm install framer-motion` in the dashboard package.

### 9. Replace mock activity log with real data
- **File:** `packages/dashboard/src/hooks/useActivityLog.ts`
- **Issue:** Returns hardcoded mock entries. A paying customer seeing fake data destroys trust instantly.
- **Fix:** Wire to the `auditLog` subcollection that already exists under organizations, or hide the Activity page behind a feature flag until real data is available.

### 10. Add security headers to Firebase Hosting
- **File:** `firebase.json`
- **Issue:** No CSP, HSTS, X-Frame-Options, or X-Content-Type-Options. Security-conscious hotel IT teams will check for these.
- **Fix:** Add a `headers` block to the hosting config with standard SaaS security headers.

---

## Tier 3 — Next 1-2 Weeks (Sellable Product Foundation)

This is where the product goes from "working demo" to "thing someone can actually buy." Order matters due to dependencies.

### 11. Set up a staging environment
- Create a second Firebase project (e.g. `realyn-app-staging`). All subsequent work should be testable without touching production.
- Unblocks safe iteration on everything below.

### 12. Automate dashboard CI/CD
- **File:** `.github/workflows/deploy-dashboard.yml`
- **Issue:** Dashboard workflow is `workflow_dispatch` only (manual). Website already auto-deploys on push to `main`.
- **Fix:** Change trigger to push-on-main with path filters matching the website workflow pattern.

### 13. Add basic test suite
- **Dashboard:** Auth flow (login/logout/protected routes), dispute list loading, evidence upload. Use Vitest.
- **Functions:** Stripe/Adyen webhook handlers, auth middleware, dispute upsert logic. Jest config already exists.
- **Goal:** Confidence that the critical money path doesn't break when you ship. Not 90% coverage — critical paths only.

### 14. Add CI test and lint gates
- **File:** New or updated `.github/workflows/` files
- Wire tests from step 13 into GitHub Actions so PRs can't merge broken code. ~30-line workflow file.

### 15. Build self-service signup and onboarding
- Registration page, email verification, org creation wizard ("What's your hotel name? Connect your Stripe/Adyen account.")
- This is the biggest single piece of work but it's what makes the product usable without manually creating accounts via Cloud Functions.
- Build *before* billing so there's a funnel to attach payments to.

### 16. Build billing (Stripe Checkout + subscriptions)
- Plan selection, checkout session, webhook for subscription status, customer portal for managing payment method/invoices.
- Depends on onboarding (step 15) so there's a place to put the paywall.

### 17. Wire up Sentry (or equivalent)
- **File:** `functions/src/utils/errorReporting.ts` (placeholder already exists)
- Connect to a real Sentry project, add the browser SDK to the dashboard, configure alerts.
- Do this before real customers so you catch issues before they report them.

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
