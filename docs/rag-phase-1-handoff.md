# RAG Phase 1 — Agent Handoff

> Living state document for autonomous Cloud Agents working through RAG Phase 1.
> This is the **first place a fresh agent should read** when picking up RAG work.
> Updated when state changes — feel free to edit it as you go.

> **Status as of 2026-04-30:** PR #11 in review, PR #12 in review, `PINECONE_API_KEY` saved to Cursor secrets and verified reachable in agent VM, `PINECONE_INDEX_NAME=realyn-rag-dev` saved, no Pinecone index yet, no rulebooks ingested. Pinecone organisation is on the **Starter (free) plan** — index defaults adjusted to `aws/us-east-1` accordingly (see [Free-tier vs paid-tier deployment](#free-tier-vs-paid-tier-deployment)).

---

## TL;DR for the next agent

1. **Verify the env var is reachable** — `echo "${PINECONE_API_KEY:+set}"` should print `set`. If not set, see [Troubleshooting](#troubleshooting-secrets-not-reachable).
2. **Run `cd functions && npm run build && npm run rag:setup`** — creates the `realyn-rag-dev` index with the schema-v2 invariants below. Idempotent.
3. **Run `cd functions && npm run rag:test`** — smoke query against the empty index. Expected: "no matches" + latency numbers. Confirms auth + region wiring.
4. **Report back to the user** with: index name, observed config (cloud / region / metric / dim), smoke-query latency. **Do not proceed past `rag:test`** without explicit confirmation.
5. **If `rag:setup` exits non-zero with a config-drift error**, that means a pre-existing index named `realyn-rag-dev` already exists with `metric: cosine` (left over from before the schema-v2 migration in PR #12). Tell the user; do not delete the index without explicit permission.
6. **Cloud + region default to `aws/us-east-1`** because the Pinecone organisation is on the free Starter plan (only AWS Virginia is allowed). If `rag:setup` fails with a "free plan does not support indexes in <region>" error, see [Free-tier vs paid-tier deployment](#free-tier-vs-paid-tier-deployment).

---

## Master plan

The full plan lives in [`docs/post-hardening-plan.md`](post-hardening-plan.md). The relevant cursor for this work is **Workstream C — RAG Phase 1**. Items already done by prior agents:

| Item | Status | Where |
|---|---|---|
| C6 — wire retrieval into evidencePlanner + argumentGenerator | ✅ Done | PR #11 |
| RAG architecture corrections (dotproduct, L2 norm, hybrid, rerank) | ✅ Done | PR #12 |
| C1 — provision Pinecone index | ⏳ **Next action** | Will happen when `rag:setup` runs |
| C2 — source rulebook PDFs | 🔒 Awaiting decision | See [Awaiting decisions](#awaiting-decisions) |
| C3 — pre-RAG baseline grading | 🔒 Awaiting decision | Needs human grading |
| C4 — dry-run ingestion | ⏸️ Blocked on C2 | |
| C5 — real ingestion | ⏸️ Blocked on C4 | |
| C7 — bind PINECONE_API_KEY on Cloud Functions, deploy | 🔒 Needs FIREBASE_TOKEN | Not yet in Cursor secrets |
| C8 — re-run eval, compare to baseline | ⏸️ Blocked on C5 + C3 | |
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
| `PINECONE_API_KEY` | ✅ Saved by user 2026-04-30 (unverified in agent VM yet) | Required for all Pinecone calls |
| `PINECONE_INDEX_NAME` | Optionally saved as `realyn-rag-dev` | Falls back to `realyn-rag` if unset; setting it explicitly avoids prod/dev collisions |

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

### C2 — Rulebook PDF sourcing

Two paths:

1. **You fetch the public Visa Public Rules and Mastercard Chargeback Guide PDFs** via WebFetch / curl. Public, no licensing risk.
2. **User stages them in a Firebase Storage bucket** and we pull via `gsutil cp`. Cleanest path for the licensed Visa Core Rules and Visa Product/Service Rules if those are wanted.

The user has not picked between these. If you need PDFs to make further progress, ask.

### C3 — Pre-RAG baseline grading

The plan says **DO NOT SKIP**. But this needs:

- 5–10 representative disputes pulled from staging Firestore (needs `GOOGLE_APPLICATION_CREDENTIALS_JSON` — not in secrets).
- Human grading of the outputs on coverage / accuracy / tone.

You can pre-fill the eval doc structure (`docs/eval/$(date +%Y-%m)-rag-phase1-baseline.md`) but you can't do the grading without the user.

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

Merge order: #11 → #12. Don't merge them in this session — the user wants to review.

If you do RAG provisioning work and need to check it in, **branch off `cursor/rag-architecture-corrections-47d1`** since that has the schema-v2 setup. Suggested branch name: `cursor/rag-phase-1-provisioning-XXXX`.

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

# Provision the Pinecone index (idempotent)
cd functions && npm run rag:setup

# Smoke-query the index
cd functions && npm run rag:test

# Ingest rulebooks (when PDFs are staged)
cd functions && npm run rag:ingest -- --file PATH --network visa --name "Visa Public Rules" --version 2024-04-15
```

Running `npm run rag:setup` requires `PINECONE_API_KEY` in env.

---

## Troubleshooting — secrets not reachable

If `echo "${PINECONE_API_KEY:+set}"` returns empty:

1. **Confirm the secret is saved at the right scope.** Cursor Dashboard → Cloud Agents → Secrets. Should be either user-account-scoped or `tstoko/realyn-app`-repo-scoped.
2. **Confirm the exact name.** `PINECONE_API_KEY` — all caps, single underscores. Typos like `PINECONE_KEY` or `PINECONE_API_TOKEN` won't match.
3. **If your VM started before the secret was saved**, secrets are injected at agent-VM-creation time, not on every command. End the current agent session and start a new one. The new VM will boot with the secrets in env.
4. **Tell the user if 1–3 don't fix it.** Don't try to work around it by hard-coding keys, asking them to paste in chat, or any other unsafe path.

---

## Files added in PR #11 / #12 worth knowing about

- `packages/ai-core/src/services/ragPromptInjection.ts` — the `## REFERENCE MATERIAL` block format and feature-flag gate.
- `packages/ai-core/src/services/ragService.ts` — retrieval orchestration, hybrid query path.
- `packages/ai-core/src/services/embeddingService.ts` — Pinecone Inference dense embeddings + L2 normalisation.
- `packages/ai-core/src/services/sparseEmbeddingService.ts` — sparse encoder + `applyAlpha`.
- `packages/ai-core/src/services/rerankService.ts` — `RerankPort` + `maybeRerank` (gated on `RERANK_ENABLED`).
- `functions/src/services/ai/pineconeVectorStore.ts` — concrete Pinecone-backed adapter.
- `functions/src/services/ai/pineconeRerank.ts` — concrete Pinecone-Inference rerank adapter.
- `functions/src/scripts/setupPineconeIndex.ts` — `npm run rag:setup` entry point.
- `functions/src/scripts/ingestRulebooks.ts` — `npm run rag:ingest` entry point.
- `functions/src/scripts/testRagRetrieval.ts` — `npm run rag:test` entry point.

All of these have inline comments explaining the design decisions; read them before refactoring anything.
