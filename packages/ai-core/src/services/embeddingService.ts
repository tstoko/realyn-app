/**
 * Embedding Service — Pinecone Inference integration.
 *
 * We use Pinecone's hosted inference API so a single `PINECONE_API_KEY` covers
 * both vector storage and embedding generation. Keeping this behind a narrow
 * interface means we can swap the backend later (Voyage, OpenAI, local model)
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
  EMBEDDING_PROVIDER,
  EMBED_BATCH_SIZE,
  type EmbeddingInputType,
} from "../config/ragConfig";
import { getTelemetryEmitter, type TelemetryContext } from "../telemetry";
import {
  voyageEmbed,
  isVoyageAvailable,
  getVoyageInitError,
} from "./voyageEmbeddingClient";

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
  // Availability depends on the configured provider — Pinecone Inference for
  // `pinecone`, Voyage AI's REST API for `voyage`. The sparse/lexical encoder
  // (used by hybrid retrieval) is always Pinecone-hosted regardless of the
  // dense provider, so a Pinecone client failure still means the dense path
  // is partially degraded for `voyage` callers; consult `isVoyageAvailable()`
  // and `getPineconeClient()` directly when you need finer status.
  if (EMBEDDING_PROVIDER === "voyage") return isVoyageAvailable();
  return getPineconeClient() !== null;
}

export function getEmbeddingInitError(): string | null {
  if (EMBEDDING_PROVIDER === "voyage") return getVoyageInitError();
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

  // Route to the configured provider. The two paths must produce vectors of
  // the same `EMBEDDING_DIM`; if you change provider/model and the dim shifts,
  // bump `RAG_SCHEMA_VERSION` and re-ingest.
  let result: EmbedResult;
  if (EMBEDDING_PROVIDER === "voyage") {
    result = await embedViaVoyage(texts, model, inputType);
  } else {
    result = await embedViaPineconeInference(texts, model, inputType);
  }

  // L2-normalise on success so dotproduct retrieval equals cosine similarity.
  // Required by the schema-v2 dotproduct index (see ragConfig.PINECONE_METRIC).
  // No-op when result.success is false.
  if (result.success && result.vectors) {
    result = { ...result, vectors: result.vectors.map(l2Normalize) };
  }

  emitTelemetry(options, result, startMs);
  return result;
}

async function embedViaPineconeInference(
  texts: string[],
  model: string,
  inputType: EmbeddingInputType,
): Promise<EmbedResult> {
  const client = getPineconeClient();
  if (!client) {
    return {
      success: false,
      model,
      dim: EMBEDDING_DIM,
      error: clientInitError || "Pinecone client not available",
    };
  }

  try {
    const vectors: number[][] = [];
    let tokensUsed = 0;

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const response = await client.inference.embed({
        model,
        inputs: batch,
        parameters: { inputType, truncate: "END" },
      });

      for (const entry of response.data ?? []) {
        if ("values" in entry && Array.isArray(entry.values)) {
          vectors.push(entry.values as number[]);
        } else {
          throw new Error(`Unexpected embedding response shape for model ${model}`);
        }
      }
      if (response.usage?.totalTokens) tokensUsed += response.usage.totalTokens;
    }

    return {
      success: true,
      vectors,
      model,
      dim: vectors[0]?.length ?? EMBEDDING_DIM,
      tokensUsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Pinecone embedding call failed:", message);
    return { success: false, model, dim: EMBEDDING_DIM, error: message };
  }
}

async function embedViaVoyage(
  texts: string[],
  model: string,
  inputType: EmbeddingInputType,
): Promise<EmbedResult> {
  const result = await voyageEmbed(texts, model, inputType);
  if (!result.success) {
    console.error(`Voyage embedding call failed: ${result.error}`);
  }
  return result;
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
