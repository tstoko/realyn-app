/**
 * RAG Service — semantic retrieval of scheme rulebooks, past cases, and policies.
 *
 * This is the read path. Writes (ingestion, case indexing, policy indexing)
 * live in `functions/src/scripts/` and trigger handlers. The service is
 * deliberately fail-safe: every public function returns an empty result on
 * error rather than throwing, because RAG is always additive context to the
 * existing deterministic pipeline — it must never block a dispute from being
 * processed.
 *
 * The service depends on a {@link VectorStorePort} rather than Pinecone
 * directly. This keeps `@realyn/ai-core` free of Pinecone imports for
 * consumers that only want the domain layer (tests, local tools) and lets
 * the Functions/Scripts layer supply a concrete Pinecone-backed adapter.
 */

import {
  DEFAULT_TOP_K,
  MIN_RELEVANCE_SCORE,
  RAG_HYBRID_ALPHA,
  RAG_NAMESPACES,
  RERANK_CANDIDATE_K,
  type RagNamespace,
} from "../config/ragConfig";
import {
  EMPTY_RAG_RESULT,
  type RagQuery,
  type RagResult,
  type RetrievedChunk,
  type RulebookQueryFilter,
  type CaseQueryFilter,
  type PolicyQueryFilter,
} from "../types/rag";
import { embedQuery } from "./embeddingService";
import {
  applyAlpha,
  sparseEmbedQuery,
  type SparseVector,
} from "./sparseEmbeddingService";
import { isRerankEnabled, maybeRerank } from "./rerankService";
import { getTelemetryEmitter, type TelemetryContext } from "../telemetry";

// ---------------------------------------------------------------------------
// Port — implemented in functions/ with concrete Pinecone client
// ---------------------------------------------------------------------------

export interface VectorQuery {
  namespace: RagNamespace;
  /** Dense query vector. L2-normalised so dotproduct ≡ cosine. */
  vector: number[];
  topK: number;
  filter?: Record<string, unknown>;
  /**
   * Optional sparse query vector. When present together with `vector`, the
   * adapter performs hybrid (dense + sparse) retrieval against a single
   * `metric: dotproduct` Pinecone index. Both vectors are expected to be
   * pre-scaled per {@link applyAlpha} — the adapter does no further weighting.
   */
  sparseVector?: SparseVector;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Abstracts the vector store so the RAG service can be tested without Pinecone
 * and so the backing store can be swapped (e.g. pgvector, in-memory fake).
 */
export interface VectorStorePort {
  query(q: VectorQuery): Promise<VectorMatch[]>;
}

// ---------------------------------------------------------------------------
// Module-level store injection — set once at application startup
// ---------------------------------------------------------------------------

let _store: VectorStorePort | null = null;

export function configureVectorStore(store: VectorStorePort): void {
  _store = store;
}

export function getVectorStore(): VectorStorePort | null {
  return _store;
}

/** Test helper — reset the module cache. */
export function _resetVectorStoreForTests(): void {
  _store = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve context across all RAG namespaces in parallel. Always succeeds;
 * partial failures are surfaced via `result.partial` and an empty array for
 * the affected namespace.
 */
export async function retrieveRagContext(query: RagQuery): Promise<RagResult> {
  const startMs = Date.now();

  const store = _store;
  if (!store) {
    // Not configured — treat as disabled rather than an error.
    return EMPTY_RAG_RESULT;
  }

  if (!query.queryText.trim()) {
    return EMPTY_RAG_RESULT;
  }

  const telemetry: TelemetryContext | undefined = query.disputeId
    ? { disputeId: query.disputeId, stage: query.stage ?? "rag_retrieve" }
    : undefined;

  // Embed the query in parallel for both providers — dense via the configured
  // EMBEDDING_PROVIDER (Voyage), sparse via Pinecone Inference's hosted
  // sparse-english model. We treat a sparse failure as non-fatal (partial:true)
  // so dense-only retrieval still happens; the inverse (dense fail, sparse OK)
  // is fatal because dense covers semantic matches that sparse can't.
  const [denseResult, sparseResult] = await Promise.all([
    embedQuery(query.queryText, { telemetry }),
    sparseEmbedQuery(query.queryText),
  ]);

  if (!denseResult.success || !denseResult.vector) {
    return { ...EMPTY_RAG_RESULT, partial: true, latencyMs: Date.now() - startMs };
  }

  // Apply hybrid alpha weighting client-side. If sparse failed, fall back to
  // pure-dense retrieval (alpha=1) so the request still produces results,
  // but mark partial so callers / telemetry can see the degraded mode.
  let denseQueryVector = denseResult.vector;
  let sparseQueryVector: SparseVector | undefined;
  let degradedToDenseOnly = false;
  if (sparseResult.success && sparseResult.vector) {
    const scaled = applyAlpha(denseResult.vector, sparseResult.vector, RAG_HYBRID_ALPHA);
    denseQueryVector = scaled.dense;
    sparseQueryVector = scaled.sparse;
  } else {
    console.warn(
      `[rag] sparse query embed failed (${sparseResult.error ?? "unknown"}); ` +
        `falling back to dense-only retrieval`,
    );
    degradedToDenseOnly = true;
  }

  const minScore = query.minScore ?? MIN_RELEVANCE_SCORE;
  const namespaces = query.namespaces ?? [
    RAG_NAMESPACES.rulebooks,
    RAG_NAMESPACES.cases,
    RAG_NAMESPACES.policies,
  ];

  const requests = namespaces.map((ns) =>
    queryNamespace(store, ns, denseQueryVector, sparseQueryVector, query, minScore).catch(
      (err) => {
        console.warn(`[rag] ${ns} retrieval failed:`, err?.message ?? err);
        return null as RetrievedChunk[] | null;
      },
    ),
  );

  const settled = await Promise.all(requests);

  const result: RagResult = {
    rulebooks: [],
    cases: [],
    policies: [],
    partial: degradedToDenseOnly,
    latencyMs: Date.now() - startMs,
  };

  namespaces.forEach((ns, i) => {
    const chunks = settled[i];
    if (chunks == null) {
      result.partial = true;
    } else {
      result[ns] = chunks;
    }
  });

  emitRetrievalTelemetry(query, result, startMs);
  return result;
}

// Convenience single-namespace helpers for when callers know they only need one.

export async function retrieveRulebookContext(
  queryText: string,
  filter?: RulebookQueryFilter,
  options?: { topK?: number; minScore?: number; disputeId?: string; stage?: string },
): Promise<RetrievedChunk[]> {
  const result = await retrieveRagContext({
    queryText,
    namespaces: [RAG_NAMESPACES.rulebooks],
    topK: options?.topK ? { rulebooks: options.topK } : undefined,
    minScore: options?.minScore,
    filters: filter ? { rulebooks: filter } : undefined,
    disputeId: options?.disputeId,
    stage: options?.stage,
  });
  return result.rulebooks;
}

export async function retrieveSimilarCases(
  queryText: string,
  filter?: CaseQueryFilter,
  options?: { topK?: number; minScore?: number; disputeId?: string; stage?: string },
): Promise<RetrievedChunk[]> {
  const result = await retrieveRagContext({
    queryText,
    namespaces: [RAG_NAMESPACES.cases],
    topK: options?.topK ? { cases: options.topK } : undefined,
    minScore: options?.minScore,
    filters: filter ? { cases: filter } : undefined,
    disputeId: options?.disputeId,
    stage: options?.stage,
  });
  return result.cases;
}

export async function retrievePolicyContext(
  queryText: string,
  filter: PolicyQueryFilter,
  options?: { topK?: number; minScore?: number; disputeId?: string; stage?: string },
): Promise<RetrievedChunk[]> {
  const result = await retrieveRagContext({
    queryText,
    namespaces: [RAG_NAMESPACES.policies],
    topK: options?.topK ? { policies: options.topK } : undefined,
    minScore: options?.minScore,
    filters: { policies: filter },
    disputeId: options?.disputeId,
    stage: options?.stage,
  });
  return result.policies;
}

// ---------------------------------------------------------------------------
// Prompt-injection helper
// ---------------------------------------------------------------------------

/**
 * Format retrieved chunks for injection into a specialist prompt.
 * Callers render this as a dedicated `## REFERENCE MATERIAL` section so the
 * LLM treats it as authoritative and cites specific sources rather than
 * hallucinating regulatory language.
 */
export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c, i) => `[${i + 1}] ${c.source}\n${c.text.trim()}`)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function queryNamespace(
  store: VectorStorePort,
  namespace: RagNamespace,
  vector: number[],
  sparseVector: SparseVector | undefined,
  query: RagQuery,
  minScore: number,
): Promise<RetrievedChunk[]> {
  const finalTopK = query.topK?.[namespace] ?? DEFAULT_TOP_K[namespace];
  // When reranking is enabled, fetch a wider candidate pool so the cross-
  // encoder has more variety to choose from. Reranker keeps the top
  // `finalTopK` of `RERANK_CANDIDATE_K` candidates.
  const candidateTopK = isRerankEnabled() ? Math.max(RERANK_CANDIDATE_K, finalTopK) : finalTopK;
  const filter = buildFilter(namespace, query);

  const matches = await store.query({
    namespace,
    vector,
    sparseVector,
    topK: candidateTopK,
    filter,
  });

  const candidates = matches
    .filter((m) => m.metadata)
    .map((m) => toRetrievedChunk(m))
    .filter((c): c is RetrievedChunk => c !== null);

  // Rerank (no-op when disabled or no port configured) then drop chunks
  // below `minScore`. The order matters: reranking against low-quality
  // candidates is wasted but harmless; filtering before rerank can starve
  // the cross-encoder of variety.
  const reranked = await maybeRerank({
    query: query.queryText,
    chunks: candidates,
    topN: finalTopK,
  });

  return reranked.filter((c) => c.score >= minScore);
}

function buildFilter(namespace: RagNamespace, query: RagQuery): Record<string, unknown> | undefined {
  if (namespace === RAG_NAMESPACES.rulebooks) {
    const f = query.filters?.rulebooks;
    if (!f) return undefined;
    const filter: Record<string, unknown> = {};
    if (f.network) filter.network = { $eq: f.network };
    if (f.reasonCodes?.length) filter.reasonCodes = { $in: f.reasonCodes };
    if (f.documentName) filter.documentName = { $eq: f.documentName };
    return Object.keys(filter).length ? filter : undefined;
  }
  if (namespace === RAG_NAMESPACES.cases) {
    const f = query.filters?.cases;
    if (!f) return undefined;
    const filter: Record<string, unknown> = {};
    if (f.network) filter.network = { $eq: f.network };
    if (f.reasonCode) filter.reasonCode = { $eq: f.reasonCode };
    if (f.verticalId) filter.verticalId = { $eq: f.verticalId };
    if (f.outcome) filter.outcome = { $eq: f.outcome };
    if (f.organizationId) filter.organizationId = { $eq: f.organizationId };
    return Object.keys(filter).length ? filter : undefined;
  }
  if (namespace === RAG_NAMESPACES.policies) {
    const f = query.filters?.policies;
    if (!f) return undefined;
    const filter: Record<string, unknown> = { organizationId: { $eq: f.organizationId } };
    if (f.documentType) filter.documentType = { $eq: f.documentType };
    return filter;
  }
  return undefined;
}

function toRetrievedChunk(match: VectorMatch): RetrievedChunk | null {
  const md = match.metadata ?? {};
  const text = typeof md.text === "string" ? md.text : null;
  const source = typeof md.source === "string" ? md.source : null;
  if (!text || !source) {
    // Defensive: should never happen if ingest wrote valid metadata.
    return null;
  }
  return {
    id: match.id,
    text,
    source,
    score: match.score,
    // Metadata is validated at the ingestion boundary; here we trust the store.
    metadata: md as RetrievedChunk["metadata"],
  };
}

function emitRetrievalTelemetry(query: RagQuery, result: RagResult, startMs: number): void {
  if (!query.disputeId) return;
  try {
    getTelemetryEmitter().emit({
      type: "kb_lookup",
      disputeId: query.disputeId,
      stage: query.stage ?? "rag_retrieve",
      latencyMs: Date.now() - startMs,
      success: !result.partial,
      kbSource: "firestore",
    });
  } catch {
    // Telemetry must never break the pipeline.
  }
}
