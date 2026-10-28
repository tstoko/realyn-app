# Project status

Realyn is an experimental side project for exploring dispute workflows and AI-assisted evidence preparation. This page describes repository scope, not a deployment audit.

## Implementation and limits

### Dashboard and backend

The repository contains a case dashboard, evidence workflows, Firebase handlers, and automated tests. Local development uses Auth, Firestore, Storage, and Functions emulators. External services still require separate credentials.

### Stripe and Adyen

Webhook, mapping, sync, and submission implementations exist under [the PSP services](../functions/src/services/psp/) and [submission handlers](../functions/src/handlers/submitDisputeResponse.ts). This supports describing them as integration code. It does not establish end-to-end validation for every account, dispute type, API version, or deployment. No universal PSP support or certification is claimed.

Submission handlers include retry logic. That does not establish exactly-once delivery or guaranteed receipt reconciliation.

### AI and retrieval

[AI core](../packages/ai-core/src/) includes provider integrations, specialist modules, and retrieval helpers. Generated plans, recommendations, and arguments can be wrong and need review against the actual evidence. Strategy scores are heuristics, not calibrated win probabilities.

The [2026-05-02 baseline](eval/2026-05-rag-phase1-baseline.md) explicitly records a pre-retrieval run with Pinecone unavailable to the deployed Functions. It is a dated observation, not proof of today's deployment state. Retrieval and reranking should be described as configurable experiments until a reproducible run demonstrates their use and quality.

### Audit and privacy helpers

[Dispute activity entries](../functions/src/utils/auditTrailHelper.ts) are appended to a Firestore document array; [organization events](../functions/src/utils/orgAuditLogger.ts) are separate Firestore documents. These are application logs. Their presence does not establish tamper-proof or immutable storage.

[PII sanitization](../packages/ai-core/src/utils/piiSanitizer.ts) replaces selected structured fields and text patterns. Pattern matching can miss identifying information. No blanket anonymization or compliance guarantee follows from this helper.

### Examples and earlier business work

Hospitality and ticketing configurations, named demo fixtures, website copy, billing code, and commercial planning documents reflect experiments in the repository. Demo names do not establish customer relationships. Legal drafts and security checklists do not certify the application or show that a deployment has been reviewed.

## Near-term priorities

1. Reproduce setup from a clean checkout and simplify the local fixture path.
2. Record processor test-mode scenarios with inputs, expected results, and API versions.
3. Evaluate AI drafts on fixed synthetic cases with a factual-accuracy rubric.
4. Identify which workflows call external services and document their configuration.
5. Bring older website copy and planning notes into line with the side-project framing.

These are directions for future work, without delivery dates or support commitments.

## Reading older documents

[PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md) is an earlier commercial planning record. Its checkmarks, deadlines, security assertions, and estimates have not been revalidated by this documentation pass. Use source code and fresh checks to assess implementation, and inspect the relevant deployment to assess runtime behavior.

