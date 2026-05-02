/**
 * captureRagBaseline.ts — pre-RAG eval baseline capture (post-hardening plan §C3).
 *
 * What this does
 * --------------
 * 1. Force-disables retrieval (`RAG_RETRIEVAL_ENABLED=false`) so the prompt
 *    pipeline runs without any `## REFERENCE MATERIAL` injection — i.e. the
 *    deterministic baseline. This matches what the deployed Functions
 *    currently do today, since prod Functions don't have `PINECONE_API_KEY`
 *    bound (C7) and the ragService falls back to empty chunks on init failure.
 *    Setting the flag explicitly is belt-and-braces in case a future agent
 *    runs this script after C7 lands.
 * 2. Resolves a small, hard-coded sample of 3 demo-org disputes (one per
 *    representative reason category × different demo orgs for some vertical
 *    spread). Demo orgs are intentional — they're disposable and re-seedable,
 *    so the destructive parts of this script (see below) don't touch real
 *    customer data.
 * 3. For each dispute, invokes `triggerEvidencePlanning(..., { forceRefresh:
 *    true })` — this re-runs the full specialist chain (claim analyst →
 *    evidence analyzer → relevance scorer → strategy advisor → planner with
 *    quality loop). The result IS persisted back to Firestore (overwrites
 *    `evidencePlan`, appends to `evidencePlanVersions`, refreshes the
 *    `cached*` specialist outputs). This is the user-approved trade-off:
 *    fresh outputs at the cost of mutating prod docs for demo orgs.
 * 4. Then invokes `generateDisputeArgument(...)` to produce the argument
 *    draft. Unlike the deployed `draftArgument` handler, the generated
 *    argument is NOT persisted to Firestore — we just dump it into the
 *    markdown so the eval is reproducible without polluting the dispute's
 *    `argumentDraft` / `argumentVersions`.
 * 5. Renders `docs/eval/2026-05-rag-phase1-baseline.md` from the existing
 *    `docs/eval/rag-baseline-template.md` shape, with one section per dispute.
 *    Rubric grids are left empty for human grading (per the C3 plan: the
 *    script captures the artefact, the human grades it).
 *
 * Required env
 * ------------
 * - ANTHROPIC_API_KEY: required for all Claude calls. The script bails early
 *   if it's missing, rather than running a half-baseline. Don't pass this via
 *   `--env-file=.env` because `functions/.env` only has placeholder secrets;
 *   export it in your shell before invoking the script.
 * - GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`
 *   for the Firebase Admin SDK to talk to prod Firestore (`realyn-app`).
 *
 * Usage
 * -----
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   cd functions && npm run rag:eval:baseline
 *
 * Re-running this script later (e.g. for the C8 post-RAG comparison) should
 * reuse the same `(organizationId, reason)` tuples below so the same 3
 * disputes are picked. Demo seed data is deterministic per org, but the
 * dispute IDs themselves are non-deterministic (Firestore-generated) — the
 * lookup is by `(organizationId, reason)` precisely so re-runs don't drift.
 */

// CRITICAL: must be set BEFORE any module reads it. ragPromptInjection.ts
// reads this at call-time, but defence-in-depth — set it as the very first
// statement so even module-init reads see "false".
process.env.RAG_RETRIEVAL_ENABLED = "false";

import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import * as admin from "firebase-admin";

import { triggerEvidencePlanning } from "../services/ai/evidencePlanningService";
import { buildDisputeCase } from "../services/ai/disputeCaseBuilder";
import { generateDisputeArgument } from "../services/ai/argumentGenerator";
import { getEvidenceFiles } from "../services/evidenceService";
import {
  getPSPFormats,
  getWinPatterns,
} from "../services/knowledgeBaseService";
import {
  detectNetworkFromCode,
  mapStripeReasonToCode,
  sanitizeDisputeCaseWithLog,
} from "@realyn/ai-core";
import type {
  DisputeCase,
  EvidencePlan,
  EvidenceItem,
  DisputeArgument,
  ClaimAnalysis,
  DisputeStrategy,
} from "../types/aiDispute";

// ============================================================
// Sample
// ============================================================

interface SampleSpec {
  organizationId: string;
  reason: string;
  /** Human-friendly label used in markdown headers. */
  label: string;
  /** Expected reason-code mapping for the markdown header (informational). */
  expectedCode: string;
}

/**
 * Three demo-org disputes. Each tuple is resolved at runtime to the first
 * matching dispute (with a "rich" lifecycleStatus — see DESIRED_LIFECYCLES
 * below) so we get one with evidence already uploaded.
 */
const DEFAULT_SAMPLE: SampleSpec[] = [
  {
    organizationId: "zipworld_adventures",
    reason: "product_not_received",
    label: "Zip World — product not received",
    expectedCode: "Visa 13.1",
  },
  {
    organizationId: "dice_ticketing",
    reason: "fraudulent",
    label: "Dice — fraudulent",
    expectedCode: "Visa 10.4",
  },
  {
    organizationId: "nimax_ticketing",
    reason: "duplicate",
    label: "Nimax — duplicate",
    expectedCode: "Visa 12.6",
  },
];

/**
 * Lifecycle statuses where the dispute has gone through the full pipeline at
 * least once and has evidence attached. Filtering to these gives the argument
 * generator something meaningful to inspect.
 */
const DESIRED_LIFECYCLES = ["won", "lost", "submitted", "draft_ready"];

// ============================================================
// Types
// ============================================================

interface CaptureResult {
  spec: SampleSpec;
  disputeId: string;
  disputeCase: DisputeCase | null;
  plan: EvidencePlan | null;
  argument: DisputeArgument | null;
  claimAnalysis?: ClaimAnalysis;
  strategy?: DisputeStrategy;
  qualityScore?: number;
  revisionAttempts?: number;
  planDurationMs: number;
  argDurationMs: number;
  uploadedEvidenceCount: number;
  preLifecycleStatus?: string;
  preReason?: string;
  preNetwork?: string;
  preMerchantVertical?: string;
  error?: string;
}

// ============================================================
// Firebase init (mirrors clearDisputes.ts pattern)
// ============================================================

function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    const projectId =
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      "realyn-app";
    admin.initializeApp({ projectId });
  }
  return admin.firestore();
}

// ============================================================
// Dispute resolution
// ============================================================

async function pickDisputeForSample(
  db: admin.firestore.Firestore,
  spec: SampleSpec,
): Promise<{ id: string; data: admin.firestore.DocumentData } | null> {
  // Step 1: prefer a "rich" lifecycle (has evidence + draft).
  for (const lifecycle of DESIRED_LIFECYCLES) {
    const snap = await db
      .collection("disputes")
      .where("organizationId", "==", spec.organizationId)
      .where("reason", "==", spec.reason)
      .where("lifecycleStatus", "==", lifecycle)
      .limit(1)
      .get();
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, data: d.data() };
    }
  }
  // Step 2: fall back to any matching dispute, regardless of lifecycle.
  const snap = await db
    .collection("disputes")
    .where("organizationId", "==", spec.organizationId)
    .where("reason", "==", spec.reason)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() };
}

// ============================================================
// Per-dispute capture
// ============================================================

async function captureOne(spec: SampleSpec): Promise<CaptureResult> {
  const db = getDb();
  const baseResult: CaptureResult = {
    spec,
    disputeId: "",
    disputeCase: null,
    plan: null,
    argument: null,
    planDurationMs: 0,
    argDurationMs: 0,
    uploadedEvidenceCount: 0,
  };

  console.log(`\n[capture] === ${spec.label} ===`);

  const picked = await pickDisputeForSample(db, spec);
  if (!picked) {
    return {
      ...baseResult,
      error: `No dispute found in org=${spec.organizationId} with reason=${spec.reason}`,
    };
  }
  const disputeId = picked.id;
  const preData = picked.data;
  console.log(
    `[capture] picked disputeId=${disputeId} ` +
      `lifecycle=${preData.lifecycleStatus} reason=${preData.reason} ` +
      `network=${preData.network ?? "(unset)"}`,
  );

  // Step A: triggerEvidencePlanning with forceRefresh — writes back to Firestore.
  const planStart = Date.now();
  let planResult;
  try {
    planResult = await triggerEvidencePlanning(disputeId, spec.organizationId, {
      forceRefresh: true,
    });
  } catch (err) {
    return {
      ...baseResult,
      disputeId,
      preLifecycleStatus: preData.lifecycleStatus,
      preReason: preData.reason,
      preNetwork: preData.network,
      preMerchantVertical: preData.merchantVertical,
      planDurationMs: Date.now() - planStart,
      error: `triggerEvidencePlanning threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  const planDurationMs = Date.now() - planStart;

  if (!planResult.success || !planResult.plan) {
    return {
      ...baseResult,
      disputeId,
      preLifecycleStatus: preData.lifecycleStatus,
      preReason: preData.reason,
      preNetwork: preData.network,
      preMerchantVertical: preData.merchantVertical,
      planDurationMs,
      error: planResult.error || "triggerEvidencePlanning returned unsuccessful",
    };
  }
  console.log(
    `[capture] plan ok: ${planResult.plan.requirements.length} reqs, ` +
      `quality=${planResult.qualityScore}, revisions=${planResult.revisionAttempts}, ` +
      `${(planDurationMs / 1000).toFixed(1)}s`,
  );

  // Step B: build dispute case + load freshly-cached values for argument gen.
  const disputeCase = await buildDisputeCase(disputeId, spec.organizationId);
  if (!disputeCase) {
    return {
      ...baseResult,
      disputeId,
      preLifecycleStatus: preData.lifecycleStatus,
      preReason: preData.reason,
      preNetwork: preData.network,
      preMerchantVertical: preData.merchantVertical,
      plan: planResult.plan,
      claimAnalysis: planResult.claimAnalysis,
      strategy: planResult.strategy,
      qualityScore: planResult.qualityScore,
      revisionAttempts: planResult.revisionAttempts,
      planDurationMs,
      error: "buildDisputeCase returned null",
    };
  }

  const disputeDoc = await db.collection("disputes").doc(disputeId).get();
  const dispute = disputeDoc.data()!;
  const evidenceItems = (dispute.evidenceItems || []) as EvidenceItem[];
  const uploadedCount = evidenceItems.filter((i) => i.status === "uploaded").length;

  const pspProvider = (dispute.pspProvider || "stripe") as
    | "stripe"
    | "adyen"
    | "other";
  const reasonCode = dispute.reason
    ? mapStripeReasonToCode(dispute.reason) || dispute.reason
    : "";
  const network = reasonCode ? detectNetworkFromCode(reasonCode) : "unknown";
  const verticalId = disputeCase.merchantVertical || "general";

  const [preloadedFiles, pspFormats, winPatterns] = await Promise.all([
    getEvidenceFiles(disputeId),
    getPSPFormats(pspProvider),
    reasonCode && network !== "unknown"
      ? getWinPatterns(network as any, reasonCode, verticalId)
      : Promise.resolve([]),
  ]);

  // Step C: generate argument (NOT persisted — capture only).
  const argStart = Date.now();
  let argument: DisputeArgument | null = null;
  try {
    argument = await generateDisputeArgument(
      disputeCase,
      planResult.plan,
      evidenceItems,
      disputeId,
      {
        preloadedFiles,
        pmsMatch: dispute.pmsMatch,
        claimAnalysis: planResult.claimAnalysis,
        strategy: planResult.strategy,
        schemeRule: dispute.cachedSchemeRule,
        pspFormats: pspFormats.length > 0 ? pspFormats : undefined,
        winPatterns: winPatterns.length > 0 ? winPatterns : undefined,
      },
    );
  } catch (err) {
    console.error(
      `[capture] generateDisputeArgument threw for ${disputeId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
  const argDurationMs = Date.now() - argStart;
  console.log(
    `[capture] argument ${argument ? "ok" : "null"}: ` +
      `${(argDurationMs / 1000).toFixed(1)}s, ${uploadedCount} uploaded evidence items`,
  );

  return {
    ...baseResult,
    disputeId,
    disputeCase,
    plan: planResult.plan,
    argument,
    claimAnalysis: planResult.claimAnalysis,
    strategy: planResult.strategy,
    qualityScore: planResult.qualityScore,
    revisionAttempts: planResult.revisionAttempts,
    planDurationMs,
    argDurationMs,
    uploadedEvidenceCount: uploadedCount,
    preLifecycleStatus: preData.lifecycleStatus,
    preReason: preData.reason,
    preNetwork: preData.network,
    preMerchantVertical: preData.merchantVertical,
  };
}

// ============================================================
// Markdown rendering
// ============================================================

function fmtNumber(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return "(unset)";
  return n.toFixed(digits);
}

function fmtAmount(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined || currency === undefined) return "(unset)";
  return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function quoteBlock(text: string | undefined, fallback = "(none)"): string {
  if (!text) return fallback;
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function renderEvidencePlan(plan: EvidencePlan | null): string {
  if (!plan) return "_Plan generation failed._";
  const lines: string[] = [];
  lines.push(`- **Recommendation:** \`${plan.recommendation}\``);
  lines.push(`- **Winnability:** \`${plan.winnability}\``);
  lines.push(`- **Network / reason code:** \`${plan.network ?? "(unset)"}\` / \`${plan.reasonCode ?? "(unset)"}\``);
  if (plan.disputeCategory) lines.push(`- **Category:** ${plan.disputeCategory}`);
  if (plan.disputeSubtype) lines.push(`- **Subtype:** ${plan.disputeSubtype}`);
  lines.push("");
  lines.push("**Plan summary:**");
  lines.push("");
  lines.push(quoteBlock(plan.summary));
  if (plan.winnabilityReason) {
    lines.push("");
    lines.push("**Winnability reason:**");
    lines.push("");
    lines.push(quoteBlock(plan.winnabilityReason));
  }
  lines.push("");
  lines.push(`**Requirements (${plan.requirements.length}):**`);
  lines.push("");
  for (const req of plan.requirements) {
    const required = req.required ? "**required**" : "_optional_";
    lines.push(`- \`${req.id}\` — ${req.label} (${required}, priority ${req.priority}, category \`${req.category}\`)`);
    if (req.description) lines.push(`  - ${req.description}`);
  }
  return lines.join("\n");
}

function renderArgument(arg: DisputeArgument | null): string {
  if (!arg) return "_Argument generation returned null._";
  const lines: string[] = [];
  if (arg.executiveSummary) {
    lines.push("**Executive summary:**");
    lines.push("");
    lines.push(quoteBlock(arg.executiveSummary));
    lines.push("");
  }
  if (arg.timeline && arg.timeline.length > 0) {
    lines.push("**Timeline:**");
    lines.push("");
    for (const entry of arg.timeline) {
      lines.push(`- **${entry.date}** — ${entry.description}`);
    }
    lines.push("");
  }
  if (arg.paragraphs && arg.paragraphs.length > 0) {
    lines.push("**Paragraphs:**");
    lines.push("");
    for (const p of arg.paragraphs) {
      lines.push(`#### ${p.heading}`);
      lines.push("");
      lines.push(quoteBlock(p.content));
      if (p.evidenceReferences && p.evidenceReferences.length > 0) {
        lines.push("");
        lines.push(`*Evidence refs: ${p.evidenceReferences.map((r) => `\`${r}\``).join(", ")}*`);
      }
      lines.push("");
    }
  }
  if (arg.customerClaimRebuttal) {
    lines.push("**Customer-claim rebuttal:**");
    lines.push("");
    lines.push(quoteBlock(arg.customerClaimRebuttal));
    lines.push("");
  }
  if (arg.conclusion) {
    lines.push("**Conclusion:**");
    lines.push("");
    lines.push(quoteBlock(arg.conclusion));
  }
  return lines.join("\n");
}

function renderClaimSummary(disputeCase: DisputeCase | null): string {
  if (!disputeCase) return "_(could not build dispute case)_";
  // Use the same sanitiser the LLM sees, so the markdown matches what the
  // baseline pipeline operated on. customerExplanation is the cardholder's
  // free-form claim text where present; otherwise fall back to reason.
  const sanitized = sanitizeDisputeCaseWithLog(disputeCase);
  return (
    sanitized.customerExplanation ||
    sanitized.reason ||
    "(no claim text)"
  );
}

function renderDisputeSection(idx: number, r: CaptureResult): string {
  const lines: string[] = [];
  lines.push(`### Dispute ${idx} — ${r.spec.label}`);
  lines.push("");

  if (r.error) {
    lines.push(`> ⚠️ **Capture failed:** ${r.error}`);
    if (r.disputeId) {
      lines.push(`>`);
      lines.push(`> Firestore disputeId: \`${r.disputeId}\``);
    }
    return lines.join("\n");
  }

  lines.push(`- **Firestore disputeId:** \`${r.disputeId}\``);
  lines.push(`- **Pre-run lifecycle:** \`${r.preLifecycleStatus ?? "(unset)"}\``);
  lines.push(`- **Reason / network (expected):** ${r.spec.reason} → ${r.spec.expectedCode}`);
  if (r.disputeCase) {
    lines.push(`- **Vertical:** \`${r.disputeCase.merchantVertical ?? "general"}\``);
    lines.push(`- **Amount:** ${fmtAmount(r.disputeCase.amount, r.disputeCase.currency)}`);
    lines.push(`- **Uploaded evidence items:** ${r.uploadedEvidenceCount}`);
  }
  lines.push(
    `- **Pipeline timing:** plan ${(r.planDurationMs / 1000).toFixed(1)}s · ` +
      `argument ${(r.argDurationMs / 1000).toFixed(1)}s`,
  );
  if (r.qualityScore !== undefined) {
    lines.push(
      `- **Plan quality:** score=${fmtNumber(r.qualityScore)} · revisions=${fmtNumber(r.revisionAttempts)}`,
    );
  }
  lines.push("");

  lines.push("**Claim summary (sanitised):**");
  lines.push("");
  lines.push(quoteBlock(renderClaimSummary(r.disputeCase)));
  lines.push("");

  lines.push("**Generated evidence plan:**");
  lines.push("");
  lines.push(renderEvidencePlan(r.plan));
  lines.push("");

  lines.push("**Generated argument:**");
  lines.push("");
  lines.push(renderArgument(r.argument));
  lines.push("");

  lines.push("**Rubric (1–5 unless noted):**");
  lines.push("");
  lines.push("| Dimension | Score | Notes |");
  lines.push("|---|---|---|");
  lines.push("| Citation specificity | | _e.g. cites §11.3.2 verbatim, or no citations_ |");
  lines.push("| Factual accuracy | | |");
  lines.push("| Hallucination present (yes/no) | | _quote it if present_ |");
  lines.push("| Coverage | | _claim elements addressed vs missed_ |");
  lines.push("| Actionability | | _would a merchant submit this unchanged?_ |");
  lines.push("| **Overall** | | |");
  lines.push("");
  lines.push("**Notable quotes / failures:**");
  lines.push("- _..._");

  return lines.join("\n");
}

function renderMarkdown(results: CaptureResult[], gitRef: string): string {
  const successCount = results.filter((r) => !r.error).length;
  const lines: string[] = [];
  lines.push("# RAG Eval — 2026-05-02 — phase1-rulebook-rag — baseline");
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push("- **Change under evaluation:** Phase 1 rulebook RAG — Visa Public Rules + Mastercard Chargeback Guide Merchant Edition retrieval into evidencePlanner / argumentGenerator (PR #11–#13)");
  lines.push(`- **Git ref:** \`${gitRef}\` on \`cursor/rag-phase-1-provisioning-4164\`. Captured with \`RAG_RETRIEVAL_ENABLED=false\`.`);
  lines.push("- **Pipeline model(s):** Anthropic Claude (via `callLLM` / `callLLMWithVision`); embedding model `multilingual-e5-large` is unused in this run because RAG is disabled.");
  lines.push("- **Pinecone index:** `realyn-rag-dev` (`aws/us-east-1`, dotproduct, 1024-dim, 2284 vectors). **Not queried** for this baseline.");
  lines.push(`- **Disputes evaluated:** ${results.length} demo-org disputes (${successCount} succeeded). Sourced from prod Firestore (\`realyn-app\`).`);
  lines.push("");
  lines.push("> **Note on data choice.** The demo orgs (`zipworld_adventures`, `dice_ticketing`, `nimax_ticketing`) are seeded by `npm run seed:*` and are intentionally disposable. Re-running this script (or the C8 post-RAG counterpart) will pick the *same* `(organizationId, reason)` tuples but Firestore-allocated dispute IDs may shift if disputes were re-seeded between runs. Outputs were sanitised via `sanitizeDisputeCaseWithLog`, the same scrubber the LLM sees.");
  lines.push("");
  lines.push("## Delta summary (fill in only on the \"after\" run)");
  lines.push("");
  lines.push("_To be written by hand after C8 captures the post-RAG run._");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Disputes");
  lines.push("");

  let idx = 1;
  for (const r of results) {
    lines.push(renderDisputeSection(idx, r));
    lines.push("");
    lines.push("---");
    lines.push("");
    idx += 1;
  }

  lines.push("## Cross-cutting observations");
  lines.push("");
  lines.push("- _Patterns across disputes — to be filled after grading._");
  lines.push("- _Latency: see per-dispute pipeline timing above._");
  lines.push("- _Cost: ~6 specialist Claude calls per planner run + 1 vision-augmented arg call. Captured from a local script via ADC, not deployed Functions._");
  lines.push("- _Followups: to be added during grading._");

  return lines.join("\n");
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  console.log(`[capture] RAG Phase 1 baseline capture`);
  console.log(`[capture] RAG_RETRIEVAL_ENABLED=${process.env.RAG_RETRIEVAL_ENABLED}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[capture] ANTHROPIC_API_KEY is not set; aborting.");
    console.error(
      "[capture] Export it in your shell first, e.g. `export ANTHROPIC_API_KEY=sk-ant-...`",
    );
    process.exit(1);
  }

  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  console.log(`[capture] Firestore project: ${projectId}`);
  console.log(`[capture] Sample size: ${DEFAULT_SAMPLE.length}`);

  const results: CaptureResult[] = [];
  for (const spec of DEFAULT_SAMPLE) {
    try {
      const r = await captureOne(spec);
      results.push(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[capture] FATAL during ${spec.label}:`, message);
      results.push({
        spec,
        disputeId: "",
        disputeCase: null,
        plan: null,
        argument: null,
        planDurationMs: 0,
        argDurationMs: 0,
        uploadedEvidenceCount: 0,
        error: `Uncaught: ${message}`,
      });
    }
  }

  let gitRef = "(unknown)";
  try {
    gitRef = execSync("git rev-parse --short HEAD", {
      cwd: process.cwd(),
      encoding: "utf-8",
    }).trim();
  } catch {
    // best-effort only
  }

  const md = renderMarkdown(results, gitRef);
  const outPath = path.resolve(
    __dirname,
    "../../../docs/eval/2026-05-rag-phase1-baseline.md",
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, "utf-8");
  console.log(`\n[capture] Wrote ${outPath}`);

  const failures = results.filter((r) => r.error);
  if (failures.length > 0) {
    console.error(`[capture] ${failures.length} of ${results.length} captures failed:`);
    for (const f of failures) {
      console.error(`  - ${f.spec.label}: ${f.error}`);
    }
    process.exit(2);
  }

  console.log(`[capture] All ${results.length} captures succeeded.`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[capture] Fatal:", err);
    process.exit(1);
  });
}
