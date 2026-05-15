/**
 * Embedding Service — Pinecone Inference integration.
 *
 * We use Pinecone's hosted inference API so a single `PINECONE_API_KEY` covers
 * both vector storage and embedding generation. Keeping this behind a narrow
 * interface means we can swap the backend later (Voyage, OpenAI, local model — currently Pinecone-only)
 * without touching callers.
 *
 * Design notes:
 *   - Lazy client init (matches `llmService.ts`) so import order is safe.
 *   - Batches to `EMBED_BATCH_SIZE` automatically; callers can pass any array.
 *   - Document (`passage`) and query (`query`) embeddings are separate entry
 *     points so calling code cannot accidentally mix them.
 *   - Fails closed: returns `{ success: false, ... }` rather than throwing,
 *     because RAG ingestion is a batch job we want to observe, not crash.
 *   - Telemetry is emitted via the shared `AITelemetryEmitter` when a
 *     `TelemetryContext` is provided.
 */

import { Pinecone } from "@pinecone-database/pinecone";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIM,
  EMBED_BATCH_SIZE,
  type EmbeddingInputType,
} from "../config/ragConfig";
import { getTelemetryEmitter, type TelemetryContext } from "../telemetry";

// ---------------------------------------------------------------------------
// Lazy client
// ---------------------------------------------------------------------------

let pineconeClient: Pinecone | null = null;
let clientInitError: string | null = null;

function getPineconeClient(): Pinecone | null {
  if (clientInitError) return null;
  if (pineconeClient) return pineconeClient;

  const apiKey = process.env.PINECONE_API_KEY?.trim();
  if (!apiKey) {
    clientInitError = "PINECONE_API_KEY environment variable is not set";
    console.warn(`Pinecone client initialization failed: ${clientInitError}`);
    return null;
  }

  try {
    pineconeClient = new Pinecone({ apiKey });
    return pineconeClient;
  } catch (error) {
    clientInitError = error instanceof Error ? error.message : String(error);
    console.warn(`Pinecone client initialization failed: ${clientInitError}`);
    return null;
  }
}

export function isEmbeddingAvailable(): boolean {
  return getPineconeClient() !== null;
}

export function getEmbeddingInitError(): string | null {
  return clientInitError;
}

/** For tests only. Resets the module-level cache. */
export function _resetEmbeddingClientForTests(): void {
  pineconeClient = null;
  clientInitError = null;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EmbedOptions {
  /** Model override. Prefer leaving unset and changing `EMBEDDING_MODEL` centrally. */
  model?: string;
  inputType?: EmbeddingInputType;
  telemetry?: TelemetryContext;
}

export interface EmbedResult {
  success: boolean;
  vectors?: number[][];
  model: string;
  dim: number;
  tokensUsed?: number;
  error?: string;
}

export interface EmbedQueryResult {
  success: boolean;
  vector?: number[];
  model: string;
  dim: number;
  tokensUsed?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Rate-limit retry
// ---------------------------------------------------------------------------

/**
 * Pinecone Inference rate limits (Starter plan):
 *   - 100 inference requests / second / project
 *   - 2000 inference requests / minute / project
 *   - **250,000 tokens / minute / model / input_type** (the binding constraint
 *     for a multi-thousand-chunk rulebook ingest)
 *
 * The token-rate cap means a 800-chunk ingest at ~500 tokens/chunk (= ~400K
 * tokens) will overflow the per-minute budget and the SDK surfaces a 429
 * `RESOURCE_EXHAUSTED` error mid-batch, terminating the whole script.
 *
 * Rather than try to track tokens-per-minute client-side (the SDK doesn't
 * expose remaining quota and the inputs aren't easy to count without
 * tokenizing), we retry on 429 with exponential backoff. The first retry
 * waits ~30s, which is enough to amortise the budget across the rolling
 * minute. Subsequent retries widen the backoff in case the limit is bumping
 * against another concurrent caller in the same project.
 *
 * Capped at 5 retries total (~30s + 60s + 90s + 120s + 150s = ~7.5min worst
 * case for a single batch). Beyond that something is structurally wrong.
 */
export async function embedWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 5,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const is429 = /\bstatus[":\s]*429\b/i.test(message) || /RESOURCE_EXHAUSTED/i.test(message);
      attempt += 1;
      if (!is429 || attempt >= maxAttempts) {
        throw error;
      }
      const waitMs = 30_000 * attempt;
      console.warn(
        `[embed-retry] ${label} hit 429 (attempt ${attempt}/${maxAttempts - 1}); ` +
          `sleeping ${(waitMs / 1000).toFixed(0)}s before retry.`,
      );
      await sleep(waitMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Core embed function
// ---------------------------------------------------------------------------

async function embedTextsInternal(
  texts: string[],
  options: EmbedOptions | undefined,
  inputType: EmbeddingInputType,
): Promise<EmbedResult> {
  const startMs = Date.now();
  const model = options?.model ?? EMBEDDING_MODEL;

  if (texts.length === 0) {
    return { success: true, vectors: [], model, dim: EMBEDDING_DIM, tokensUsed: 0 };
  }

  const client = getPineconeClient();
  if (!client) {
    const err = clientInitError || "Pinecone client not available";
    const result: EmbedResult = { success: false, model, dim: EMBEDDING_DIM, error: err };
    emitTelemetry(options, result, startMs);
    return result;
  }

  try {
    const vectors: number[][] = [];
    let tokensUsed = 0;

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const response = await embedWithRetry(() =>
        client.inference.embed({
          model,
          inputs: batch,
          parameters: { inputType, truncate: "END" },
        }),
        `embed[${model}, batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1}/${Math.ceil(texts.length / EMBED_BATCH_SIZE)}]`,
      );

      for (const entry of response.data ?? []) {
        if ("values" in entry && Array.isArray(entry.values)) {
          vectors.push(entry.values as number[]);
        } else {
          throw new Error(`Unexpected embedding response shape for model ${model}`);
        }
      }
      if (response.usage?.totalTokens) tokensUsed += response.usage.totalTokens;
    }

    // L2-normalise so dotproduct retrieval equals cosine similarity. Required
    // by the schema-v2 dotproduct index (see ragConfig.PINECONE_METRIC) so
    // dense + sparse hybrid retrieval can share a single index without the
    // dense side biasing toward longer-magnitude vectors.
    const result: EmbedResult = {
      success: true,
      vectors: vectors.map(l2Normalize),
      model,
      dim: vectors[0]?.length ?? EMBEDDING_DIM,
      tokensUsed,
    };
    emitTelemetry(options, result, startMs);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Pinecone embedding call failed:", message);
    const result: EmbedResult = {
      success: false,
      model,
      dim: EMBEDDING_DIM,
      error: message,
    };
    emitTelemetry(options, result, startMs);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Public API — separate document and query entry points
// ---------------------------------------------------------------------------

/**
 * Embed documents (rulebook chunks, past cases, policy chunks) for upsert.
 * Uses the `passage` input type, which is optimised for the indexed side.
 */
export function embedDocuments(
  texts: string[],
  options?: Omit<EmbedOptions, "inputType">,
): Promise<EmbedResult> {
  return embedTextsInternal(texts, options, "passage");
}

/**
 * Embed a single user/query string at retrieval time. Uses the `query` input
 * type, which is tuned asymmetrically from `passage` in Pinecone's hosted
 * models. Mixing these silently degrades recall — do not inline this call
 * into ingestion code paths.
 */
export async function embedQuery(
  text: string,
  options?: Omit<EmbedOptions, "inputType">,
): Promise<EmbedQueryResult> {
  const result = await embedTextsInternal([text], options, "query");
  return {
    success: result.success,
    vector: result.vectors?.[0],
    model: result.model,
    dim: result.dim,
    tokensUsed: result.tokensUsed,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Vector normalisation
// ---------------------------------------------------------------------------

/**
 * L2-normalise a vector so its magnitude is 1.
 *
 * Required for the schema-v2 dotproduct Pinecone index — when both upserted
 * vectors and query vectors are unit-length, dotproduct similarity is
 * mathematically identical to cosine similarity. Without this step, dotproduct
 * over un-normalised dense vectors gives results that are biased toward
 * longer vectors, which is not what we want for retrieval.
 *
 * Returns the input unchanged when the magnitude is zero (no direction to
 * preserve) so we don't divide by zero. Such vectors won't match anything
 * usefully anyway.
 *
 * Exported so the sparse encoder + applyAlpha helpers in ragService can reuse
 * the same definition rather than re-implementing it.
 */
export function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  if (sumSq === 0) return vector;
  const norm = Math.sqrt(sumSq);
  const out = new Array<number>(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

// ---------------------------------------------------------------------------
// Internal — telemetry
// ---------------------------------------------------------------------------

function emitTelemetry(
  options: EmbedOptions | undefined,
  result: EmbedResult,
  startMs: number,
): void {
  if (!options?.telemetry) return;
  try {
    getTelemetryEmitter().emit({
      type: "llm_call",
      disputeId: options.telemetry.disputeId,
      stage: options.telemetry.stage,
      model: result.model,
      tokensIn: result.tokensUsed,
      latencyMs: Date.now() - startMs,
      success: result.success,
      error: result.error,
    });
  } catch {
    // Telemetry must never break the pipeline.
  }
}
