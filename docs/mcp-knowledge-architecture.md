# MCP Knowledge Architecture

Realyn's dispute resolution pipeline uses the MCP server as a knowledge broker between a structured knowledge base and the LLM. Every AI decision — evidence planning, auto-collection, argument generation, draft validation — is informed by vertical-specific, PSP-aware, scheme-grounded context assembled by MCP tools at call time.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard (React)                        │
│  EvidenceDashboard → MCP Client → plan / collect / draft / val  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ MCP protocol + Firebase Bearer token
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Server (Cloud Run)                       │
│                                                                  │
│  Tools:                                                          │
│   plan_evidence          retrieve_operational_evidence            │
│   draft_argument         validate_draft                          │
│   check_evidence_gaps    assess_readiness                        │
│   get_scheme_rules       get_evidence_requirements               │
│   get_psp_formats        get_win_patterns                        │
│   submit_to_psp          advance_to_review                       │
│                                                                  │
│  Before each LLM call, the tool:                                 │
│   1. Queries the knowledge base for this reason code × vertical  │
│   2. Queries PSP format rules for the target PSP                 │
│   3. Fetches cached specialist outputs from the dispute doc      │
│   4. Assembles everything into structured prompt sections         │
│   5. Calls the LLM with full context                             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐ ┌─────────────┐ ┌──────────────────┐
│  Knowledge Base   │ │  LLM (Claude) │ │  Firestore        │
│  (Firestore)      │ │              │ │  (Dispute docs,   │
│                   │ │              │ │   Evidence,        │
│  5 tables:        │ │              │ │   Operations)      │
│  - Scheme rules   │ │              │ └──────────────────┘
│  - Evidence reqs  │ │              │
│  - PSP formats    │ │              │
│  - Output templates│ │              │
│  - Win patterns   │ │              │
└──────────────────┘ └──────────────┘
```

---

## Knowledge Base Data Model

### 1. Scheme Rules

Card network rules per reason code. Sourced from Visa Core Rules, Mastercard Chargeback Guide, Amex Merchant Regulations, and Discover Operating Regulations.

```
Collection: schemeRules/{network}_{reasonCode}

Fields:
  code: string                    // e.g. "13.7"
  network: "visa" | "mastercard" | "amex" | "discover"
  category: string                // e.g. "Consumer Disputes"
  subcategory: string             // e.g. "Cancelled Merchandise/Services"
  description: string             // Human-readable description of what this code means
  merchantObligation: string      // What the merchant must prove
  cardholderBurden: string        // What the cardholder has claimed
  timeLimit: {
    days: number                  // Response deadline in calendar days
    fromEvent: string             // e.g. "dispute_date", "transaction_date"
  }
  citations: [{
    section: string               // e.g. "Visa Core Rules 11.4.2"
    excerpt: string               // Relevant quote from the documentation
  }]
  submissionConstraints: string[] // e.g. "Combined evidence must not exceed 50MB"
  effectiveDate: string           // When this rule version took effect
  supersededDate?: string         // When replaced by a newer version
```

**Coverage:** 65+ reason codes across Visa, Mastercard, Amex, and Discover. Versioned — when card networks update their rules, a new version is imported and the old one is marked superseded.

### 2. Evidence Requirement Rules

What evidence is needed per reason code, scoped to each vertical. This is the core table that makes evidence planning industry-aware.

```
Collection: evidenceRequirements/{id}

Fields:
  reasonCode: string              // e.g. "13.7"
  network: string                 // e.g. "visa"
  verticalId: string              // e.g. "hospitality", "ticketing", "general"
  evidenceType: string            // e.g. "folio", "redemption_log", "cancellation_policy"
  priority: "critical" | "required" | "recommended" | "optional"
  rationale: string               // Why this evidence matters for this code + vertical
  citations: string[]             // References to scheme rule sections
  tips: string                    // Practical advice for the merchant
  canAutoFulfill: boolean         // Whether this can be pulled from operational systems
  sourceSystem: string            // e.g. "PMS", "Ticketing Platform", "Manual"
```

**Example rows for Visa 13.7:**

| Vertical | Evidence Type | Priority | Rationale |
|---|---|---|---|
| hospitality | cancellation_policy | critical | Visa requires proof policy was disclosed at booking time |
| hospitality | folio | critical | Proves the charge matches the actual stay |
| hospitality | registration_card | required | Physical proof of guest check-in |
| hospitality | guest_communications | recommended | Emails showing guest was informed of policy |
| ticketing | refund_policy | critical | Must show non-refundable terms were accepted at checkout |
| ticketing | order_confirmation | critical | Proves purchase with terms link visible |
| ticketing | redemption_log | critical | Scan records proving ticket was used at venue |
| ticketing | buyer_communications | recommended | Messages about the order or refund request |

Same reason code, completely different evidence strategy per vertical.

### 3. PSP Format Rules

What format each payment service provider accepts per evidence submission slot.

```
Collection: pspFormats/{psp}_{evidenceSlot}

Fields:
  pspProvider: "stripe" | "adyen" | "worldpay" | ...
  evidenceSlot: string            // e.g. "cancellation_policy", "service_documentation"
  acceptedFormats: string[]       // e.g. ["text"], ["pdf", "image"], ["pdf", "image", "text"]
  maxSizeBytes: number            // e.g. 20480 for 20KB text, 52428800 for 50MB file
  isRequired: boolean             // Whether the PSP requires this slot for submission
  fieldDescription: string        // What the PSP expects in this slot
  apiFieldName: string            // Actual API field name (e.g. Stripe's "evidence.cancellation_policy")
  notes: string                   // Additional guidance
```

**Example rows for Stripe:**

| Slot | Accepted Formats | Max Size | Required | Description |
|---|---|---|---|---|
| cancellation_policy | text | 20KB | yes | Raw text of the cancellation policy |
| cancellation_policy_disclosure | text | 20KB | yes | How/when the policy was shown to the customer |
| service_documentation | pdf, image | 50MB | no | Supporting documentation (folio, receipts) |
| customer_communication | text | 20KB | no | Summary of communications with customer |
| uncategorized_text | text | 20KB | no | Additional text evidence |
| uncategorized_file | pdf, image | 50MB | no | Additional file evidence |

**Example rows for Adyen:**

| Slot | Accepted Formats | Max Size | Required | Description |
|---|---|---|---|---|
| DefenseDocument | pdf, image | 10MB | yes | Combined evidence document |
| DefenseReason | text | — | yes | Written defense reason |

### 4. Evidence Output Templates

How to produce evidence for a specific vertical + PSP combination. Drives the auto-collector's output format.

```
Collection: evidenceOutputTemplates/{id}

Fields:
  evidenceType: string            // e.g. "folio", "redemption_log"
  verticalId: string              // e.g. "hospitality", "ticketing"
  pspProvider: string             // e.g. "stripe", "adyen"
  outputFormat: "text" | "pdf" | "image" | "passthrough"
  extractionMethod: string        // e.g. "line_item_table", "text_extraction", "ocr", "api_fetch"
  sourceSystem: string            // e.g. "PMS", "Ticketing Platform"
  templateInstructions: string    // How to structure the output
  fallbackFormat: string          // What to produce if the preferred format fails
```

**Example rows:**

| Evidence Type | Vertical | PSP | Output Format | Extraction Method |
|---|---|---|---|---|
| folio | hospitality | stripe | text | Extract line items as formatted text table |
| folio | hospitality | adyen | pdf | Generate PDF with line-item table and totals |
| cancellation_policy | hospitality | stripe | text | OCR/extract text from uploaded policy document |
| cancellation_policy | hospitality | adyen | pdf | Include policy document in combined defense PDF |
| redemption_log | ticketing | stripe | text | Extract scan timestamps as formatted text |
| redemption_log | ticketing | adyen | pdf | Generate PDF with scan event table |
| order_confirmation | ticketing | stripe | passthrough | Forward original confirmation as uncategorized_file |

### 5. Win Patterns

Historical intelligence that improves over time as disputes resolve. Starts empty, populates organically.

```
Collection: winPatterns/{id}

Fields:
  reasonCode: string
  network: string
  verticalId: string
  evidenceCombination: string[]   // e.g. ["folio", "cancellation_policy", "registration_card"]
  winCount: number
  lossCount: number
  winRate: number                 // Computed: winCount / (winCount + lossCount)
  sampleSize: number              // winCount + lossCount
  argumentPatterns: string[]      // Recurring themes in winning arguments
  weaknesses: string[]            // Common reasons for losses with this combo
  lastUpdated: Timestamp
  confidenceLevel: "high" | "medium" | "low"  // Based on sample size
```

**Example rows:**

| Code | Vertical | Evidence Combination | Win Rate | Sample | Key Pattern |
|---|---|---|---|---|---|
| 13.7 | hospitality | folio + cancellation_policy + registration_card | 78% | 142 | "Policy disclosed at booking, guest signed registration" |
| 13.7 | hospitality | folio + cancellation_policy | 61% | 89 | "Policy disclosed but no physical proof of stay" |
| 13.7 | ticketing | order_confirmation + redemption_log + refund_policy | 85% | 56 | "Ticket was used, non-refundable policy accepted at purchase" |
| 10.4 | hospitality | 3ds_records + folio + registration_card | 92% | 78 | "3D Secure authenticated, guest physically present" |
| F29 | ticketing | 3ds_records + order_confirmation + delivery_proof | 71% | 34 | "Authentication passed, ticket delivered to verified email" |

Confidence levels based on sample size: high (50+), medium (20-49), low (<20).

---

## Vertical Definitions

Each vertical defines industry-specific vocabulary, evidence types, operational system integrations, and auto-fulfillment capabilities.

### Hospitality

- **Display name:** Hospitality
- **Operational system:** PMS (Property Management System)
- **Vocabulary:** hotel, guest, booking, stay, check-in/out
- **Evidence types:** registration_card, folio, cancellation_policy, refund_policy, terms_of_service, booking_confirmation, check_in_records, check_out_records, key_card_logs, housekeeping_records, guest_communications, 3d_secure_records, avs_cvv_records, authorization_records, id_verification, signed_agreements
- **Auto-fulfillable:** folio, check-in/out records, keycard logs, authorization records, guest activity log
- **PMS providers:** Opera Cloud (live API), Opera CSV/XML/delimited (file import), Mews (planned), Cloudbeds (planned)

### Ticketing & Events

- **Display name:** Ticketing & Events
- **Operational system:** Ticketing Platform
- **Vocabulary:** merchant, buyer, order, event, ticket
- **Evidence types:** order_confirmation, ticket_delivery_proof, redemption_log, refund_policy, terms_of_service, buyer_communications, 3d_secure_records, avs_cvv_records, authorization_records, id_verification, signed_agreements
- **Auto-fulfillable:** order_confirmation, ticket_delivery_proof, redemption_log (from ticketing platform API)
- **Platform providers:** (to be implemented per customer)

### General (Fallback)

- **Display name:** General
- **Operational system:** None
- **Vocabulary:** merchant, customer, order, service
- **Evidence types:** order_confirmation, delivery_proof, refund_policy, terms_of_service, customer_communications, 3d_secure_records, avs_cvv_records, authorization_records, id_verification, signed_agreements, service_records, product_description
- **Auto-fulfillable:** None (no integrated operational system)

New verticals (e.g., SaaS subscriptions, e-commerce, car rental) are added by registering a `VerticalDefinition` and seeding vertical-specific evidence requirement rules.

---

## Pipeline Flow

### Phase 1: Evidence Planning

When a dispute arrives and the user triggers evidence planning:

```
1. MCP tool: plan_evidence(caseId)
   │
   ├─ Query knowledge base:
   │   ├─ Scheme rules for this reason code
   │   │   → "Visa 13.7: merchant must prove cancellation policy was disclosed"
   │   │   → Citation: "Visa Core Rules 11.4.2"
   │   │   → Deadline: 30 days from dispute date
   │   │
   │   ├─ Evidence requirements for this reason code × vertical
   │   │   → "For ticketing: need refund_policy (critical), order_confirmation
   │   │      (critical), redemption_log (critical), buyer_communications (recommended)"
   │   │
   │   ├─ Win patterns for this reason code × vertical
   │   │   → "85% win rate with order + redemption + policy (56 cases)"
   │   │   → "52% win rate without redemption log"
   │   │
   │   └─ PSP format rules for the target PSP
   │       → "Stripe: cancellation_policy as text, service_documentation as file"
   │
   ├─ Run specialist pipeline (with full knowledge context):
   │   ├─ Claim Analyst → identifies customer claims + required disproofs
   │   │   (now informed by scheme rules: knows what the network cares about)
   │   ├─ Evidence Analyzer → assesses what evidence already exists
   │   ├─ Relevance Scorer → ranks evidence by importance
   │   ├─ Strategy Advisor → recommends defense approach
   │   │   (now informed by win patterns: knows what actually works)
   │   └─ Evidence Planner → generates the plan
   │       (now informed by PSP formats: plans for correct output types)
   │
   ├─ Cache ALL specialist outputs to dispute doc:
   │   ├─ cachedClaimAnalysis
   │   ├─ cachedStrategy (NEW — currently not persisted)
   │   ├─ cachedSchemeRules (NEW)
   │   └─ cachedExistingEvidence
   │
   └─ Auto-collect evidence (Phase 2 begins immediately)
```

### Phase 2: Evidence Collection

After the plan is created, auto-collection runs and the user fills gaps:

```
2. Auto-collection (runs automatically after planning):
   │
   ├─ For each pending evidence item:
   │   ├─ Can this be auto-fulfilled from the operational system?
   │   │   (Checks vertical's autoFulfillableTags + knowledge base canAutoFulfill)
   │   │
   │   ├─ If yes: query output template for this evidence type × vertical × PSP
   │   │   ├─ Template says "text extraction" → extract structured text from PMS data
   │   │   ├─ Template says "pdf" → generate PDF with appropriate layout
   │   │   └─ Template says "passthrough" → forward the original document as-is
   │   │
   │   └─ If no: leave as pending for human upload
   │
   └─ Result: some items auto-collected, some awaiting human input

3. Dashboard shows evidence gaps:
   │
   ├─ MCP tool: check_evidence_gaps(caseId)
   │   → "3 items auto-collected from PMS. 2 items need your attention."
   │   → Per item: what to upload, what format the PSP needs, why it matters
   │
   └─ User uploads remaining evidence
       → Dashboard shows PSP-specific guidance:
         "Stripe needs your cancellation policy as text — upload the document
          and we'll extract the text automatically"

4. Readiness check:
   │
   └─ MCP tool: assess_readiness(caseId)
       → Evidence completeness, deadline risk, expected win rate
       → "Ready for draft" or "Blocked: 1 required item missing"
```

### Phase 3: Argument Generation

When the user clicks "Generate Argument," the LLM receives the full context chain:

```
5. MCP tool: draft_argument(caseId)
   │
   ├─ Assemble context from dispute doc + knowledge base:
   │   ├─ Cached claim analysis → what the customer claims, required disproofs
   │   ├─ Cached strategy → recommended approach, defense points, confidence
   │   ├─ Cached scheme rules → card network requirements and citations
   │   ├─ PSP format rules → what format each submission field needs
   │   ├─ Win patterns → which argument patterns succeed for this combo
   │   ├─ Evidence plan → winnability, recommendation, category
   │   ├─ Evidence files → uploaded documents via Claude vision + text extraction
   │   └─ Readiness assessment → case strength, any gaps to work around
   │
   ├─ LLM generates argument that:
   │   ├─ Directly addresses each customer claim (from claim analysis)
   │   ├─ Follows the recommended strategy (from strategy advisor)
   │   ├─ Hits every required evidence category (from scheme rules)
   │   ├─ Fills each PSP field in the correct format (text vs file)
   │   ├─ Cites specific evidence (quotes from documents, dates, amounts)
   │   ├─ Uses argument patterns that historically win (from win patterns)
   │   └─ Acknowledges and works around any evidence gaps
   │
   └─ Persist argument draft + metadata to dispute doc

6. MCP tool: validate_draft(caseId)
   │
   ├─ LLM checks the draft against:
   │   ├─ Available evidence → are claims actually supported?
   │   ├─ Scheme rules → does it address what the network requires?
   │   ├─ PSP format rules → are text fields filled correctly?
   │   └─ Win patterns → does it follow successful argument patterns?
   │
   └─ Returns: supported claims, weak claims (with suggestions),
      unsupported claims, missing PSP fields, submission risk level

7. If weak claims exist → regenerate with validation feedback:
   │
   └─ MCP tool: draft_argument(caseId, regenerate: true)
       ├─ LLM now also receives previous draftValidation
       │   → Knows exactly what was weak and focuses on strengthening those claims
       └─ Produces improved draft informed by validation feedback
```

### Phase 4: Submission and Feedback

```
8. MCP tool: submit_to_psp(caseId, confirm: true)
   │
   └─ PSP adapter submits evidence in the correct format per slot
       (driven by output templates and PSP format rules)

9. When dispute outcome arrives (win/loss via PSP webhook):
   │
   └─ Update win patterns table:
       ├─ Record which evidence combination was used
       ├─ Record which argument patterns were in the draft
       ├─ Increment win or loss count
       └─ Recalculate win rate
       → Next dispute with this reason code × vertical gets smarter recommendations
```

---

## MCP Tools and Knowledge Base Interaction

Each MCP tool queries specific tables from the knowledge base:

| MCP Tool | Reads From KB | Writes To KB |
|---|---|---|
| `get_scheme_rules` | Scheme Rules | — |
| `get_evidence_requirements` | Evidence Requirement Rules | — |
| `get_psp_formats` | PSP Format Rules | — |
| `get_win_patterns` | Win Patterns | — |
| `plan_evidence` | All 5 tables (assembles full context for LLM) | — |
| `retrieve_operational_evidence` | Evidence Output Templates (determines format) | — |
| `check_evidence_gaps` | Evidence Requirement Rules (what's missing) | — |
| `assess_readiness` | Evidence Requirement Rules, Scheme Rules (deadline) | — |
| `draft_argument` | All 5 tables (assembles full context for LLM) | — |
| `validate_draft` | Scheme Rules, PSP Format Rules, Win Patterns | — |
| `submit_to_psp` | PSP Format Rules, Output Templates | — |
| *outcome webhook* | — | Win Patterns (feedback loop) |

---

## Context Assembly Per LLM Call

Every LLM call in the pipeline receives context assembled from the knowledge base. The MCP tool fetches the relevant slice and includes it as structured prompt sections.

### Claim Analyst

```
Receives:
  - Dispute case data (amount, dates, customer claim, hotel/merchant profile)
  - Scheme rules for this reason code (NEW)
    → What the card network considers valid grounds for this dispute type
    → What disproofs the network expects from the merchant
  - Vertical context
    → Industry-specific vocabulary and common dispute patterns
```

### Strategy Advisor

```
Receives (all of the above, plus):
  - Claim analysis output (from previous step)
  - Existing evidence analysis
  - Evidence relevance scores
  - Win patterns for this reason code × vertical (NEW)
    → "78% win rate when folio + cancellation_policy + registration_card are present"
    → "Strongest pattern: lead with 3DS proof, then policy disclosure"
  - Scheme rule citations (NEW)
    → Exact documentation references for the recommended defense
```

### Evidence Planner

```
Receives (all of the above, plus):
  - Strategy advice (from previous step)
  - Evidence requirement rules for this reason code × vertical (ENHANCED)
    → Vertical-specific requirements, not just generic categories
    → Per-item rationale explaining why this evidence matters
  - PSP format rules (NEW)
    → So the plan can specify "get cancellation policy as extractable text"
    → Instead of generic "get cancellation policy"
  - Auto-fulfillability flags
    → Which items can be pulled from the operational system automatically
```

### Argument Generator

```
Receives (all of the above, plus):
  - Cached claim analysis (from dispute doc)
  - Cached strategy (from dispute doc — currently not persisted, needs fix)
  - Cached scheme rules with citations (from dispute doc)
  - PSP format rules
    → Knows cancellation_policy must be TEXT for Stripe, PDF for Adyen
  - Win patterns
    → Uses argument patterns that historically succeed
  - Readiness assessment
    → Case strength, evidence completeness, any gaps to work around
  - All uploaded evidence files (via Claude vision + text extraction)
  - Previous draft validation (on regeneration)
    → Knows what was weak and focuses on strengthening those specific claims
```

---

## Seeding and Maintenance

### Initial Seed

The knowledge base is seeded from:

1. **Scheme rules** — Manually curated from Visa Core Rules, Mastercard Chargeback Guide, Amex Merchant Regulations. The existing `disputeCodeMapping.ts` (65 codes) provides the starting data. Enhanced with citations, merchant obligations, and submission constraints from official documentation.

2. **Evidence requirement rules** — Manually curated per vertical. Start with hospitality (existing knowledge) and ticketing. General vertical gets baseline rules. Each new vertical requires a seeding pass.

3. **PSP format rules** — Extracted from PSP API documentation. Stripe's Evidence object fields, Adyen's defense document requirements, etc.

4. **Evidence output templates** — Defined per vertical × PSP combination. Start with hospitality × Stripe (most common), expand as customers onboard.

5. **Win patterns** — Starts empty. Populates organically as disputes resolve. Can be bootstrapped with anonymized historical data if available.

### Ongoing Maintenance

- **Card network rule updates:** When Visa/MC/Amex publish rule changes, import a new version via `rulesetService.importRuleset()`. The diff system (`rulesetService.diffRulesets()`) shows what changed.
- **New PSPs:** Add format rules when integrating a new payment processor.
- **New verticals:** Register a `VerticalDefinition`, seed evidence requirement rules, define output templates.
- **Win pattern refinement:** Automatic via dispute outcome webhooks. No manual maintenance needed.
- **Evidence requirement tuning:** As win patterns accumulate, evidence requirements can be re-prioritized based on actual outcomes (e.g., if registration cards don't correlate with wins for a specific code, downgrade from "required" to "recommended").

---

## Current State vs Target

| Component | Current State | Target State |
|---|---|---|
| Scheme rules | 65 codes in static `disputeCodeMapping.ts`. Basic fields (required/optional categories). No citations. | Firestore-backed with versioning, citations, merchant obligations, submission constraints. |
| Evidence requirements | Same for all verticals. `requiredEvidence: ["policy", "pms_data"]`. | Per reason code × vertical. With rationale, tips, auto-fulfillability flags. |
| PSP format rules | `stripeEvidenceMapper.ts` — field name mapping only. | Full format specification per slot per PSP. Text vs file vs image, size limits. |
| Evidence output templates | Auto-collector always generates PDFs. | Format-aware output driven by vertical × PSP. Text extraction, PDF, passthrough. |
| Win patterns | Nothing. | Feedback loop from dispute outcomes. Grows smarter per vertical per reason code. |
| Specialist context chaining | Claim analysis and existing evidence cached. Strategy NOT cached. Nothing fed to argument generator. | All specialist outputs cached and chained through to argument generation. |
| LLM scheme awareness | Planner and strategy advisor see basic `codeInfo`. Claim analyst and argument generator see nothing. | Every LLM call receives the relevant knowledge base context for this specific dispute. |
| MCP role | Exposes tools for external AI agents. Dashboard doesn't use it. | Central knowledge broker for both the dashboard and external agents. |
| Vertical support | Prompt label swapping only ("hotel" vs "merchant"). Same evidence rules for all. | Full vertical-aware pipeline: different evidence, formats, strategies per industry. |
