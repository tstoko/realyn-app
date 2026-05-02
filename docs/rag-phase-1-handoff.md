# RAG Phase 1 — Agent Handoff

> Living state document for autonomous Cloud Agents working through RAG Phase 1.
> This is the **first place a fresh agent should read** when picking up RAG work.
> Updated when state changes — feel free to edit it as you go.

> **Status as of 2026-05-02:** PR #11 in review, PR #12 in review, **PR #13 in review**. The `realyn-rag-dev` Pinecone index is **provisioned and populated** — 2284 vectors in the `rulebooks` namespace (Visa Public Rules + Mastercard Chargeback Guide Merchant Edition). `PINECONE_API_KEY` is saved to Cursor secrets and was used end-to-end for ingest from a Cursor Cloud Agent VM. Pinecone organisation is on the **Starter (free) plan** — index defaults remain `aws/us-east-1` (see [Free-tier vs paid-tier deployment](#free-tier-vs-paid-tier-deployment)). Next unblocked code work is **C7** (bind secret on deployed Functions + deploy) — currently gated on `FIREBASE_TOKEN` in Cursor secrets.

---

## TL;DR for the next agent

The unglamorous parts (provisioning + ingestion) are done. What's left is mostly about deploying retrieval to the real Functions runtime and measuring whether it helps.

1. **Don't re-run `rag:setup` expecting an empty index.** It already exists at `realyn-rag-dev` (`aws/us-east-1`, dotproduct, 1024-dim) with 2284 vectors. The script is still idempotent — re-running just no-ops — but ingestion-style work is **not** the next step.
2. **If you have `PINECONE_API_KEY` reachable in your shell**, sanity-check the live index with `cd functions && npm run rag:test`. You should see real top-K hits (not "no matches"). Sample queries that returned coherent rule excerpts in PR #13: `"What evidence does a merchant need to defend a Visa 13.1 service not provided chargeback?"`, `"Mastercard reason code 4853 cardholder dispute compelling evidence"`. Top scores ~10+, well above the `MIN_RELEVANCE_SCORE=0.35` floor.
3. **`PINECONE_API_KEY` is only in Cursor Cloud Agent VMs, not in your local IDE shell.** Local agents will see `echo "${PINECONE_API_KEY:+set}"` print empty. That's expected. Don't ask the user to paste it; either run a Cursor Cloud Agent for live-index work, or have the user export it themselves before invoking you on commands that need it.
4. **The actual next code-side work is C7** — bind `PINECONE_API_KEY` as a Firebase Functions secret and add it to the `secrets: [...]` list on the `planEvidence` / `draftArgument` `onRequest` definitions in `functions/src/handlers/aiDisputeHandlers.ts`, then deploy. **C7 needs `FIREBASE_TOKEN` in Cursor secrets** (or a developer workstation with `firebase` CLI auth). Not currently in Cursor secrets — ask the user before suggesting they add it.
5. **C3 (pre-RAG baseline) is still the blocking eval prerequisite.** It can't be backfilled retroactively. If C7 lands and the user wants to do C8, you must do C3 against the *deterministic-pipeline output for the same disputes* before flipping `RAG_RETRIEVAL_ENABLED` on for those disputes' replays. Reading staging disputes needs `GOOGLE_APPLICATION_CREDENTIALS_JSON` (not in Cursor secrets); the eval doc skeleton can be pre-filled without it.
6. **Don't merge PR #11/#12/#13 in this session.** User wants to review. Merge order is #11 → #12 → #13. Branches are stacked.

---

## Master plan

The full plan lives in [`docs/post-hardening-plan.md`](post-hardening-plan.md). The relevant cursor for this work is **Workstream C — RAG Phase 1**.

| Item | Status | Where |
|---|---|---|
| C6 — wire retrieval into evidencePlanner + argumentGenerator | ✅ Done | PR #11 |
| RAG architecture corrections (dotproduct, L2 norm, hybrid, rerank) | ✅ Done | PR #12 |
| C1 — provision Pinecone index | ✅ Done | PR #13 — `realyn-rag-dev` in `aws/us-east-1`, dotproduct, 1024-dim, Ready |
| C2 — source rulebook PDFs | ✅ Done | PR #13 — Visa Public Rules (canonical Visa-hosted URL) + Mastercard Chargeback Guide Merchant Edition (user-staged via temp commit, then reverted) |
| C4 — dry-run ingestion | ✅ Done | PR #13 — chunking heuristics validated on both PDFs |
| C5 — real ingestion | ✅ Done | PR #13 — 2284 vectors total: Visa 896 chunks + Mastercard 1388 chunks |
| C3 — pre-RAG baseline grading | 🔒 Awaiting decision | Needs human grading + `GOOGLE_APPLICATION_CREDENTIALS_JSON` to read staging disputes. Doc skeleton can be pre-filled without creds. |
| C7 — bind PINECONE_API_KEY on Cloud Functions, deploy | 🔒 **Next unblocked code work** — needs FIREBASE_TOKEN | Not yet in Cursor secrets. Code change for the `secrets: [...]` list is small and can be staged without deploying. |
| C8 — re-run eval, compare to baseline | ⏸️ Blocked on C7 + C3 | |
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
| `PINECONE_API_KEY` | ✅ Saved 2026-04-30, **verified end-to-end** by the PR #13 ingest run from a Cursor Cloud Agent VM | Required for all Pinecone calls. Only injected into Cursor Cloud Agent VMs at boot — **not** present in local IDE shells. |
| `PINECONE_INDEX_NAME` | Optionally saved as `realyn-rag-dev` | Falls back to `realyn-rag` if unset; setting it explicitly avoids prod/dev collisions. |

**Local-vs-Cloud-Agent caveat.** Cursor secrets are only present in Cloud Agent VMs. If you're running as a *local* agent (the user's own IDE, not a Cloud Agent), `echo "${PINECONE_API_KEY:+set}"` will print empty even though the secret is "saved". Two paths:

1. Spin up a Cursor Cloud Agent for any work that needs to call Pinecone (preferred — that's how PR #13's ingest happened).
2. Have the user export `PINECONE_API_KEY` themselves in their shell before invoking you. Don't suggest pasting it in chat.

**Not in Cursor secrets** (would need user action if you need them):

- `FIREBASE_TOKEN` — would unblock A1 (Firestore index deploy) and **C7 (Functions deploy + secrets:set)** ← currently the bottleneck for Phase 1. Note: Firestore *reads* (for C3 baseline) are now reachable via the Firebase MCP server (`plugin-firebase-firebase`) without this token.
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — would unblock A2 (Cloud Run env vars) and C7 partial. C3/C8 Firestore reads are unblocked via Firebase MCP instead.
- `ANTHROPIC_API_KEY` — required for C3 / C8 (the eval pipeline calls Claude end-to-end via `callLLM`). Not in Cursor secrets. Either ask the user to add it to Cursor secrets and run from a Cloud Agent VM, or have them export it locally before invoking you.
- `STRIPE_SECRET_KEY_TEST` — A4 partial, deliberately deferred (Stripe smoke testing skipped per user).
- `VOYAGE_API_KEY` — N/A, Voyage was rejected.
- ~~`GH_ADMIN_TOKEN`~~ — was added briefly to unblock A3 (delete dead Sentry GitHub Actions secrets). **A3 turned out to be a no-op** — verified 2026-05-02 that no `*SENTRY*` secrets exist at the repo Actions / dependabot / codespaces scopes. The PAT has been (or should be) revoked.

If you find you need any of these, **ask the user before suggesting they add it**. The user has been deliberately conservative about credential sprawl.

---

## Awaiting decisions

Things the user has not decided yet. **Don't unilaterally pick.**

### C2 — Rulebook PDF sourcing

**Resolved in PR #13.** What actually happened:

- **Visa**: downloaded directly from `https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf` (canonical Visa-hosted URL, public, ~923 pages, version `2026-04-18`). No licensing concern.
- **Mastercard**: Akamai 403 on every URL variant from the Cursor Cloud Agent VM's IP range. **User downloaded locally** and pushed via a temporary `git add -f` commit (since `data/rulebooks/` is gitignored). That commit (`36bc6bf temp: stage Mastercard Chargeback Guide for ingest`) was reverted in `bd54229` so PR #13 doesn't carry the binary blob.

Phase 1 corpus is therefore the public/merchant-facing edition for both networks. The licensed Visa Core Rules and Visa Product/Service Rules path was not taken — re-open the question if Phase 2 ever needs them.

If you need to re-ingest from a fresh agent VM and the PDFs aren't on disk, the same staging trick works: have the user push them via temporary `git add -f`, ingest, then revert.

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
| `cursor/rag-phase-1-provisioning-4164` | [#13](https://github.com/tstoko/realyn-app/pull/13) | Draft, in review | `cursor/rag-architecture-corrections-47d1` |

Merge order: #11 → #12 → #13. Don't merge them in this session — the user wants to review.

If you do follow-up RAG work (C7 binding/deploy, C3 baseline doc, ingest tweaks) and need a new branch, **branch off `cursor/rag-phase-1-provisioning-4164`** — that's the tip of the stack and contains all the bug fixes from PR #13 (sparse parser, pdf-parse@2 API, 429 retry, env-driven cloud/region). Suggested branch name pattern: `cursor/rag-phase-1-cN-<short>-XXXX`.

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

# Provision the Pinecone index (idempotent — already done in PR #13)
cd functions && npm run rag:setup

# Smoke-query the live populated index — should return real top-K hits, not "no matches"
cd functions && npm run rag:test

# Ingest a new / replacement rulebook (idempotent on (network, version, content-hash))
cd functions && npm run rag:ingest -- --file PATH --network visa --name "Visa Public Rules" --version 2026-04-18

# Dry-run ingestion (parse + chunk + log only — no embed, no upsert)
cd functions && npm run rag:ingest -- --file PATH --network visa --name "..." --version "..." --dry-run --sample 20
```

All `rag:*` commands require `PINECONE_API_KEY` in env (only available in Cursor Cloud Agent VMs by default — see [What's in Cursor secrets](#whats-in-cursor-secrets-right-now)).

---

## Troubleshooting — secrets not reachable

If `echo "${PINECONE_API_KEY:+set}"` returns empty:

0. **First, confirm you're actually in a Cloud Agent VM.** Cursor secrets only inject into Cloud Agent VMs, not into local IDE shells. If you're running as a local agent in the user's IDE, empty is expected — go run a Cloud Agent for Pinecone work, or have the user export the key in their shell before invoking you. Don't pursue steps 1–4.
1. **Confirm the secret is saved at the right scope.** Cursor Dashboard → Cloud Agents → Secrets. Should be either user-account-scoped or `tstoko/realyn-app`-repo-scoped.
2. **Confirm the exact name.** `PINECONE_API_KEY` — all caps, single underscores. Typos like `PINECONE_KEY` or `PINECONE_API_TOKEN` won't match.
3. **If your VM started before the secret was saved**, secrets are injected at agent-VM-creation time, not on every command. End the current agent session and start a new one. The new VM will boot with the secrets in env.
4. **Tell the user if 0–3 don't fix it.** Don't try to work around it by hard-coding keys, asking them to paste in chat, or any other unsafe path.

---

## Files added / changed across PR #11 / #12 / #13 worth knowing about

**From PR #11 (RAG wiring):**
- `packages/ai-core/src/services/ragPromptInjection.ts` — the `## REFERENCE MATERIAL` block format and `RAG_RETRIEVAL_ENABLED` feature-flag gate.
- `packages/ai-core/src/services/ragService.ts` — retrieval orchestration, hybrid query path, `buildFilter` (per-namespace metadata filters).

**From PR #12 (architecture corrections):**
- `packages/ai-core/src/services/embeddingService.ts` — Pinecone Inference dense embeddings + `l2Normalize` helper (exported).
- `packages/ai-core/src/services/sparseEmbeddingService.ts` — sparse encoder + `applyAlpha` for client-side hybrid scaling.
- `packages/ai-core/src/services/rerankService.ts` — `RerankPort` + `maybeRerank` (gated on `RERANK_ENABLED`).
- `functions/src/services/ai/pineconeVectorStore.ts` — concrete Pinecone-backed adapter, dual-vector upsert path.
- `functions/src/services/ai/pineconeRerank.ts` — concrete Pinecone-Inference rerank adapter.
- `functions/src/scripts/setupPineconeIndex.ts` — `npm run rag:setup` entry point.
- `functions/src/scripts/ingestRulebooks.ts` — `npm run rag:ingest` entry point.
- `functions/src/scripts/testRagRetrieval.ts` — `npm run rag:test` entry point.

**From PR #13 (provisioning + bug fixes uncovered by first real ingest):**
- `packages/ai-core/src/config/ragConfig.ts` — `PINECONE_CLOUD` / `PINECONE_REGION` are now env-driven via `getPineconeCloud()` / `getPineconeRegion()`. Defaults flipped to `aws/us-east-1` for Starter compatibility. The schema-v2 invariants (model, dim, metric, normalisation, alpha, schema version) stay hard-coded — they need to match between ingest and query.
- `packages/ai-core/src/services/sparseEmbeddingService.ts` — parses Pinecone SDK 7.x flat sparse-embed shape (`sparseValues: number[]` + `sparseIndices: number[]`); old nested `{ indices, values }` shape kept for back-compat. Without this fix, **every hybrid query was silently falling back to dense-only**.
- `packages/ai-core/src/services/embeddingService.ts` + `sparseEmbeddingService.ts` — shared `embedWithRetry()` helper retries on 429 / `RESOURCE_EXHAUSTED` only, with 30s → 60s → 90s → 120s backoff. Calibrated to Pinecone Inference's rolling-minute token bucket (Starter cap: 250K tokens/min/model/input-type).
- `functions/src/scripts/ingestRulebooks.ts` — uses `pdf-parse@2` class-based `PDFParse` API (`getText({ pageJoiner: "" })`), always calls `destroy()` in `finally` to release the PDF.js worker between sources. The v1 callable default export was removed in v2.
- `functions/src/scripts/setupPineconeIndex.ts` — reads cloud + region from the new getters at runtime.
- `functions/.env.example` — documents the new `PINECONE_CLOUD` / `PINECONE_REGION` override knobs and the immutability constraint (cloud + region can't be changed on an existing index — requires a new index name).

All of these have inline comments explaining the design decisions; read them before refactoring anything.
