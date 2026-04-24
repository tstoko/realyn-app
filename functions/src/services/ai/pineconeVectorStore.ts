/**
 * Pinecone-backed implementation of {@link VectorStorePort}.
 *
 * Why it lives in `functions/` and not `packages/ai-core/`:
 *   `ai-core` keeps its vector layer abstracted behind `VectorStorePort` so
 *   tests and local tools can run against a fake store. Concrete adapters
 *   (Pinecone here, pgvector/Firestore later) belong at the consumption edge.
 *
 * This module is a narrow wrapper around `pc.index(name).namespace(ns).query`.
 * All Pinecone-specific filter syntax is produced by `ragService.buildFilter`,
 * so this adapter does not interpret filter contents — it forwards them.
 */

import { Pinecone } from "@pinecone-database/pinecone";
import {
  getPineconeIndexName,
  type VectorQuery,
  type VectorMatch,
  type VectorStorePort,
  type RagRecord,
  UPSERT_BATCH_SIZE,
} from "@realyn/ai-core";

// ---------------------------------------------------------------------------
// Lazy client — Cloud Functions import this module at cold start; we must not
// throw before the secret is read from env.
// ---------------------------------------------------------------------------

let client: Pinecone | null = null;
let clientInitError: string | null = null;

function getClient(): Pinecone | null {
  if (clientInitError) return null;
  if (client) return client;

  const apiKey = process.env.PINECONE_API_KEY?.trim();
  if (!apiKey) {
    clientInitError = "PINECONE_API_KEY environment variable is not set";
    console.warn(`Pinecone client init failed: ${clientInitError}`);
    return null;
  }

  try {
    client = new Pinecone({ apiKey });
    return client;
  } catch (err) {
    clientInitError = err instanceof Error ? err.message : String(err);
    console.warn(`Pinecone client init failed: ${clientInitError}`);
    return null;
  }
}

/** Bare handle to the Pinecone client — scripts (setup/ingest) need this directly. */
export function getPineconeClient(): Pinecone {
  const c = getClient();
  if (!c) {
    throw new Error(clientInitError || "Pinecone client unavailable");
  }
  return c;
}

// ---------------------------------------------------------------------------
// VectorStorePort implementation
// ---------------------------------------------------------------------------

export const pineconeVectorStore: VectorStorePort = {
  async query(q: VectorQuery): Promise<VectorMatch[]> {
    const pc = getClient();
    if (!pc) return [];

    const indexName = getPineconeIndexName();
    const index = pc.index(indexName).namespace(q.namespace);

    const response = await index.query({
      vector: q.vector,
      topK: q.topK,
      filter: q.filter,
      includeMetadata: true,
    });

    return (response.matches ?? []).map((m) => ({
      id: String(m.id),
      score: typeof m.score === "number" ? m.score : 0,
      metadata: (m.metadata ?? undefined) as Record<string, unknown> | undefined,
    }));
  },
};

// ---------------------------------------------------------------------------
// Upsert path — used by ingestion scripts, not by request-path handlers
// ---------------------------------------------------------------------------

export interface UpsertResult {
  upserted: number;
  skipped: number;
  errors: Array<{ batch: number; message: string }>;
}

/**
 * Upsert pre-embedded records to Pinecone, batched per {@link UPSERT_BATCH_SIZE}.
 * Callers are expected to have validated metadata via the Zod schemas.
 * Records without a vector are skipped (never silently embedded here — the
 * embedding path is a separate concern owned by `embeddingService`).
 */
export async function upsertRecords(
  namespace: string,
  records: RagRecord[],
): Promise<UpsertResult> {
  const result: UpsertResult = { upserted: 0, skipped: 0, errors: [] };
  if (records.length === 0) return result;

  const pc = getPineconeClient();
  const indexName = getPineconeIndexName();
  const index = pc.index(indexName).namespace(namespace);

  const upsertable = records.filter((r) => {
    if (!r.vector || r.vector.length === 0) {
      result.skipped++;
      return false;
    }
    return true;
  });

  for (let i = 0; i < upsertable.length; i += UPSERT_BATCH_SIZE) {
    const slice = upsertable.slice(i, i + UPSERT_BATCH_SIZE);
    try {
      await index.upsert({
        records: slice.map((r) => ({
          id: r.id,
          values: r.vector!,
          metadata: r.metadata as unknown as Record<string, string | number | boolean | string[]>,
        })),
      });
      result.upserted += slice.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ batch: Math.floor(i / UPSERT_BATCH_SIZE), message });
    }
  }

  return result;
}
