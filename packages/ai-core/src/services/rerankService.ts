/**
 * Cross-encoder reranking — second-stage refinement for hybrid retrieval.
 *
 * Hybrid (dense + sparse) retrieval gives us ~20 candidate chunks per
 * namespace; a cross-encoder reranker scores each candidate against the
 * query directly and re-orders them by true relevance, then we keep the top
 * `RERANK_TOP_N`. Cross-encoders read the query and the chunk together
 * (rather than embedding them separately and computing similarity), which
 * typically lifts precision by ~5–15% on regulatory/legal retrieval.
 *
 * **Disabled by default.** The default Pinecone Inference plan may not have
 * rerank access, and rerank endpoints are rate-limited per project. Until
 * we've verified plan tier + rate limits at provisioning time (per
 * docs/post-hardening-plan.md §C7 corrections), `RERANK_ENABLED` defaults
 * to false. Even when enabled, the path is fail-safe: any rerank error
 * collapses back to the original retrieval order so the deterministic
 * pipeline is never blocked.
 *
 * Architecture mirrors `VectorStorePort` — ai-core defines the port; the
 * functions/ layer supplies a Pinecone-Inference-backed adapter.
 */

import type { RetrievedChunk } from "../types/rag";

// ---------------------------------------------------------------------------
// Port — implemented in functions/ with Pinecone Inference rerank
// ---------------------------------------------------------------------------

export interface RerankRequest {
  query: string;
  /** Documents to rerank, in the order they came out of hybrid retrieval. */
  chunks: RetrievedChunk[];
  /** Number of results to keep after reranking (top-N). */
  topN: number;
}

export interface RerankResultEntry {
  /** Index into the original `chunks` array — used to map back to the chunk. */
  index: number;
  /** Reranker score in [0, 1]; higher = more relevant. */
  score: number;
}

export interface RerankPort {
  rerank(request: RerankRequest): Promise<RerankResultEntry[]>;
}

// ---------------------------------------------------------------------------
// Module-level adapter injection
// ---------------------------------------------------------------------------

let _rerankPort: RerankPort | null = null;

export function configureRerankPort(port: RerankPort): void {
  _rerankPort = port;
}

export function getRerankPort(): RerankPort | null {
  return _rerankPort;
}

/** Test helper. */
export function _resetRerankPortForTests(): void {
  _rerankPort = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when reranking should be attempted.
 *
 * `RERANK_ENABLED=true` to opt in. Default off so we don't accidentally hit
 * an unprovisioned Pinecone tier in production. Mirrors the polarity of
 * `RAG_RETRIEVAL_ENABLED` (which defaults on) — rerank is a more invasive
 * feature that adds a vendor dependency, so its default is the safer one.
 */
export function isRerankEnabled(): boolean {
  return process.env.RERANK_ENABLED === "true";
}

/**
 * Rerank chunks if enabled and a port is configured. Otherwise return the
 * input unchanged.
 *
 * Fail-safe: any error in the rerank call collapses to the input order so
 * the caller never has to think about whether rerank succeeded. The only
 * observable effect of a failed rerank is a `[rerank]` warn line.
 */
export async function maybeRerank(
  request: RerankRequest,
): Promise<RetrievedChunk[]> {
  if (request.chunks.length === 0) return request.chunks;

  if (!isRerankEnabled()) {
    return request.chunks.slice(0, request.topN);
  }

  const port = _rerankPort;
  if (!port) {
    console.warn(
      "[rerank] enabled but no rerank port configured; returning hybrid order",
    );
    return request.chunks.slice(0, request.topN);
  }

  try {
    const startMs = Date.now();
    const ranked = await port.rerank(request);
    const elapsed = Date.now() - startMs;

    // Map ranked indices back to chunks. Defensive: drop entries whose index
    // is out of bounds (reranker bug or malformed response) rather than
    // throwing — we'd rather lose one chunk than fail the whole retrieval.
    const result: RetrievedChunk[] = [];
    for (const entry of ranked) {
      if (entry.index >= 0 && entry.index < request.chunks.length) {
        const chunk = request.chunks[entry.index];
        // Replace the upstream similarity score with the reranker score so
        // downstream MIN_RELEVANCE_SCORE filtering operates on the same
        // scale. Reranker scores are normalised to [0, 1].
        result.push({ ...chunk, score: entry.score });
      }
    }

    const trimmed = result.slice(0, request.topN);
    console.log(
      `[rerank] reranked ${request.chunks.length} → ${trimmed.length} in ${elapsed}ms`,
    );
    return trimmed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rerank] failed; falling back to hybrid order: ${message}`);
    return request.chunks.slice(0, request.topN);
  }
}
