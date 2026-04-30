/**
 * Sparse / lexical embedding service.
 *
 * Hybrid retrieval (dense + sparse on the same Pinecone index) needs a sparse
 * representation of every chunk and every query. We use Pinecone Inference's
 * hosted `pinecone-sparse-english-v0` model — a learned-sparse encoder built
 * on the DeepImpact architecture — so we don't have to host a tokenizer + IDF
 * table ourselves. Default option per the corrected plan.
 *
 * If the corpus moves multilingual or the rate limits on hosted sparse become
 * problematic, swap this module for a self-hosted SPLADE or a hand-rolled BM25
 * implementation behind the same `SparseVector` interface; nothing else in the
 * codebase needs to change.
 *
 * Fail-safe contract matches `embeddingService`: every public path returns
 * `{ success: false, error }` rather than throwing.
 */

import { Pinecone } from "@pinecone-database/pinecone";
import { EMBED_BATCH_SIZE, type EmbeddingInputType } from "../config/ragConfig";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Pinecone's sparse-vector wire format. Indices are token ids in the model's
 * vocabulary; values are per-token weights from the sparse encoder. Order
 * within `indices` is not significant; entries with weight zero are omitted.
 */
export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface SparseEmbedResult {
  success: boolean;
  vectors?: SparseVector[];
  model: string;
  tokensUsed?: number;
  error?: string;
}

/** Pinecone's hosted sparse encoder. */
export const SPARSE_EMBEDDING_MODEL = "pinecone-sparse-english-v0" as const;
export type SparseEmbeddingModel = typeof SPARSE_EMBEDDING_MODEL;

// ---------------------------------------------------------------------------
// Lazy client (separate cache from dense path so resetting one doesn't
// disturb the other in tests)
// ---------------------------------------------------------------------------

let sparseClient: Pinecone | null = null;
let sparseClientInitError: string | null = null;

function getSparseClient(): Pinecone | null {
  if (sparseClientInitError) return null;
  if (sparseClient) return sparseClient;

  const apiKey = process.env.PINECONE_API_KEY?.trim();
  if (!apiKey) {
    sparseClientInitError = "PINECONE_API_KEY environment variable is not set";
    console.warn(`Sparse encoder init failed: ${sparseClientInitError}`);
    return null;
  }

  try {
    sparseClient = new Pinecone({ apiKey });
    return sparseClient;
  } catch (err) {
    sparseClientInitError = err instanceof Error ? err.message : String(err);
    console.warn(`Sparse encoder init failed: ${sparseClientInitError}`);
    return null;
  }
}

export function isSparseEmbeddingAvailable(): boolean {
  return getSparseClient() !== null;
}

export function getSparseEmbeddingInitError(): string | null {
  return sparseClientInitError;
}

/** Test helper. */
export function _resetSparseEmbeddingClientForTests(): void {
  sparseClient = null;
  sparseClientInitError = null;
}

// ---------------------------------------------------------------------------
// Embed
// ---------------------------------------------------------------------------

async function sparseEmbedInternal(
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<SparseEmbedResult> {
  if (texts.length === 0) {
    return { success: true, vectors: [], model: SPARSE_EMBEDDING_MODEL, tokensUsed: 0 };
  }

  const client = getSparseClient();
  if (!client) {
    return {
      success: false,
      model: SPARSE_EMBEDDING_MODEL,
      error: sparseClientInitError ?? "Sparse encoder client not available",
    };
  }

  try {
    const vectors: SparseVector[] = [];
    let tokensUsed = 0;

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const response = await client.inference.embed({
        model: SPARSE_EMBEDDING_MODEL,
        inputs: batch,
        parameters: { inputType, truncate: "END" },
      });

      for (const entry of response.data ?? []) {
        // Pinecone SDK 7.x serves `inference.embed` for sparse models as:
        //   { vectorType: "sparse", sparseValues: number[], sparseIndices: number[],
        //     sparseTokens?: string[] }
        // i.e. two flat parallel arrays, NOT a nested `sparseValues: { indices,
        // values }` object. (Confirmed against
        // pinecone-generated-ts-fetch/inference/models/SparseEmbedding.d.ts and
        // a live `embed` call against pinecone-sparse-english-v0.)
        //
        // We also accept the older nested shape `sparseValues: { indices, values }`
        // for forward/backward compatibility — older SDK revs and some test
        // fixtures use it. If neither shape is present we surface a clear
        // error rather than silently producing empty vectors (which would make
        // hybrid retrieval degrade to dense-only without a loud signal).
        const e = entry as unknown as {
          sparseValues?: number[] | SparseVector;
          sparseIndices?: number[];
        };

        let sv: SparseVector | null = null;

        if (Array.isArray(e.sparseValues) && Array.isArray(e.sparseIndices)) {
          sv = { indices: e.sparseIndices.slice(), values: e.sparseValues.slice() };
        } else if (
          e.sparseValues &&
          typeof e.sparseValues === "object" &&
          !Array.isArray(e.sparseValues) &&
          Array.isArray(e.sparseValues.indices) &&
          Array.isArray(e.sparseValues.values)
        ) {
          sv = {
            indices: e.sparseValues.indices.slice(),
            values: e.sparseValues.values.slice(),
          };
        }

        if (!sv) {
          throw new Error(
            `Unexpected sparse embedding response shape for model ${SPARSE_EMBEDDING_MODEL}`,
          );
        }
        if (sv.indices.length !== sv.values.length) {
          throw new Error(
            `Sparse vector length mismatch: ${sv.indices.length} indices vs ${sv.values.length} values`,
          );
        }
        vectors.push(sv);
      }
      if (response.usage?.totalTokens) tokensUsed += response.usage.totalTokens;
    }

    return { success: true, vectors, model: SPARSE_EMBEDDING_MODEL, tokensUsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sparse encoder call failed:", message);
    return { success: false, model: SPARSE_EMBEDDING_MODEL, error: message };
  }
}

/** Sparse-embed at ingestion time (passage). */
export function sparseEmbedDocuments(texts: string[]): Promise<SparseEmbedResult> {
  return sparseEmbedInternal(texts, "passage");
}

/** Sparse-embed at retrieval time (query). */
export async function sparseEmbedQuery(
  text: string,
): Promise<{
  success: boolean;
  vector?: SparseVector;
  model: string;
  tokensUsed?: number;
  error?: string;
}> {
  const result = await sparseEmbedInternal([text], "query");
  return {
    success: result.success,
    vector: result.vectors?.[0],
    model: result.model,
    tokensUsed: result.tokensUsed,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Hybrid alpha weighting
// ---------------------------------------------------------------------------

/**
 * Apply hybrid alpha weighting by scaling dense and sparse vectors before
 * sending the query to Pinecone.
 *
 * Pinecone has no native `alpha` parameter at query time. Since hybrid
 * scoring is `score = dense·dense_query + sparse·sparse_query`, we can shift
 * the relative weight by scaling each side: dense by `alpha`, sparse by
 * `(1 - alpha)`. `alpha = 1.0` is pure dense, `0.0` is pure sparse, `0.5` is
 * balanced (the default in `RAG_HYBRID_ALPHA`).
 *
 * This must be applied to the QUERY vectors only, not the indexed vectors —
 * upserted vectors are stored as-is and the query-time scaling is what shifts
 * the inner-product contribution. Applying the same scaling at upsert time
 * would just shift everything by a constant and produce the same ranking.
 *
 * @throws never — alpha is clamped to [0, 1].
 */
export function applyAlpha(
  dense: number[],
  sparse: SparseVector,
  alpha: number,
): { dense: number[]; sparse: SparseVector } {
  const a = Math.max(0, Math.min(1, alpha));
  const scaledDense = dense.map((v) => v * a);
  const scaledSparse: SparseVector = {
    indices: sparse.indices,
    values: sparse.values.map((v) => v * (1 - a)),
  };
  return { dense: scaledDense, sparse: scaledSparse };
}
