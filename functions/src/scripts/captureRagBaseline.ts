/**
 * captureRagBaseline.ts — pre-RAG eval baseline capture (post-hardening plan §C3).
 *
 * Two modes
 * ---------
 *
 * 1. **Read-cached (DEFAULT)**: Reads `evidencePlan` + `argumentDraft` directly
 *    from prod Firestore for disputes that have already been processed by the
 *    deployed planner. **Cost: $0** (no Anthropic / Pinecone calls). This works
 *    because the deployed Functions don't have `PINECONE_API_KEY` bound (C7 is
 *    still pending), so every cached output IS a pre-RAG output by definition.
 *    The discovery query picks the most recent disputes (across all orgs,
 *    demo + real) that have both plan and argument present, with a weak
 *    diversity bias (avoids picking two disputes with the same `(org, reason)`
 *    tuple if alternatives exist).
 *
 * 2. **Force-refresh** (`--force-refresh` flag): Re-runs the pipeline against a
 *    fixed set of demo-org disputes. Costs ~$5–6 in Anthropic credit at the
 *    default `claude-opus-4-6` model. Use this **only** when you specifically
 *    need same-dispute pairwise control between C3 and C8 — for most evaluation
 *    purposes read-cached mode captures real production behavior more
 *    faithfully and for free. Demo orgs are intentional in this mode because
 *    `triggerEvidencePlanning(forceRefresh: true)` overwrites `evidencePlan`,
 *    appends to `evidencePlanVersions`, and refreshes the `cached*` specialist
 *    outputs — re-seedable demo orgs make this safe.
 *
 * In both modes, the output markdown lives at
 * `docs/eval/2026-05-rag-phase1-baseline.md`.
 *
 * Required env
 * ------------
 * - `GOOGLE_APPLICATION_CREDENTIALS` (or `gcloud auth application-default
 *   login`) for Firebase Admin SDK to talk to prod Firestore (`realyn-app`).
 * - `ANTHROPIC_API_KEY`: required **only** in `--force-refresh` mode. Pass it
 *   via `functions/.env.local` (gitignored) and `set -a && source` before
 *   running.
 *
 * Usage
 * -----
 *   # Default: free, read-cached
 *   cd functions && npm run rag:eval:baseline
 *
 *   # Force-refresh (costs money):
 *   cd functions && npm run rag:eval:baseline -- --force-refresh
 *
 * Re-running for the C8 post-RAG comparison
 * -----------------------------------------
 * In read-cached mode, simply re-run after `PINECONE_API_KEY` lands on
 * Functions and a few new disputes have been processed — the discovery
 * query will naturally pick them up. Move the output markdown to a separate
 * file by hand if you want both kept (e.g. rename to `2026-MM-rag-phase1-
 * eval.md`).
 */

const FORCE_REFRESH = process.argv.includes("--force-refresh");

// CRITICAL: must be set BEFORE any module reads it. ragPromptInjection.ts reads
// this at call-time, but defence-in-depth — set it as the very first statement
// so even module-init reads see "false" when force-refreshing. (No-op in
// read-cached mode since we never call the LLM.)
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
// Config
// ============================================================

const TARGET_SAMPLE_SIZE = 3;
const DISCOVERY_PAGE_SIZE = 50;

/**
 * Org IDs the seed scripts produce. Used to label disputes as "(demo)" vs
 * "(prod)" in the rendered markdown so the human grader can weight accordingly,
 * and to bias the discovery query toward a mix when both pools are available.
 */
const KNOWN_DEMO_ORG_IDS = new Set([
  "zipworld_adventures",
  "dice_ticketing",
  "nimax_ticketing",
  "skiddle_ticketing",
  "sadlerswells_ticketing",
  "attractionworld_ticketing",
]);

/**
 * Lifecycle statuses where the dispute has gone through the full pipeline at
 * least once. Used by the force-refresh path to find a "rich" dispute (one
 * with evidence already uploaded so the argument generator has something to
 * inspect). Read-cached mode uses presence of `evidencePlan` + `argumentDraft`
 * as a stricter equivalent.
 */
const DESIRED_LIFECYCLES = ["won", "lost", "submitted", "draft_ready"];

/**
 * Force-refresh mode sample. Three demo-org disputes — one per representative
 * reason category × different demo orgs for some vertical spread. Demo orgs
 * are intentional because force-refresh mutates Firestore (`evidencePlan` is
 * overwritten, `evidencePlanVersions` appended, `cached*` refreshed). If
 * `nimax_ticketing` doesn't have a `duplicate` dispute in your Firestore, the
 * resolver falls through to "any matching dispute regardless of lifecycle"
 * (see `pickDisputeForRefreshSpec`) — adjust this list rather than the
 * resolver if you want different coverage.
 */
const FORCE_REFRESH_SAMPLE: SampleSpec[] = [
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

// ============================================================
// Types
// ============================================================

interface SampleSpec {
  organizationId: string;
  reason: string;
  /** Human-friendly label used in markdown headers. */
  label: string;
  /** Expected reason-code mapping for the markdown header (informational). */
  expectedCode: string;
  /** Pre-resolved Firestore disputeId — set in read-cached mode after discovery. */
  disputeId?: string;
}

interface CaptureResult {
  spec: SampleSpec;
  disputeId: string;
  organizationId: string;
  isDemoOrg: boolean;
  capturedFrom: "cached" | "refreshed";
  disputeCase: DisputeCase | null;
  plan: EvidencePlan | null;
  argument: DisputeArgument | null;
  claimAnalysis?: ClaimAnalysis;
  strategy?: DisputeStrategy;
  qualityScore?: number;
  revisionAttempts?: number;
  /** ms — `0` for cached results (no work was done). */
  planDurationMs: number;
  /** ms — `0` for cached results. */
  argDurationMs: number;
  uploadedEvidenceCount: number;
  preLifecycleStatus?: string;
  preReason?: string;
  preNetwork?: string;
  preMerchantVertical?: string;
  /** When the cached evidence plan was originally generated (cached mode only). */
  evidencePlanGeneratedAt?: Date;
  /** When the cached argument draft was originally generated (cached mode only). */
  argumentDraftGeneratedAt?: Date;
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
    // Mirror the production Functions setting (see functions/src/index.ts):
    // the planning pipeline's fallback paths produce nested objects with
    // undefined fields, which Firestore Admin rejects without this setting.
    // Must be applied before the first Firestore call. No-op for reads but
    // protects the force-refresh write-back path.
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
  return admin.firestore();
}

// ============================================================
// Sample helpers
// ============================================================

function deriveLabel(orgId: string, reason: string): string {
  const orgPretty = orgId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${orgPretty} — ${reason}`;
}

function deriveExpectedCode(reason: string): string {
  if (!reason) return "(unknown)";
  const code = mapStripeReasonToCode(reason);
  if (!code) return reason;
  const network = detectNetworkFromCode(code);
  return network !== "unknown" ? `${network} ${code}` : code;
}

function tsToDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof (value as admin.firestore.Timestamp).toDate === "function") {
    return (value as admin.firestore.Timestamp).toDate();
  }
  return undefined;
}

// ============================================================
// Read-cached selection
// ============================================================

/**
 * Discovery query for read-cached mode.
 *
 * Returns up to N disputes with both `evidencePlan` and `argumentDraft`
 * present, sorted by recency, with a weak diversity preference (no two
 * disputes from the same `(org, reason)` tuple if alternatives exist).
 *
 * Why this shape: Firestore can't index `field != null`, but it CAN order by
 * `evidencePlanGeneratedAt`. Disputes that have been through the planner
 * always have that timestamp set; never-planned disputes lack it entirely
 * and are therefore excluded by `orderBy`. We then filter client-side for
 * `argumentDraft != null` (the smaller subset) to find disputes that
 * completed both stages. `DISCOVERY_PAGE_SIZE = 50` is a working ceiling —
 * if Firestore has fewer than ~3 disputes-with-arg in the most-recent 50,
 * the diversity rule starves and we top up with whatever's left.
 */
async function discoverCachedDisputes(
  db: admin.firestore.Firestore,
  n: number,
): Promise<SampleSpec[]> {
  const snap = await db
    .collection("disputes")
    .orderBy("evidencePlanGeneratedAt", "desc")
    .limit(DISCOVERY_PAGE_SIZE)
    .get();

  const candidates = snap.docs
    .filter((d) => {
      const data = d.data();
      return data.argumentDraft !== undefined && data.argumentDraft !== null;
    })
    .map((d) => ({
      id: d.id,
      data: d.data(),
    }));

  if (candidates.length === 0) {
    console.warn(
      "[capture] No disputes found with both evidencePlan and argumentDraft. " +
        "Has the planner+argDraft been run successfully on this Firestore? " +
        "Try `--force-refresh` (requires ANTHROPIC_API_KEY) or seed demo data.",
    );
    return [];
  }

  // Diversity-aware pick. Strategy:
  //   1. Bucket candidates by organizationId, preserving recency order
  //      within each bucket (since the source query is sorted desc).
  //      Buckets are inserted in the order each org was first seen, which
  //      is also recency order — so the most-recently-active orgs get
  //      first dibs in round-robin.
  //   2. Round-robin: pick the most-recent unpicked dispute from each org,
  //      then loop back. This maximises org spread before reaching for a
  //      second dispute from the same org. With 4 orgs available and
  //      n = 3, we get 1 dispute from each of 3 distinct orgs — exactly
  //      what "mix orgs and real" means in practice.
  //   3. (Implicit) within an org, the bucket order is recency desc, which
  //      tends to give different `reason` values across consecutive picks
  //      anyway. We don't add an explicit reason-diversity rule because
  //      it can over-constrain when the candidate pool is small.
  const byOrg = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = byOrg.get(c.data.organizationId) ?? [];
    list.push(c);
    byOrg.set(c.data.organizationId, list);
  }
  const picked: typeof candidates = [];
  while (picked.length < n) {
    let didAdd = false;
    for (const bucket of byOrg.values()) {
      if (bucket.length === 0) continue;
      picked.push(bucket.shift()!);
      didAdd = true;
      if (picked.length >= n) break;
    }
    if (!didAdd) break; // all buckets empty
  }

  return picked.map((cand) => {
    const orgId = cand.data.organizationId;
    const reason = cand.data.reason ?? "unknown";
    return {
      organizationId: orgId,
      reason,
      label: deriveLabel(orgId, reason),
      expectedCode: deriveExpectedCode(reason),
      disputeId: cand.id,
    };
  });
}

// ============================================================
// Force-refresh dispute resolution
// ============================================================

async function pickDisputeForRefreshSpec(
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
// Per-dispute capture — read-cached path
// ============================================================

/**
 * Read-only capture: load the dispute, pull `evidencePlan` and `argumentDraft`
 * straight from Firestore, render. No LLM calls, no Firestore writes.
 *
 * Pre-condition: `spec.disputeId` is set (populated by `discoverCachedDisputes`).
 */
async function captureOneFromCached(spec: SampleSpec): Promise<CaptureResult> {
  const db = getDb();
  const isDemoOrg = KNOWN_DEMO_ORG_IDS.has(spec.organizationId);
  const baseResult: CaptureResult = {
    spec,
    disputeId: spec.disputeId ?? "",
    organizationId: spec.organizationId,
    isDemoOrg,
    capturedFrom: "cached",
    disputeCase: null,
    plan: null,
    argument: null,
    planDurationMs: 0,
    argDurationMs: 0,
    uploadedEvidenceCount: 0,
  };

  console.log(`\n[capture] === ${spec.label} (cached, ${isDemoOrg ? "demo" : "prod"}) ===`);

  if (!spec.disputeId) {
    return { ...baseResult, error: "spec.disputeId not set (discoverCachedDisputes bug?)" };
  }

  const disputeDoc = await db.collection("disputes").doc(spec.disputeId).get();
  if (!disputeDoc.exists) {
    return { ...baseResult, error: `Firestore dispute ${spec.disputeId} not found` };
  }
  const dispute = disputeDoc.data()!;
  const plan = (dispute.evidencePlan ?? null) as EvidencePlan | null;
  const argument = (dispute.argumentDraft ?? null) as DisputeArgument | null;
  if (!plan) {
    return { ...baseResult, error: "Cached evidencePlan missing (discovery filter mismatch)" };
  }
  if (!argument) {
    return { ...baseResult, error: "Cached argumentDraft missing (discovery filter mismatch)" };
  }

  // disputeCaseBuilder is purely Firestore-based (no LLM) — safe to use here.
  const disputeCase = await buildDisputeCase(spec.disputeId, spec.organizationId);

  const evidenceItems = (dispute.evidenceItems || []) as EvidenceItem[];
  const uploadedCount = evidenceItems.filter((i) => i.status === "uploaded").length;

  const claimAnalysis = (dispute.cachedClaimAnalysis ?? undefined) as
    | ClaimAnalysis
    | undefined;
  const strategy = (dispute.cachedStrategy ?? undefined) as
    | DisputeStrategy
    | undefined;

  console.log(
    `[capture] cached: ${plan.requirements.length} reqs, ` +
      `lifecycle=${dispute.lifecycleStatus ?? "(unset)"}, ` +
      `${uploadedCount} uploaded evidence items`,
  );

  return {
    ...baseResult,
    disputeCase,
    plan,
    argument,
    claimAnalysis,
    strategy,
    uploadedEvidenceCount: uploadedCount,
    preLifecycleStatus: dispute.lifecycleStatus,
    preReason: dispute.reason,
    preNetwork: dispute.network,
    preMerchantVertical: dispute.merchantVertical,
    evidencePlanGeneratedAt: tsToDate(dispute.evidencePlanGeneratedAt),
    argumentDraftGeneratedAt: tsToDate(dispute.argumentDraftGeneratedAt),
  };
}

// ============================================================
// Per-dispute capture — force-refresh path (costs money)
// ============================================================

async function captureOneWithRefresh(spec: SampleSpec): Promise<CaptureResult> {
  const db = getDb();
  const isDemoOrg = KNOWN_DEMO_ORG_IDS.has(spec.organizationId);
  const baseResult: CaptureResult = {
    spec,
    disputeId: "",
    organizationId: spec.organizationId,
    isDemoOrg,
    capturedFrom: "refreshed",
    disputeCase: null,
    plan: null,
    argument: null,
    planDurationMs: 0,
    argDurationMs: 0,
    uploadedEvidenceCount: 0,
  };

  console.log(`\n[capture] === ${spec.label} (refresh, ${isDemoOrg ? "demo" : "prod"}) ===`);

  const picked = await pickDisputeForRefreshSpec(db, spec);
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

function fmtDate(d: Date | undefined): string {
  if (!d) return "(unset)";
  return d.toISOString();
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
  const orgTag = r.isDemoOrg ? "demo" : "prod";
  const sourceTag = r.capturedFrom === "cached" ? "cached" : "fresh";
  lines.push(`### Dispute ${idx} — ${r.spec.label} _(${orgTag} · ${sourceTag})_`);
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
  lines.push(`- **Organisation:** \`${r.organizationId}\` (${orgTag})`);
  lines.push(`- **Pre-run lifecycle:** \`${r.preLifecycleStatus ?? "(unset)"}\``);
  lines.push(`- **Reason / network (expected):** ${r.spec.reason} → ${r.spec.expectedCode}`);
  if (r.disputeCase) {
    lines.push(`- **Vertical:** \`${r.disputeCase.merchantVertical ?? "general"}\``);
    lines.push(`- **Amount:** ${fmtAmount(r.disputeCase.amount, r.disputeCase.currency)}`);
    lines.push(`- **Uploaded evidence items:** ${r.uploadedEvidenceCount}`);
  }
  if (r.capturedFrom === "cached") {
    lines.push(`- **Cached plan generated at:** ${fmtDate(r.evidencePlanGeneratedAt)}`);
    lines.push(`- **Cached argument generated at:** ${fmtDate(r.argumentDraftGeneratedAt)}`);
  } else {
    lines.push(
      `- **Pipeline timing:** plan ${(r.planDurationMs / 1000).toFixed(1)}s · ` +
        `argument ${(r.argDurationMs / 1000).toFixed(1)}s`,
    );
    if (r.qualityScore !== undefined) {
      lines.push(
        `- **Plan quality:** score=${fmtNumber(r.qualityScore)} · revisions=${fmtNumber(r.revisionAttempts)}`,
      );
    }
  }
  lines.push("");

  lines.push("**Claim summary (sanitised):**");
  lines.push("");
  lines.push(quoteBlock(renderClaimSummary(r.disputeCase)));
  lines.push("");

  lines.push("**Evidence plan:**");
  lines.push("");
  lines.push(renderEvidencePlan(r.plan));
  lines.push("");

  lines.push("**Argument draft:**");
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

function renderMarkdown(results: CaptureResult[], gitRef: string, mode: "cached" | "refreshed"): string {
  const successCount = results.filter((r) => !r.error).length;
  const demoCount = results.filter((r) => r.isDemoOrg && !r.error).length;
  const prodCount = results.filter((r) => !r.isDemoOrg && !r.error).length;

  const lines: string[] = [];
  lines.push("# RAG Eval — 2026-05-02 — phase1-rulebook-rag — baseline");
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push("- **Change under evaluation:** Phase 1 rulebook RAG — Visa Public Rules + Mastercard Chargeback Guide Merchant Edition retrieval into evidencePlanner / argumentGenerator (PR #11–#13)");
  lines.push(`- **Git ref:** \`${gitRef}\` on \`cursor/rag-phase-1-provisioning-4164\`.`);
  lines.push(`- **Capture mode:** \`${mode}\` ${mode === "cached"
    ? "(read-only; pulled `evidencePlan` and `argumentDraft` directly from prod Firestore. **Cost: $0**.)"
    : "(force-refresh; re-ran `triggerEvidencePlanning(forceRefresh: true)` + `generateDisputeArgument` against prod Firestore for demo orgs. **Costs Anthropic credit.**)"}`);
  lines.push("- **Pipeline model(s):** Anthropic Claude (default `claude-opus-4-6` via `callLLM` / `callLLMWithVision`); embedding model `multilingual-e5-large` is unused because RAG is not yet bound on Functions and `RAG_RETRIEVAL_ENABLED=false` is forced regardless.");
  lines.push("- **Pinecone index:** `realyn-rag-dev` (`aws/us-east-1`, dotproduct, 1024-dim, 2284 vectors). **Not queried** for this baseline.");
  lines.push(`- **Disputes evaluated:** ${results.length} (${successCount} succeeded, ${demoCount} demo + ${prodCount} prod). Sourced from prod Firestore (\`realyn-app\`).`);
  lines.push("");
  if (mode === "cached") {
    lines.push("> **Why these outputs are pre-RAG.** The deployed Cloud Functions don't yet have `PINECONE_API_KEY` bound (post-hardening C7), so the live `ragService` falls back to empty chunks on init failure and `RAG_RETRIEVAL_ENABLED` defaults are moot. Every `evidencePlan` and `argumentDraft` currently in Firestore was therefore generated without retrieval. We're reading those documents back as-is. PII fields in the claim summary go through `sanitizeDisputeCaseWithLog` (the same scrubber the LLM sees on the way in); LLM-generated outputs (plan summary, argument paragraphs) cannot contain PII the LLM never saw.");
  } else {
    lines.push("> **Note on data choice.** The demo orgs (`zipworld_adventures`, `dice_ticketing`, `nimax_ticketing`) are seeded by `npm run seed:*` and are intentionally disposable — re-running this script overwrites their cached specialist outputs and `evidencePlan`. Real customer data is not touched. Outputs were sanitised via `sanitizeDisputeCaseWithLog`, the same scrubber the LLM sees.");
  }
  lines.push("");
  lines.push("## Delta summary (fill in only on the \"after\" run)");
  lines.push("");
  lines.push("_To be written by hand after the post-RAG counterpart captures the C8 numbers._");
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
  if (mode === "cached") {
    lines.push("- _Latency: not measured (read-only capture). Production planner timings in Cloud Logging if needed._");
    lines.push("- _Cost: $0 — pure Firestore reads._");
  } else {
    lines.push("- _Latency: see per-dispute pipeline timing above._");
    lines.push("- _Cost: ~7–9 Claude Opus calls per dispute (≈$1.50–2.00 each); see commit message for breakdown._");
  }
  lines.push("- _Followups: to be added during grading._");

  return lines.join("\n");
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  console.log(`[capture] RAG Phase 1 baseline capture`);
  console.log(`[capture] Mode: ${FORCE_REFRESH ? "FORCE-REFRESH (will call Anthropic)" : "read-cached (default; $0)"}`);
  console.log(`[capture] RAG_RETRIEVAL_ENABLED=${process.env.RAG_RETRIEVAL_ENABLED}`);

  if (FORCE_REFRESH && !process.env.ANTHROPIC_API_KEY) {
    console.error("[capture] --force-refresh requires ANTHROPIC_API_KEY; aborting.");
    console.error(
      "[capture] Source it from functions/.env.local first: `set -a && source .env.local && set +a`",
    );
    process.exit(1);
  }

  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  console.log(`[capture] Firestore project: ${projectId}`);

  const db = getDb();

  let specs: SampleSpec[];
  if (FORCE_REFRESH) {
    specs = FORCE_REFRESH_SAMPLE;
    console.log(`[capture] Force-refresh sample size: ${specs.length}`);
  } else {
    specs = await discoverCachedDisputes(db, TARGET_SAMPLE_SIZE);
    if (specs.length === 0) {
      console.error("[capture] Discovery returned zero disputes; nothing to capture.");
      process.exit(2);
    }
    console.log(`[capture] Discovered ${specs.length} cached dispute(s):`);
    for (const s of specs) {
      const tag = KNOWN_DEMO_ORG_IDS.has(s.organizationId) ? "demo" : "prod";
      console.log(`  - ${s.disputeId} ${s.organizationId}/${s.reason} (${tag})`);
    }
  }

  const results: CaptureResult[] = [];
  for (const spec of specs) {
    try {
      const r = FORCE_REFRESH
        ? await captureOneWithRefresh(spec)
        : await captureOneFromCached(spec);
      results.push(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[capture] FATAL during ${spec.label}:`, message);
      results.push({
        spec,
        disputeId: spec.disputeId ?? "",
        organizationId: spec.organizationId,
        isDemoOrg: KNOWN_DEMO_ORG_IDS.has(spec.organizationId),
        capturedFrom: FORCE_REFRESH ? "refreshed" : "cached",
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

  const md = renderMarkdown(results, gitRef, FORCE_REFRESH ? "refreshed" : "cached");
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
