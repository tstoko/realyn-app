/**
 * Create (or verify) the Pinecone Serverless index used by the RAG pipeline.
 *
 * Idempotent: safe to re-run. If the index already exists it will report the
 * observed configuration and exit non-zero if the config drifts from the
 * locked values in `@realyn/ai-core/config/ragConfig`.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/setupPineconeIndex.js
 *
 * Environment variables:
 *   PINECONE_API_KEY       Required. Secret set via `firebase functions:secrets:set`.
 *   PINECONE_INDEX_NAME    Optional override (default: `realyn-rag`).
 *
 * Runs locally against the real Pinecone control plane — there is no emulator.
 * Review your Pinecone dashboard after running to confirm the index appears.
 */

import {
  EMBEDDING_DIM,
  PINECONE_METRIC,
  getPineconeCloud,
  getPineconeIndexName,
  getPineconeRegion,
} from "@realyn/ai-core";
import { getPineconeClient } from "../services/ai/pineconeVectorStore";

// `dotproduct` is required for single-index hybrid retrieval (dense + sparse
// vectors on the same record). We L2-normalise dense vectors at upsert/query
// time (see embeddingService.l2Normalize) so dotproduct on the dense side is
// mathematically identical to cosine similarity. Locked-constant — drift
// here means re-creating the index. See ragConfig.PINECONE_METRIC for the
// full rationale.
const METRIC = PINECONE_METRIC;

async function main(): Promise<void> {
  const indexName = getPineconeIndexName();
  const cloud = getPineconeCloud();
  const region = getPineconeRegion();
  const pc = getPineconeClient();

  console.log(`[rag-setup] target index: ${indexName}`);
  console.log(`[rag-setup] cloud/region: ${cloud}/${region}`);
  console.log(`[rag-setup] dimension: ${EMBEDDING_DIM}, metric: ${METRIC}`);

  const existing = await pc.listIndexes();
  const already = (existing.indexes ?? []).find((i) => i.name === indexName);

  if (already) {
    console.log(`[rag-setup] index already exists`);
    const drift: string[] = [];
    if (already.dimension !== EMBEDDING_DIM) {
      drift.push(`dimension=${already.dimension} (expected ${EMBEDDING_DIM})`);
    }
    if (already.metric !== METRIC) {
      drift.push(`metric=${already.metric} (expected ${METRIC})`);
    }
    if (drift.length) {
      console.error(`[rag-setup] FATAL: index config drift: ${drift.join(", ")}`);
      console.error(
        `[rag-setup] Re-indexing required. Delete the index via Pinecone console ` +
          `or use a new PINECONE_INDEX_NAME before re-running.`,
      );
      process.exit(2);
    }
    console.log(`[rag-setup] config matches locked values; no action required`);
    return;
  }

  console.log(`[rag-setup] creating serverless index…`);
  await pc.createIndex({
    name: indexName,
    dimension: EMBEDDING_DIM,
    metric: METRIC,
    spec: {
      serverless: {
        cloud,
        region,
      },
    },
    // Wait for the index to be ready before returning so subsequent scripts
    // (e.g. ingestRulebooks) don't race the control plane.
    waitUntilReady: true,
  });

  console.log(`[rag-setup] index ${indexName} created and ready`);
}

main().catch((err) => {
  console.error("[rag-setup] failed:", err);
  process.exit(1);
});
