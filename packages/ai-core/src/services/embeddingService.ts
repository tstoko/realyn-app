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

    const result: EmbedResult = {
      success: true,
      vectors,
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
