# RAG Implementation Guide

How to add Retrieval-Augmented Generation to Realyn's dispute resolution pipeline so the LLM has access to scheme rulebooks, past case examples, and other unstructured knowledge at generation time.

---

## Current State: Structured Knowledge Base

The AI pipeline already has a structured knowledge base backed by five Firestore collections. These are populated per-client during onboarding and queried deterministically before every LLM call.

| Collection | Key | What it stores |
|---|---|---|
| `schemeRules` | `{network}_{reasonCode}` | Card network obligations, time limits, citations, winnability defaults |
| `evidenceRequirements` | `{network}_{reasonCode}_{verticalId}` | Required/optional evidence items per reason code and merchant vertical |
| `pspFormats` | `{pspProvider}_{evidenceSlot}` | Accepted file formats, size limits, API field names for Stripe/Adyen |
| `evidenceOutputTemplates` | `{evidenceType}_{verticalId}_{psp}` | How to format extracted evidence for a given PSP slot |
| `winPatterns` | `{network}_{reasonCode}_{verticalId}` | Historical win/loss rates and which evidence combinations correlate with wins |

Additionally, `disputeCodeMapping.ts` provides a static fallback mapping from reason codes to dispute metadata when the Firestore KB collections are empty.

**This structured KB is deterministic and fast.** It stays. RAG supplements it with unstructured knowledge the structured tables cannot capture.

---

## What RAG Adds

Three categories of knowledge that the structured KB cannot serve today:

### 1. Scheme Rulebook Passages (highest impact)

Visa Core Rules, Mastercard Chargeback Guide, and similar PDFs run to hundreds of pages. The `schemeRules` collection stores a curated summary per reason code, but the LLM sometimes needs the *exact regulatory language* — for example when writing an argument that cites "Visa Core Rules §11.3.2" or when the dispute falls into an edge case the curated summary doesn't cover.

**Source documents:** Visa Core Rules & Visa Product and Service Rules PDFs, Mastercard Chargeback Guide, Amex Merchant Regulations.

### 2. Past Case Examples (medium impact)

When the pipeline has enough historical disputes (won and lost), retrieving similar past cases gives the LLM concrete examples of winning arguments and evidence combinations. This is especially useful for the Strategy Advisor and Evidence Planner specialists.

**Source documents:** Resolved dispute records in Firestore (anonymised), including their argument drafts and outcomes.

### 3. Organization-Specific Policies (lower impact, high value for personalization)

Merchant policies (e.g. cancellation, T&Cs, refund rules, SLAs — hospitality or ticketing). Currently the pipeline has access to policy *metadata* from the organization/property document (often still named `Hotel` in the schema), but not the full policy text. RAG makes the full text searchable so the argument generator can quote specific policy clauses.

**Source documents:** PDFs and text documents uploaded to each organization's document library in Firebase Storage.

---

## Recommended Architecture

```
                        ┌─────────────────────────────────┐
                        │         Cloud Function           │
                        │   (planEvidence / draftArgument) │
                        └────────┬───────────┬────────────┘
                                 │           │
              structured lookup  │           │  semantic retrieval
                                 ▼           ▼
                        ┌──────────┐  ┌──────────────┐
                        │ Firestore│  │   Pinecone    │
                        │   KB     │  │  Serverless   │
                        │ (5 cols) │  │  (vectors)    │
                        └──────────┘  └──────┬───────┘
                                             │
                                    embeddings via
                                    Vertex AI / OpenAI
```

### Vector Store: Pinecone Serverless

Chosen for zero-ops serverless scaling, pay-per-query pricing, metadata filtering, and hybrid search (dense + sparse vectors). A single index with namespace isolation per organization.

### Embedding Model

**See [`embedding-provider-setup.md`](./embedding-provider-setup.md) for full setup steps and provider comparison.**

Short version: Anthropic (our current LLM) does not offer embeddings, so a separate provider is needed. Recommended order:

1. **Pinecone Inference** — embed + upsert in one call, no new vendor. Default starting point.
2. **Voyage AI** (`voyage-3-large` or `voyage-law-2`) — Anthropic's recommended partner; slight quality edge on rulebook text.
3. **OpenAI `text-embedding-3-small`** or **Vertex AI `text-embedding-004`** — fine alternatives if a key already exists for other reasons.

### Retrieval Strategy: Hybrid Search

Combine dense vector similarity with sparse keyword matching (BM25). This matters for chargeback disputes because:

- **Dense search** finds semantically similar passages ("merchant failed to issue refund" ≈ "no credit was processed")
- **Sparse search** catches exact terms the LLM needs ("reason code 13.1", "Visa §11.3.2", specific policy clause numbers)

Pinecone supports hybrid search natively via sparse-dense vectors in a single query.

---

## Integration Points in the Pipeline

The existing specialist pipeline runs in sequence:

```
Step 0: Build case → resolve code info → fetch structured KB
Step 1: Claim Analyst
Step 2: Evidence Analyzer
Step 3: Relevance Scorer
Step 4: Strategy Advisor
Step 5-6: Evidence Planner + Quality Checker (revision loop)
Step 7: Save to Firestore
```

RAG retrieval slots in at **Step 0** alongside the existing structured KB fetch, and optionally at **argument generation** time:

| Integration point | What to retrieve | Why |
|---|---|---|
| **Step 0 (evidence planning)** | Scheme rulebook passages for the dispute's reason code; win/loss examples for similar cases | Planner and strategy advisor get regulatory grounding and historical patterns |
| **Argument generation** | Exact rulebook citations; organization policy clauses; similar winning arguments | Argument generator can quote regulations and policies verbatim |

### Retrieval Function

A single `retrieveContext()` function that runs alongside the existing `assembleKnowledgeContext()`:

```typescript
interface RAGQuery {
  disputeId: string;
  reasonCode: string;
  network: CardNetwork;
  claimType: string;
  merchantVertical: string;
  organizationId: string;
  pspProvider: string;
  additionalTerms?: string[];  // extracted from claim analysis
}

interface RAGResult {
  rulebookPassages: RetrievedChunk[];
  pastCases: RetrievedChunk[];
  policyPassages: RetrievedChunk[];
}

interface RetrievedChunk {
  text: string;
  source: string;          // e.g. "Visa Core Rules v2024, §11.3.2"
  score: number;           // relevance score
  metadata: Record<string, string>;
}
```

The retrieved chunks get injected into specialist prompts as a `## REFERENCE MATERIAL` section, clearly delimited so the LLM knows to cite them rather than hallucinate.

---

## Document Ingestion Pipeline

### Phase A: Scheme Rulebooks (batch, infrequent)

Rulebooks change ~1-2x per year. Ingestion is a batch job.

1. **Parse PDF** — Extract text from rulebook PDFs using a PDF parser (e.g. `pdf-parse`, or Vertex AI Document AI for complex layouts).
2. **Chunk** — Split into overlapping chunks of ~500-800 tokens with section headers preserved. Use heading-aware chunking: each chunk starts with its section path (e.g. "Chapter 11 > §11.3 > §11.3.2 Compelling Evidence").
3. **Enrich metadata** — Tag each chunk with: `source`, `network`, `section`, `effectiveDate`, `documentVersion`. Where possible, tag relevant reason codes.
4. **Embed** — Generate embeddings via the chosen model.
5. **Upsert to Pinecone** — Store in a `rulebooks` namespace with the metadata for filtering.

```typescript
// Example chunk metadata
{
  id: "visa-core-2024-11.3.2-chunk-3",
  namespace: "rulebooks",
  metadata: {
    source: "Visa Core Rules v2024",
    network: "visa",
    section: "11.3.2",
    sectionTitle: "Compelling Evidence for Fraud Disputes",
    effectiveDate: "2024-04-15",
    reasonCodes: ["10.4", "10.5"],  // relevant codes
    chunkIndex: 3,
  }
}
```

### Phase B: Past Cases (incremental, triggered on dispute close)

When a dispute is resolved (won or lost), a Cloud Function trigger anonymises the case and indexes it.

1. **Anonymise** — Strip PII (guest names, card numbers, emails). Keep: reason code, network, vertical, evidence types used, argument structure, outcome.
2. **Build case summary** — Create a text representation: dispute type, evidence submitted, argument approach, outcome, and any notable factors.
3. **Embed + upsert** — Store in a `cases` namespace, filtered by `network`, `reasonCode`, `verticalId`, `outcome`.

### Phase C: Organization Policies (on upload)

When a merchant uploads policy documents, a Storage trigger processes them.

1. **Parse** — Extract text from PDF/DOCX.
2. **Chunk** — Split into ~400-token chunks with document name and section headers.
3. **Embed + upsert** — Store in a `policies` namespace, filtered by `organizationId`.

---

## Pinecone Index Design

A single Pinecone Serverless index with namespace isolation:

| Namespace | Content | Metadata filters | Update frequency |
|---|---|---|---|
| `rulebooks` | Card network scheme rules | `network`, `section`, `reasonCodes[]`, `effectiveDate` | ~Yearly |
| `cases` | Anonymised past disputes | `network`, `reasonCode`, `verticalId`, `outcome`, `organizationId` | On dispute close |
| `policies` | Org-specific policy documents | `organizationId`, `documentType`, `documentName` | On upload |

### Query Patterns

**Evidence planning query:**
```typescript
const results = await pinecone.query({
  namespace: "rulebooks",
  vector: embed(queryText),
  filter: { network: "visa", reasonCodes: { $in: ["10.4"] } },
  topK: 5,
  includeMetadata: true,
});
```

**Argument generation query** (multi-namespace fan-out):
```typescript
const [rulebook, cases, policies] = await Promise.all([
  pinecone.query({
    namespace: "rulebooks",
    vector: queryVector,
    filter: { network, reasonCodes: { $in: [reasonCode] } },
    topK: 5,
  }),
  pinecone.query({
    namespace: "cases",
    vector: queryVector,
    filter: { network, reasonCode, outcome: "won" },
    topK: 3,
  }),
  pinecone.query({
    namespace: "policies",
    vector: queryVector,
    filter: { organizationId },
    topK: 3,
  }),
]);
```

---

## Implementation Phases

### Phase 1: Rulebook RAG (highest impact, lowest complexity)

**Scope:** Ingest Visa and Mastercard rulebooks into Pinecone. Retrieve relevant passages during evidence planning and argument generation.

**Steps:**
1. Set up Pinecone Serverless index (starter tier is free for experimentation)
2. Write a batch ingestion script in `functions/src/scripts/` that parses rulebook PDFs, chunks, embeds, and upserts
3. Create `packages/core/src/services/ragService.ts` with `retrieveRulebookContext(query)` 
4. Wire into `evidencePlanningService.ts` Step 0 and `argumentGenerator.ts` prompt builder
5. Add `PINECONE_API_KEY` to Cloud Functions secrets
6. Measure: compare argument quality (manual review) with and without RAG context

**Estimated effort:** 2-3 days.

### Phase 2: Past Case Retrieval

**Scope:** Index resolved disputes. Retrieve similar winning cases during strategy advising and argument generation.

**Steps:**
1. Write a Firestore trigger (`onDisputeClosed`) that anonymises and indexes the case
2. Add `retrieveSimilarCases(query)` to `ragService.ts`
3. Wire into Strategy Advisor and Argument Generator prompts
4. Add a backfill script for existing resolved disputes

**Estimated effort:** 2-3 days. Depends on having enough resolved disputes to be useful.

### Phase 3: Organization Policy RAG

**Scope:** Index merchant-uploaded policy documents so the argument generator can quote specific clauses.

**Steps:**
1. Write a Storage trigger (`onPolicyUploaded`) that parses, chunks, embeds, and upserts to the `policies` namespace
2. Add `retrievePolicyContext(organizationId, query)` to `ragService.ts`  
3. Wire into Argument Generator with org-scoped retrieval
4. Handle policy document deletion (remove vectors on file delete)

**Estimated effort:** 2-3 days.

---

## Key Design Decisions

### Where to embed

Embeddings should be generated in Cloud Functions (not the client). This keeps API keys server-side and allows caching. Use a thin wrapper that supports swapping providers:

```typescript
// packages/core/src/services/embeddingService.ts
export async function embed(text: string): Promise<number[]> {
  // Switch between OpenAI and Vertex AI based on config
}
```

### Chunk size

Target 500-800 tokens per chunk for rulebooks, 300-500 for policies. Smaller chunks improve retrieval precision but may lose surrounding context. Use overlapping windows (100-token overlap) to mitigate.

### Prompt injection

Retrieved chunks are injected as read-only reference material with source attribution. The prompt makes clear these are authoritative references:

```
## REFERENCE MATERIAL (from Visa Core Rules v2024)
The following passages are retrieved from official scheme documentation.
Cite specific sections when building your argument.

[§11.3.2] "For fraud-related disputes, the merchant must provide
compelling evidence that..."
```

### Cost estimation (Pinecone Serverless)

- **Storage:** ~$0.33/GB/month. A full set of scheme rulebooks is <50MB of text → negligible.
- **Queries:** ~$8 per million read units. At ~10 queries per dispute × 1000 disputes/month = 10K queries → ~$0.08/month.
- **Writes:** One-time ingestion + incremental case indexing. Negligible.

Total estimated cost: **<$5/month** at current scale.

### Fallback behavior

RAG retrieval is **additive, never blocking**. If Pinecone is unreachable or returns no results, the pipeline continues with the structured KB alone (the same behavior as today). Retrieved context has a minimum relevance score threshold — low-confidence results are discarded rather than injected.

---

## File Structure (proposed)

```
packages/core/src/services/
  ragService.ts              # retrieveRulebookContext, retrieveSimilarCases, retrievePolicyContext
  embeddingService.ts        # embed() wrapper for OpenAI / Vertex AI

functions/src/services/
  ragService.ts              # functions copy (or import from core after build)

functions/src/scripts/
  ingestRulebooks.ts         # batch script: PDF → chunks → Pinecone
  backfillCases.ts           # backfill script: existing disputes → Pinecone

functions/src/handlers/
  ragTriggers.ts             # onDisputeClosed → index case; onPolicyUploaded → index policy
```

---

## Prerequisites

- [ ] Pinecone Serverless account (free starter tier available)
- [ ] Embedding API access (OpenAI or Vertex AI)
- [ ] Scheme rulebook PDFs (Visa Core Rules, Mastercard Chargeback Guide)
- [ ] `PINECONE_API_KEY` added to Cloud Functions secrets
- [ ] `OPENAI_API_KEY` or Vertex AI credentials (may already exist for other features)
