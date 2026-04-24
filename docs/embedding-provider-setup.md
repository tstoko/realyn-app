# Embedding Provider Setup

Reference notes for choosing and wiring an embedding provider for RAG. Future-you when you start Phase 1 of [`rag-implementation-guide.md`](./rag-implementation-guide.md) — read this first.

---

## TL;DR

- **Anthropic does not offer an embedding model.** Claude is generation-only. Embeddings need a separate provider.
- This is normal — even all-OpenAI shops use a separate embedding model (`text-embedding-3-*`) from their chat model.
- Three realistic paths, in order of "fewest moving parts":
  1. **Pinecone Inference** — Pinecone hosts the embedding model, embed + upsert in one call. No new vendor, no embedding service file. **Recommended starting point.**
  2. **Voyage AI** — Anthropic's officially recommended embedding partner. Slight quality edge on legal/rulebook text.
  3. **OpenAI `text-embedding-3-small`** — fine, cheap, well-documented. Adds OpenAI as a new vendor.
- **Do not switch generation off Claude** to "simplify" embeddings. The migration cost (re-tuning prompts, re-validating specialists, rewriting `llmService.ts`) is days of work and gains nothing on the embedding side.

---

## Why this came up

Current LLM stack: **Anthropic Claude** via `@anthropic-ai/sdk` (see `packages/ai-core/src/services/llmService.ts`).

Anthropic's API has `messages.create` (chat) but no `embeddings.create`. So when we add RAG, we need:

```
ingest:   PDF → chunks → [EMBEDDING PROVIDER] → Pinecone.upsert
query:    user text   → [EMBEDDING PROVIDER] → Pinecone.query → Claude.messages.create(context + question)
```

The `[EMBEDDING PROVIDER]` slot is what this doc is about.

---

## Option comparison

| | Pinecone Inference | Voyage AI | OpenAI |
|---|---|---|---|
| New vendor relationship | None (already enabled via MCP) | Yes | Yes |
| Embedding service file needed | No | Yes (~80 lines) | Yes (~80 lines) |
| Quality on rulebook/legal text | Good | Slightly better (`voyage-law-2`) | Good |
| Anthropic-officially-recommended | No | Yes | No |
| Free tier | Pinecone's existing free tier | 200M tokens free | None |
| Price (per 1M tokens) | Bundled into Pinecone usage | ~$0.02–0.12 | ~$0.02 |
| Document/query input-type asymmetry | Model-dependent | Yes (better recall) | No |
| Vector DB lock-in | Pinecone-tight | Portable | Portable |

### When each one is the right pick

- **Pinecone Inference** — Phase 1 (rulebooks). One vendor, simplest code path. Use `voyage-3-large` or `llama-text-embed-v2` via Pinecone's hosted models.
- **Voyage AI directly** — when you outgrow Pinecone Inference's hosted models or want `voyage-law-2` specifically and Pinecone doesn't host it.
- **OpenAI** — only if you already have `OPENAI_API_KEY` for other reasons. Don't add OpenAI just for this.

---

## Path 1 — Pinecone Inference (recommended)

Zero new files, zero new keys. Pinecone embeds and stores in one call.

```typescript
await pinecone.index("rulebooks").upsertRecords([
  { id: "visa-13.1-chunk-3", text: "Reason code 13.1 covers merchandise not received...", section: "13.1" },
]);

const results = await pinecone.index("rulebooks").searchRecords({
  query: { inputs: { text: "Did the hotel double-charge the guest?" }, topK: 5 },
});
```

Setup:
1. Create the index with an integrated embedding model (Pinecone console → "Create index" → "Setup by model").
2. Pick a model: `multilingual-e5-large` (default), `llama-text-embed-v2`, or `voyage-3-large` if available.
3. Upsert with `text` field instead of pre-computed `values`.
4. Done.

No `embeddingService.ts`, no `VOYAGE_API_KEY` / `OPENAI_API_KEY`. Just `PINECONE_API_KEY`.

---

## Path 2 — Voyage AI (if Pinecone Inference doesn't fit)

Mirrors the existing `llmService.ts` pattern in the repo.

### 1. Account + API key

1. Sign up at https://dash.voyageai.com.
2. Settings → API Keys → create one (starts with `pa-...`).
3. Add billing (200M tokens free, requires card on file for sustained use).

### 2. Pick a model and lock it in

| Model | Dim | When to use |
|---|---|---|
| `voyage-3-large` | 1024 | Best general-purpose; default for rulebooks |
| `voyage-3` | 1024 | Cheaper, ~95% of large's quality |
| `voyage-3-lite` | 512 | When cost/latency matter more than recall |
| `voyage-law-2` | 1024 | Legal/rulebook text; A/B test vs `voyage-3-large` |

**Critical:** changing embedding models later means re-indexing everything in Pinecone. Pick one and write it into every record's metadata (`embeddingModel: "voyage-3-large"`).

### 3. Install the SDK

```bash
npm install voyageai --workspace packages/ai-core
npm install voyageai --workspace functions
```

(No dashboard install — embeddings must never run client-side; you'd leak the key.)

### 4. Add the embedding service

Create `packages/ai-core/src/services/embeddingService.ts`, mirroring the lazy-init / telemetry pattern in `llmService.ts`:

```typescript
import { VoyageAIClient } from "voyageai";
import { getTelemetryEmitter, type TelemetryContext } from "../telemetry";

let voyageClient: VoyageAIClient | null = null;
let clientInitError: string | null = null;

function getVoyageClient(): VoyageAIClient | null {
  if (clientInitError) return null;
  if (!voyageClient) {
    try {
      const apiKey = process.env.VOYAGE_API_KEY;
      if (!apiKey) {
        clientInitError = "VOYAGE_API_KEY environment variable is not set";
        console.warn(`Voyage client initialization failed: ${clientInitError}`);
        return null;
      }
      voyageClient = new VoyageAIClient({ apiKey });
    } catch (error) {
      clientInitError = error instanceof Error ? error.message : String(error);
      return null;
    }
  }
  return voyageClient;
}

export type EmbeddingModel =
  | "voyage-3-large"
  | "voyage-3"
  | "voyage-3-lite"
  | "voyage-law-2"
  | "voyage-finance-2";

/**
 * `document` — for text being indexed (rulebook chunks, past cases, policies)
 * `query`    — for the user's question at retrieval time
 * Voyage tunes each side asymmetrically; passing the wrong one costs ~10% recall.
 */
export type EmbeddingInputType = "document" | "query";

export interface EmbedOptions {
  model?: EmbeddingModel;
  inputType?: EmbeddingInputType;
  telemetry?: TelemetryContext;
}

export interface EmbedResult {
  success: boolean;
  vectors?: number[][];
  model?: EmbeddingModel;
  dim?: number;
  tokensUsed?: number;
  error?: string;
}

const DEFAULT_MODEL: EmbeddingModel = "voyage-3-large";

export async function embedTexts(
  texts: string[],
  options?: EmbedOptions,
): Promise<EmbedResult> {
  const startMs = Date.now();
  const model = options?.model ?? DEFAULT_MODEL;
  const inputType = options?.inputType ?? "document";

  if (texts.length === 0) {
    return { success: true, vectors: [], model, dim: 0, tokensUsed: 0 };
  }

  const client = getVoyageClient();
  if (!client) {
    return { success: false, error: clientInitError || "Voyage client not available" };
  }

  try {
    const response = await client.embed({ input: texts, model, inputType });
    const vectors = (response.data ?? [])
      .map((d) => d.embedding)
      .filter((v): v is number[] => Array.isArray(v));

    const result: EmbedResult = {
      success: true,
      vectors,
      model,
      dim: vectors[0]?.length ?? 0,
      tokensUsed: response.usage?.totalTokens,
    };
    emitEmbeddingTelemetry(options, result, startMs, model);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export function embedDocuments(texts: string[], options?: Omit<EmbedOptions, "inputType">) {
  return embedTexts(texts, { ...options, inputType: "document" });
}

export function embedQuery(text: string, options?: Omit<EmbedOptions, "inputType">) {
  return embedTexts([text], { ...options, inputType: "query" }).then((r) => ({
    ...r,
    vector: r.vectors?.[0],
  }));
}

function emitEmbeddingTelemetry(
  options: EmbedOptions | undefined,
  result: EmbedResult,
  startMs: number,
  model: EmbeddingModel,
): void {
  if (!options?.telemetry) return;
  try {
    getTelemetryEmitter().emit({
      type: "llm_call",
      disputeId: options.telemetry.disputeId,
      stage: options.telemetry.stage,
      model,
      tokensIn: result.tokensUsed,
      latencyMs: Date.now() - startMs,
      success: result.success,
      error: result.error,
    });
  } catch {
    // Telemetry must never break the pipeline.
  }
}
```

Then export from `packages/ai-core/src/index.ts` and add a re-export shim at `functions/src/services/ai/embeddingService.ts`:

```typescript
export * from "@realyn/ai-core/services/embeddingService";
```

### 5. Wire the secret into Cloud Functions

```bash
firebase functions:secrets:set VOYAGE_API_KEY
```

Bind it on any function that calls `embedTexts`, mirroring how `ANTHROPIC_API_KEY` is bound in `aiDisputeHandlers.ts`:

```typescript
export const retrieveContext = onCall(
  {
    region: "us-central1",
    secrets: ["ANTHROPIC_API_KEY", "VOYAGE_API_KEY", "PINECONE_API_KEY"],
  },
  async (request) => { /* ... */ },
);
```

### 6. Local dev

Append to `functions/.env.example`:

```
VOYAGE_API_KEY=
```

And in your local (gitignored) `functions/.env`:

```
VOYAGE_API_KEY=pa-your-real-key
```

### 7. Smoke test

`functions/scripts/testVoyage.ts`:

```typescript
import "dotenv/config";
import { embedDocuments, embedQuery } from "../src/services/ai/embeddingService";

async function main() {
  const docs = await embedDocuments([
    "Visa reason code 13.1 covers merchandise/services not received.",
    "Cardholder claims the hotel charged them twice for the same stay.",
  ]);
  console.log("doc vectors:", docs.vectors?.length, "dim:", docs.dim);

  const q = await embedQuery("Did the hotel double-charge the guest?");

  const cos = (a: number[], b: number[]) => {
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    return dot / (Math.hypot(...a) * Math.hypot(...b));
  };
  if (q.vector && docs.vectors) {
    console.log("sim to doc[0]:", cos(q.vector, docs.vectors[0]).toFixed(4));
    console.log("sim to doc[1]:", cos(q.vector, docs.vectors[1]).toFixed(4));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run:

```bash
cd functions && npx tsx scripts/testVoyage.ts
```

`sim to doc[1]` should be higher than `sim to doc[0]`. If it is, embeddings are wired correctly.

---

## Path 3 — OpenAI embeddings (drop-in alternative to Voyage)

Identical service-file shape. Only the SDK call changes:

```typescript
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.embeddings.create({
  model: "text-embedding-3-small", // or text-embedding-3-large
  input: texts,
});

const vectors = response.data.map((d) => d.embedding);
```

OpenAI doesn't have `inputType` asymmetry — same endpoint for documents and queries. Slightly worse retrieval quality on domain text vs Voyage, but operationally simpler.

Secret: `OPENAI_API_KEY`. Same Cloud Functions binding pattern.

---

## Gotchas (apply to all paths)

1. **Same model at ingest and query time.** Always. Write `embeddingModel` into every Pinecone record's metadata so future-you can detect mismatches.
2. **Document vs query input types matter for Voyage.** Use `embedDocuments()` at ingest, `embedQuery()` at retrieval. Flipping them silently costs recall.
3. **Batch limits.** Voyage accepts ~128 inputs per call; OpenAI accepts more but charges per token. Batch ingestion in chunks of ~64 to stay safe.
4. **Rate limits.** Wrap with retry-with-backoff (same pattern as `llmService.ts`) for bulk ingest.
5. **Never embed in the browser.** Embedding must run server-side only — exposing the API key client-side is a security incident.
6. **Lock the model choice in code.** Don't make it configurable per-request. Once you upsert vectors with model X, every query has to use model X.

---

## Decision when you start Phase 1

1. Try **Pinecone Inference** first. If their hosted models cover your case (they should for rulebooks), you're done.
2. If you need a Voyage-specific model (`voyage-law-2`), or want full control over the embedding pipeline, fall back to **Path 2 (Voyage)**.
3. Skip OpenAI unless you already have a key for other reasons.

Cross-references:
- Full RAG architecture: [`rag-implementation-guide.md`](./rag-implementation-guide.md)
- Existing LLM service pattern to mirror: `packages/ai-core/src/services/llmService.ts`
- Existing secret-binding pattern: `functions/src/handlers/aiDisputeHandlers.ts` (search for `secrets:`)
