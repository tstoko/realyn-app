# RAG Phase 1 — Agent Handoff

> Living state document for autonomous Cloud Agents working through RAG Phase 1.
> This is the **first place a fresh agent should read** when picking up RAG work.
> Updated when state changes — feel free to edit it as you go.

> **Status as of 2026-05-02:** PRs #11, #12, #13 all in review. `PINECONE_API_KEY` + `PINECONE_INDEX_NAME=realyn-rag-dev` saved in Cursor secrets and verified reachable in agent VMs. Pinecone Serverless index `realyn-rag-dev` provisioned in `aws/us-east-1` (free Starter plan). **Rulebooks ingested:** Visa Core + Product/Service Rules (2026-04-18, 896 chunks) + Mastercard Chargeback Guide Merchant Edition (2025-05-13, 1388 chunks) = **2284 vectors** in the `rulebooks` namespace. Hybrid retrieval confirmed working end-to-end against real queries (Visa 13.1 → tables 11-94/11-95, MC 4853 → right reason-code sections, scores 10+). The remaining Workstream-C work (C3, C7, C8, C9) is all blocked on credentials or human grading — see [What's left after PR #13](#whats-left-after-pr-13).

---

## TL;DR for the next agent

1. **Before reading this doc, check which Cursor secrets your VM got.** `echo "${PINECONE_API_KEY:+set}"` should print `set`; `echo "${FIREBASE_TOKEN:+set}"` and `echo "${GOOGLE_APPLICATION_CREDENTIALS_JSON:+set}"` tell you which of the remaining Workstream-C items are unblocked. If `PINECONE_API_KEY` is empty, see [Troubleshooting](#troubleshooting-secrets-not-reachable).
2. **The index is already provisioned and populated.** Do **not** re-run `rag:setup` or `rag:ingest` unless you explicitly want to rebuild — re-ingest bills against the Starter token-per-minute cap (~6 minutes wall time with 429 retries). To sanity-check state, run one `rag:test` query (see [Quick reference](#quick-reference--common-commands)) and confirm you get Visa or Mastercard hits at scores 10+.
3. **Pick work based on what credentials you have.** The unblocked branches are listed in [What's left after PR #13](#whats-left-after-pr-13). If you have none of the missing creds, the only sanctioned agent-autonomous work is doc cleanup + pre-filling the C3 baseline skeleton (structure only; grading is a human step).
4. **Branching rule.** Stack new work **on top of PR #13** (`cursor/rag-phase-1-provisioning-4164`) unless the user says otherwise. Merge order is #11 → #12 → #13. Do not merge in an agent session.
5. **Cloud + region default to `aws/us-east-1`** because the Pinecone organisation is on the free Starter plan (only AWS Virginia is allowed). If you ever re-run `rag:setup` and it fails with a "free plan does not support indexes in <region>" error, see [Free-tier vs paid-tier deployment](#free-tier-vs-paid-tier-deployment).

---

## Master plan

The full plan lives in [`docs/post-hardening-plan.md`](post-hardening-plan.md). The relevant cursor for this work is **Workstream C — RAG Phase 1**. Items already done by prior agents:

| Item | Status | Where |
|---|---|---|
| C6 — wire retrieval into evidencePlanner + argumentGenerator | ✅ Done | PR #11 |
| RAG architecture corrections (dotproduct, L2 norm, hybrid, rerank) | ✅ Done | PR #12 |
| C1 — provision Pinecone index | ✅ Done | PR #13 (`realyn-rag-dev` in `aws/us-east-1`) |
| C2 — source rulebook PDFs | ✅ Done | PR #13 (Visa public URL + user-supplied Mastercard PDF) |
| C4 — dry-run ingestion | ✅ Done | PR #13 (verified on Visa PDF) |
| C5 — real ingestion | ✅ Done | PR #13 (2284 vectors in `rulebooks` namespace) |
| C3 — pre-RAG baseline grading | 🔒 **Blocked** on `GOOGLE_APPLICATION_CREDENTIALS_JSON` + human grading | Plan allows pre-filling doc structure autonomously |
| C7 — bind PINECONE_API_KEY on Cloud Functions, deploy | 🔒 **Blocked** on `FIREBASE_TOKEN` | Not in Cursor secrets |
| C8 — re-run eval, compare to baseline | ⏸️ Blocked on C3 + C7 | |
| C9 — production cutover | ⏸️ Blocked on C8 | |

---

## Locked architecture (do not change without asking)

These were decided through a long thread with the user. Override only with explicit permission.

### Vendor stack

**Two AI vendors, no third.** Anthropic for the LLM, Pinecone for everything else (dense embeddings, sparse encoding, vector storage, reranking — all under one `PINECONE_API_KEY`).

**Voyage AI was rejected.** PR #12's commit history shows a Voyage adapter being added then removed. The trade-off was ~5–10 retrieval-quality points on legal text vs a third vendor account / API key. User chose Pinecone-only. **Don't propose adding Voyage back.** If post-ingest evals (§C8) show retrieval is the bottleneck, re-evaluate then — but only with explicit user agreement.

### Schema-v2 invariants (from `packages/ai-core/src/config/ragConfig.ts`)

| Constant | Value | Notes |
|---|---|---|
| `EMBEDDING_MODEL` | `multilingual-e5-large` | Pinecone Inference, 1024 dim |
| `PINECONE_METRIC` | `dotproduct` | Required for single-index hybrid; cosine doesn't work |
| `RAG_SCHEMA_VERSION` | `2` | Bump + re-ingest if changing model, metric, normalisation, or chunking |
| `RAG_HYBRID_ALPHA` | `0.5` | Balanced dense/sparse; client-side scaled via `applyAlpha` |
| `RERANK_MODEL` | `cohere-rerank-3.5` | Configured but not enabled |
| `RERANK_CANDIDATE_K` | `20` | Top-K from hybrid that gets reranked |

**Dense vectors are L2-normalised at upsert AND query time.** This is what makes dotproduct equivalent to cosine. If you ever bypass `embedDocuments` / `embedQuery` and call the Pinecone SDK directly, you must `l2Normalize` before upsert/query — there's an exported helper in `embeddingService.ts`.

**Hybrid alpha is implemented client-side.** Pinecone has no native `alpha` flag — `applyAlpha(dense, sparse, alpha)` scales the query vectors before sending. See `sparseEmbeddingService.ts`.

### Feature flags

| Env var | Default | Polarity | Effect |
|---|---|---|---|
| `RAG_RETRIEVAL_ENABLED` | ON | literal `"false"` disables | Feature flag for the whole retrieve-and-inject path |
| `RERANK_ENABLED` | OFF | literal `"true"` enables | Cross-encoder rerank on top of hybrid |

The polarities are deliberately inverted. `RAG_RETRIEVAL_ENABLED` defaults ON because retrieval is fail-safe (empty chunks = original behaviour). `RERANK_ENABLED` defaults OFF because rerank is a more invasive feature with vendor-tier risk — it should not run accidentally before the Pinecone tier is verified.

**Do not flip `RERANK_ENABLED=true` without first running a probe call against the Pinecone account and confirming rerank is on the tier and not rate-limit-constrained.** The plan calls this out at §C7.

---

## Free-tier vs paid-tier deployment

The Pinecone organisation is currently on the **free Starter plan**. The codebase is configured to work on Starter today, with a low-friction upgrade path to a paid plan later.

### What's tier-sensitive

| Concern | Starter (current) | Standard / Enterprise |
|---|---|---|
| Allowed cloud + region for serverless indexes | `aws/us-east-1` only | All regions, including `gcp/us-central1` (co-locates with Cloud Functions) |
| Storage cap per project | 2 GB | None / contractual |
| Indexes per project | 5 | 20 / 200 |
| `cohere-rerank-3.5` (the default `RERANK_MODEL`) | **Not available** | Unlimited |
| `bge-reranker-v2-m3`, `pinecone-rerank-v0` | 500 reqs/month each | Unlimited |
| Inference rate limits (embed + sparse + rerank) | 100 rps / 2000 rpm | Same 100 rps / 2000 rpm |

### What's hard-coded vs configurable

Configurable (env-driven, no code change to switch):

- `PINECONE_INDEX_NAME` — already env-driven via `getPineconeIndexName()`.
- `PINECONE_CLOUD` — env-driven via `getPineconeCloud()`. Default `aws`.
- `PINECONE_REGION` — env-driven via `getPineconeRegion()`. Default `us-east-1`.

Hard-coded (changing requires a re-ingest, in some cases a schema-version bump):

- `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `PINECONE_METRIC`, dense L2-normalisation, sparse encoder, hybrid alpha defaults, chunk sizes, schema version. These are the load-bearing invariants from §[Schema-v2 invariants](#schema-v2-invariants-from-packagesai-coresrcconfigragconfigts) and are intentionally not configurable.
- `RERANK_MODEL` — locked to `cohere-rerank-3.5`. Not available on Starter; if rerank is ever enabled while on Starter, swap to `bge-reranker-v2-m3` or `pinecone-rerank-v0` in the same commit. This is fine today because `RERANK_ENABLED` defaults OFF.

### Upgrade recipe (Starter → Standard, GCP co-location)

When the Pinecone org gets upgraded:

1. Upgrade the Pinecone organisation to Standard (or Enterprise) in the Pinecone console.
2. Pick a new index name, e.g. `realyn-rag-gcp` — Pinecone serverless cloud + region are immutable on an existing index, so co-location requires a fresh index.
3. Set the env vars on whoever runs ingestion + on the deployed Cloud Functions:
   ```
   PINECONE_INDEX_NAME=realyn-rag-gcp
   PINECONE_CLOUD=gcp
   PINECONE_REGION=us-central1
   ```
4. Run `cd functions && npm run rag:setup` — creates the new index in `gcp/us-central1`.
5. Run `cd functions && npm run rag:ingest -- --file PATH …` for each rulebook to repopulate the new index.
6. Once retrieval looks healthy on the new index, delete the old AWS index and remove `PINECONE_INDEX_NAME` overrides (or keep the override pointing at the new name).

No code changes needed for the region switch. `RERANK_ENABLED=true` is now safe to consider once verified against the upgraded tier (see §C7 of the master plan).

---

## What's in Cursor secrets right now

| Secret | Set? | Notes |
|---|---|---|
| `PINECONE_API_KEY` | ✅ Saved + verified reachable in agent VMs (PR #13 ingested against it) | Required for all Pinecone calls |
| `PINECONE_INDEX_NAME` | ✅ Saved as `realyn-rag-dev` | Falls back to `realyn-rag` if unset; setting it explicitly avoids prod/dev collisions |

**Not in Cursor secrets** (would need user action if you need them):

- `FIREBASE_TOKEN` — would unblock A1 (Firestore index deploy) and C7 (Functions deploy + secrets:set).
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — would unblock A2 (Cloud Run env vars), C7 partial, and C3/C8 (read staging disputes for eval baseline).
- `GH_ADMIN_TOKEN` — would unblock A3 (delete dead Sentry secrets).
- `STRIPE_SECRET_KEY_TEST` — A4 partial, deliberately deferred (Stripe smoke testing skipped per user).
- `VOYAGE_API_KEY` — N/A, Voyage was rejected.

If you find you need any of these, **ask the user before suggesting they add it**. The user has been deliberately conservative about credential sprawl.

---

## Awaiting decisions

Things the user has not decided yet. **Don't unilaterally pick.**

### C3 — Pre-RAG baseline grading

The plan says **DO NOT SKIP**. But this needs:

- 5–10 representative disputes pulled from staging Firestore (needs `GOOGLE_APPLICATION_CREDENTIALS_JSON` — not in secrets).
- Human grading of the outputs on coverage / accuracy / tone.

You can pre-fill the eval doc structure (`docs/eval/$(date +%Y-%m)-rag-phase1-baseline.md`) but you can't do the grading without the user. Template is at [`docs/eval/rag-baseline-template.md`](eval/rag-baseline-template.md).

### Whether to deploy RAG at all

The user asked good questions throughout:

- "Do we need this pinecone stuff?"
- "Can we not do this without pinecone and just create it ourselves?" *(referring to the existing `schemeRules` Firestore collection, which already supports verbatim rule citations via the `citations: SchemeRuleCitation[]` field on `SchemeRule`)*
- "RAG would make the AI architecture we've built much more accurate" *(user's eventual call: yes, do it)*

**Don't re-litigate the decision.** It's been made. But also don't push them deeper into RAG complexity without checking — the user values simplicity over completeness.

---

## Communication preferences from the user

Patterns observed across the conversation. Hold to these unless the user signals otherwise.

- **Concise.** Walls of text get short replies; the user often asks "what is X?" or "difference between these?" wanting a tight answer with concrete examples.
- **Push back on unnecessary complexity.** When asked to do something, ask whether it's actually needed. The user explicitly preferred Pinecone-only over Voyage and would have been happy with even-simpler architectures (curated `schemeRules` Firestore docs).
- **No new vendors without explicit ask.** Two AI vendors (Anthropic + Pinecone) is the line.
- **Honest about trade-offs.** If something has costs, say so — including engineering complexity, vendor surface area, ongoing maintenance.
- **Honest about what you don't know.** Don't claim latency numbers you haven't measured. Don't promise quality lifts that need to be evaluated.
- **One decision at a time.** When multiple paths are possible, lay them out and ask. Don't try to make 4 architectural decisions in one response.

---

## Branches and PRs

| Branch | PR | Status | Base |
|---|---|---|---|
| `cursor/post-hardening-plan-execution-47d1` | [#11](https://github.com/tstoko/realyn-app/pull/11) | Draft, in review | `main` |
| `cursor/rag-architecture-corrections-47d1` | [#12](https://github.com/tstoko/realyn-app/pull/12) | Draft, in review | `cursor/post-hardening-plan-execution-47d1` |
| `cursor/rag-phase-1-provisioning-4164` | [#13](https://github.com/tstoko/realyn-app/pull/13) | Draft, in review | `cursor/rag-architecture-corrections-47d1` |

Merge order: #11 → #12 → #13. Don't merge them in an agent session — the user wants to review.

If you do follow-up RAG work and need to check it in, **branch off `cursor/rag-phase-1-provisioning-4164`** (PR #13's head) since that's the only branch where the Pinecone index config + sparse-parser fix + pdf-parse@2 fix + 429-retry fix are all present. Suggested branch name: `cursor/<descriptive>-XXXX`.

---

## What's left after PR #13

PR #13 left Workstream C in this state:

| Next item | Blocker | What an agent can do autonomously |
|---|---|---|
| **C3 — pre-RAG baseline** | `GOOGLE_APPLICATION_CREDENTIALS_JSON` (read staging Firestore to pick 5–10 representative disputes) + human grading | Pre-fill the baseline doc structure in `docs/eval/YYYY-MM-rag-phase1-baseline.md` — see [`docs/post-hardening-plan.md`](post-hardening-plan.md) §C3 last paragraph. Do **not** invent dispute IDs or grade outputs. |
| **C7 — Cloud Functions deploy + secret bind** | `FIREBASE_TOKEN` (secrets:set + deploy) and Cloud Run permissions. Test handlers also need `PINECONE_API_KEY` added to the `onRequest({ secrets: [...] })` array in `functions/src/handlers/aiDisputeHandlers.ts` — small code change, no creds needed for the code part. | The code-side change (adding `PINECONE_API_KEY` to the handler's `secrets` array) can be made on a feature branch and PR'd without credentials. The `firebase functions:secrets:set` and `firebase deploy` steps cannot. |
| **C8 — post-RAG eval** | Blocked on C3 + C7. | None before C3 + C7 are done. |
| **C9 — production cutover** | Blocked on C8. | None. |

### Ops follow-ups still open

From [`docs/post-hardening-plan.md`](post-hardening-plan.md) Workstream A / B, these remain:

| Item | Blocker | Notes |
|---|---|---|
| A1 — deploy Firestore composite index | Firebase CLI + deploy creds | `firebase.indexes.json` is already correct; deploy is a one-liner. |
| A2 — set `DASHBOARD_URL` on billing Cloud Run services | `gcloud` + project-owner perms | Documented in the plan. |
| A3 — remove dead Sentry GitHub secrets | `GH_ADMIN_TOKEN` | One-liner via `gh secret delete`. |
| A4 — staging smoke-test checklist | Staging creds + Stripe CLI | Partially covered by B4's automated tests. |
| A5 — clean up `docs/* 2` Finder dupes | None | Already verified clean on `main`. |
| B1 — Anthropic SDK 0.39 → 0.91 | None | **Done** in PR #11. |
| B2 — tighten `winPatterns` rules | None | **Resolved** as no-change decision + documentation. |
| B3 — delete `packages/core/` | None | **Done** in PR #11 (option 2 chosen). |
| B4 — handler test backfill | None | **Done** in PR #11 (billing + AI handler critical paths). |

---

## Quick reference — common commands

From repo root:

```bash
# Build ai-core (functions depends on its dist/)
cd packages/ai-core && npm run build

# Type check ai-core
cd packages/ai-core && npm run typecheck

# Run ai-core tests
cd packages/ai-core && npm test

# Type check functions (after ai-core is built)
cd functions && npx tsc --noEmit

# Run functions tests
cd functions && npm test

# Provision the Pinecone index (idempotent; already provisioned as of PR #13)
cd functions && npm run rag:setup

# Smoke-query the index — takes the query as a CLI flag
cd functions && node --env-file=.env lib/scripts/testRagRetrieval.js \
  --q "What evidence defends a Visa 13.1 chargeback?" \
  --network visa --topK 5

# Re-ingest rulebooks (only if you intentionally want to rebuild the index;
# bills against the Starter 250K tokens-per-min budget, takes ~6m with retries)
cd functions && npm run rag:ingest -- \
  --file /abs/path/to/rulebook.pdf \
  --network visa --name "Visa Core Rules and Visa Product and Service Rules" --version 2026-04-18
```

Running `npm run rag:setup` or `rag:test` requires `PINECONE_API_KEY` in env (already in Cursor secrets). For local shells, put it in `functions/.env`:

```bash
cd functions
cat > .env <<EOF
PINECONE_API_KEY=$PINECONE_API_KEY
PINECONE_INDEX_NAME=$PINECONE_INDEX_NAME
EOF
```

---

## Troubleshooting — secrets not reachable

If `echo "${PINECONE_API_KEY:+set}"` returns empty:

1. **Confirm the secret is saved at the right scope.** Cursor Dashboard → Cloud Agents → Secrets. Should be either user-account-scoped or `tstoko/realyn-app`-repo-scoped.
2. **Confirm the exact name.** `PINECONE_API_KEY` — all caps, single underscores. Typos like `PINECONE_KEY` or `PINECONE_API_TOKEN` won't match.
3. **If your VM started before the secret was saved**, secrets are injected at agent-VM-creation time, not on every command. End the current agent session and start a new one. The new VM will boot with the secrets in env.
4. **Tell the user if 1–3 don't fix it.** Don't try to work around it by hard-coding keys, asking them to paste in chat, or any other unsafe path.

---

## Files added in PR #11 / #12 / #13 worth knowing about

From PR #11 (retrieval wiring + ops follow-ups):

- `packages/ai-core/src/services/ragPromptInjection.ts` — the `## REFERENCE MATERIAL` block format and feature-flag gate.
- `packages/ai-core/src/services/ragService.ts` — retrieval orchestration, hybrid query path.

From PR #12 (schema v2 + hybrid + rerank):

- `packages/ai-core/src/services/embeddingService.ts` — Pinecone Inference dense embeddings + L2 normalisation. (Token-rate 429 retry added in PR #13.)
- `packages/ai-core/src/services/sparseEmbeddingService.ts` — sparse encoder + `applyAlpha`. (SDK-7.x flat-shape parser + 429 retry fixed in PR #13.)
- `packages/ai-core/src/services/rerankService.ts` — `RerankPort` + `maybeRerank` (gated on `RERANK_ENABLED`).
- `functions/src/services/ai/pineconeVectorStore.ts` — concrete Pinecone-backed adapter.
- `functions/src/services/ai/pineconeRerank.ts` — concrete Pinecone-Inference rerank adapter.
- `functions/src/scripts/setupPineconeIndex.ts` — `npm run rag:setup` entry point. (Cloud/region getters wired in PR #13.)
- `functions/src/scripts/ingestRulebooks.ts` — `npm run rag:ingest` entry point. (`pdf-parse@2` class API fixed in PR #13.)
- `functions/src/scripts/testRagRetrieval.ts` — `npm run rag:test` entry point.

From PR #13 (provisioning + ingest):

- `packages/ai-core/src/config/ragConfig.ts` — `getPineconeCloud()` / `getPineconeRegion()` env-driven getters (defaults `aws/us-east-1`). `PINECONE_CLOUD` / `PINECONE_REGION` are the override knobs.
- `functions/.env.example` — documents `PINECONE_*` env vars including the region-immutability constraint.
- `docs/rag-phase-1-handoff.md` — this file's [Free-tier vs paid-tier deployment](#free-tier-vs-paid-tier-deployment) section was added in PR #13.

All of these have inline comments explaining the design decisions; read them before refactoring anything.
