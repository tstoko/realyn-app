# RAG Eval — 2026-05-02 — phase1-rulebook-rag — baseline

## Context

- **Change under evaluation:** Phase 1 rulebook RAG — Visa Public Rules + Mastercard Chargeback Guide Merchant Edition retrieval into evidencePlanner / argumentGenerator (PR #11–#13)
- **Git ref:** `3f28a89` on `cursor/rag-phase-1-provisioning-4164`.
- **Capture mode:** `cached` (read-only; pulled `evidencePlan` and `argumentDraft` directly from prod Firestore. **Cost: $0**.)
- **Pipeline model(s):** Anthropic Claude (default `claude-opus-4-6` via `callLLM` / `callLLMWithVision`); embedding model `multilingual-e5-large` is unused because RAG is not yet bound on Functions and `RAG_RETRIEVAL_ENABLED=false` is forced regardless.
- **Pinecone index:** `realyn-rag-dev` (`aws/us-east-1`, dotproduct, 1024-dim, 2284 vectors). **Not queried** for this baseline.
- **Disputes evaluated:** 3 (3 succeeded, 2 demo + 1 prod). Sourced from prod Firestore (`realyn-app`).

> **Why these outputs are pre-RAG.** The deployed Cloud Functions don't yet have `PINECONE_API_KEY` bound (post-hardening C7), so the live `ragService` falls back to empty chunks on init failure and `RAG_RETRIEVAL_ENABLED` defaults are moot. Every `evidencePlan` and `argumentDraft` currently in Firestore was therefore generated without retrieval. We're reading those documents back as-is. PII fields in the claim summary go through `sanitizeDisputeCaseWithLog` (the same scrubber the LLM sees on the way in); LLM-generated outputs (plan summary, argument paragraphs) cannot contain PII the LLM never saw.

## Delta summary (fill in only on the "after" run)

_To be written by hand after the post-RAG counterpart captures the C8 numbers._

---

## Disputes

### Dispute 1 — Zipworld Adventures — duplicate _(demo · cached)_

- **Firestore disputeId:** `OKvtUnGQdIVg35hNFrUg`
- **Organisation:** `zipworld_adventures` (demo)
- **Pre-run lifecycle:** `draft_ready`
- **Reason / network (expected):** duplicate → visa 12.6
- **Vertical:** `general`
- **Amount:** 200.00 GBP
- **Uploaded evidence items:** 2
- **Cached plan generated at:** 2026-03-31T12:56:19.329Z
- **Cached argument generated at:** 2026-03-31T12:56:19.329Z

**Claim summary (sanitised):**

> Customer claims they were charged twice for a Bounce Below family booking at Llechwedd

**Evidence plan:**

- **Recommendation:** `fight`
- **Winnability:** `high`
- **Network / reason code:** `visa` / `duplicate`
- **Category:** Adventure & Experiences
- **Subtype:** Duplicate

**Plan summary:**

> Customer claims they were charged twice for a Bounce Below family booking at Llechwedd. Demonstrate separate authorisations or distinct bookings rather than a mistaken double charge for a single family booking.

**Winnability reason:**

> Two legitimate charges with unique booking references, amounts, or timestamps typically defeat duplicate disputes for adventure experience tickets.

**Requirements (3):**

- `zw_dup_charges` — Authorisation and settlement detail (**required**, priority 1, category `payment_data`)
  - PSP view of each charge with auth code, amount, timestamp, and descriptor to prove they are not identical retries.
- `zw_dup_orders` — Matching booking records (**required**, priority 2, category `pms_data`)
  - Two booking confirmations (or one family booking plus an additional date) proving the cardholder consented to both transactions.
- `zw_dup_comm` — Customer communications (_optional_, priority 3, category `communications`)
  - Messages showing the buyer knew about both charges (e.g. separate booking confirmations for different adventure dates).

**Argument draft:**

**Executive summary:**

> Zip World is contesting this duplicate chargeback: Customer claims they were charged twice for a Bounce Below family booking at Llechwedd The cardholder completed two separate bookings; each has a distinct authorisation, amount, and booking record in the Zip World system. We are submitting payment and booking evidence showing there was no erroneous double billing for a single transaction.

**Timeline:**

- **2026-03-13** — Buyer placed the first family Bounce Below booking via zipworld.co.uk; confirmation and e-tickets delivered.
- **2026-03-20** — Buyer placed a second booking for additional participants or a different adventure date; separate payment succeeded.
- **2026-03-28** — Chargeback filed as duplicate; Zip World compiled PSP and booking evidence for submission.

**Paragraphs:**

#### Two valid charges

> The amounts in dispute correspond to two consented checkouts on zipworld.co.uk, not a retry of the same payment. The attached authorisation records show different network transaction IDs and timestamps.

*Evidence refs: `zw_dup_charges`*

#### Booking records

> Each charge maps to its own booking reference and participant allocation in the Zip World system. The buyer received separate booking confirmations, which undermines a duplicate-billing claim for a single purchase.

*Evidence refs: `zw_dup_orders`*

**Customer-claim rebuttal:**

> The cardholder's duplicate claim does not match the two legitimate bookings tied to this account and card on the Zip World platform.

**Conclusion:**

> We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing booking records.

**Rubric (1–5 unless noted):**

| Dimension | Score | Notes |
|---|---|---|
| Citation specificity | | _e.g. cites §11.3.2 verbatim, or no citations_ |
| Factual accuracy | | |
| Hallucination present (yes/no) | | _quote it if present_ |
| Coverage | | _claim elements addressed vs missed_ |
| Actionability | | _would a merchant submit this unchanged?_ |
| **Overall** | | |

**Notable quotes / failures:**
- _..._

---

### Dispute 2 — Dice Ticketing — duplicate _(demo · cached)_

- **Firestore disputeId:** `SJlJAYLlpv7cd8pLxSSs`
- **Organisation:** `dice_ticketing` (demo)
- **Pre-run lifecycle:** `draft_ready`
- **Reason / network (expected):** duplicate → visa 12.6
- **Vertical:** `ticketing`
- **Amount:** 150.00 GBP
- **Uploaded evidence items:** 2
- **Cached plan generated at:** 2026-03-30T10:19:00.393Z
- **Cached argument generated at:** 2026-03-30T10:19:00.393Z

**Claim summary (sanitised):**

> Customer claims they were charged twice for the same event

**Evidence plan:**

- **Recommendation:** `fight`
- **Winnability:** `high`
- **Network / reason code:** `visa` / `duplicate`
- **Category:** Ticketing
- **Subtype:** Duplicate

**Plan summary:**

> Customer claims they were charged twice for the same event. Demonstrate separate authorisations or distinct purchases rather than a mistaken double charge.

**Winnability reason:**

> Two legitimate charges with unique IDs, amounts, or timestamps typically defeat duplicate disputes.

**Requirements (3):**

- `dice_dup_charges` — Authorisation and settlement detail (**required**, priority 1, category `payment_data`)
  - PSP view of each charge with auth code, amount, timestamp, and descriptor to prove they are not identical retries.
- `dice_dup_orders` — Matching order records (**required**, priority 2, category `pms_data`)
  - Two order confirmations (or one order plus an add-on) proving the cardholder consented twice.
- `dice_dup_comm` — Customer communications (_optional_, priority 3, category `communications`)
  - Messages showing the buyer knew about both charges (e.g. receipts for two separate events or orders).

**Argument draft:**

**Executive summary:**

> (Company Name) is contesting this duplicate chargeback: Customer claims they were charged twice for the same event The cardholder completed two separate purchases; each has a distinct authorisation, amount, and order record. We are submitting payment and order evidence showing there was no erroneous double billing for a single transaction.

**Timeline:**

- **2026-03-12** — Buyer placed first order for the earlier show date; confirmation and receipt delivered.
- **2026-03-19** — Buyer placed a second order for a different event or add-on; separate payment succeeded.
- **2026-03-27** — Chargeback filed as duplicate; DICE compiled PSP and order evidence for submission.

**Paragraphs:**

#### Two valid charges

> The amounts in dispute correspond to two consented checkouts, not a retry of the same payment. The attached authorisation records show different network transaction IDs and timestamps.

*Evidence refs: `dice_dup_charges`*

#### Order records

> Each charge maps to its own order ID and ticket package. The buyer received separate confirmations, which undermines a duplicate-billing claim for a single purchase.

*Evidence refs: `dice_dup_orders`*

**Customer-claim rebuttal:**

> The cardholder’s duplicate claim does not match the two legitimate orders tied to this account and card.

**Conclusion:**

> We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing records.

**Rubric (1–5 unless noted):**

| Dimension | Score | Notes |
|---|---|---|
| Citation specificity | | _e.g. cites §11.3.2 verbatim, or no citations_ |
| Factual accuracy | | |
| Hallucination present (yes/no) | | _quote it if present_ |
| Coverage | | _claim elements addressed vs missed_ |
| Actionability | | _would a merchant submit this unchanged?_ |
| **Overall** | | |

**Notable quotes / failures:**
- _..._

---

### Dispute 3 — Y3i1cZvgeu2KrSrY4VrA — subscription_canceled _(prod · cached)_

- **Firestore disputeId:** `hBJigtEf9zVoxvXdNBhU`
- **Organisation:** `y3i1cZvgeu2KrSrY4VrA` (prod)
- **Pre-run lifecycle:** `submitted`
- **Reason / network (expected):** subscription_canceled → visa 13.2
- **Vertical:** `general`
- **Amount:** 99.00 USD
- **Uploaded evidence items:** 5
- **Cached plan generated at:** 2026-01-21T20:57:57.531Z
- **Cached argument generated at:** 2026-01-21T20:58:45.925Z

**Claim summary (sanitised):**

> Guest canceled but was still charged

**Evidence plan:**

- **Recommendation:** `fight`
- **Winnability:** `medium`
- **Network / reason code:** `visa` / `13.2`
- **Category:** Consumer Disputes
- **Subtype:** Cancelled Recurring Transaction

**Plan summary:**

> This is a Consumer Disputes dispute (13.2). Cardholder claims charge after cancelling recurring payment

**Winnability reason:**

> Based on dispute code 13.2 (Cardholder claims charge after cancelling recurring payment). No booking data linked - manual matching may be needed.

**Requirements (5):**

- `req-1` — Cancellation Policy (**required**, priority 1, category `policy`)
  - Your hotel's cancellation policy as shown to the guest at booking
- `req-4` — Booking Confirmation (**required**, priority 1, category `communications`)
  - Confirmation email sent to guest with reservation details
- `req-2` — Terms Acceptance Proof (**required**, priority 2, category `policy`)
  - Screenshot or log showing guest accepted terms during booking
- `req-3` — Guest Communications (**required**, priority 2, category `communications`)
  - Email or chat correspondence with the guest about the booking
- `req-5` — Booking Details (_optional_, priority 4, category `pms_data`)
  - Reservation details from PMS

**Argument draft:**

**Executive summary:**

> We respectfully contest this dispute of USD 99.00. Grand Plaza Hotel provided the agreed-upon services, and the charge is valid. Evidence has been collected to support our position.

**Timeline:**

- **2026-01-03T20:52:00.106Z** — Original transaction processed

**Paragraphs:**

#### Transaction Overview

> This dispute relates to a charge of USD 99.00 for services provided by Grand Plaza Hotel. The cardholder has disputed this charge citing "subscription_canceled". We respectfully contest this dispute and provide evidence demonstrating that the charge is valid.

#### Supporting Evidence

> We have provided 5 pieces of evidence supporting our position. This includes documentation from our property management system and relevant policies that were disclosed to the guest at the time of booking.

**Customer-claim rebuttal:**

> The cardholder claims "subscription_canceled". We have documentation showing that the service was provided as agreed and that our policies were clearly disclosed at the time of booking.

**Conclusion:**

> Based on the evidence provided, we request that this dispute be resolved in favor of Grand Plaza Hotel. The charge of USD 99.00 is valid and the cardholder received the services they paid for.

**Rubric (1–5 unless noted):**

| Dimension | Score | Notes |
|---|---|---|
| Citation specificity | | _e.g. cites §11.3.2 verbatim, or no citations_ |
| Factual accuracy | | |
| Hallucination present (yes/no) | | _quote it if present_ |
| Coverage | | _claim elements addressed vs missed_ |
| Actionability | | _would a merchant submit this unchanged?_ |
| **Overall** | | |

**Notable quotes / failures:**
- _..._

---

## Cross-cutting observations

- _Patterns across disputes — to be filled after grading._
- _Latency: not measured (read-only capture). Production planner timings in Cloud Logging if needed._
- _Cost: $0 — pure Firestore reads._
- _Followups: to be added during grading._