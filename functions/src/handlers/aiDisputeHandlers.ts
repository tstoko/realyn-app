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
import { EvidencePlan, EvidenceItem, ArgumentVersion } from "../types/aiDispute";
import { applyRateLimit, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import { verifyUser, verifyUserInOrganization, sendAuthError } from "../utils/authMiddleware";
import { assertFeatureEnabled, PlanLimitError, sendPlanLimitError } from "../utils/planEnforcement";
import { ALLOWED_ORIGINS } from "../config/environment";

// ============================================================
// AI Dispute Handlers  (DEPRECATED — migrate to MCP server)
// HTTP endpoints for AI evidence planning.
// These handlers are superseded by MCP tools in packages/mcp-server.
// The dashboard uses them as a fallback when VITE_MCP_SERVER_URL is unset.
// Remove once MCP migration is complete.
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
 * @deprecated Use MCP tool `plan_evidence` instead.
 * Generate evidence plan for a dispute (async pattern)
 * POST /ai/disputes/:id/plan-evidence
 */
export const planEvidence = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    secrets: ["ANTHROPIC_API_KEY"],
    timeoutSeconds: 300, // 5 min – pipeline is sequential (6 LLM calls + revision loop)
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
    let disputeId: string | undefined;

    try {
      disputeId = req.query.disputeId as string;

      if (!disputeId) {
        res.status(400).json({ error: "Missing disputeId parameter" });
        return;
      }

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

      // Mark as "generating" immediately
      await db.collection("disputes").doc(disputeId).update({
        evidencePlanStatus: "generating",
        evidencePlanError: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Return immediately - don't wait for generation
      res.json({
        success: true,
        status: "generating",
        message: "Evidence plan generation started. You will be notified when complete.",
      });

      // Continue processing in background (after response is sent)
      const planningPromise = regenerate
        ? regenerateEvidencePlan(disputeId, organizationId)
        : triggerEvidencePlanning(disputeId, organizationId);

      planningPromise
        .then(async (result) => {
          if (result.success) {
            // Update status to complete (plan data is already saved by triggerEvidencePlanning)
            await db.collection("disputes").doc(disputeId!).update({
              evidencePlanStatus: "complete",
              evidencePlanError: null,
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Evidence plan generation completed for dispute ${disputeId}`);
          } else {
            // Update status to error
            await db.collection("disputes").doc(disputeId!).update({
              evidencePlanStatus: "error",
              evidencePlanError: result.error || "Unknown error during plan generation",
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.error(`Evidence plan generation failed for dispute ${disputeId}: ${result.error}`);
          }
        })
        .catch(async (error) => {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`Error in background evidence planning for ${disputeId}:`, errorMessage);
          
          // Update status to error
          try {
            await db.collection("disputes").doc(disputeId!).update({
              evidencePlanStatus: "error",
              evidencePlanError: errorMessage,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } catch (updateError) {
            console.error(`Failed to update error status for ${disputeId}:`, updateError);
          }
        });

    } catch (error) {
      console.error("Error in planEvidence:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      
      // If we have a disputeId, try to update the status to error
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
      
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @deprecated Use MCP tool `update_evidence_item` instead.
 * Update evidence item status
 * POST /ai/disputes/:id/evidence-item
 */
export const updateEvidenceItem = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
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
        res.status(500).json({ error: "Failed to update evidence item" });
        return;
      }

      // Get updated progress
      const progress = await getEvidenceProgress(disputeId);

      res.json({
        success: true,
        progress,
      });
    } catch (error) {
      console.error("Error in updateEvidenceItem:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @deprecated Use MCP tool `get_dispute` or Firestore listener instead.
 * Get evidence progress for a dispute
 * GET /ai/disputes/:id/progress
 */
export const getProgress = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
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
      console.error("Error in getProgress:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @deprecated Use MCP tool `plan_evidence` with regenerate=true instead.
 * Toggle AI plan mode
 * POST /ai/disputes/:id/toggle-ai-plan
 */
export const toggleAIPlan = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
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
        res.status(500).json({ error: "Failed to toggle AI plan mode" });
        return;
      }

      res.json({
        success: true,
        useAIPlan,
      });
    } catch (error) {
      console.error("Error in toggleAIPlan:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @deprecated Use MCP tool `draft_argument` instead.
 * Draft argument for a dispute
 * POST /ai/disputes/:id/draft-argument
 */
export const draftArgument = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    secrets: ["ANTHROPIC_API_KEY"],
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

    try {
      const disputeId = req.query.disputeId as string;

      if (!disputeId) {
        res.status(400).json({ error: "Missing disputeId parameter" });
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

      // Check if evidence plan exists
      const evidencePlan = dispute.evidencePlan as EvidencePlan | undefined;
      if (!evidencePlan) {
        res.status(400).json({ 
          error: "Evidence plan not generated yet",
          message: "Please generate an evidence plan before drafting an argument",
        });
        return;
      }

      // Check if we already have a draft and not regenerating
      if (dispute.argumentDraft && !regenerate) {
        res.json({
          success: true,
          argument: dispute.argumentDraft,
          cached: true,
        });
        return;
      }

      // Build the DisputeCase
      const disputeCase = await buildDisputeCase(disputeId, organizationId);
      if (!disputeCase) {
        res.status(500).json({ error: "Failed to build dispute case" });
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

      // Read cached specialist outputs persisted by evidence planning (Phase 2A)
      const cachedClaimAnalysis = dispute.cachedClaimAnalysis || undefined;
      const cachedStrategy = dispute.cachedStrategy || undefined;
      const cachedSchemeRule = dispute.cachedSchemeRule || undefined;
      const previousValidation = dispute.draftValidation || undefined;

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
          previousValidation: regenerate ? previousValidation : undefined,
        }
      );

      if (!argument) {
        res.status(500).json({ error: "Failed to generate argument" });
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

      // Save the draft to Firestore - update both current fields and versions array
      await db.collection("disputes").doc(disputeId).update({
        argumentDraft: cleanedArgument, // Keep current draft for backward compatibility
        argumentDraftGeneratedAt: FieldValue.serverTimestamp(),
        argumentVersions: updatedVersions, // Store all versions
        lifecycleStatus: "draft_ready",
        updatedAt: FieldValue.serverTimestamp(),
      });

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
      res.status(500).json({ error: message });
    }
  }
);

