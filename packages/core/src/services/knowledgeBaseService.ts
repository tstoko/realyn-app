/**
 * Knowledge Base Query Service
 *
 * Single read interface for the 5-table knowledge base.
 * Every method tries Firestore first, then falls back to static data
 * from disputeCodeMapping.ts when the KB collections are empty.
 *
 * The assembleContext() convenience method fetches a dispute, resolves
 * its reason code / vertical / PSP, and returns a KnowledgeContext with
 * all 5 slices pre-fetched.
 */

import * as admin from "firebase-admin";
import type { CardNetwork } from "../config/disputeCodeMapping";
import { getDisputeCodeInfo, mapStripeReasonToCode } from "../config/disputeCodeMapping";
import { verticalRegistry } from "../verticals/registry";
import type {
  SchemeRule,
  EvidenceRequirementRule,
  PSPFormatRule,
  PSPProvider,
  EvidenceOutputTemplate,
  WinPattern,
  KnowledgeContext,
} from "../types/knowledgeBase";
import {
  KB_COLLECTIONS,
  schemeRuleDocId,
  evidenceRequirementDocId,
  winPatternDocId,
} from "../types/knowledgeBase";

function getDb() {
  return admin.firestore();
}

// ---------------------------------------------------------------------------
// 1. Scheme Rules
// ---------------------------------------------------------------------------

export async function getSchemeRule(
  network: CardNetwork,
  reasonCode: string,
): Promise<SchemeRule | null> {
  const db = getDb();
  const docId = schemeRuleDocId(network, reasonCode);
  const snap = await db.collection(KB_COLLECTIONS.SCHEME_RULES).doc(docId).get();

  if (snap.exists) {
    return snap.data() as SchemeRule;
  }

  // Fallback: build a partial SchemeRule from static disputeCodeMapping
  const staticInfo = getDisputeCodeInfo(reasonCode);
  if (!staticInfo) return null;

  return {
    code: staticInfo.code,
    network: staticInfo.network,
    category: staticInfo.category,
    subcategory: staticInfo.subcategory,
    description: staticInfo.description,
    merchantObligation: "",
    cardholderBurden: "",
    timeLimit: { days: 0, fromEvent: "" },
    citations: [],
    submissionConstraints: [],
    hotelRelevance: staticInfo.hotelRelevance,
    commonInHotels: staticInfo.commonInHotels,
    defaultRecommendation: staticInfo.defaultRecommendation,
    defaultWinnability: staticInfo.defaultWinnability,
    requiredEvidence: staticInfo.requiredEvidence,
    optionalEvidence: staticInfo.optionalEvidence,
    effectiveDate: "",
  };
}

// ---------------------------------------------------------------------------
// 2. Evidence Requirements
// ---------------------------------------------------------------------------

export async function getEvidenceRequirements(
  reasonCode: string,
  network: CardNetwork,
  verticalId: string,
): Promise<EvidenceRequirementRule | null> {
  const db = getDb();
  const docId = evidenceRequirementDocId(network, reasonCode, verticalId);
  const snap = await db.collection(KB_COLLECTIONS.EVIDENCE_REQUIREMENTS).doc(docId).get();

  if (snap.exists) {
    return snap.data() as EvidenceRequirementRule;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3. PSP Format Rules
// ---------------------------------------------------------------------------

export async function getPSPFormats(
  pspProvider: PSPProvider,
): Promise<PSPFormatRule[]> {
  const db = getDb();
  const snap = await db
    .collection(KB_COLLECTIONS.PSP_FORMATS)
    .where("pspProvider", "==", pspProvider)
    .get();

  if (snap.empty) return [];
  return snap.docs.map((doc) => doc.data() as PSPFormatRule);
}

// ---------------------------------------------------------------------------
// 4. Evidence Output Templates
// ---------------------------------------------------------------------------

export async function getOutputTemplate(
  evidenceType: string,
  verticalId: string,
  pspProvider: PSPProvider,
): Promise<EvidenceOutputTemplate | null> {
  const db = getDb();
  const docId = `${evidenceType}_${verticalId}_${pspProvider}`;
  const snap = await db.collection(KB_COLLECTIONS.EVIDENCE_OUTPUT_TEMPLATES).doc(docId).get();

  if (snap.exists) {
    return snap.data() as EvidenceOutputTemplate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 5. Win Patterns
// ---------------------------------------------------------------------------

export async function getWinPatterns(
  reasonCode: string,
  network: CardNetwork,
  verticalId: string,
): Promise<WinPattern[]> {
  const db = getDb();
  const docId = winPatternDocId(network, reasonCode, verticalId);
  const snap = await db.collection(KB_COLLECTIONS.WIN_PATTERNS).doc(docId).get();

  if (snap.exists) {
    return [snap.data() as WinPattern];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Context Assembly
// ---------------------------------------------------------------------------

interface DisputeDocData {
  organizationId?: string;
  reason?: string;
  pspProvider?: string;
  [key: string]: unknown;
}

function resolvePSPProvider(dispute: DisputeDocData): PSPProvider {
  const raw = dispute.pspProvider || "stripe";
  if (raw === "stripe" || raw === "adyen") return raw;
  return "other";
}

function resolveReasonCode(reason: string | undefined): string | null {
  if (!reason) return null;
  const mapped = mapStripeReasonToCode(reason);
  if (mapped) return mapped;
  return reason;
}

/**
 * Assemble full knowledge context for a dispute.
 *
 * Fetches the dispute doc, resolves its reason code / card network /
 * vertical / PSP, and returns a KnowledgeContext with all 5 slices.
 * Fields that have no KB data return null / empty arrays.
 */
export async function assembleContext(
  disputeId: string,
): Promise<KnowledgeContext & { resolvedNetwork: CardNetwork; resolvedReasonCode: string | null; resolvedVerticalId: string; resolvedPSP: PSPProvider }> {
  const db = getDb();
  const disputeSnap = await db.collection("disputes").doc(disputeId).get();

  if (!disputeSnap.exists) {
    return {
      schemeRule: null,
      evidenceRequirements: null,
      pspFormats: [],
      outputTemplates: [],
      winPatterns: [],
      resolvedNetwork: "unknown",
      resolvedReasonCode: null,
      resolvedVerticalId: "general",
      resolvedPSP: "other",
    };
  }

  const dispute = disputeSnap.data() as DisputeDocData;

  // Resolve PSP
  const pspProvider = resolvePSPProvider(dispute);

  // Resolve reason code and network
  const reasonCode = resolveReasonCode(dispute.reason);

  let network: CardNetwork = "unknown";
  if (reasonCode) {
    const codeInfo = getDisputeCodeInfo(reasonCode);
    if (codeInfo) {
      network = codeInfo.network;
    }
  }

  // Resolve vertical from organization
  let verticalId = "general";
  if (dispute.organizationId) {
    const orgSnap = await db.collection("organizations").doc(dispute.organizationId).get();
    if (orgSnap.exists) {
      const orgData = orgSnap.data() as { industry?: string };
      const vertical = verticalRegistry.resolve(orgData.industry);
      verticalId = vertical.id;
    }
  }

  // Fetch all 5 slices in parallel
  const [schemeRule, evidenceRequirements, pspFormats, winPatterns] = await Promise.all([
    reasonCode && network !== "unknown"
      ? getSchemeRule(network, reasonCode)
      : Promise.resolve(null),
    reasonCode && network !== "unknown"
      ? getEvidenceRequirements(reasonCode, network, verticalId)
      : Promise.resolve(null),
    getPSPFormats(pspProvider),
    reasonCode && network !== "unknown"
      ? getWinPatterns(reasonCode, network, verticalId)
      : Promise.resolve([]),
  ]);

  // Output templates are per-item; fetch them all for this vertical+PSP combo
  let outputTemplates: EvidenceOutputTemplate[] = [];
  const templateSnap = await db
    .collection(KB_COLLECTIONS.EVIDENCE_OUTPUT_TEMPLATES)
    .where("verticalId", "==", verticalId)
    .where("pspProvider", "==", pspProvider)
    .get();
  if (!templateSnap.empty) {
    outputTemplates = templateSnap.docs.map((doc) => doc.data() as EvidenceOutputTemplate);
  }

  return {
    schemeRule,
    evidenceRequirements,
    pspFormats,
    outputTemplates,
    winPatterns,
    resolvedNetwork: network,
    resolvedReasonCode: reasonCode,
    resolvedVerticalId: verticalId,
    resolvedPSP: pspProvider,
  };
}
