/**
 * Ingest scheme rulebook PDFs into the `rulebooks` Pinecone namespace.
 *
 * Pipeline:
 *   1. Read one or more PDFs from the filesystem.
 *   2. Extract text (pdf-parse), normalise, heading-aware chunk.
 *   3. Embed chunks with Pinecone Inference (passage input type).
 *   4. Validate metadata via Zod, build stable content-addressed IDs.
 *   5. Upsert in batches. Report counts + any per-batch errors.
 *
 * Idempotency: chunk IDs are deterministic (`{docSlug}-{chunkIndex}-{hash8}`),
 * so re-running this against unchanged inputs overwrites the same vectors
 * rather than duplicating them. Changing the input text changes the hash,
 * which changes the ID — use a new `documentVersion` to keep old and new
 * vectors separate for auditability.
 *
 * Usage (from `functions/`):
 *   npm run build
 *   node lib/scripts/ingestRulebooks.js \
 *     --file ../data/rulebooks/visa-public-rules-2024.pdf \
 *     --network visa \
 *     --name "Visa Public Rules" \
 *     --version 2024-04-15 \
 *     [--dry-run] [--sample 3]
 *
 * Multiple PDFs at once:
 *   node lib/scripts/ingestRulebooks.js \
 *     --file visa.pdf   --network visa   --name "Visa Core Rules"   --version 2024-04-15 \
 *     --file mc.pdf     --network mastercard --name "MC Chargeback Guide" --version 2024-07-01
 *
 * Environment variables:
 *   PINECONE_API_KEY       Required.
 *   PINECONE_INDEX_NAME    Optional override (default: `realyn-rag`).
 */

import { readFile } from "fs/promises";
import { basename } from "path";
import { createHash } from "crypto";
// pdf-parse v2 ships as CJS; use require for compatibility with commonjs target.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages?: number }> = require("pdf-parse");
import {
  RAG_NAMESPACES,
  RAG_SCHEMA_VERSION,
  EMBEDDING_MODEL,
  type RagRecord,
  type RulebookMetadata,
  RulebookMetadataSchema,
  CardNetworkSchema,
  embedDocuments,
  sparseEmbedDocuments,
} from "@realyn/ai-core";
import { upsertRecords } from "../services/ai/pineconeVectorStore";
import { chunkText } from "./lib/textChunker";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface SourceArgs {
  file: string;
  network: string;
  name: string;
  version: string;
  effectiveDate?: string;
}

interface CliArgs {
  sources: SourceArgs[];
  dryRun: boolean;
  sample: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const sources: SourceArgs[] = [];
  let dryRun = false;
  let sample: number | null = null;

  let current: Partial<SourceArgs> = {};
  const flush = () => {
    if (!current.file) return;
    if (!current.network || !current.name || !current.version) {
      throw new Error(
        `Each --file needs matching --network, --name, --version. Got: ${JSON.stringify(current)}`,
      );
    }
    sources.push(current as SourceArgs);
    current = {};
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--file":
        flush();
        current.file = argv[++i];
        break;
      case "--network":
        current.network = argv[++i];
        break;
      case "--name":
        current.name = argv[++i];
        break;
      case "--version":
        current.version = argv[++i];
        break;
      case "--effective-date":
        current.effectiveDate = argv[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--sample":
        sample = parseInt(argv[++i], 10);
        if (!Number.isFinite(sample) || sample <= 0) {
          throw new Error(`--sample expects a positive integer`);
        }
        break;
      default:
        throw new Error(`Unknown flag: ${a}`);
    }
  }
  flush();

  if (sources.length === 0) {
    throw new Error(
      `No sources specified. Provide at least one --file plus --network --name --version.`,
    );
  }
  return { sources, dryRun, sample };
}

// ---------------------------------------------------------------------------
// Per-source ingestion
// ---------------------------------------------------------------------------

async function ingestSource(src: SourceArgs, opts: { dryRun: boolean; sample: number | null }) {
  console.log(`\n[ingest] --- ${src.name} v${src.version} (${src.network}) ---`);
  console.log(`[ingest] file: ${src.file}`);

  CardNetworkSchema.parse(src.network); // fails fast on typos

  const buf = await readFile(src.file);
  const parsed = await pdfParse(buf);
  const pages = parsed.numpages ?? 0;
  const chars = parsed.text.length;
  console.log(`[ingest] parsed ${pages} pages, ${chars.toLocaleString()} chars`);

  let chunks = chunkText(parsed.text);
  console.log(`[ingest] produced ${chunks.length} chunks`);

  if (opts.sample) {
    chunks = chunks.slice(0, opts.sample);
    console.log(`[ingest] --sample ${opts.sample}: keeping first ${chunks.length} chunks`);
  }

  if (chunks.length === 0) {
    console.warn(`[ingest] no chunks produced — is the PDF scanned/image-only?`);
    return { upserted: 0, skipped: 0 };
  }

  // Embed passages in bulk. Run dense + sparse in parallel — each side is
  // batched internally by its own service. We keep them in separate calls
  // (rather than fanning out per chunk) so the network-cost amortises across
  // batches and a partial failure on one side surfaces a clear error.
  console.log(`[ingest] embedding ${chunks.length} chunks (dense + sparse)…`);
  const texts = chunks.map((c) => c.text);
  const [denseEmb, sparseEmb] = await Promise.all([
    embedDocuments(texts),
    sparseEmbedDocuments(texts),
  ]);
  if (!denseEmb.success || !denseEmb.vectors) {
    throw new Error(`Dense embedding failed: ${denseEmb.error}`);
  }
  if (!sparseEmb.success || !sparseEmb.vectors) {
    throw new Error(`Sparse embedding failed: ${sparseEmb.error}`);
  }
  if (denseEmb.vectors.length !== chunks.length) {
    throw new Error(
      `Dense embedding length mismatch: got ${denseEmb.vectors.length}, expected ${chunks.length}`,
    );
  }
  if (sparseEmb.vectors.length !== chunks.length) {
    throw new Error(
      `Sparse embedding length mismatch: got ${sparseEmb.vectors.length}, expected ${chunks.length}`,
    );
  }
  console.log(
    `[ingest] embedded ok (dense dim=${denseEmb.dim}, dense tokens=${denseEmb.tokensUsed ?? "?"}, ` +
      `sparse tokens=${sparseEmb.tokensUsed ?? "?"})`,
  );

  const docSlug = slugify(`${src.network}-${basename(src.file, ".pdf")}-${src.version}`);
  const indexedAt = new Date().toISOString();

  const records: RagRecord[] = chunks.map((c, i) => {
    const metadata: RulebookMetadata = {
      namespace: RAG_NAMESPACES.rulebooks,
      schemaVersion: RAG_SCHEMA_VERSION,
      embeddingModel: EMBEDDING_MODEL,
      tokenCount: c.tokenCount,
      indexedAt,
      text: c.text,
      chunkIndex: c.index,
      source: buildCitation(src, c.headingPath),
      network: src.network as RulebookMetadata["network"],
      documentName: src.name,
      documentVersion: src.version,
      effectiveDate: src.effectiveDate,
      section: extractSectionNumber(c.headingPath),
      sectionTitle: c.headingPath ?? undefined,
      reasonCodes: [], // filled in later by an optional enrichment pass
    };
    // Validates metadata before upsert; a bug here stops the batch cleanly.
    RulebookMetadataSchema.parse(metadata);

    const id = `${docSlug}-${i.toString().padStart(5, "0")}-${shortHash(c.text)}`;
    return {
      id,
      text: c.text,
      metadata,
      vector: denseEmb.vectors![i],
      sparseVector: sparseEmb.vectors![i],
    };
  });

  if (opts.dryRun) {
    console.log(`[ingest] --dry-run: skipping upsert. First record preview:`);
    console.log(JSON.stringify({ id: records[0].id, metadata: records[0].metadata }, null, 2));
    return { upserted: 0, skipped: records.length };
  }

  console.log(`[ingest] upserting ${records.length} records to Pinecone…`);
  const result = await upsertRecords(RAG_NAMESPACES.rulebooks, records);
  console.log(
    `[ingest] upsert complete: upserted=${result.upserted} skipped=${result.skipped} errors=${result.errors.length}`,
  );
  for (const err of result.errors) {
    console.error(`[ingest] batch ${err.batch}: ${err.message}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

function buildCitation(src: SourceArgs, headingPath: string | null): string {
  const base = `${src.name} v${src.version}`;
  return headingPath ? `${base}, ${headingPath}` : base;
}

function extractSectionNumber(headingPath: string | null): string | undefined {
  if (!headingPath) return undefined;
  const last = headingPath.split(" > ").pop() ?? headingPath;
  const m = last.match(/§(\d+(?:\.\d+)*)/);
  return m ? m[1] : undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log(`[ingest] ${args.sources.length} source(s), dryRun=${args.dryRun}`);

  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const src of args.sources) {
    const r = await ingestSource(src, { dryRun: args.dryRun, sample: args.sample });
    totalUpserted += r.upserted;
    totalSkipped += r.skipped;
  }

  console.log(
    `\n[ingest] done. totalUpserted=${totalUpserted} totalSkipped=${totalSkipped}`,
  );
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
