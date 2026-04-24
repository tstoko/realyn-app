import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { buildDisputeCase, summarizeDisputeCase, hasFolioAvailable, getFolioUrl } from "./disputeCaseBuilder";
import {
  generateEvidencePlan,
  resolveDisputeCode,
  applyFolioDedup,
  applyCodeBasedMerge,
} from "./evidencePlanner";
import { autoCollectFromPMS } from "../pms/evidenceAutoCollector";
import {
  initializeEvidenceItems,
  EvidencePlan,
  EvidenceItem,
  EvidencePlanVersion,
  ClaimAnalysis,
  ExistingEvidenceAnalysis,
  EvidenceRelevanceScores,
  DisputeStrategy,
  RevisionInstructions,
  QualityIssue,
  SpecialistContext,
} from "../../types/aiDispute";
import {
  analyzeClaim,
  generateFallbackClaimAnalysis,
  analyzeExistingEvidence,
  scoreEvidenceRelevance,
  checkEvidencePlanQuality,
  synthesizeStrategy,
  generateFallbackStrategy,
} from "./specialists";
import { sanitizeDisputeCaseWithLog } from "../../utils/piiSanitizer";
import {
  getSchemeRule as getKBSchemeRule,
  getEvidenceRequirements as getKBEvidenceRequirements,
  getPSPFormats as getKBPSPFormats,
  getWinPatterns as getKBWinPatterns,
} from "../knowledgeBaseService";
import type { PSPProvider } from "../../types/knowledgeBase";

// ============================================================
// Evidence Planning Service
// Orchestrates the evidence planning workflow with specialist pipeline
//
// Refined sequential pipeline:
//   Step 0: Build case + resolve code info + sanitize PII
//   Step 1: Claim Analyst (guaranteed via fallback)
//   Step 2: Evidence Analyzer (informed by claim)
//   Step 3: Relevance Scorer (informed by claim + existing evidence)
//   Step 4: Strategy Advisor (skip if urgent deadline or running low on time)
//   Step 5-6: Evidence Planner + Quality Checker (revision loop)
//   Step 7: Save to Firestore
// ============================================================

// Maximum number of revision attempts for quality checking
const MAX_REVISION_ATTEMPTS = 2;

// Timeout budget management (in milliseconds)
const PIPELINE_BUDGET_MS = 240_000; // 4 minutes – leave headroom for the 5-min CF timeout
const STRATEGY_SKIP_BUDGET_MS = 60_000; // Skip strategy advisor if less than 60s remaining
const URGENT_DEADLINE_HOURS = 24; // Skip strategy advisor LLM if deadline within 24h

export interface PlanningResult {
  success: boolean;
  plan?: EvidencePlan;
  evidenceItems?: EvidenceItem[];
  error?: string;
  // Include specialist analysis for debugging/logging
  claimAnalysis?: ClaimAnalysis;
  qualityScore?: number;
  revisionAttempts?: number;
  strategy?: DisputeStrategy;
  warning?: string; // Set if pipeline degraded gracefully
}

// ============================================================
// Helper utilities
// ============================================================

/**
 * Check if we have enough time remaining in the pipeline budget.
 */
function hasTimeRemaining(startTime: number, minimumMs: number): boolean {
  const elapsed = Date.now() - startTime;
  return elapsed + minimumMs < PIPELINE_BUDGET_MS;
}

/**
 * Check if the dispute deadline is within the urgent window.
 */
function isUrgentDeadline(respondByDate: string | undefined): boolean {
  if (!respondByDate) return false;
  try {
    const deadline = new Date(respondByDate);
    const hoursRemaining = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursRemaining < URGENT_DEADLINE_HOURS;
  } catch {
    return false;
  }
}

export interface PlanningOptions {
  /** When true, re-run all specialist LLM calls even if cached results exist. */
  forceRefresh?: boolean;
}

/**
 * Trigger evidence planning for a dispute
 * This is the main entry point for the evidence planning workflow.
 */
export async function triggerEvidencePlanning(
  disputeId: string,
  organizationId: string,
  options?: PlanningOptions
): Promise<PlanningResult> {
  const db = admin.firestore();
  const startTime = Date.now();
  let warningMsg: string | undefined;
  const forceRefresh = options?.forceRefresh ?? false;

  try {
    console.log(`[EvidencePlanning] Starting for dispute ${disputeId}${forceRefresh ? " (force refresh)" : ""}`);

    // ============================================================
    // STEP 0: Build case + resolve code info + sanitize PII
    // ============================================================
    const disputeCase = await buildDisputeCase(disputeId, organizationId);
    if (!disputeCase) {
      console.error(`[EvidencePlanning] Failed to build DisputeCase for ${disputeId}`);
      return {
        success: false,
        error: "Failed to build dispute case - dispute not found or data incomplete",
      };
    }

    console.log(`[EvidencePlanning] Built DisputeCase: ${summarizeDisputeCase(disputeCase)}`);

    // Sanitize once – used for all specialist LLM calls
    const sanitizedCase = sanitizeDisputeCaseWithLog(disputeCase);

    // Resolve dispute code info once – shared with all specialists
    const { codeInfo } = resolveDisputeCode(disputeCase);

    // Check if folio is available
    const hasFolio = hasFolioAvailable(disputeCase);
    const folioUrl = getFolioUrl(disputeCase);
    if (hasFolio) {
      console.log(`[EvidencePlanning] Folio available${folioUrl ? `: ${folioUrl}` : ""}`);
    }

    // Extract PMS match from the builder (attached as non-schema property)
    const pmsMatch = (disputeCase as any).pmsMatch || undefined;
    if (pmsMatch) {
      console.log(`[EvidencePlanning] PMS match available: ${pmsMatch.confirmationNumber} (${pmsMatch.source}, ${pmsMatch.confidence}%)`);
    }

    // Load cached specialist outputs from the dispute document (if any)
    const cachedDoc = await db.collection("disputes").doc(disputeId).get();
    const cachedData = cachedDoc.data();
    const cachedClaimAnalysis = cachedData?.cachedClaimAnalysis as ClaimAnalysis | undefined;
    const cachedExistingEvidence = cachedData?.cachedExistingEvidence as ExistingEvidenceAnalysis | undefined;
    const cachedStrategyData = cachedData?.cachedStrategy as DisputeStrategy | undefined;
    const cachedRelevanceScoresData = cachedData?.cachedRelevanceScores as EvidenceRelevanceScores | undefined;

    // Fetch knowledge base context (graceful: returns null/empty when KB not populated)
    const verticalId = disputeCase.merchantVertical || "general";
    const pspProvider: PSPProvider = (disputeCase.pspProvider === "stripe" || disputeCase.pspProvider === "adyen")
      ? disputeCase.pspProvider : "other";
    const reasonCode = codeInfo?.code;
    const network = codeInfo?.network || "unknown";

    const [kbSchemeRule, kbEvidenceReqs, kbPspFormats, kbWinPatterns] = await Promise.all([
      reasonCode && network !== "unknown" ? getKBSchemeRule(network, reasonCode) : Promise.resolve(null),
      reasonCode && network !== "unknown" ? getKBEvidenceRequirements(reasonCode, network, verticalId) : Promise.resolve(null),
      getKBPSPFormats(pspProvider),
      reasonCode && network !== "unknown" ? getKBWinPatterns(reasonCode, network, verticalId) : Promise.resolve([]),
    ]);

    // ============================================================
    // STEP 1: Claim Analyst (guaranteed result via fallback)
    // ============================================================
    let claimAnalysis: ClaimAnalysis;
    if (cachedClaimAnalysis && !forceRefresh) {
      console.log(`[EvidencePlanning] Step 1: Using cached Claim Analysis (type=${cachedClaimAnalysis.claimType})`);
      claimAnalysis = cachedClaimAnalysis;
    } else {
      console.log(`[EvidencePlanning] Step 1: Claim Analyst${cachedClaimAnalysis ? " (force refresh)" : ""}`);
      const result = await analyzeClaim(sanitizedCase, { codeInfo, schemeRule: kbSchemeRule });
      if (!result) {
        console.log(`[EvidencePlanning] Claim Analyst LLM failed, using fallback`);
        claimAnalysis = generateFallbackClaimAnalysis(disputeCase);
      } else {
        claimAnalysis = result;
      }
    }
    console.log(
      `[EvidencePlanning] Claim Analysis: type=${claimAnalysis.claimType}, ` +
      `arguments=${claimAnalysis.customerArguments.length}, disproofs=${claimAnalysis.requiredDisproofs.length}`
    );

    // ============================================================
    // STEP 2: Evidence Analyzer (informed by claim)
    // ============================================================
    let existingEvidence: ExistingEvidenceAnalysis | null;
    if (cachedExistingEvidence && !forceRefresh) {
      console.log(`[EvidencePlanning] Step 2: Using cached Evidence Analysis`);
      existingEvidence = cachedExistingEvidence;
    } else {
      console.log(`[EvidencePlanning] Step 2: Evidence Analyzer (with claim context)${cachedExistingEvidence ? " (force refresh)" : ""}`);
      existingEvidence = await analyzeExistingEvidence(
        organizationId,
        sanitizedCase,
        claimAnalysis
      );
    }
    if (existingEvidence) {
      console.log(
        `[EvidencePlanning] Existing Evidence: ${existingEvidence.availableDocuments.length} docs, ` +
        `${existingEvidence.missingDocuments.length} missing` +
        (existingEvidence.argumentCoverage ? `, ${existingEvidence.argumentCoverage.length} coverage items` : "")
      );
    }

    // ============================================================
    // STEP 3: Relevance Scorer (informed by claim + existing evidence)
    // ============================================================
    let relevanceScores: EvidenceRelevanceScores | null;
    if (cachedRelevanceScoresData && !forceRefresh) {
      console.log(`[EvidencePlanning] Step 3: Using cached Relevance Scores`);
      relevanceScores = cachedRelevanceScoresData;
    } else {
      console.log(`[EvidencePlanning] Step 3: Relevance Scorer${cachedRelevanceScoresData ? " (force refresh)" : ""}`);
      relevanceScores = await scoreEvidenceRelevance(
        sanitizedCase,
        claimAnalysis,
        existingEvidence
      );
    }
    if (relevanceScores) {
      console.log(`[EvidencePlanning] Relevance Scores: top priority = [${relevanceScores.topPriorityEvidence.join(", ")}]`);
    }

    // ============================================================
    // STEP 4: Strategy Advisor (skip if deadline < 24h or running low on time)
    // ============================================================
    let strategy: DisputeStrategy | null = null;
    const urgent = isUrgentDeadline(disputeCase.respondByDate);

    if (cachedStrategyData && !forceRefresh) {
      console.log(`[EvidencePlanning] Step 4: Using cached Strategy`);
      strategy = cachedStrategyData;
    } else if (hasTimeRemaining(startTime, STRATEGY_SKIP_BUDGET_MS) && !urgent) {
      console.log(`[EvidencePlanning] Step 4: Strategy Advisor${cachedStrategyData ? " (force refresh)" : ""}`);
      strategy = await synthesizeStrategy(
        sanitizedCase,
        claimAnalysis,
        existingEvidence,
        relevanceScores,
        codeInfo,
        { retries: 1 },
        pmsMatch,
        { schemeRule: kbSchemeRule, winPatterns: kbWinPatterns },
      );
    } else {
      const reason = urgent ? "urgent deadline" : "time budget";
      console.log(`[EvidencePlanning] Step 4: Skipping Strategy Advisor LLM (${reason}), using fallback`);
    }

    if (!strategy) {
      strategy = generateFallbackStrategy(claimAnalysis, relevanceScores, codeInfo);
    }

    console.log(
      `[EvidencePlanning] Strategy: ${strategy.recommendation} (confidence: ${strategy.confidence}%), ` +
      `${strategy.defensePoints.length} defense points`
    );

    // ============================================================
    // STEPS 5-6: Plan + Quality loop (with post-processing)
    // ============================================================
    console.log(`[EvidencePlanning] Steps 5-6: Plan generation with quality loop`);

    let plan: EvidencePlan | null = null;
    let revisionFeedback: RevisionInstructions | undefined;
    let qualityScore = 0;
    let revisionAttempts = 0;
    let previousIssues: QualityIssue[] = [];
    let previousScore = 0;

    for (let attempt = 0; attempt <= MAX_REVISION_ATTEMPTS; attempt++) {
      revisionAttempts = attempt;

      // Check time budget – if running low, skip revision loop
      if (attempt > 0 && !hasTimeRemaining(startTime, 30_000)) {
        console.log(`[EvidencePlanning] Time budget exceeded, saving current plan`);
        warningMsg = "Pipeline completed with reduced quality checking due to time constraints";
        break;
      }

      // Build context for this attempt
      const context: SpecialistContext = {
        claimAnalysis,
        relevanceScores: relevanceScores || undefined,
        existingEvidence: existingEvidence || undefined,
        codeInfo: codeInfo || undefined,
        strategy,
        revisionFeedback: attempt > 0 ? revisionFeedback : undefined,
        hasFolio,
        respondByDate: disputeCase.respondByDate,
        pmsMatch,
        merchantVertical: disputeCase.merchantVertical,
        schemeRule: kbSchemeRule,
        evidenceRequirements: kbEvidenceReqs,
        pspFormats: kbPspFormats,
        winPatterns: kbWinPatterns,
      };

      // Generate the plan (planner receives sanitizedCase)
      plan = await generateEvidencePlan(sanitizedCase, context);

      if (!plan) {
        console.error(`[EvidencePlanning] Failed to generate plan on attempt ${attempt + 1}`);
        if (attempt === MAX_REVISION_ATTEMPTS) {
          return {
            success: false,
            error: "Failed to generate evidence plan - AI service error",
          };
        }
        continue;
      }

      // Post-processing: code-based merge (only on first attempt) + folio dedup
      if (attempt === 0) {
        plan = applyCodeBasedMerge(plan, codeInfo, disputeCase, hasFolio);
      }
      plan = applyFolioDedup(plan, hasFolio);

      console.log(`[EvidencePlanning] Attempt ${attempt + 1}: ${plan.requirements.length} requirements after post-processing`);

      // Quality check (always runs – claimAnalysis is guaranteed)
      const qualityCheck = await checkEvidencePlanQuality(
        plan,
        sanitizedCase,
        claimAnalysis,
        {
          attemptNumber: attempt + 1,
          previousIssues: attempt > 0 ? previousIssues : undefined,
          previousScore: attempt > 0 ? previousScore : undefined,
          strategy,
        }
      );
      qualityScore = qualityCheck.overallScore;

      console.log(`[EvidencePlanning] Quality check: score=${qualityCheck.overallScore}, passed=${qualityCheck.passed}`);

      if (qualityCheck.passed) {
        console.log(`[EvidencePlanning] Plan passed quality check on attempt ${attempt + 1}`);
        break;
      }

      // Prepare revision feedback for next attempt
      if (attempt < MAX_REVISION_ATTEMPTS && qualityCheck.revisionInstructions) {
        previousIssues = qualityCheck.issues;
        previousScore = qualityCheck.overallScore;
        revisionFeedback = qualityCheck.revisionInstructions;
        console.log(`[EvidencePlanning] Plan needs revision. Issues: ${qualityCheck.issues.length}`);
        for (const issue of qualityCheck.issues) {
          console.log(`  - [${issue.severity}] ${issue.category}: ${issue.description}`);
        }
      }
    }

    if (!plan) {
      return {
        success: false,
        error: "Failed to generate evidence plan after all attempts",
      };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[EvidencePlanning] Final plan: ${plan.requirements.length} requirements, ` +
      `recommendation: ${plan.recommendation}, winnability: ${plan.winnability}, ` +
      `quality: ${qualityScore}, revisions: ${revisionAttempts}, elapsed: ${elapsed}s`
    );

    // ============================================================
    // STEP 7: Save to Firestore
    // ============================================================
    const evidenceItems = initializeEvidenceItems(plan, hasFolio, folioUrl);

    const disputeDoc = await db.collection("disputes").doc(disputeId).get();
    const dispute = disputeDoc.data();

    const existingVersions: EvidencePlanVersion[] =
      (dispute?.evidencePlanVersions as EvidencePlanVersion[]) || [];

    const nextVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map(v => v.version || 0)) + 1
      : 1;

    const updatedVersions = existingVersions.map(v => ({ ...v, isCurrent: false }));

    const newVersion: EvidencePlanVersion = {
      plan,
      evidenceItems,
      generatedAt: new Date(),
      version: nextVersion,
      isCurrent: true,
    };
    updatedVersions.push(newVersion);

    await db
      .collection("disputes")
      .doc(disputeId)
      .update({
        evidencePlan: plan,
        evidencePlanGeneratedAt: FieldValue.serverTimestamp(),
        evidenceItems,
        evidencePlanVersions: updatedVersions,
        lifecycleStatus: "evidence_in_progress",
        internalStatus: "awaiting_docs",
        // Cache specialist outputs so regeneration can skip Steps 1-2
        // and so the argument generator can consume them later
        cachedClaimAnalysis: claimAnalysis,
        cachedExistingEvidence: existingEvidence || null,
        cachedStrategy: strategy || null,
        cachedSchemeRule: kbSchemeRule || codeInfo || null,
        cachedRelevanceScores: relevanceScores || null,
        updatedAt: FieldValue.serverTimestamp(),
      });

    console.log(`[EvidencePlanning] Saved evidence plan version ${nextVersion} to dispute ${disputeId}`);

    // ============================================================
    // STEP 8: Auto-collect evidence from PMS CSV data
    // ============================================================
    try {
      const autoCollectResult = await autoCollectFromPMS(disputeId, organizationId, plan, evidenceItems);
      if (autoCollectResult.itemsFulfilled.length > 0) {
        console.log(
          `[EvidencePlanning] Auto-collected ${autoCollectResult.itemsFulfilled.length} evidence items from PMS data`
        );
      }
    } catch (autoCollectError) {
      console.warn("[EvidencePlanning] PMS auto-collection failed (non-blocking):", autoCollectError);
    }

    return {
      success: true,
      plan,
      evidenceItems,
      claimAnalysis,
      qualityScore,
      revisionAttempts,
      strategy,
      warning: warningMsg,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EvidencePlanning] Error for ${disputeId}:`, message);

    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Regenerate evidence plan for a dispute
 * Useful when user wants to refresh the plan after adding more data
 */
export async function regenerateEvidencePlan(
  disputeId: string,
  organizationId: string,
  options?: PlanningOptions
): Promise<PlanningResult> {
  console.log(`Regenerating evidence plan for dispute ${disputeId}`);
  return triggerEvidencePlanning(disputeId, organizationId, options);
}

/**
 * Update evidence item status
 */
export async function updateEvidenceItemStatus(
  disputeId: string,
  requirementId: string,
  status: "pending" | "uploaded" | "not_available" | "not_applicable",
  fileId?: string,
  fileName?: string,
  uploadedBy?: string,
  notes?: string
): Promise<boolean> {
  const db = admin.firestore();

  try {
    const disputeDoc = await db.collection("disputes").doc(disputeId).get();
    if (!disputeDoc.exists) {
      console.error(`Dispute not found: ${disputeId}`);
      return false;
    }

    const dispute = disputeDoc.data();
    if (!dispute?.evidenceItems) {
      console.error(`No evidence items found for dispute ${disputeId}`);
      return false;
    }

    // Find and update the evidence item
    const evidenceItems: EvidenceItem[] = dispute.evidenceItems;
    const itemIndex = evidenceItems.findIndex((i) => i.requirementId === requirementId);

    if (itemIndex === -1) {
      console.error(`Requirement ${requirementId} not found in dispute ${disputeId}`);
      return false;
    }

    // Update the item - only include defined values (Firestore doesn't accept undefined)
    const updatedItem: EvidenceItem = {
      ...evidenceItems[itemIndex],
      status,
    };
    
    // Only add optional fields if they have values
    if (fileId !== undefined) updatedItem.fileId = fileId;
    if (fileName !== undefined) updatedItem.fileName = fileName;
    if (status === "uploaded") updatedItem.uploadedAt = new Date().toISOString();
    if (uploadedBy !== undefined) updatedItem.uploadedBy = uploadedBy;
    if (notes !== undefined) updatedItem.notes = notes;
    
    // Remove undefined fields from the existing item that we're replacing
    if (status !== "uploaded" && updatedItem.uploadedAt === undefined) {
      delete updatedItem.uploadedAt;
    }
    
    evidenceItems[itemIndex] = updatedItem;

    // Check if all required items are complete
    const plan: EvidencePlan = dispute.evidencePlan;
    const requiredIds = plan.requirements
      .filter((r) => r.required)
      .map((r) => r.id);

    const allRequiredComplete = requiredIds.every((id) => {
      const item = evidenceItems.find((i) => i.requirementId === id);
      return (
        item && (item.status === "uploaded" || item.status === "not_applicable")
      );
    });

    // Determine new lifecycle status
    let newLifecycleStatus = dispute.lifecycleStatus;
    let newInternalStatus = dispute.internalStatus;
    if (allRequiredComplete) {
      newLifecycleStatus = "draft_ready";
      newInternalStatus = "ready_to_submit";
    } else if (evidenceItems.some((i) => i.status === "uploaded")) {
      newLifecycleStatus = "evidence_in_progress";
      newInternalStatus = "awaiting_docs";
    }

    // Save updates
    await db.collection("disputes").doc(disputeId).update({
      evidenceItems,
      lifecycleStatus: newLifecycleStatus,
      internalStatus: newInternalStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });


    console.log(
      `Updated evidence item ${requirementId} to ${status} for dispute ${disputeId}. ` +
        `Lifecycle: ${newLifecycleStatus}`
    );

    return true;
  } catch (error) {
    console.error(`Error updating evidence item ${requirementId}:`, error);
    return false;
  }
}

/**
 * Get evidence completion progress
 */
export async function getEvidenceProgress(disputeId: string): Promise<{
  completed: number;
  total: number;
  requiredCompleted: number;
  requiredTotal: number;
  isComplete: boolean;
} | null> {
  const db = admin.firestore();

  try {
    const disputeDoc = await db.collection("disputes").doc(disputeId).get();
    if (!disputeDoc.exists) {
      return null;
    }

    const dispute = disputeDoc.data();
    if (!dispute?.evidencePlan || !dispute?.evidenceItems) {
      return null;
    }

    const plan: EvidencePlan = dispute.evidencePlan;
    const items: EvidenceItem[] = dispute.evidenceItems;

    const requiredReqs = plan.requirements.filter((r) => r.required);
    const requiredIds = requiredReqs.map((r) => r.id);

    const completed = items.filter(
      (i) => i.status === "uploaded" || i.status === "not_applicable"
    ).length;

    const requiredCompleted = items.filter(
      (i) =>
        requiredIds.includes(i.requirementId) &&
        (i.status === "uploaded" || i.status === "not_applicable")
    ).length;

    return {
      completed,
      total: plan.requirements.length,
      requiredCompleted,
      requiredTotal: requiredReqs.length,
      isComplete: requiredCompleted >= requiredReqs.length,
    };
  } catch (error) {
    console.error(`Error getting evidence progress for ${disputeId}:`, error);
    return null;
  }
}

/**
 * Toggle AI plan mode (on/off)
 */
export async function toggleAIPlanMode(
  disputeId: string,
  useAIPlan: boolean
): Promise<boolean> {
  const db = admin.firestore();

  try {
    await db.collection("disputes").doc(disputeId).update({
      useAIPlan,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`Set useAIPlan=${useAIPlan} for dispute ${disputeId}`);
    return true;
  } catch (error) {
    console.error(`Error toggling AI plan mode for ${disputeId}:`, error);
    return false;
  }
}

