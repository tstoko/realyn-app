/**
 * RAG prompt-injection helpers.
 *
 * This is the single source of truth for how scheme-rulebook RAG context is
 * shaped into a `## REFERENCE MATERIAL` block and injected into specialist
 * LLM prompts. It is intentionally:
 *
 *   - Fail-safe: any retrieval error returns an empty block. The deterministic
 *     pipeline keeps working when Pinecone is down or `PINECONE_API_KEY` is
 *     unset, which means RAG is purely additive.
 *   - Feature-flag gated via `RAG_RETRIEVAL_ENABLED`. Setting the env var to
 *     `"false"` on a Cloud Run service reverts behaviour to pre-RAG without a
 *     redeploy. Any other value (or unset) leaves RAG enabled.
 *   - Side-effect free aside from a single `console.log` per retrieval call,
 *     of the shape `[rag] disputeId=… stage=… chunksReturned=… topScore=…`
 *     so production logs can be grepped for retrieval coverage / failures.
 *
 * Callers (evidence planner, argument generator, future specialists) must use
 * this module — they should not call `retrieveRulebookContext` directly. That
 * keeps query construction, telemetry, and the prompt block format consistent
 * across the pipeline.
 */

import type { DisputeCase } from "../types/aiDispute";
import type { RetrievedChunk, RulebookQueryFilter } from "../types/rag";
import {
  detectNetworkFromCode,
  getDisputeCodeInfo,
  mapStripeReasonToCode,
  type CardNetwork,
} from "../config/disputeCodeMapping";
import {
  formatRetrievedContext,
  retrieveRulebookContext,
} from "./ragService";

// ---------------------------------------------------------------------------
// Stage labels used in retrieval telemetry.
// ---------------------------------------------------------------------------

export type RagStage = "evidence_planning" | "argument_generation";

// ---------------------------------------------------------------------------
// Retrieval result + prompt-injection block
// ---------------------------------------------------------------------------

export interface RulebookRagResult {
  /** Chunks returned from the rulebooks namespace, post-threshold. */
  chunks: RetrievedChunk[];
  /** Highest similarity score in the result set, or 0 when empty. */
  topScore: number;
  /** True when the feature flag was disabled at retrieval time. */
  disabled: boolean;
}

const EMPTY_RULEBOOK_RESULT: RulebookRagResult = {
  chunks: [],
  topScore: 0,
  disabled: false,
};

/**
 * Returns true when retrieval should be attempted.
 *
 * Defaults to enabled. The exact comparison `=== "false"` is intentional:
 * any other value (including malformed input) leaves RAG on. We never want
 * a typo in env config to silently disable retrieval.
 */
export function isRagRetrievalEnabled(): boolean {
  return process.env.RAG_RETRIEVAL_ENABLED !== "false";
}

/**
 * Build the rulebook retrieval query from dispute context.
 *
 * Kept deterministic and PII-free: we use the dispute's network, reason code
 * (and its description from the static mapping when available), amount, and
 * vertical. We deliberately do NOT include cardholder name, email, or the
 * customer's free-form explanation here — those would leak PII into the
 * embedding call and can include adversarial text.
 */
export function buildRulebookRetrievalQuery(
  disputeCase: DisputeCase,
  reasonCodeDescription?: string,
): string {
  const parts: string[] = [];

  const network = inferNetwork(disputeCase);
  const reasonCode = disputeCase.pspReasonCode || disputeCase.reason || "";

  if (network && reasonCode) {
    parts.push(`Network ${network}, reason code ${reasonCode}`);
  } else if (network) {
    parts.push(`Network ${network}`);
  } else if (reasonCode) {
    parts.push(`Reason code ${reasonCode}`);
  }

  if (reasonCodeDescription) {
    parts.push(reasonCodeDescription);
  }

  // Only emit amount/vertical if we already have a network or code anchor.
  // A bare "Dispute amount ... Merchant vertical ..." query is too generic to
  // produce useful retrievals and just wastes embed-tokens.
  if (parts.length > 0) {
    if (Number.isFinite(disputeCase.amount) && disputeCase.amount > 0) {
      const amount = (disputeCase.amount / 100).toFixed(2);
      parts.push(`Dispute amount ${amount} ${disputeCase.currency.toUpperCase()}`);
    }

    if (disputeCase.merchantVertical) {
      parts.push(`Merchant vertical ${disputeCase.merchantVertical}`);
    }
  }

  return parts.filter(Boolean).join(". ").trim();
}

/**
 * Run rulebook retrieval and shape the result for prompt injection.
 *
 * Emits a single structured log line on completion (or skip) so production
 * logs can be filtered by `[rag]` to track retrieval coverage. Never throws;
 * any error path collapses to `EMPTY_RULEBOOK_RESULT`.
 */
export async function retrieveRulebookForPrompt(opts: {
  disputeCase: DisputeCase;
  stage: RagStage;
  /** Optional override for the query string; defaults to {@link buildRulebookRetrievalQuery}. */
  queryText?: string;
  /** Optional reason-code description used when building the default query. */
  reasonCodeDescription?: string;
  topK?: number;
  minScore?: number;
}): Promise<RulebookRagResult> {
  if (!isRagRetrievalEnabled()) {
    logRetrieval(opts.disputeCase.disputeId, opts.stage, 0, 0, "disabled");
    return { ...EMPTY_RULEBOOK_RESULT, disabled: true };
  }

  const queryText =
    opts.queryText ?? buildRulebookRetrievalQuery(opts.disputeCase, opts.reasonCodeDescription);

  if (!queryText) {
    logRetrieval(opts.disputeCase.disputeId, opts.stage, 0, 0, "empty-query");
    return EMPTY_RULEBOOK_RESULT;
  }

  const network = inferNetwork(opts.disputeCase);
  const filter: RulebookQueryFilter | undefined = network ? { network } : undefined;

  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveRulebookContext(queryText, filter, {
      topK: opts.topK,
      minScore: opts.minScore,
      disputeId: opts.disputeCase.disputeId,
      stage: opts.stage,
    });
  } catch (err) {
    // ragService is already fail-safe but defend in depth — a future change
    // could make it throw, and this code path must never break the pipeline.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rag] retrieval failed disputeId=${opts.disputeCase.disputeId} stage=${opts.stage}: ${message}`);
    logRetrieval(opts.disputeCase.disputeId, opts.stage, 0, 0, "error");
    return EMPTY_RULEBOOK_RESULT;
  }

  const topScore = chunks.length > 0 ? Math.max(...chunks.map((c) => c.score)) : 0;
  logRetrieval(opts.disputeCase.disputeId, opts.stage, chunks.length, topScore, "ok");

  return { chunks, topScore, disabled: false };
}

/**
 * Render a `## REFERENCE MATERIAL` markdown block for injection into a prompt.
 *
 * Returns an empty string when there are no chunks so callers can append
 * unconditionally without producing a stray heading.
 */
export function buildReferenceMaterialBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const formatted = formatRetrievedContext(chunks);
  return [
    "## REFERENCE MATERIAL",
    "",
    "The excerpts below are drawn verbatim from card-network rulebooks.",
    "Treat them as authoritative when they apply to this dispute. Cite the",
    "section number(s) where appropriate. Do not invent rule text that is not",
    "supported by these excerpts or by the deterministic facts already in the",
    "prompt; if a fact is not supported, omit it rather than guess.",
    "",
    formatted,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Resolve the rulebook network filter for a dispute.
 *
 * Mirrors {@link resolveDisputeCode} in the evidence planner: prefer
 * `pspReasonCode`, mapping Stripe's English reasons through the static table
 * first; fall back to `reason`. Returns `undefined` when the network cannot
 * be determined so the retrieval call doesn't apply a misleading filter.
 */
function inferNetwork(disputeCase: DisputeCase): CardNetwork | undefined {
  let code = disputeCase.pspReasonCode || disputeCase.reason || "";
  if (!code) return undefined;

  if (disputeCase.pspProvider === "stripe") {
    const mapped = mapStripeReasonToCode(code);
    if (mapped) code = mapped;
  }

  const network = detectNetworkFromCode(code);
  return network === "unknown" ? undefined : network;
}

/**
 * Look up a static reason-code description for the dispute, when available.
 * Used to enrich the retrieval query with a human-readable summary so the
 * embedding has more semantic surface area than a bare numeric code.
 */
export function lookupReasonCodeDescription(disputeCase: DisputeCase): string | undefined {
  let code = disputeCase.pspReasonCode || disputeCase.reason || "";
  if (!code) return undefined;
  if (disputeCase.pspProvider === "stripe") {
    const mapped = mapStripeReasonToCode(code);
    if (mapped) code = mapped;
  }
  const info = getDisputeCodeInfo(code);
  return info?.description;
}

function logRetrieval(
  disputeId: string | undefined,
  stage: RagStage,
  chunksReturned: number,
  topScore: number,
  status: "ok" | "disabled" | "empty-query" | "error",
): void {
  console.log(
    `[rag] disputeId=${disputeId ?? "unknown"} stage=${stage} status=${status} ` +
      `chunksReturned=${chunksReturned} topScore=${topScore.toFixed(3)}`,
  );
}
