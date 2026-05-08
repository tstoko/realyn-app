import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  triggerEvidencePlanning,
  regenerateEvidencePlan,
  updateEvidenceItemStatus,
  getEvidenceProgress,
  toggleAIPlanMode,
} from "../services/ai/evidencePlanningService";
import { buildDisputeCase } from "../services/ai/disputeCaseBuilder";
import { generateDisputeArgument } from "../services/ai/argumentGenerator";
import { getEvidenceFiles } from "../services/evidenceService";
import { getPSPFormats, getWinPatterns } from "../services/knowledgeBaseService";
import { detectNetworkFromCode, mapStripeReasonToCode } from "../config/disputeCodeMapping";
import { EvidencePlan, EvidenceItem, ArgumentVersion } from "../types/aiDispute";
import { applyRateLimit, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import { verifyUser, verifyUserInOrganization, sendAuthError } from "../utils/authMiddleware";
import { assertFeatureEnabled, PlanLimitError, sendPlanLimitError } from "../utils/planEnforcement";
import { ALLOWED_ORIGINS } from "../config/environment";
import { addAuditTrailEntry, createSystemAuditEntry, createErrorAuditEntry } from "../utils/auditTrailHelper";
import { sendInternalError } from "../utils/httpErrorResponse";

// ============================================================
// AI Dispute Handlers
// HTTP endpoints for AI evidence planning and argument generation.
// ============================================================

/**
 * Helper to remove undefined values from an object
 * Firestore doesn't accept undefined values
 */
function removeUndefinedFields<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      // Recursively clean nested objects (but not arrays)
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = removeUndefinedFields(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}

/**
 * Generate evidence plan for a dispute.
 * POST /ai/disputes/:id/plan-evidence
 *
 * This HTTP handler only validates auth, rate-limits, and writes a
 * `{ evidencePlanStatus: "queued" }` marker to the dispute document.
 * The actual pipeline work is picked up by the Firestore-triggered
 * `onEvidencePlanQueued` function, which has full Cloud Functions
 * lifecycle guarantees (no detached promises after response).
 */
export const planEvidence = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { organizationId, regenerate } = req.body || {};

    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId in request body" });
      return;
    }

    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      await assertFeatureEnabled(organizationId, "aiDraftsEnabled");
    } catch (err) {
      if (err instanceof PlanLimitError) { sendPlanLimitError(res, err); return; }
      throw err;
    }

    const rateLimitKey = authResult.uid!;
    const allowed = await applyRateLimit(req, res, rateLimitKey, RATE_LIMIT_CONFIGS.ai);
    if (!allowed) return;

    const db = admin.firestore();
    let disputeId: string | undefined;

    try {
      disputeId = req.query.disputeId as string;

      if (!disputeId) {
        res.status(400).json({ error: "Missing disputeId parameter" });
        return;
      }

      const disputeRef = db.collection("disputes").doc(disputeId);

      // Atomically check status and queue — prevents double-queuing on rapid clicks
      const alreadyInProgress = await db.runTransaction(async (tx) => {
        const snap = await tx.get(disputeRef);
        if (!snap.exists) {
          res.status(404).json({ error: "Dispute not found" });
          return "abort" as const;
        }
        const data = snap.data()!;
        if (data.organizationId !== organizationId) {
          res.status(403).json({ error: "Dispute does not belong to organization" });
          return "abort" as const;
        }
        const currentStatus = data.evidencePlanStatus;
        if (currentStatus === "queued" || currentStatus === "generating") {
          return true;
        }
        tx.update(disputeRef, {
          evidencePlanStatus: "queued",
          evidencePlanRegenerate: !!regenerate,
          evidencePlanError: null,
          evidencePlanQueuedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return false;
      });

      if (alreadyInProgress === "abort") return;

      if (alreadyInProgress) {
        res.json({
          success: true,
          status: "queued",
          message: "Evidence plan generation is already in progress.",
        });
        return;
      }

      res.json({
        success: true,
        status: "queued",
        message: "Evidence plan generation queued. You will be notified when complete.",
      });
    } catch (error) {
      console.error("Error in planEvidence:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (disputeId) {
        try {
          await db.collection("disputes").doc(disputeId).update({
            evidencePlanStatus: "error",
            evidencePlanError: message,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (updateError) {
          console.error("Failed to update error status:", updateError);
        }
      }

      sendInternalError(res, error, "planEvidence");
    }
  }
);

/**
 * Firestore-triggered function that runs the evidence planning pipeline
 * when a dispute's `evidencePlanStatus` changes to "queued".
 *
 * This replaces the old detached-promise pattern: the pipeline now runs
 * within a proper Cloud Functions invocation with its own timeout/retry
 * lifecycle guarantees.
 */
export const onEvidencePlanQueued = functions.firestore.onDocumentUpdated(
  {
    document: "disputes/{disputeId}",
    region: "us-central1",
    // PINECONE_API_KEY is bound here so the evidence-planning pipeline can
    // call Pinecone Inference for hybrid retrieval against the rulebooks
    // namespace. The retrieval path is fail-safe (empty chunks on any
    // error), so an unset / unbound secret degrades gracefully back to the
    // pre-RAG deterministic pipeline. See ragPromptInjection.ts.
    secrets: ["ANTHROPIC_API_KEY", "PINECONE_API_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only trigger when status transitions to "queued"
    if (before.evidencePlanStatus === "queued" || after.evidencePlanStatus !== "queued") {
      return;
    }

    const disputeId = event.params.disputeId;
    const organizationId = after.organizationId as string;
    const regenerate = !!after.evidencePlanRegenerate;
    const db = admin.firestore();
    const planStart = Date.now();
    const disputeRef = db.collection("disputes").doc(disputeId);

    // Atomically transition queued → generating so duplicate trigger
    // deliveries are harmless (second invocation sees "generating" and bails).
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(disputeRef);
      if (!snap.exists) return false;
      if (snap.data()!.evidencePlanStatus !== "queued") return false;
      tx.update(disputeRef, {
        evidencePlanStatus: "generating",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!claimed) {
      console.log(`[onEvidencePlanQueued] Dispute ${disputeId} no longer queued — skipping`);
      return;
    }

    await addAuditTrailEntry(
      disputeId,
      regenerate ? "Evidence Plan Regeneration Started" : "Evidence Plan Generation Started",
      `AI evidence planning pipeline initiated (${regenerate ? "regeneration" : "first run"}).`,
      "in_progress",
      { type: "automation" },
      "evidence_planning",
    );

    try {
      const result = regenerate
        ? await regenerateEvidencePlan(disputeId, organizationId)
        : await triggerEvidencePlanning(disputeId, organizationId);

      const durationMs = Date.now() - planStart;

      if (result.success) {
        await db.collection("disputes").doc(disputeId).update({
          evidencePlanStatus: "complete",
          evidencePlanError: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await createSystemAuditEntry(
          disputeId,
          "Evidence Plan Generated",
          `AI evidence planning completed successfully in ${(durationMs / 1000).toFixed(1)}s.`,
          "evidence_planning",
          { duration: durationMs },
        );
        console.log(`Evidence plan generation completed for dispute ${disputeId}`);
      } else {
        await db.collection("disputes").doc(disputeId).update({
          evidencePlanStatus: "error",
          evidencePlanError: result.error || "Unknown error during plan generation",
          updatedAt: FieldValue.serverTimestamp(),
        });
        await createErrorAuditEntry(
          disputeId,
          "Evidence Plan Failed",
          `AI evidence planning failed after ${(durationMs / 1000).toFixed(1)}s.`,
          undefined,
          result.error || "Unknown error",
          undefined,
          "evidence_planning",
          { duration: durationMs },
        );
        console.error(`Evidence plan generation failed for dispute ${disputeId}: ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error in evidence planning for ${disputeId}:`, errorMessage);

      try {
        await db.collection("disputes").doc(disputeId).update({
          evidencePlanStatus: "error",
          evidencePlanError: errorMessage,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await createErrorAuditEntry(
          disputeId,
          "Evidence Plan Error",
          `Unexpected error during evidence planning.`,
          undefined,
          errorMessage,
          undefined,
          "evidence_planning",
          { duration: Date.now() - planStart },
        );
      } catch (updateError) {
        console.error(`Failed to update error status for ${disputeId}:`, updateError);
      }
    }
  },
);

/**
 * Update evidence item status
 * POST /ai/disputes/:id/evidence-item
 */
export const updateEvidenceItem = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authResult = await verifyUser(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      const disputeId = req.query.disputeId as string;
      const {
        requirementId,
        status,
        fileId,
        fileName,
        uploadedBy,
        notes,
      } = req.body;

      if (!disputeId || !requirementId || !status) {
        res.status(400).json({
          error: "Missing required fields: disputeId, requirementId, status",
        });
        return;
      }

      // Validate status
      const validStatuses = ["pending", "uploaded", "not_available", "not_applicable"];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
        return;
      }

      // Verify the dispute exists and belongs to the organization
      const db = admin.firestore();
      const disputeDoc = await db.collection("disputes").doc(disputeId).get();

      if (!disputeDoc.exists) {
        res.status(404).json({ error: "Dispute not found" });
        return;
      }

      const dispute = disputeDoc.data();
      if (authResult.role !== "admin" && dispute?.organizationId !== authResult.organizationId) {
        res.status(403).json({ error: "Dispute does not belong to organization" });
        return;
      }

      // Update the evidence item
      const success = await updateEvidenceItemStatus(
        disputeId,
        requirementId,
        status,
        fileId,
        fileName,
        uploadedBy,
        notes
      );

      if (!success) {
        sendInternalError(
          res,
          new Error("updateEvidenceItemStatus returned false"),
          "updateEvidenceItem",
        );
        return;
      }

      // Get updated progress
      const progress = await getEvidenceProgress(disputeId);

      res.json({
        success: true,
        progress,
      });
    } catch (error) {
      sendInternalError(res, error, "updateEvidenceItem");
    }
  }
);

/**
 * Get evidence progress for a dispute
 * GET /ai/disputes/:id/progress
 */
export const getProgress = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authResult = await verifyUser(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      const disputeId = req.query.disputeId as string;

      if (!disputeId) {
        res.status(400).json({ error: "Missing disputeId parameter" });
        return;
      }

      // Verify the caller belongs to the dispute's organization
      const db = admin.firestore();
      const disputeDoc = await db.collection("disputes").doc(disputeId).get();
      if (!disputeDoc.exists) {
        res.status(404).json({ error: "Dispute not found" });
        return;
      }
      const dispute = disputeDoc.data();
      if (authResult.role !== "admin" && dispute?.organizationId !== authResult.organizationId) {
        res.status(403).json({ error: "Dispute does not belong to your organization" });
        return;
      }

      const progress = await getEvidenceProgress(disputeId);

      if (!progress) {
        res.status(404).json({ error: "Dispute not found or no evidence plan" });
        return;
      }

      res.json({
        success: true,
        progress,
      });
    } catch (error) {
      sendInternalError(res, error, "getProgress");
    }
  }
);

/**
 * Toggle AI plan mode
 * POST /ai/disputes/:id/toggle-ai-plan
 */
export const toggleAIPlan = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { organizationId, useAIPlan } = req.body || {};

    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId in request body" });
      return;
    }

    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      await assertFeatureEnabled(organizationId, "aiDraftsEnabled");
    } catch (err) {
      if (err instanceof PlanLimitError) { sendPlanLimitError(res, err); return; }
      throw err;
    }

    try {
      const disputeId = req.query.disputeId as string;

      if (!disputeId || useAIPlan === undefined) {
        res.status(400).json({
          error: "Missing required fields: disputeId, useAIPlan",
        });
        return;
      }

      const db = admin.firestore();
      const disputeDoc = await db.collection("disputes").doc(disputeId).get();

      if (!disputeDoc.exists) {
        res.status(404).json({ error: "Dispute not found" });
        return;
      }

      const dispute = disputeDoc.data();
      if (dispute?.organizationId !== organizationId) {
        res.status(403).json({ error: "Dispute does not belong to organization" });
        return;
      }

      const success = await toggleAIPlanMode(disputeId, useAIPlan);

      if (!success) {
        sendInternalError(
          res,
          new Error("toggleAIPlanMode returned false"),
          "toggleAIPlan",
        );
        return;
      }

      res.json({
        success: true,
        useAIPlan,
      });
    } catch (error) {
      sendInternalError(res, error, "toggleAIPlan");
    }
  }
);

/**
 * Draft argument for a dispute
 * POST /ai/disputes/:id/draft-argument
 */
export const draftArgument = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    // PINECONE_API_KEY is bound here so generateDisputeArgument's RAG path
    // can call Pinecone Inference for hybrid retrieval against the rulebooks
    // namespace. Same fail-safe guarantee as onEvidencePlanQueued: empty
    // chunks on any error, no impact on deterministic argument generation.
    secrets: ["ANTHROPIC_API_KEY", "PINECONE_API_KEY"],
    timeoutSeconds: 180,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { organizationId, regenerate } = req.body || {};

    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId in request body" });
      return;
    }

    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      await assertFeatureEnabled(organizationId, "aiDraftsEnabled");
    } catch (err) {
      if (err instanceof PlanLimitError) { sendPlanLimitError(res, err); return; }
      throw err;
    }

    const rateLimitKey = authResult.uid!;
    const allowed = await applyRateLimit(req, res, rateLimitKey, RATE_LIMIT_CONFIGS.ai);
    if (!allowed) return;

    const db = admin.firestore();

    try {
      const disputeId = req.query.disputeId as string;

      if (!disputeId) {
        res.status(400).json({ error: "Missing disputeId parameter" });
        return;
      }

      const disputeRef = db.collection("disputes").doc(disputeId);

      // Atomic check-and-claim to prevent concurrent argument generation
      const txResult = await db.runTransaction(async (tx) => {
        const snap = await tx.get(disputeRef);
        if (!snap.exists) return { status: "not_found" as const };
        const data = snap.data()!;

        if (data.organizationId !== organizationId) {
          return { status: "forbidden" as const };
        }
        if (!data.evidencePlan) {
          return { status: "no_plan" as const };
        }
        if (data.argumentDraft && !regenerate) {
          return { status: "cached" as const, draft: data.argumentDraft };
        }
        if (data.argumentDraftStatus === "generating") {
          return { status: "already_generating" as const };
        }

        tx.update(disputeRef, {
          argumentDraftStatus: "generating",
          updatedAt: FieldValue.serverTimestamp(),
        });

        return { status: "claimed" as const, dispute: data };
      });

      if (txResult.status === "not_found") {
        res.status(404).json({ error: "Dispute not found" });
        return;
      }
      if (txResult.status === "forbidden") {
        res.status(403).json({ error: "Dispute does not belong to organization" });
        return;
      }
      if (txResult.status === "no_plan") {
        res.status(400).json({
          error: "Evidence plan not generated yet",
          message: "Please generate an evidence plan before drafting an argument",
        });
        return;
      }
      if (txResult.status === "cached") {
        res.json({
          success: true,
          argument: txResult.draft,
          cached: true,
        });
        return;
      }
      if (txResult.status === "already_generating") {
        res.json({
          success: true,
          argument: null,
          cached: false,
          message: "Argument generation is already in progress.",
        });
        return;
      }

      const dispute = txResult.dispute!;
      const evidencePlan = dispute.evidencePlan as EvidencePlan;

      // Build the DisputeCase
      const disputeCase = await buildDisputeCase(disputeId, organizationId);
      if (!disputeCase) {
        sendInternalError(
          res,
          new Error("buildDisputeCase returned null"),
          "draftArgument",
        );
        return;
      }

      // Get evidence items
      const evidenceItems = (dispute.evidenceItems || []) as EvidenceItem[];

      // Pre-load evidence files and PMS match to avoid redundant Firestore reads
      // inside the argument generator pipeline.
      const [preloadedFiles, pmsMatch] = await Promise.all([
        getEvidenceFiles(disputeId),
        Promise.resolve(dispute.pmsMatch || undefined),
      ]);

      // Read cached specialist outputs persisted by evidence planning
      const cachedClaimAnalysis = dispute.cachedClaimAnalysis || undefined;
      const cachedStrategy = dispute.cachedStrategy || undefined;
      const cachedSchemeRule = dispute.cachedSchemeRule || undefined;
      const previousValidation = dispute.draftValidation || undefined;

      // Fetch KB context for the argument generator
      const pspProvider = (dispute.pspProvider || "stripe") as "stripe" | "adyen" | "other";
      const reasonCode = dispute.reason
        ? (mapStripeReasonToCode(dispute.reason) || dispute.reason)
        : "";
      const network = reasonCode ? detectNetworkFromCode(reasonCode) : "unknown";
      const verticalId = disputeCase.merchantVertical || "general";

      const [pspFormats, winPatterns] = await Promise.all([
        getPSPFormats(pspProvider),
        reasonCode && network !== "unknown"
          ? getWinPatterns(network as any, reasonCode, verticalId)
          : Promise.resolve([]),
      ]);

      const argStart = Date.now();
      await addAuditTrailEntry(
        disputeId,
        regenerate ? "Argument Regeneration Started" : "Argument Draft Started",
        `AI argument generation pipeline initiated.`,
        "in_progress",
        { type: "automation" },
        "argument_generation",
      );

      console.log(`Generating argument for dispute ${disputeId} using Claude vision`);
      const argument = await generateDisputeArgument(
        disputeCase,
        evidencePlan,
        evidenceItems,
        disputeId,
        {
          preloadedFiles,
          pmsMatch,
          claimAnalysis: cachedClaimAnalysis,
          strategy: cachedStrategy,
          schemeRule: cachedSchemeRule,
          pspFormats: pspFormats.length > 0 ? pspFormats : undefined,
          winPatterns: winPatterns.length > 0 ? winPatterns : undefined,
          previousValidation: regenerate ? previousValidation : undefined,
        }
      );

      if (!argument) {
        sendInternalError(
          res,
          new Error("generateDisputeArgument returned null"),
          "draftArgument",
        );
        return;
      }

      // Get existing argument versions or initialize
      const existingVersions: ArgumentVersion[] = 
        (dispute?.argumentVersions as ArgumentVersion[]) || [];
      
      // Determine next version number
      const nextVersion = existingVersions.length > 0
        ? Math.max(...existingVersions.map(v => v.version || 0)) + 1
        : 1;

      // Mark all previous versions as not current
      const updatedVersions = existingVersions.map(v => ({
        ...v,
        isCurrent: false,
      }));

      // Clean the argument to remove undefined fields (Firestore doesn't accept undefined)
      const cleanedArgument = removeUndefinedFields(argument);

      // Create new version entry
      const newVersion: ArgumentVersion = {
        argument: cleanedArgument,
        generatedAt: new Date(),
        version: nextVersion,
        isCurrent: true,
        isSubmitted: false,
      };

      // Add to versions array
      updatedVersions.push(newVersion);

      // Save the draft to Firestore — clear the generation lock
      await disputeRef.update({
        argumentDraft: cleanedArgument,
        argumentDraftGeneratedAt: FieldValue.serverTimestamp(),
        argumentDraftStatus: "complete",
        argumentVersions: updatedVersions,
        lifecycleStatus: "draft_ready",
        updatedAt: FieldValue.serverTimestamp(),
      });

      const argDurationMs = Date.now() - argStart;
      await createSystemAuditEntry(
        disputeId,
        "Argument Draft Generated",
        `AI argument v${nextVersion} generated in ${(argDurationMs / 1000).toFixed(1)}s.`,
        "argument_generation",
        { duration: argDurationMs, argumentVersion: nextVersion },
      );

      console.log(`Argument version ${nextVersion} generated and saved for dispute ${disputeId}`);

      res.json({
        success: true,
        argument,
        cached: false,
        version: nextVersion,
      });
    } catch (error) {
      console.error("Error in draftArgument:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      const draftDisputeId = req.query.disputeId as string | undefined;
      if (draftDisputeId) {
        try {
          await db.collection("disputes").doc(draftDisputeId).update({
            argumentDraftStatus: "error",
            updatedAt: FieldValue.serverTimestamp(),
          });
          await createErrorAuditEntry(
            draftDisputeId,
            "Argument Draft Failed",
            `AI argument generation failed.`,
            undefined,
            message,
            undefined,
            "argument_generation",
          );
        } catch {
          // Cleanup must not mask the original error.
        }
      }

      sendInternalError(res, error, "draftArgument");
    }
  }
);

