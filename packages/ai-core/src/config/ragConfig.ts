/**
 * RAG configuration — LOCKED CONSTANTS.
 *
 * These values are load-bearing: changing any of them after ingestion has run
 * means re-indexing every document in Pinecone. Do not make them configurable
 * per-request, and do not override them in tests without explicit intent.
 *
 * If you need to change a value, the process is:
 *   1. Bump {@link RAG_SCHEMA_VERSION} in the same commit.
 *   2. Re-run the ingestion scripts against a fresh index (or a new namespace
 *      suffix, e.g. `rulebooks-v2`) so old and new vectors never mix.
 *   3. Update {@link PINECONE_INDEX_NAME} or namespace constants as appropriate.
 *   4. Cut over readers only once re-ingestion is complete.
 */

// ---------------------------------------------------------------------------
// Embedding model
// ---------------------------------------------------------------------------

/**
 * Embedding model used for both document ingestion and query embedding.
 * MUST be the same at ingest time and query time or retrieval quality collapses.
 *
 * `multilingual-e5-large` is hosted by Pinecone Inference (single vendor —
 * Anthropic for the LLM, Pinecone for vectors + sparse + rerank, no third
 * vendor account). 1024 dimensions, tuned for retrieval on mixed-language
 * content. We write this value into every record's metadata (`embeddingModel`)
 * so mismatches can be detected in Firestore/Pinecone audits.
 *
 * History:
 *   v1 (RAG_SCHEMA_VERSION=1) — `multilingual-e5-large`, cosine metric,
 *     dense-only.
 *   v2 (RAG_SCHEMA_VERSION=2) — same dense model, but the index switched to
 *     `metric: dotproduct` so dense + sparse hybrid retrieval can share a
 *     single Pinecone index, dense vectors are L2-normalised at upsert/query
 *     time, and a sparse encoder (`pinecone-sparse-english-v0`) + cross-
 *     encoder reranker (`cohere-rerank-3.5`, gated on `RERANK_ENABLED`) are
 *     bolted on for hybrid + rerank. Vectors from v1 ingestion are NOT
 *     comparable to v2 (different metric + normalisation + sparse
 *     companions), so re-ingestion is required when crossing this boundary.
 *
 * Domain-tuned alternative considered + rejected: Voyage AI's `voyage-law-2`.
 * The trade-off was ~5–10 retrieval-quality points on legal text in exchange
 * for a third vendor account and a third API key. We chose Pinecone-only
 * (one vendor for embeddings + sparse + rerank) and let hybrid + rerank
 * carry the precision lift instead. Re-evaluate if post-ingest evals
 * (§C8 of docs/post-hardening-plan.md) show retrieval is the bottleneck.
 */
export const EMBEDDING_MODEL = "multilingual-e5-large" as const;
export type EmbeddingModel = typeof EMBEDDING_MODEL;

/** Vector dimension for {@link EMBEDDING_MODEL}. */
export const EMBEDDING_DIM = 1024 as const;

/**
 * Pinecone Inference distinguishes between passage-style and query-style
 * embedding calls. Passing the wrong one costs ~10% recall, so call sites
 * use {@link embedDocuments} / {@link embedQuery} rather than picking
 * `inputType` directly.
 */
export type EmbeddingInputType = "passage" | "query";

// ---------------------------------------------------------------------------
// Pinecone index + namespaces
// ---------------------------------------------------------------------------

/**
 * Pinecone index name. Overridable via `PINECONE_INDEX_NAME` so staging and
 * production can point at different indexes without a code change. The setup
 * script creates the index if it does not exist.
 */
export function getPineconeIndexName(): string {
  return process.env.PINECONE_INDEX_NAME?.trim() || "realyn-rag";
}

/**
 * Pinecone cloud + region for Serverless indexes.
 *
 * Overridable via `PINECONE_CLOUD` and `PINECONE_REGION` env vars so the same
 * code can target free-tier accounts (Starter plan only allows
 * `aws/us-east-1`) and paid accounts (Standard/Enterprise unlock GCP +
 * Azure regions including `gcp/us-central1` which co-locates with Firebase
 * Cloud Functions).
 *
 * Defaults: `aws/us-east-1`. This is the only region the Pinecone Starter
 * (free) plan supports, and it's what `rag:setup` will create unless the
 * env vars are set. It introduces a few tens of ms of cross-region RTT on
 * each retrieval call from `us-central1` Cloud Functions — measurable but
 * not catastrophic for a non-realtime LLM pipeline.
 *
 * To upgrade later (paid plan, GCP co-location):
 *   1. Upgrade the Pinecone organisation to Standard or Enterprise.
 *   2. Set `PINECONE_CLOUD=gcp` and `PINECONE_REGION=us-central1` in the
 *      Cloud Functions env (and any local `.env` used for ingestion).
 *   3. Set a new `PINECONE_INDEX_NAME` (e.g. `realyn-rag-gcp`) so the old
 *      AWS index is not touched. Pinecone serverless cloud+region are
 *      immutable on an existing index — a region change always requires a
 *      new index.
 *   4. Re-run `rag:setup` (creates the new index) and `rag:ingest` for each
 *      rulebook (re-ingests into the new index).
 *   5. Once retrieval looks healthy on the new index, retire the old one.
 *
 * Embedding models, sparse encoder, and rerank models are all served from
 * Pinecone Inference (a separate, region-agnostic control plane), so the
 * data-region change does not affect anything except the vector index
 * itself.
 *
 * Note on rerank availability (Starter plan): `cohere-rerank-3.5` is
 * **not available** on Starter — Pinecone's docs list it as paid-plan only.
 * Free-tier alternatives reachable via the same Inference endpoint are
 * `bge-reranker-v2-m3` and `pinecone-rerank-v0` (each 500 reqs/month). This
 * is fine today because `RERANK_ENABLED` defaults OFF; if rerank is ever
 * flipped on while still on Starter, swap `RERANK_MODEL` to a free-tier
 * model in the same commit.
 */
export type PineconeCloud = "aws" | "gcp" | "azure";

export function getPineconeCloud(): PineconeCloud {
  const raw = process.env.PINECONE_CLOUD?.trim().toLowerCase();
  if (raw === "aws" || raw === "gcp" || raw === "azure") return raw;
  return "aws";
}

export function getPineconeRegion(): string {
  return process.env.PINECONE_REGION?.trim() || "us-east-1";
}

/**
 * @deprecated Use {@link getPineconeCloud} so env overrides are honoured.
 * Kept for backwards compatibility with code that imported the constant
 * directly. Reflects the default value, not any env override.
 */
export const PINECONE_CLOUD: PineconeCloud = "aws";

/**
 * @deprecated Use {@link getPineconeRegion} so env overrides are honoured.
 * Kept for backwards compatibility with code that imported the constant
 * directly. Reflects the default value, not any env override.
 */
export const PINECONE_REGION = "us-east-1" as const;

/**
 * Namespaces isolate different content types inside a single index. Queries
 * always target one namespace; cross-namespace fan-out is orchestrated in
 * the RAG service layer.
 */
export const RAG_NAMESPACES = {
  rulebooks: "rulebooks",
  cases: "cases",
  policies: "policies",
} as const;

export type RagNamespace = (typeof RAG_NAMESPACES)[keyof typeof RAG_NAMESPACES];

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Target chunk size in tokens (approximate — we count by character/4).
 * 500–800 is the retrieval sweet spot: large enough to preserve context,
 * small enough to keep retrieval precise.
 */
export const CHUNK_TARGET_TOKENS = 700 as const;

/** Overlap between adjacent chunks, in tokens. Prevents losing context at boundaries. */
export const CHUNK_OVERLAP_TOKENS = 100 as const;

/** Hard cap to protect against pathological single-paragraph chunks. */
export const CHUNK_MAX_TOKENS = 1200 as const;

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** Minimum relevance score for a retrieved chunk to be injected into a prompt. */
export const MIN_RELEVANCE_SCORE = 0.35 as const;

/**
 * Hybrid retrieval alpha weight.
 *
 * `score = (alpha * dense·dense_query) + ((1 - alpha) * sparse·sparse_query)`.
 *
 * - `1.0` → pure dense (semantic) retrieval.
 * - `0.0` → pure sparse (lexical) retrieval.
 * - `0.5` → balanced; what we ship by default.
 *
 * Implemented client-side via {@link applyAlpha}: Pinecone has no native
 * alpha flag, so we scale the dense and sparse query vectors before sending.
 * Tunable per call but pinned here as the default; revisit during the
 * post-ingest eval (§C8) once we have actual Hit@5/MRR numbers.
 */
export const RAG_HYBRID_ALPHA = 0.5 as const;

/**
 * Reranking model used by `rerankService.maybeRerank` when reranking is
 * enabled (`RERANK_ENABLED=true`).
 *
 * `cohere-rerank-3.5` is Cohere's leading cross-encoder, available via
 * Pinecone Inference. Open-source alternatives reachable through the same
 * endpoint: `bge-reranker-v2-m3`, `pinecone-rerank-v0`. Plan-tier and
 * rate-limit caveats apply — see docs/post-hardening-plan.md §C7
 * corrections; verify availability at provisioning time (`rag:test`)
 * before flipping `RERANK_ENABLED=true` in any environment.
 */
export const RERANK_MODEL = "cohere-rerank-3.5" as const;
export type RerankModel = typeof RERANK_MODEL;

/**
 * Number of candidates to fetch from hybrid retrieval before reranking.
 * The reranker keeps the best `DEFAULT_TOP_K` of these; pulling more
 * candidates gives the cross-encoder more variety to choose from at the
 * cost of latency proportional to this number.
 */
export const RERANK_CANDIDATE_K = 20 as const;

/**
 * Default `topK` per namespace. The RAG service can override per call,
 * but these are the sensible defaults for the existing pipeline.
 */
export const DEFAULT_TOP_K = {
  rulebooks: 5,
  cases: 3,
  policies: 3,
} as const satisfies Record<RagNamespace, number>;

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

/**
 * Maximum vectors per Pinecone upsert call. Pinecone accepts up to 100
 * vectors per request; we stay under that to leave headroom.
 */
export const UPSERT_BATCH_SIZE = 90 as const;

/** Maximum texts per Pinecone Inference `embed()` call. */
export const EMBED_BATCH_SIZE = 64 as const;

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/**
 * Version stamped into every record's metadata so future migrations can
 * detect and handle vectors from older ingestion runs. Bump when the
 * chunking strategy, metadata shape, embedding model, or index metric
 * changes.
 *
 * History:
 *   v1 — multilingual-e5-large via Pinecone Inference, cosine metric, dense-only.
 *   v2 — multilingual-e5-large via Pinecone Inference (same as v1), dotproduct
 *        metric, dense vectors L2-normalised at upsert/query time, hybrid
 *        retrieval (dense + sparse) on the same index, optional cross-encoder
 *        rerank gated on RERANK_ENABLED. Re-ingestion required when crossing
 *        this boundary because vector spaces are not comparable (different
 *        metric + normalisation + sparse companions).
 */
export const RAG_SCHEMA_VERSION = 2 as const;

/**
 * Pinecone index distance metric.
 *
 * `dotproduct` is required for single-index hybrid retrieval (dense + sparse
 * vectors on the same record) — Pinecone's hybrid path does not work with
 * `cosine`. We L2-normalise dense vectors at upsert/query time, which makes
 * dotproduct on the dense side mathematically identical to cosine similarity,
 * so the dense retrieval characteristics are preserved while enabling sparse
 * fusion.
 */
export const PINECONE_METRIC = "dotproduct" as const;
export type PineconeMetric = typeof PINECONE_METRIC;
