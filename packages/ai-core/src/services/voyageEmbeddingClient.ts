/**
 * Voyage AI embedding client.
 *
 * Narrow REST wrapper around `POST https://api.voyageai.com/v1/embeddings`.
 * Used by `embeddingService` when `EMBEDDING_PROVIDER === "voyage"` to route
 * dense embedding calls to Voyage AI's domain-tuned models (e.g. `voyage-law-2`
 * for scheme-rulebook RAG).
 *
 * Why a hand-rolled REST client instead of the `voyageai` Python package or a
 * TypeScript SDK:
 *   - The TS SDK landscape for Voyage is thin; the REST surface is stable and
 *     small (one POST, one path).
 *   - Keeping `@realyn/ai-core` dependency-free of any Voyage-specific package
 *     means consumers (functions/, tests, future tools) don't pay for the
 *     install when `EMBEDDING_PROVIDER !== "voyage"`.
 *   - `fetch` is built into Node 20+ so we add zero deps.
 *
 * Fail-safe: every public path returns `{ success: false, error }` rather than
 * throwing, matching the contract of {@link embedTextsInternal} so that
 * RAG ingestion can observe and report failures rather than crash batch jobs.
 */

import { EMBEDDING_DIM, EMBED_BATCH_SIZE, type EmbeddingInputType } from "../config/ragConfig";

// ---------------------------------------------------------------------------
// Public types — match the shape of `embeddingService.EmbedResult` so the
// dispatch layer can pass results straight through.
// ---------------------------------------------------------------------------

export interface VoyageEmbedResult {
  success: boolean;
  vectors?: number[][];
  model: string;
  dim: number;
  tokensUsed?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Init state
// ---------------------------------------------------------------------------

let initError: string | null = null;
let cachedKey: string | null = null;

function getApiKey(): string | null {
  if (initError) return null;
  if (cachedKey) return cachedKey;

  const k = process.env.VOYAGE_API_KEY?.trim();
  if (!k) {
    initError = "VOYAGE_API_KEY environment variable is not set";
    console.warn(`Voyage client initialization failed: ${initError}`);
    return null;
  }
  cachedKey = k;
  return cachedKey;
}

export function isVoyageAvailable(): boolean {
  return getApiKey() !== null;
}

export function getVoyageInitError(): string | null {
  return initError;
}

/** Test helper. Resets the module-level cache. */
export function _resetVoyageClientForTests(): void {
  cachedKey = null;
  initError = null;
}

// ---------------------------------------------------------------------------
// Voyage `input_type` is "query" or "document". Our internal vocabulary is
// "query" or "passage" (matching Pinecone Inference's terminology). Map at
// the boundary so call sites stay provider-agnostic.
// ---------------------------------------------------------------------------

function toVoyageInputType(t: EmbeddingInputType): "query" | "document" {
  return t === "query" ? "query" : "document";
}

// ---------------------------------------------------------------------------
// REST shape
// ---------------------------------------------------------------------------

interface VoyageEmbeddingRow {
  object: string;
  embedding: number[];
  index: number;
}

interface VoyageEmbeddingResponse {
  object: string;
  data: VoyageEmbeddingRow[];
  model: string;
  usage?: { total_tokens?: number };
}

// ---------------------------------------------------------------------------
// Public entry point — batched embed
// ---------------------------------------------------------------------------

/**
 * Embed a batch of texts with the configured Voyage model.
 *
 * Voyage allows up to 1000 inputs per request and ~120K tokens for
 * `voyage-law-2`. We batch by `EMBED_BATCH_SIZE` (64 by default) which is
 * conservative on both axes and matches the Pinecone Inference batch size,
 * keeping retry/backoff behaviour symmetric across providers.
 *
 * @param texts        — texts to embed (`document` or `query` inputs)
 * @param model        — Voyage model name, e.g. "voyage-law-2"
 * @param inputType    — internal `passage`|`query`; mapped to Voyage's `document`|`query`
 * @param fetchImpl    — injectable fetch (for tests). Defaults to global `fetch`.
 */
export async function voyageEmbed(
  texts: string[],
  model: string,
  inputType: EmbeddingInputType,
  fetchImpl: typeof fetch = fetch,
): Promise<VoyageEmbedResult> {
  if (texts.length === 0) {
    return { success: true, vectors: [], model, dim: EMBEDDING_DIM, tokensUsed: 0 };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      model,
      dim: EMBEDDING_DIM,
      error: initError ?? "Voyage client not available",
    };
  }

  const vectors: number[][] = [];
  let tokensUsed = 0;

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    let response: Response;
    try {
      response = await fetchImpl("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model,
          input_type: toVoyageInputType(inputType),
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        model,
        dim: EMBEDDING_DIM,
        error: `Voyage network error: ${message}`,
      };
    }

    if (!response.ok) {
      // Read body for diagnostics but never echo the API key or full prompt
      // back to logs / callers.
      const bodyText = await safeReadText(response);
      return {
        success: false,
        model,
        dim: EMBEDDING_DIM,
        error: `Voyage HTTP ${response.status}: ${bodyText.slice(0, 200)}`,
      };
    }

    let parsed: VoyageEmbeddingResponse;
    try {
      parsed = (await response.json()) as VoyageEmbeddingResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        model,
        dim: EMBEDDING_DIM,
        error: `Voyage JSON parse error: ${message}`,
      };
    }

    if (!Array.isArray(parsed.data) || parsed.data.length !== batch.length) {
      return {
        success: false,
        model,
        dim: EMBEDDING_DIM,
        error: `Voyage response shape mismatch: expected ${batch.length} embeddings, got ${parsed.data?.length ?? 0}`,
      };
    }

    // Voyage returns rows with an `index` field; respect it rather than
    // trusting array order in case the API ever returns out-of-order results.
    const ordered = new Array<number[] | undefined>(batch.length);
    for (const row of parsed.data) {
      if (
        typeof row.index !== "number" ||
        row.index < 0 ||
        row.index >= batch.length ||
        !Array.isArray(row.embedding)
      ) {
        return {
          success: false,
          model,
          dim: EMBEDDING_DIM,
          error: `Voyage response malformed at row index=${row.index}`,
        };
      }
      ordered[row.index] = row.embedding;
    }
    for (const v of ordered) {
      if (!v) {
        return {
          success: false,
          model,
          dim: EMBEDDING_DIM,
          error: "Voyage response missing embedding for one or more inputs",
        };
      }
      vectors.push(v);
    }

    if (parsed.usage?.total_tokens) tokensUsed += parsed.usage.total_tokens;
  }

  return {
    success: true,
    vectors,
    model,
    dim: vectors[0]?.length ?? EMBEDDING_DIM,
    tokensUsed,
  };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}
