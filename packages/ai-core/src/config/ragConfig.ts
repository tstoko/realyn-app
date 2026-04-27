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
// Embedding provider + model
// ---------------------------------------------------------------------------

/**
 * Embedding provider. Must match the model in {@link EMBEDDING_MODEL}.
 *
 * - `pinecone` — Pinecone Inference (single-vendor; default before this
 *   migration).
 * - `voyage` — Voyage AI's REST API. Used for domain-tuned models like
 *   `voyage-law-2` whose retrieval quality on regulatory text outperforms
 *   general-purpose embeddings.
 *
 * Locked constant: changing this without re-ingesting every record produces
 * silent retrieval-quality collapse (different embedding spaces), so the
 * value is treated identically to {@link RAG_SCHEMA_VERSION} — bump the
 * schema version when changing it.
 */
export const EMBEDDING_PROVIDER = "voyage" as const;
export type EmbeddingProvider = typeof EMBEDDING_PROVIDER;

/**
 * Embedding model used for both document ingestion and query embedding.
 * MUST be the same at ingest time and query time or retrieval quality collapses.
 *
 * `voyage-law-2` is Voyage AI's domain-tuned model for legal/regulatory
 * retrieval. 1024 dimensions, accessed via the Voyage REST API
 * (https://api.voyageai.com/v1/embeddings) using `VOYAGE_API_KEY`.
 *
 * History:
 *   v1 (RAG_SCHEMA_VERSION=1) — `multilingual-e5-large` via Pinecone Inference.
 *   v2 (RAG_SCHEMA_VERSION=2) — `voyage-law-2` via Voyage AI; index switched
 *     to `metric: dotproduct` so dense + sparse hybrid retrieval can share
 *     a single Pinecone index.
 *
 * We write this value into every record's metadata (`embeddingModel`) so
 * mismatches can be detected in Firestore/Pinecone audits.
 */
export const EMBEDDING_MODEL = "voyage-law-2" as const;
export type EmbeddingModel = typeof EMBEDDING_MODEL;

/** Vector dimension for {@link EMBEDDING_MODEL}. */
export const EMBEDDING_DIM = 1024 as const;

/**
 * Internal embedding-call vocabulary. Both Pinecone Inference and Voyage AI
 * distinguish between passage-style and query-style calls; the adapter layer
 * maps these to each provider's own terminology (Pinecone: `passage`/`query`;
 * Voyage: `document`/`query`). Passing the wrong one costs ~10% recall.
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
 * Pinecone cloud + region for Serverless indexes. We default to GCP `us-central1`
 * to match the Cloud Functions region and minimise cross-region latency.
 */
export const PINECONE_CLOUD = "gcp" as const;
export const PINECONE_REGION = "us-central1" as const;

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
 *   v2 — voyage-law-2 via Voyage AI, dotproduct metric, dense vectors L2-
 *        normalised at upsert/query time, hybrid retrieval (dense + sparse)
 *        on the same index. Re-ingestion required when crossing this
 *        boundary because vector spaces are not comparable.
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
