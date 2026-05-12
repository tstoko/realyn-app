/**
 * Pinecone-Inference-backed implementation of `RerankPort`.
 *
 * Why it lives in `functions/` and not `packages/ai-core/`:
 *   ai-core defines the abstract `RerankPort` so tests + local tools can
 *   plug in fakes; concrete adapters (Pinecone Inference here, future
 *   self-hosted BGE or other reranker) belong at the consumption edge.
 *
 * Plan-tier + rate-limit caveats apply to Pinecone Inference rerank — see
 * docs/post-hardening-plan.md §C7 corrections. `RERANK_ENABLED` defaults
 * off so this code only runs after explicit opt-in once we've verified
 * the Pinecone account tier.
 */

import {
  RERANK_MODEL,
  type RerankPort,
  type RerankRequest,
  type RerankResultEntry,
} from "@realyn/ai-core";
import { getPineconeClient } from "./pineconeVectorStore";

export const pineconeRerankPort: RerankPort = {
  async rerank(request: RerankRequest): Promise<RerankResultEntry[]> {
    const pc = getPineconeClient();

    // Pinecone Inference rerank accepts plain strings or objects with named
    // fields. We pass strings keyed off chunk.text since `RetrievedChunk.text`
    // is the canonical surface and `cohere-rerank-3.5` only supports a single
    // rerank field at a time. If we ever want to rerank on metadata too we'd
    // switch to the object form and pass `rankFields: [...]`.
    const documents = request.chunks.map((c) => c.text);

    const response = await pc.inference.rerank({
      model: RERANK_MODEL,
      query: request.query,
      documents,
      topN: request.topN,
      returnDocuments: false, // we already have the chunks; saves bandwidth
    });

    // RerankResult.data is `Array<{ index, score, document? }>`. The `index`
    // points back to the original `documents` array, which is in lockstep
    // with the input `chunks`. Pass that through unchanged so ai-core can
    // map it back to chunks.
    return (response.data ?? []).map((row) => ({
      index: row.index,
      score: row.score,
    }));
  },
};
