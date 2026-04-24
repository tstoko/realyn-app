# Evaluation Artifacts

Small, human-readable records of what the AI pipeline produced at a given point in time. The purpose is narrow: when we change the pipeline (add RAG, swap models, tune prompts), we want a before/after comparison grounded in real disputes rather than gut feel.

## Directory convention

```
docs/eval/
├── README.md                         (this file)
├── rag-baseline-template.md          (copy this to start a run)
├── 2026-04-rag-phase1-baseline.md    (example: pre-RAG snapshot)
├── 2026-04-rag-phase1-after.md       (example: same disputes post-RAG)
└── ...
```

Naming: `{YYYY-MM}-{change-id}-{baseline|after}.md`. Keep each run to <10 disputes so reviewers will actually look at them.

## What counts as a good eval run

1. **5–10 representative disputes** across the reason codes you care about (13.1, 10.4, 4853, etc.), mixed across verticals (hospitality, ticketing).
2. **Same inputs each time.** Lock the dispute IDs in the markdown so the "after" run uses identical data. If the input data itself changes, start a new baseline.
3. **Structured rubric.** See `rag-baseline-template.md`. Each dispute gets graded on a handful of dimensions rather than a single "good/bad" feel.
4. **Link to the generated outputs.** Paste the argument text or attach Firestore `disputeId`s — the point is reproducibility, not a summary.

## Workflow

1. Pick the disputes. Document their IDs + a one-line description of each.
2. Run the current pipeline end-to-end. Save outputs (argument text, evidence plan, claim analysis) somewhere persistent (Firestore already does this; record the `disputeId` + `draftVersion`).
3. Grade each dispute on the rubric. Be honest — if it's bad, say so.
4. Make the pipeline change.
5. Re-run on the same disputes. Grade again with the same rubric.
6. Write a short "delta" paragraph at the top. Include regressions, not just wins.

## Rubric dimensions (defaults)

These are a starting point, not a hard standard. Edit the template to match what matters for the change you're evaluating.

- **Citation specificity** — does the argument name specific rulebook sections, policy clauses, or evidence items?
- **Factual accuracy** — does every claim trace back to the dispute case or a reference document? (RAG wins here or it's not pulling its weight.)
- **Hallucination presence** — any invented facts, dates, policies, or regulations? (Binary: yes/no.)
- **Coverage** — does the argument address all the major claim elements the specialist chain identified?
- **Actionability** — could a merchant staff member actually submit this as-is, or does it need rewriting?
- **Overall** — 1–5.

## What this is not

- Not a replacement for automated tests. Critical logic paths live in Jest/Vitest suites — see `packages/core/src/__tests__/` and `packages/dashboard/src/__tests__/`.
- Not a customer-facing metric. These evals are internal, qualitative, and meant to be argued over.
- Not a substitute for a real offline-eval harness. When dispute volume grows, move to structured scoring (win/loss prediction, citation-precision scoring against held-out chargeback outcomes) and retire the markdown approach.
