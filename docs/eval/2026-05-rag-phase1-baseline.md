# RAG Eval — 2026-05 — Phase 1 rulebook RAG — baseline

> **Status: SKELETON.** Autonomous Cloud Agent cannot complete this document —
> it requires (a) reading 5–10 representative disputes from staging Firestore
> (needs `GOOGLE_APPLICATION_CREDENTIALS_JSON`), (b) running the current
> pipeline against each, and (c) human grading of the outputs. The agent that
> picked this up is only allowed to set up the scaffolding per the §C3
> paragraph of [`docs/post-hardening-plan.md`](../post-hardening-plan.md):
>
> > *"You can pre-fill the eval doc structure … but you can't do the grading
> > without the user."*
>
> Fill in the dispute blocks, add per-axis grades, and write the delta
> summary once the C8 "after" run is complete.

## Context

- **Change under evaluation:** Phase 1 rulebook RAG — Visa Core Rules and Visa
  Product and Service Rules (2026-04-18) + Mastercard Chargeback Guide Merchant
  Edition (2025-05-13). Hybrid retrieval (dense `multilingual-e5-large` +
  sparse `pinecone-sparse-english-v0`, alpha=0.5), no rerank (Starter plan).
- **Git ref (pre-RAG baseline run):** _fill in commit SHA on the branch that
  contains the C6 wiring but with `RAG_RETRIEVAL_ENABLED=false` or
  pre-ingestion state — see [`docs/rag-phase-1-handoff.md`](../rag-phase-1-handoff.md)
  for the branch sequence._
- **Pipeline model(s):** Claude (see `packages/ai-core/src/config/llmConfig.ts`
  for the pinned model); embedding `multilingual-e5-large`; sparse
  `pinecone-sparse-english-v0`.
- **Pinecone index:** `realyn-rag-dev`, namespace `rulebooks`, 2284 vectors
  total (Visa 896 + Mastercard 1388). No vectors at baseline run — the whole
  point is "before RAG was wired".
- **Disputes evaluated:** 5–10 disputes drawn from staging, date range TBD.

## Selection criteria

Per [`docs/post-hardening-plan.md`](../post-hardening-plan.md) §C3:

- Mix Visa + Mastercard.
- Mix reason codes. Starting points: 13.1 (Merchandise/Services Not Received),
  10.4 (Fraud — Card-Absent Environment), 13.2 (Cancelled Recurring
  Transaction) for Visa; 4853 (Cardholder Dispute), 4855 (Goods or Services
  Not Provided), 4837 (No Cardholder Authorisation) for Mastercard.
- Mix outcomes (some won, some lost) if historicals exist.
- Anonymise cardholder data before pasting into this doc if it may be
  reviewed externally.

## Delta summary (fill in only on the "after" run)

1–3 paragraph narrative answering: did RAG help, hurt, or do nothing? Flag any
regressions even if the overall trend is positive. Include headline numbers:

- **Coverage delta** — additional evidence items RAG surfaced per dispute.
- **Citation accuracy** — % of model-cited rules that appear in retrieved
  chunks (not hallucinated).
- **Latency cost** — `ragRetrievalLatencyMs` p50 / p95 per call.

Target numbers from [`docs/post-hardening-plan.md`](../post-hardening-plan.md)
§C8 ("What 'good' looks like for Phase 1"):

- Coverage: +1 evidence item average per dispute.
- Citation accuracy: ≥95%.
- p95 latency overhead: <800 ms over current `planEvidence` latency.

---

## Disputes

For each dispute, fill in this block. Keep the IDs real but redact PII. Do not
invent dispute IDs — if the staging pull is blocked on missing creds, leave
this section as-is and make a note in the delta summary.

### Dispute 1

- **Firestore disputeId:** `___`
- **Reason code / network:** _e.g. Visa 13.1_
- **Vertical:** _hospitality | ticketing | general_
- **Claim summary (one sentence):** _..._
- **Output artifact (baseline):** _Firestore path to argument draft, or link
  to rendered PDF. Capture before RAG is active._
- **Output artifact (after):** _same dispute, re-run after RAG wiring._

**Rubric (1–5 unless noted):**

| Dimension | Baseline | After | Delta | Notes |
|---|---|---|---|---|
| Citation specificity | | | | _e.g. "cites §11.3.2 verbatim" or "no citations"_ |
| Factual accuracy | | | | |
| Hallucination present (yes/no) | | | | _Quote the hallucination if present._ |
| Coverage | | | | _Which claim elements addressed; which missed._ |
| Actionability | | | | _Would a merchant submit this unchanged?_ |
| **Overall** | | | | |

**Notable quotes / failures (baseline):**
- _..._

**Notable quotes / failures (after):**
- _..._

---

### Dispute 2

_(same block structure)_

---

### Dispute 3

_(same block structure)_

---

### Dispute 4

_(same block structure)_

---

### Dispute 5

_(same block structure)_

---

_(add disputes 6–10 as needed)_

---

## Cross-cutting observations

- _Patterns across disputes — e.g. "RAG consistently pulled from §11.3.2 even
  for codes where §11.3.2 does not apply"._
- _Retrieval latency — capture from `[rag]` structured log line:
  `ragRetrievalLatencyMs` p50 / p95 across all runs._
- _Cost — embedding + retrieval calls per dispute, dollars per 1k disputes
  (Starter plan; update if moving to Standard)._
- _Follow-ups — what to fix next (tighter chunking, prompt tweak, query
  rewrite, rerank flip, etc)._

## How this doc gets produced

1. **Baseline run.** For each picked dispute, trigger `planEvidence` +
   `draftArgument` with `RAG_RETRIEVAL_ENABLED=false` (or on a commit that
   predates C6). Save the Firestore `disputeId` + `draftVersion` for each.
2. **Grade each output** on the 6 rubric dimensions. Be strict on "Factual
   accuracy" and "Hallucination present" — those are where RAG should move
   the needle.
3. **RAG cutover** (C7). Set `RAG_RETRIEVAL_ENABLED=true` (default), deploy
   with `PINECONE_API_KEY` bound.
4. **After run.** Re-trigger `planEvidence` + `draftArgument` on the same
   disputes. Save the new `draftVersion`s.
5. **Grade again** with the same rubric. Compute per-axis deltas.
6. **Write the delta summary** — short, honest, flag regressions.
