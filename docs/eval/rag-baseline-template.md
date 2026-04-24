# RAG Eval — {YYYY-MM-DD} — {change-id} — {baseline | after}

## Context

- **Change under evaluation:** _e.g. "Phase 1 rulebook RAG (Visa Public Rules + MC Chargeback Guide)"_
- **Git ref:** _commit SHA or branch_
- **Pipeline model(s):** _Claude model name, embedding model name_
- **Pinecone index:** _index name, namespace list, chunk count per namespace_
- **Disputes evaluated:** _count, date range they originate from_

## Delta summary (fill in only on the "after" run)

1–3 paragraph narrative answering: did the change help, hurt, or do nothing? Be specific. Flag any regressions even if the overall trend is positive.

---

## Disputes

For each dispute, copy this block and fill it in.

### Dispute {1}

- **Firestore disputeId:** `___`
- **Reason code / network:** _e.g. Visa 13.1_
- **Vertical:** _hospitality | ticketing | general_
- **Claim summary (one sentence):** _..._
- **Output artifact:** _Firestore path to argument draft, or link to rendered PDF_

**Rubric (1–5 unless noted):**

| Dimension | Score | Notes |
|---|---|---|
| Citation specificity | | _e.g. "cites §11.3.2 verbatim" or "no citations"_ |
| Factual accuracy | | |
| Hallucination present (yes/no) | | _Quote the hallucination if present._ |
| Coverage | | _Which claim elements addressed; which missed._ |
| Actionability | | _Would a merchant submit this unchanged?_ |
| **Overall** | | |

**Notable quotes / failures:**
- _..._

---

### Dispute {2}

... _(repeat)_

---

## Cross-cutting observations

- _Patterns across disputes — e.g. "RAG consistently pulled from §11.3.2 even for codes where §11.3.2 does not apply"._
- _Latency: retrieval added X ms (p50 / p95)._
- _Cost: embedding/retrieval calls per dispute, dollars per 1k disputes._
- _Followups: what to fix next._
