# RAG Phase 1 — Agent Handoff

> Living state document for autonomous Cloud Agents working through RAG Phase 1.
> This is the **first place a fresh agent should read** when picking up RAG work.
> Updated when state changes — feel free to edit it as you go.

> **Status as of 2026-05-17:** ✅ **C7 is COMPLETE. RAG retrieval is LIVE and FIRING in prod.** Two demo-dispute smoke tests confirmed `[rag] chunksReturned=5 topScore=9.45` (dice / Visa 12.6) and `chunksReturned=5 topScore=6.86` (zipworld) — well above the `MIN_RELEVANCE_SCORE=0.35` threshold, top chunks are highly relevant rulebook excerpts (Dispute Condition 12.6: Duplicate Processing). Final revisions: `draftargument-00018-quk` (2026-05-17T18:35) and `onevidenceplanqueued-00002-kub` (2026-05-17T19:23 — second revision after the vector-store registration fix in PR #23). Both bind `PINECONE_INDEX_NAME=realyn-rag-dev`, `ANTHROPIC_API_KEY`, and `PINECONE_API_KEY`. Eventarc trigger for the Firestore-trigger function lives in `eur3` (Firestore region). The `realyn-rag-dev` Pinecone index has 2284 vectors in the `rulebooks` namespace (Visa Public Rules + Mastercard Chargeback Guide Merchant Edition). **Open work:** C8 (post-RAG eval) is now unblocked AT THE INFRA LAYER but blocked at the LLM layer — the Anthropic account is currently at $0 credit, so every specialist LLM call in the planner falls back to deterministic templates. RAG context is retrieved correctly and attached to the LLM prompt, but no LLM ever consumes it. Once Anthropic credit is topped up, the same `npm run rag:eval:baseline` re-run will produce RAG-enriched outputs for the C8 delta against `docs/eval/2026-05-rag-phase1-baseline.md`.
>
> **The deploy was a multi-PR effort, including one post-deploy bug fix** — see [§Actual deploy story (2026-05-17)](#actual-deploy-story-2026-05-17) below. PR #16 (code-side secret binding) was just the start. PR #19, #20, #21 fixed three layers of CI that had been silently broken since 2026-04-24, ~10 GCP IAM grants unblocked the actual Firebase deploy, **and PR #23 fixed the silent "vector store never registered" bug that made the initial deploy produce `[rag] chunksReturned=0` on every invocation despite the index being populated.** PR #23 also adds a defence-in-depth `console.warn` in ai-core for the store-missing path so this regression shape surfaces immediately next time, and two diagnostic scripts (`triggerRagSmoke.ts`, `debugRagQuery.ts`) that turn "is RAG working?" from a black-box question into a 30-second answer.

> **New as of 2026-05-08:** A separate, broader plan now exists for going from "production-ready app" to "partner-ready platform" — see [`docs/partner-readiness-plan.md`](partner-readiness-plan.md). It absorbs RAG C7 as its first task (P0.2) and adds 5 weeks of follow-on architectural work (ontology package, Action framework, EvidenceSourceClient generalization, sandbox mode, audit trail, partner SDK, public REST API, dashboards). If you're picking up this work, read the partner-readiness plan **after** finishing this section — it's the broader master plan; this doc is the narrower RAG Phase 1 sub-plan. C7 / C8 stay tracked here so the RAG-specific narrative is preserved.

---

## TL;DR for the next agent

The unglamorous parts (provisioning + ingestion) are done. What's left is mostly about deploying retrieval to the real Functions runtime and measuring whether it helps.

1. **Don't re-run `rag:setup` expecting an empty index.** It already exists at `realyn-rag-dev` (`aws/us-east-1`, dotproduct, 1024-dim) with 2284 vectors. The script is still idempotent — re-running just no-ops — but ingestion-style work is **not** the next step.
2. **If you have `PINECONE_API_KEY` reachable in your shell**, sanity-check the live index with `cd functions && npm run rag:test`. You should see real top-K hits (not "no matches"). Sample queries that returned coherent rule excerpts in PR #13: `"What evidence does a merchant need to defend a Visa 13.1 service not provided chargeback?"`, `"Mastercard reason code 4853 cardholder dispute compelling evidence"`. Top scores ~10+, well above the `MIN_RELEVANCE_SCORE=0.35` floor.
3. **`PINECONE_API_KEY` is only in Cursor Cloud Agent VMs, not in your local IDE shell.** Local agents will see `echo "${PINECONE_API_KEY:+set}"` print empty. That's expected. Don't ask the user to paste it; either run a Cursor Cloud Agent for live-index work, or have the user export it themselves before invoking you on commands that need it.
4. **The C7 code change has landed (PR #16, branch `cursor/rag-phase-1-c7-bind-pinecone-secret`).** `secrets: ["ANTHROPIC_API_KEY", "PINECONE_API_KEY"]` is now bound on `onEvidencePlanQueued` (Firestore trigger that runs the planning pipeline — note: the upstream `planEvidence` HTTP handler is just a queue write, doesn't run RAG, doesn't need the secret) and on `draftArgument` (HTTP handler that runs argument generation directly) in `functions/src/handlers/aiDisputeHandlers.ts`. **Seed handlers (`seedDemoData`, `seedDiceDemoData`, etc.) were intentionally not bound** — they're admin-only / dev-only, gated by `shouldEnableTestHandlers()`, and degrade gracefully via the empty-chunks fail-safe path. The remaining work is the **deploy step**, which needs `FIREBASE_TOKEN` / ADC in Cursor secrets (still not there — ask the user before suggesting they add it). Concrete deploy commands are below in the C7 section.
5. **C3 (pre-RAG baseline) is captured for free in `read-cached` mode.** The script (`functions/src/scripts/captureRagBaseline.ts`, npm `rag:eval:baseline`) now has two modes: (a) **read-cached (default)** — reads `evidencePlan` + `argumentDraft` directly from prod Firestore for disputes that have already been processed by the deployed planner (which currently runs without RAG because C7 isn't done); $0 cost, no LLM calls, no Firestore writes. (b) **force-refresh** (`-- --force-refresh` flag through `npm run`) — re-runs the pipeline live and costs ~$5–6 per run on `claude-opus-4-6`. The free path is the right answer for C3/C8 because the cached outputs ARE pre-RAG by definition. C3 markdown landed at `docs/eval/2026-05-rag-phase1-baseline.md` with 3 disputes (1 zipworld + 1 dice + 1 real-prod org `y3i1cZvgeu2KrSrY4VrA` "Grand Plaza Hotel") — **awaiting human grading** of the rubric tables. For C8, after C7 lands and a handful of new disputes flow through the deployed planner with RAG bound, just re-run the same default-mode script — the discovery query will pick up the most-recent post-RAG disputes. Move the C3 markdown to a different filename first if you want both kept.
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
| C3 — pre-RAG baseline grading | 🟢 **Captured for free**, awaiting human grading | `docs/eval/2026-05-rag-phase1-baseline.md` — 3 disputes via read-cached mode (1 zipworld + 1 dice + 1 real-prod). Cost $0, real `claude-opus-4-6` outputs (the deployed planner generated them before RAG was bound on Functions). Use `npm run rag:eval:baseline -- --force-refresh` if you ever need same-dispute pairwise control instead — that path requires Anthropic credit (~$5–6/run). |
| C7 — bind PINECONE_API_KEY on Cloud Functions, deploy | ✅ **Done 2026-05-17** (after PR #23 post-deploy fix) | `draftargument-00018-quk` (2026-05-17T18:35) + `onevidenceplanqueued-00002-kub` (2026-05-17T19:23, replaces the broken `-00001-faj`). Both bind `ANTHROPIC_API_KEY` + `PINECONE_API_KEY` (from Secret Manager) and read `PINECONE_INDEX_NAME=realyn-rag-dev` from `functions/.env.realyn-app`. Eventarc trigger for Firestore-trigger function created in `eur3` (DB region). End-to-end retrieval **verified working**: `[rag] disputeId=SJlJAYLlpv7cd8pLxSSs chunksReturned=5 topScore=9.45` for the dice demo dispute. Took PR #16 (secret binding) + PR #18 (env file) + PR #19 (root `npm ci` in CI) + PR #20 (drop `storage` from deploy targets) + PR #21 (drop `firestore:rules`/`indexes`) + **PR #23 (the silent-vector-store-registration fix that's the real "RAG actually fires" PR)** + 6 IAM grants on the deploy SA + 3 service-agent bootstrap bindings + Cloud Billing API enablement + a `placeholder_disable_email` secret for `RESEND_API_KEY`. See [§Actual deploy story](#actual-deploy-story-2026-05-17). |
| C8 — re-run eval, compare to baseline | 🟡 **Infra unblocked, gated on Anthropic credit** | RAG retrieval is firing correctly. But the Anthropic account is at $0 balance, so every specialist LLM call in the deployed planner falls back to deterministic templates that don't consume the retrieved RAG chunks. The plan output therefore looks pre-RAG even though retrieval is working. Once Anthropic credit is topped up: re-run `npm run rag:eval:baseline` in default `read-cached` mode, rename to `docs/eval/2026-05-rag-phase1-post-rag.md`, write the Delta Summary by hand against `docs/eval/2026-05-rag-phase1-baseline.md`. |
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
- `ANTHROPIC_API_KEY` — required **only** for the `--force-refresh` path of the eval script. The default `read-cached` mode is free. The user supplied a `sk-ant-…` key locally via `functions/.env.local` (gitignored) on 2026-05-02 but the underlying account has **zero credit balance** — `--force-refresh` returns `400 invalid_request_error` on every call. Adding API credit at console.anthropic.com → Plans & Billing would unblock force-refresh; **note for future agents: Claude.ai Pro/Max ($20/$100 mo) does NOT include API access — separate billing surface.** Cost estimate at the default `claude-opus-4-6` model: ~$1.50–2.00 per dispute (≈$5–6 per 3-dispute run). Read-cached mode is the better choice for both C3 and C8 anyway — see TL;DR §5 — so paying for force-refresh is a niche call.
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

The plan says **DO NOT SKIP**. Status as of 2026-05-03:

- ✅ Capture script written (`functions/src/scripts/captureRagBaseline.ts`, npm `rag:eval:baseline`).
- ✅ Firebase Admin SDK + ADC working — Firestore reads/writes against prod (`realyn-app`) confirmed.
- ✅ **Free `read-cached` mode added** — pulls existing `evidencePlan` + `argumentDraft` straight from Firestore for disputes already processed by the deployed planner (which is pre-RAG by virtue of `PINECONE_API_KEY` not being bound). $0 cost, no LLM/Pinecone calls, no Firestore writes.
- ✅ Diversity-aware discovery picker (round-robin across orgs) → 1 zipworld + 1 dice + 1 real-prod (`y3i1cZvgeu2KrSrY4VrA` "Grand Plaza Hotel"), spanning 3 orgs.
- ✅ Markdown captured at `docs/eval/2026-05-rag-phase1-baseline.md`. Real `claude-opus-4-6` outputs.
- ⏳ Human grading of the per-dispute rubric tables — still pending.
- 🔓 `--force-refresh` mode is also implemented for niche pairwise-control needs but requires Anthropic credit (~$5–6/run). Not the recommended path for routine C3/C8.

The next steps are: (a) human grades the rubric tables in the markdown; (b) once C7 lands and a few new disputes flow through the deployed planner with RAG bound, re-run `npm run rag:eval:baseline` (still free) and rename the output to a C8-flavored filename; (c) write up the Delta Summary section by hand comparing the two.

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
| `cursor/rag-phase-1-provisioning-4164` | [#13](https://github.com/tstoko/realyn-app/pull/13) | Draft, in review. | `cursor/rag-architecture-corrections-47d1` |
| `cursor/rag-phase-1-c7-bind-pinecone-secret` | [#16](https://github.com/tstoko/realyn-app/pull/16) | Draft, in review. C7 code-side: bind `PINECONE_API_KEY` on `onEvidencePlanQueued` + `draftArgument`, plus 2 stripe-test mock fixups for the pre-existing `admin.firestore().settings is not a function` failure introduced by `50167f2`. Deploy still gated on `FIREBASE_TOKEN`. | `cursor/rag-phase-1-provisioning-4164` |

Merge order: #11 → #12 → #13 → #16. Don't merge them in this session — the user wants to review.

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

# Capture pre-RAG (C3) or post-RAG (C8) eval baseline for 3 demo-org disputes
# - Reads + writes prod Firestore (realyn-app) for the demo orgs only
# - RAG_RETRIEVAL_ENABLED is hard-disabled in the script for the C3 baseline
# - Needs ANTHROPIC_API_KEY exported in shell + ADC for Firebase Admin SDK
export ANTHROPIC_API_KEY=sk-ant-...
cd functions && npm run rag:eval:baseline
```

`rag:setup` / `rag:test` / `rag:ingest` require `PINECONE_API_KEY` in env (only available in Cursor Cloud Agent VMs by default — see [What's in Cursor secrets](#whats-in-cursor-secrets-right-now)). `rag:eval:baseline` requires `ANTHROPIC_API_KEY` instead (also not in Cursor secrets — user has to provide it).

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

**From the C3 capture commits (this branch, post-#13):**
- `functions/src/scripts/captureRagBaseline.ts` + `rag:eval:baseline` npm script (`2b0d951` initial; refactored later in the session to support two modes). **Default mode is read-cached** — pulls `evidencePlan` and `argumentDraft` straight from Firestore for disputes already processed by the deployed planner, which is pre-RAG by definition because `PINECONE_API_KEY` isn't bound on Functions. $0 cost, no LLM calls, no Firestore writes. **`--force-refresh` flag** keeps the original behavior (re-runs the pipeline, ~$5–6/run on Anthropic). Discovery picker uses Firestore `orderBy("evidencePlanGeneratedAt", "desc")` with a client-side `argumentDraft != null` filter and round-robin org-bucket selection for diversity. `RAG_RETRIEVAL_ENABLED=false` is still hard-coded as the very first statement — defence-in-depth for `--force-refresh`, no-op for read-cached.
- `docs/eval/2026-05-rag-phase1-baseline.md` — captured C3 output, awaiting human rubric grading.

**From the Firestore-undefined fix (this branch, `50167f2`):**
- `functions/src/index.ts` — `admin.firestore().settings({ ignoreUndefinedProperties: true })` applied immediately after `admin.initializeApp()`. Same one-liner repeated in `captureRagBaseline.ts`'s `getDb()` (the script doesn't import `index.ts`). Fixes a real production bug — when the AI pipeline's fallback paths kick in (LLM 5xx / 429 / quota-exhausted), they produce nested objects with `undefined` fields that the Firestore Admin SDK rejects by default, breaking the planner write-back. Surfaced today by the zero-credit Anthropic 400s cascading every specialist into its fallback.

**From the C7 secret binding (branch `cursor/rag-phase-1-c7-bind-pinecone-secret`, PR #16):**
- `functions/src/handlers/aiDisputeHandlers.ts` — `secrets: ["ANTHROPIC_API_KEY", "PINECONE_API_KEY"]` on the `onEvidencePlanQueued` Firestore trigger and the `draftArgument` HTTP handler. **Important nuance:** the `planEvidence` HTTP handler (line 58) is *not* bound — it only writes a `evidencePlanStatus: "queued"` marker; the actual planning pipeline runs in `onEvidencePlanQueued` (line 179). This corrects the slightly stale wording in earlier versions of this doc which said to bind on `planEvidence`. Inline comments next to each bound function explain the fail-safe contract (empty chunks on retrieval error).
- `functions/src/handlers/__tests__/stripeWebhook.integration.test.ts` and `stripeIntegration.test.ts` — added `settings: jest.fn()` to the `mockFirestore` object inside `jest.mock("firebase-admin", ...)`. Pre-existing test breakage from `50167f2`, surfaced when the post-install module graph started actually loading `index.ts` in those two suites. With the fix, all 26 functions test suites and 369 tests are green; `npx tsc --noEmit` is clean across both `packages/ai-core` and `functions`.

**Deploy steps for C7 (kept for reference; actual deploy went through GitHub Actions — see below):**

```bash
firebase functions:secrets:set PINECONE_API_KEY --project=realyn-app
# (set PINECONE_INDEX_NAME via functions/.env.realyn-app — committed; no gcloud run update needed for v2 fns)
firebase deploy --only functions:onEvidencePlanQueued,functions:draftArgument --project=realyn-app
```

Notes:
- `realyn-rag-dev` is intentional. The only currently-populated index is `realyn-rag-dev` (2284 vectors). A separate `realyn-rag` (or `realyn-rag-prod`) index would need to be provisioned + ingested before flipping the env var. For first deploy, pointing prod at `realyn-rag-dev` is the expedient call; document the migration in the partner-readiness §P0.1 staging-provisioning ticket so it's not forgotten.
- After deploy, smoke test by triggering one dispute through `planEvidence` (which writes the queue marker → `onEvidencePlanQueued` runs the pipeline) and grepping logs for `[rag] disputeId=… stage=evidence_planning chunksReturned=…`. Non-zero `chunksReturned` confirms RAG is live.
- Rollback is `gcloud run services update onevidenceplanqueued --update-env-vars=RAG_RETRIEVAL_ENABLED=false` (and same for `draftargument`). Takes effect on next request, no redeploy.

### Actual deploy story (2026-05-17)

The above three commands assume a working Firebase CLI environment. Reality was harder. Documenting here so future agents can recognise the failure modes and skip the wasted iterations.

**1. The CI workflow had been silently broken since 2026-04-24.** PR #4 introduced `packages/ai-core` as a workspace but `.github/workflows/deploy-functions.yml` never ran `npm ci` at the repo root, so `packages/ai-core/node_modules` was empty in CI, `tsc` failed with `Cannot find name 'process'` / `Cannot find module 'zod'`, and the `Deploy to Firebase` step never ran. **Three weeks of merges to main never deployed.** Nobody noticed because the GH Actions failure notification went to a channel nobody was watching. **Fix:** PR #19 added a root `npm ci` step before the `packages/ai-core` build and an `npm ci` in `functions/` before `tsc`. Also added `cache: npm` to `actions/setup-node` for speed.

**2. The Firebase MCP `firebase_deploy` tool lies.** Twice in this session the MCP reported "deploy succeeded" while the actual deploy had failed silently. Confirmed by checking `gcloud run revisions list` — no new revision after a "successful" MCP deploy. **Lesson:** Always verify deploys against Cloud Run / Cloud Functions API state, never trust the Firebase MCP's reported status. Direct `firebase deploy` CLI is more honest, and the GitHub Actions workflow surface is the most reliable (and reproducible) path. Use CLI/CI; reserve the MCP for read-only checks at most.

**3. macOS Finder duplicates poisoned the source tree.** 241 shadow files of the form `<name> 2.ts`, `<name> 2.tsx`, `<name> 2.js` across `packages/`, `functions/src/`, and `docs/`. These caused two distinct failures: (a) `firebase deploy` failed with `Error: Could not read source directory` because some shadow JS files were invalid; (b) `git fetch` failed with `bad object refs/remotes/origin/main 2`. **Fix:** `find . -name '* 2' -type f -delete` (excluding `.git/objects`) plus `find .git/refs -name '* 2' -delete` and a re-`git fetch --prune`.

**4. `RESEND_API_KEY` had been a `defineSecret` since 2026-04-09 but no secret existed in Secret Manager.** Any deploy of any function in the codebase failed with `Error: In non-interactive mode but have no value for the secret: RESEND_API_KEY` (because Firebase's deploy validates *all* secrets even if only deploying one function). **Fix:** `echo "placeholder_disable_email" | firebase functions:secrets:set RESEND_API_KEY --data-file=- --project=realyn-app`. The placeholder is intentional — email-sending code path checks for the placeholder and short-circuits. Replace with a real Resend key when email is reactivated.

**5. The deploy SA needed six IAM role upgrades.** Going from a project-Editor-style SA to one that can actually deploy v2 functions revealed missing permissions one at a time. Final set granted to `github-action-1093841209@realyn-app.iam.gserviceaccount.com`:
   - `roles/cloudfunctions.admin` (replaces `cloudfunctions.developer` — v2 functions need `cloudfunctions.functions.setIamPolicy` to manage the underlying Cloud Run IAM)
   - `roles/run.admin` (replaces `run.viewer` — to update Cloud Run services)
   - `roles/cloudscheduler.admin` (for the 3 scheduled functions: `disputeSyncScheduler`, `deadlineReminderScheduler`, `dataRetentionCleanup`)
   - `roles/secretmanager.admin` (replaces `secretmanager.secretAccessor` — `accessor` only grants `versions.access`, deploy needs `secrets.get` plus IAM mgmt for bound secrets)
   - `roles/datastore.viewer` (to verify the Firestore database exists for the Firestore-trigger function)
   - `roles/eventarc.developer` + `roles/iam.serviceAccountUser` (for Eventarc trigger management — already in place from earlier)

**6. Three service-agent bootstrap IAM bindings.** Firebase's deploy tries to set these itself but fails because the deploy SA lacks `resourcemanager.projects.setIamPolicy`. Easier to do them once as project owner:
```bash
gcloud projects add-iam-policy-binding realyn-app \
  --member=serviceAccount:service-819510714783@gcp-sa-pubsub.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator
gcloud projects add-iam-policy-binding realyn-app \
  --member=serviceAccount:819510714783-compute@developer.gserviceaccount.com \
  --role=roles/run.invoker
gcloud projects add-iam-policy-binding realyn-app \
  --member=serviceAccount:819510714783-compute@developer.gserviceaccount.com \
  --role=roles/eventarc.eventReceiver
```

**7. Cloud Billing API needed to be enabled.** Surfaced as a deploy-time 403 from `cloudbilling.googleapis.com`. Firebase verifies the project is on Blaze before deploying v2 functions. **Fix:** `gcloud services enable cloudbilling.googleapis.com --project=realyn-app`.

**8. Two Firebase deploy targets are still gated on broader IAM the deploy SA does not have:**
   - `firebase deploy --only storage` requires `firebasestorage.defaultBucket.get` (not in our SA's role set). PR #20 dropped `storage` from the deploy targets.
   - `firebase deploy --only firestore:rules,firestore:indexes` requires `firebaserules.releases.test`. PR #21 dropped these from the deploy targets. **Note:** `firestore.rules` has 4 commits since the last successful prod deploy on 2026-03-26 — none critical for RAG function, but they should be back-applied once the IAM gap is closed. Header of `.github/workflows/deploy-functions.yml` documents the missing roles.

**9. Cross-region Eventarc propagation lag.** The first try after granting all the SA roles partially-deployed — most functions succeeded, but 3 Firestore-trigger functions (`onEvidencePlanQueued`, `disputeNotificationTrigger`, `syncUserClaims`) failed with "Permission denied while using the Eventarc Service Agent. If you recently started to use Eventarc, it may take a few minutes before all necessary permissions are propagated to the Service Agent." The Eventarc Service Agent (`service-819510714783@gcp-sa-eventarc.iam.gserviceaccount.com`) was correctly bound with `roles/eventarc.serviceAgent` — it just hadn't propagated. **Fix:** Wait ~3 minutes after first eventarc API use, then re-deploy. Second run was clean. Firestore is in `eur3` (Europe multi-region), Functions are in `us-central1`; the Eventarc trigger lives in `eur3` to colocate with the DB and pushes events cross-region to the function. This is supported but adds propagation surface.

**10. Post-deploy: the planner ran RAG-blind for ~45 minutes (PR #23).** First end-to-end smoke test (triggering re-planning on dice `SJlJAYLlpv7cd8pLxSSs`) returned `[rag] disputeId=… stage=evidence_planning status=ok chunksReturned=0 topScore=0.000`. Same query against the same index via `npm run rag:test` returned 5 chunks at top score 12.97. So index + creds + query were all fine. Root cause: `functions/src/services/ai/ragService.ts` is a wire-up module that calls `configureVectorStore(pineconeVectorStore)` as an import side effect — but it was only imported by `rag:setup` / `rag:ingest` / `rag:test` / `rag:eval:baseline` scripts. **`aiDisputeHandlers.ts` and the ai-core planner/argument-generator that drive `onEvidencePlanQueued` and `draftArgument` never imported it.** So `_store` in ai-core was always null in the deployed function, and `retrieveRagContext` short-circuited to `EMPTY_RAG_RESULT` at the `if (!store) return EMPTY_RAG_RESULT` branch — which had no log line. The outer `retrieveRulebookForPrompt` then logged the aggregate `chunksReturned=0 status=ok` and the planner proceeded with no RAG context. **Fix:** PR #23 adds `import "./services/ai/ragService"` to `functions/src/index.ts` (side-effect import next to `admin.initializeApp` + `configureTelemetry`, which is already the pattern), plus a debounced `console.warn` in ai-core for the store-missing path so this regression shape surfaces immediately in production logs instead of silently degrading. Post-fix smoke: `chunksReturned=5 topScore=9.45` for dice, `chunksReturned=5 topScore=6.86` for zipworld. Two new diagnostic scripts (`triggerRagSmoke.ts`, `debugRagQuery.ts`) are part of the PR — the second was what surfaced the bug. Lesson: **side-effect-only modules in node need an explicit import edge from the production entry point; "the scripts import it" is not enough.**

**11. The LLM specialists are stuck on $0 Anthropic credit.** Every `ClaimAnalyst`, `EvidenceAnalyzer`, `RelevanceScorer`, `StrategyAdvisor`, `QualityChecker`, and main `EvidencePlan` LLM call in the latest smoke run failed with `400 "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."`. The pipeline falls back to deterministic templates for each (this is the "Strategy Advisor silently skipped" bug that was already fixed in `61b019a` — fallbacks now warn loudly). The resulting plan therefore doesn't change shape with vs without RAG, because no LLM ever consumes the retrieved chunks. **This is a billing fix, not a code fix.** Until Anthropic credit is topped up, C8 (post-RAG eval) cannot meaningfully compare plan outputs — RAG is technically firing, but every LLM that would otherwise cite the retrieved rule excerpts is short-circuiting.

**End-state IAM diff vs pre-session:**
```
+ roles/cloudfunctions.admin       (was: cloudfunctions.developer)
+ roles/run.admin                  (was: run.viewer)
+ roles/cloudscheduler.admin       (new)
+ roles/secretmanager.admin        (was: secretmanager.secretAccessor)
+ roles/datastore.viewer           (new)
+ roles/eventarc.developer         (new, granted earlier in session)
+ roles/iam.serviceAccountUser     (new, granted earlier in session)
```
Plus three service-agent bindings + `cloudbilling.googleapis.com` enabled at project level.

**Total elapsed wall time on deploy alone: ~3 hours. Most of it spent recovering from the 3-week-old CI bug + cascading IAM 403s.**

**From PR #13 (provisioning + bug fixes uncovered by first real ingest):**
- `packages/ai-core/src/config/ragConfig.ts` — `PINECONE_CLOUD` / `PINECONE_REGION` are now env-driven via `getPineconeCloud()` / `getPineconeRegion()`. Defaults flipped to `aws/us-east-1` for Starter compatibility. The schema-v2 invariants (model, dim, metric, normalisation, alpha, schema version) stay hard-coded — they need to match between ingest and query.
- `packages/ai-core/src/services/sparseEmbeddingService.ts` — parses Pinecone SDK 7.x flat sparse-embed shape (`sparseValues: number[]` + `sparseIndices: number[]`); old nested `{ indices, values }` shape kept for back-compat. Without this fix, **every hybrid query was silently falling back to dense-only**.
- `packages/ai-core/src/services/embeddingService.ts` + `sparseEmbeddingService.ts` — shared `embedWithRetry()` helper retries on 429 / `RESOURCE_EXHAUSTED` only, with 30s → 60s → 90s → 120s backoff. Calibrated to Pinecone Inference's rolling-minute token bucket (Starter cap: 250K tokens/min/model/input-type).
- `functions/src/scripts/ingestRulebooks.ts` — uses `pdf-parse@2` class-based `PDFParse` API (`getText({ pageJoiner: "" })`), always calls `destroy()` in `finally` to release the PDF.js worker between sources. The v1 callable default export was removed in v2.
- `functions/src/scripts/setupPineconeIndex.ts` — reads cloud + region from the new getters at runtime.
- `functions/.env.example` — documents the new `PINECONE_CLOUD` / `PINECONE_REGION` override knobs and the immutability constraint (cloud + region can't be changed on an existing index — requires a new index name).

All of these have inline comments explaining the design decisions; read them before refactoring anything.
