/**
 * RAG domain types.
 *
 * Pure TypeScript — no Pinecone, Firebase, or Node-specific imports. Consumers
 * (functions/, ingestion scripts) adapt these to concrete infra at the boundary.
 *
 * Zod schemas are exported alongside each type so callers can validate untyped
 * input (e.g. raw Pinecone metadata) before treating it as domain data. This
 * is a hard requirement for anything that crosses the network boundary.
 */

import { z } from "zod";
import { CardNetworkSchema } from "./aiDispute";
import { RAG_NAMESPACES, type RagNamespace } from "../config/ragConfig";

// ---------------------------------------------------------------------------
// Namespace schema
// ---------------------------------------------------------------------------

export const RagNamespaceSchema = z.enum([
  RAG_NAMESPACES.rulebooks,
  RAG_NAMESPACES.cases,
  RAG_NAMESPACES.policies,
]);

// ---------------------------------------------------------------------------
// Per-namespace metadata shapes
// ---------------------------------------------------------------------------

/** Common metadata stamped on every record regardless of namespace. */
export const RagBaseMetadataSchema = z.object({
  /** Monotonic version; bump when chunking/embedding changes. See `RAG_SCHEMA_VERSION`. */
  schemaVersion: z.number().int().positive(),
  /** Embedding model used to produce the vector — used to detect mismatches. */
  embeddingModel: z.string(),
  /** Token count of the chunk (approximate). */
  tokenCount: z.number().int().positive(),
  /** ISO-8601 timestamp when the vector was created. */
  indexedAt: z.string(),
  /** Chunk text — stored so retrieval results are self-contained. */
  text: z.string(),
  /** Chunk index within its source document (0-based). */
  chunkIndex: z.number().int().nonnegative(),
  /** Human-readable source citation, e.g. "Visa Core Rules v2024, §11.3.2". */
  source: z.string(),
});

export type RagBaseMetadata = z.infer<typeof RagBaseMetadataSchema>;

/** Scheme rulebook chunk metadata. */
export const RulebookMetadataSchema = RagBaseMetadataSchema.extend({
  namespace: z.literal(RAG_NAMESPACES.rulebooks),
  network: CardNetworkSchema,
  documentName: z.string(),
  documentVersion: z.string(),
  effectiveDate: z.string().optional(),
  section: z.string().optional(),
  sectionTitle: z.string().optional(),
  /** Reason codes this chunk is most relevant to (empty if unknown). */
  reasonCodes: z.array(z.string()).default([]),
});

export type RulebookMetadata = z.infer<typeof RulebookMetadataSchema>;

/** Anonymised past-case chunk metadata (Phase 2). */
export const CaseMetadataSchema = RagBaseMetadataSchema.extend({
  namespace: z.literal(RAG_NAMESPACES.cases),
  network: CardNetworkSchema,
  reasonCode: z.string(),
  verticalId: z.string(),
  outcome: z.enum(["won", "lost", "unknown"]),
  organizationId: z.string().optional(),
});

export type CaseMetadata = z.infer<typeof CaseMetadataSchema>;

/** Organization policy chunk metadata (Phase 3). */
export const PolicyMetadataSchema = RagBaseMetadataSchema.extend({
  namespace: z.literal(RAG_NAMESPACES.policies),
  organizationId: z.string(),
  documentId: z.string(),
  documentName: z.string(),
  documentType: z.string().optional(),
});

export type PolicyMetadata = z.infer<typeof PolicyMetadataSchema>;

export const RagMetadataSchema = z.discriminatedUnion("namespace", [
  RulebookMetadataSchema,
  CaseMetadataSchema,
  PolicyMetadataSchema,
]);

export type RagMetadata = z.infer<typeof RagMetadataSchema>;

// ---------------------------------------------------------------------------
// Records (input to upsert) and chunks (output of retrieval)
// ---------------------------------------------------------------------------

/** Input to the upsert path — pre-embedded or text-only depending on path taken. */
export interface RagRecord {
  id: string;
  text: string;
  metadata: RagMetadata;
  /** Pre-computed vector. Omit when the upsert path embeds at write time. */
  vector?: number[];
}

/** Output of a retrieval call. Always carries its own source attribution. */
export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
  source: string;
  metadata: RagMetadata;
}

// ---------------------------------------------------------------------------
// Query + result shapes
// ---------------------------------------------------------------------------

/** Free-form retrieval query — the service layer turns this into a vector search. */
export interface RagQuery {
  /** Text to embed for the retrieval call. Must come from the current dispute context. */
  queryText: string;
  /** Optional per-namespace topK overrides. Falls back to `DEFAULT_TOP_K`. */
  topK?: Partial<Record<RagNamespace, number>>;
  /** Minimum score threshold; falls back to `MIN_RELEVANCE_SCORE`. */
  minScore?: number;
  /** Scope filters applied per namespace. */
  filters?: {
    rulebooks?: RulebookQueryFilter;
    cases?: CaseQueryFilter;
    policies?: PolicyQueryFilter;
  };
  /** Which namespaces to query. Defaults to all enabled ones. */
  namespaces?: RagNamespace[];
  /** Telemetry correlation. */
  disputeId?: string;
  stage?: string;
}

export interface RulebookQueryFilter {
  network?: string;
  reasonCodes?: string[];
  documentName?: string;
}

export interface CaseQueryFilter {
  network?: string;
  reasonCode?: string;
  verticalId?: string;
  outcome?: "won" | "lost";
  organizationId?: string;
}

export interface PolicyQueryFilter {
  organizationId: string;
  documentType?: string;
}

/** Bundle of retrieved chunks, one array per namespace. Empty arrays on miss. */
export interface RagResult {
  rulebooks: RetrievedChunk[];
  cases: RetrievedChunk[];
  policies: RetrievedChunk[];
  /** True if any retrieval call failed. Callers should log but not block. */
  partial: boolean;
  /** Total time spent in retrieval (embedding + vector query). */
  latencyMs: number;
}

export const EMPTY_RAG_RESULT: RagResult = {
  rulebooks: [],
  cases: [],
  policies: [],
  partial: false,
  latencyMs: 0,
};
