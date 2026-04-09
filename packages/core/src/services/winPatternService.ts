/**
 * Win Pattern Service
 *
 * Records dispute outcomes and maintains running statistics in the
 * kb_winPatterns collection. Called from webhook handlers when a
 * dispute is resolved (won/lost) via Stripe or Adyen.
 *
 * Uses incremental running averages so we never need to scan all
 * historical outcomes — each WinPattern doc is self-contained.
 */

import * as admin from "firebase-admin";
import type { CardNetwork } from "../config/disputeCodeMapping";
import { getDisputeCodeInfo, mapStripeReasonToCode } from "../config/disputeCodeMapping";
import { verticalRegistry } from "../verticals/registry";
import type { WinPattern } from "../types/knowledgeBase";
import { KB_COLLECTIONS, winPatternDocId } from "../types/knowledgeBase";

type Firestore = admin.firestore.Firestore;

function getDb(db?: Firestore): Firestore {
  return db ?? admin.firestore();
}

export type DisputeOutcome = "won" | "lost";

interface DisputeSnapshot {
  organizationId?: string;
  reason?: string;
  pspProvider?: string;
  createdAt?: admin.firestore.Timestamp | Date;
  respondBy?: admin.firestore.Timestamp | Date;
  evidencePlan?: {
    reasonCode?: string;
    network?: CardNetwork;
    requirements?: Array<{ category?: string; label?: string }>;
  };
  evidenceItems?: Array<{
    requirementId: string;
    status: string;
    fileName?: string;
  }>;
  argumentDraft?: {
    paragraphs?: Array<{ heading?: string }>;
    executiveSummary?: string;
  };
  argumentVersions?: Array<{
    argument?: {
      paragraphs?: Array<{ heading?: string }>;
    };
    isSubmitted?: boolean;
  }>;
  argumentSubmittedAt?: admin.firestore.Timestamp | Date;
}

/**
 * Record a dispute outcome and update the corresponding WinPattern document.
 *
 * Safe to call with incomplete dispute data — missing fields are skipped
 * gracefully and logged.
 */
export async function recordDisputeOutcome(
  disputeId: string,
  outcome: DisputeOutcome,
  db?: Firestore,
): Promise<void> {
  const firestore = getDb(db);
  const disputeRef = firestore.collection("disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();

  if (!disputeSnap.exists) {
    console.warn(`[WinPattern] Dispute ${disputeId} not found, skipping outcome recording`);
    return;
  }

  const dispute = disputeSnap.data() as DisputeSnapshot;

  // Resolve reason code
  const rawReason = dispute.evidencePlan?.reasonCode ?? dispute.reason;
  const reasonCode = resolveReasonCode(rawReason);
  if (!reasonCode) {
    console.warn(`[WinPattern] Dispute ${disputeId} has no reason code, skipping`);
    return;
  }

  // Resolve network
  const network = resolveNetwork(reasonCode, dispute.evidencePlan?.network);
  if (network === "unknown") {
    console.warn(`[WinPattern] Could not resolve network for ${disputeId} (reason: ${reasonCode}), skipping`);
    return;
  }

  // Resolve vertical from org
  const verticalId = await resolveVerticalId(dispute.organizationId, firestore);

  // Gather evidence types that were fulfilled
  const evidenceTypes = extractFulfilledEvidenceTypes(dispute);

  // Calculate response time in days
  const responseTimeDays = calcResponseTimeDays(dispute);

  // Extract argument themes (paragraph headings from the submitted or latest argument)
  const argThemes = extractArgumentThemes(dispute);

  // Load or create the WinPattern document
  const patternDocId = winPatternDocId(network, reasonCode, verticalId);
  const patternRef = firestore.collection(KB_COLLECTIONS.WIN_PATTERNS).doc(patternDocId);
  const patternSnap = await patternRef.get();

  const isWin = outcome === "won";
  const now = new Date().toISOString();

  if (!patternSnap.exists) {
    // First outcome for this combination — create the doc
    const newPattern: WinPattern = {
      reasonCode,
      network,
      verticalId,
      evidenceCombination: evidenceTypes,
      argumentPatterns: isWin ? argThemes : [],
      winCount: isWin ? 1 : 0,
      lossCount: isWin ? 0 : 1,
      winRate: isWin ? 1.0 : 0.0,
      sampleSize: 1,
      lastUpdated: now,
    };

    await patternRef.set(newPattern);
    console.log(`[WinPattern] Created ${patternDocId} (${outcome})`);
    return;
  }

  // Update existing pattern
  const existing = patternSnap.data() as WinPattern;
  const newWinCount = existing.winCount + (isWin ? 1 : 0);
  const newLossCount = existing.lossCount + (isWin ? 0 : 1);
  const newSampleSize = newWinCount + newLossCount;
  const newWinRate = newSampleSize > 0 ? newWinCount / newSampleSize : 0;

  // Merge evidence types — keep top 10 most frequent by appending and deduplicating
  const mergedEvidence = mergeFrequencyList(
    existing.evidenceCombination,
    evidenceTypes,
    10,
  );

  // Only update argument patterns on wins
  const mergedArgPatterns = isWin
    ? mergeFrequencyList(existing.argumentPatterns, argThemes, 10)
    : existing.argumentPatterns;

  const update: Partial<WinPattern> & { winCount: number; lossCount: number } = {
    winCount: newWinCount,
    lossCount: newLossCount,
    winRate: Math.round(newWinRate * 1000) / 1000,
    sampleSize: newSampleSize,
    evidenceCombination: mergedEvidence,
    argumentPatterns: mergedArgPatterns,
    lastUpdated: now,
  };

  await patternRef.update(update);
  console.log(
    `[WinPattern] Updated ${patternDocId}: ${outcome}, winRate=${update.winRate} (n=${newSampleSize})`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveReasonCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = mapStripeReasonToCode(raw);
  return mapped ?? raw;
}

function resolveNetwork(
  reasonCode: string,
  planNetwork?: CardNetwork,
): CardNetwork {
  if (planNetwork && planNetwork !== "unknown") return planNetwork;
  const codeInfo = getDisputeCodeInfo(reasonCode);
  return codeInfo?.network ?? "unknown";
}

async function resolveVerticalId(
  organizationId: string | undefined,
  db: Firestore,
): Promise<string> {
  if (!organizationId) return "general";
  try {
    const orgSnap = await db.collection("organizations").doc(organizationId).get();
    if (orgSnap.exists) {
      const orgData = orgSnap.data() as { industry?: string };
      const vertical = verticalRegistry.resolve(orgData.industry);
      return vertical.id;
    }
  } catch (err) {
    console.warn(`[WinPattern] Failed to resolve vertical for org ${organizationId}:`, err);
  }
  return "general";
}

function extractFulfilledEvidenceTypes(dispute: DisputeSnapshot): string[] {
  const types = new Set<string>();

  if (dispute.evidenceItems) {
    for (const item of dispute.evidenceItems) {
      if (item.status === "fulfilled" || item.status === "uploaded") {
        types.add(item.requirementId);
      }
    }
  }

  if (dispute.evidencePlan?.requirements) {
    for (const req of dispute.evidencePlan.requirements) {
      if (req.category) types.add(req.category);
    }
  }

  return Array.from(types);
}

function calcResponseTimeDays(dispute: DisputeSnapshot): number | null {
  const createdAt = toDate(dispute.createdAt);
  const submittedAt = toDate(dispute.argumentSubmittedAt);

  if (!createdAt || !submittedAt) return null;

  const diffMs = submittedAt.getTime() - createdAt.getTime();
  if (diffMs < 0) return null;
  return Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;
}

function toDate(
  val: admin.firestore.Timestamp | Date | undefined | null,
): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof (val as admin.firestore.Timestamp).toDate === "function") {
    return (val as admin.firestore.Timestamp).toDate();
  }
  return null;
}

function extractArgumentThemes(dispute: DisputeSnapshot): string[] {
  // Prefer the submitted argument version
  const submitted = dispute.argumentVersions?.find((v) => v.isSubmitted);
  const paragraphs =
    submitted?.argument?.paragraphs ??
    dispute.argumentDraft?.paragraphs;

  if (!paragraphs || paragraphs.length === 0) return [];

  return paragraphs
    .map((p) => p.heading)
    .filter((h): h is string => !!h && h.trim().length > 0);
}

/**
 * Merge new items into an existing frequency list and keep the top N.
 * Since we don't store counts per item, we use position-based weighting:
 * existing items that appear again get boosted to the front.
 */
function mergeFrequencyList(
  existing: string[],
  incoming: string[],
  maxSize: number,
): string[] {
  const seen = new Map<string, number>();

  for (let i = 0; i < existing.length; i++) {
    seen.set(existing[i], (seen.get(existing[i]) ?? 0) + 2);
  }
  for (const item of incoming) {
    seen.set(item, (seen.get(item) ?? 0) + 1);
  }

  return Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSize)
    .map(([item]) => item);
}
