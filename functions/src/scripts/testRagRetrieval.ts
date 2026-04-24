/**
 * Smoke test for the RAG retrieval path.
 *
 * Embeds a query, hits Pinecone via the configured `VectorStorePort`, and
 * prints the top results. Useful for:
 *   - Verifying Pinecone creds + index are wired correctly after `setupPineconeIndex`.
 *   - Eyeballing retrieval quality after `ingestRulebooks` runs.
 *   - Debugging score thresholds before wiring RAG into the specialist pipeline.
 *
 * Usage (from `functions/`):
 *   npm run build
 *   node lib/scripts/testRagRetrieval.js \
 *     --q "Did the hotel double-charge the guest?" \
 *     [--network visa] [--reason 13.1] [--topK 5] [--minScore 0.3]
 *
 * Environment variables:
 *   PINECONE_API_KEY       Required.
 *   PINECONE_INDEX_NAME    Optional override (default: `realyn-rag`).
 */

// Importing the shim registers the Pinecone-backed vector store.
import "../services/ai/ragService";

import { retrieveRulebookContext } from "../services/ai/ragService";
import { MIN_RELEVANCE_SCORE, isEmbeddingAvailable } from "@realyn/ai-core";

interface CliArgs {
  query: string;
  network?: string;
  reasonCode?: string;
  topK?: number;
  minScore?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--q":
      case "--query":
        out.query = argv[++i];
        break;
      case "--network":
        out.network = argv[++i];
        break;
      case "--reason":
        out.reasonCode = argv[++i];
        break;
      case "--topK":
        out.topK = parseInt(argv[++i], 10);
        break;
      case "--minScore":
        out.minScore = parseFloat(argv[++i]);
        break;
      default:
        throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (!out.query) {
    throw new Error(
      `--q is required.  e.g. --q "Did the hotel double-charge the guest?"`,
    );
  }
  return out as CliArgs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!isEmbeddingAvailable()) {
    throw new Error(`Embedding unavailable — is PINECONE_API_KEY set?`);
  }

  console.log(`[rag-test] query: "${args.query}"`);
  if (args.network) console.log(`[rag-test] filter network=${args.network}`);
  if (args.reasonCode) console.log(`[rag-test] filter reasonCodes in [${args.reasonCode}]`);
  console.log(`[rag-test] minScore=${args.minScore ?? MIN_RELEVANCE_SCORE}`);

  const chunks = await retrieveRulebookContext(
    args.query,
    {
      network: args.network,
      reasonCodes: args.reasonCode ? [args.reasonCode] : undefined,
    },
    {
      topK: args.topK,
      minScore: args.minScore,
    },
  );

  if (chunks.length === 0) {
    console.log(`[rag-test] no matches above score threshold.`);
    console.log(
      `[rag-test] Try lowering --minScore, removing filters, or confirming ingestion ran.`,
    );
    return;
  }

  console.log(`[rag-test] ${chunks.length} chunk(s):\n`);
  chunks.forEach((c, i) => {
    console.log(`--- [${i + 1}] score=${c.score.toFixed(4)} ---`);
    console.log(`source: ${c.source}`);
    console.log(`id:     ${c.id}`);
    const preview = c.text.length > 400 ? c.text.slice(0, 400) + "…" : c.text;
    console.log(preview);
    console.log();
  });
}

main().catch((err) => {
  console.error("[rag-test] failed:", err);
  process.exit(1);
});
