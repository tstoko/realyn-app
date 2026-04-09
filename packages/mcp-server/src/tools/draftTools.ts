import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as admin from "firebase-admin";
import { z } from "zod";
import { getCurrentSession } from "../auth/session.js";
import { requirePermission } from "../types/mcp.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { auditToolCall } from "../middleware/auditLogger.js";
import { toolRateLimit, getToolRateLimit } from "../middleware/rateLimiter.js";
import {
  createOperation,
  completeOperation,
  failOperation,
  validateDraft,
  buildDisputeCase,
  getTextCompletion,
  assembleKnowledgeContext,
} from "@realyn/core";

export function registerDraftTools(server: McpServer): void {
  server.registerTool("draft_argument", {
    title: "Draft Argument",
    description: "Generate an AI-powered dispute argument. Returns an operation ID.",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      regenerate: z.boolean().optional().describe("Whether to regenerate an existing draft"),
    },
  }, async ({ caseId, regenerate }) => {
    const session = getCurrentSession();
    requirePermission(session, "drafts:generate");
    const limit = getToolRateLimit("draft_argument");
    if (limit && toolRateLimit("draft_argument", session.organizationId, limit)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded for draft_argument" }) }] };
    }
    await loadAndVerifyCase(caseId, session);

    const operationId = await createOperation({
      organizationId: session.organizationId,
      caseId,
      type: "draft_argument",
      initiatedBy: { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
    });

    const disputeData = await loadAndVerifyCase(caseId, session);

    (async () => {
      try {
        const { generateDisputeArgument } = await import("@realyn/core");
        const db = admin.firestore();
        if (regenerate) {
          await db.collection("disputes").doc(caseId).update({
            argumentDraft: admin.firestore.FieldValue.delete(),
            argumentDraftGeneratedAt: admin.firestore.FieldValue.delete(),
            draftValidation: admin.firestore.FieldValue.delete(),
          });
        }
        const disputeCase = await buildDisputeCase(caseId, session.organizationId);
        const plan = disputeData.evidencePlan;
        const evidenceItems = disputeData.evidenceItems || [];
        if (!disputeCase || !plan) {
          throw new Error("Missing dispute case or evidence plan");
        }

        // Assemble knowledge context for enriched argument generation
        const kbContext = await assembleKnowledgeContext(caseId);

        const argument = await generateDisputeArgument(
          disputeCase,
          plan,
          evidenceItems,
          caseId,
          {
            claimAnalysis: disputeData.cachedClaimAnalysis || undefined,
            strategy: disputeData.cachedStrategy || undefined,
            schemeRule: kbContext.schemeRule,
            pspFormats: kbContext.pspFormats,
            winPatterns: kbContext.winPatterns,
            previousValidation: regenerate ? (disputeData.draftValidation || undefined) : undefined,
          },
        );

        // Persist the generated draft to Firestore
        if (argument) {
          const existingVersions = disputeData.argumentVersions || [];
          const nextVersion = existingVersions.length > 0
            ? Math.max(...existingVersions.map((v: any) => v.version || 0)) + 1
            : 1;

          const updatedVersions = existingVersions.map((v: any) => ({ ...v, isCurrent: false }));
          updatedVersions.push({
            version: nextVersion,
            content: argument,
            isCurrent: true,
            isSubmitted: false,
            createdAt: admin.firestore.Timestamp.now(),
          });

          await db.collection("disputes").doc(caseId).update({
            argumentDraft: argument,
            argumentDraftGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            argumentVersions: updatedVersions,
            lifecycleStatus: "draft_ready",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        await completeOperation(operationId, { regenerated: !!regenerate });
      } catch (err: any) {
        await failOperation(operationId, { code: "DRAFT_FAILED", message: err.message }).catch(() => {});
      }
    })().catch((err) => console.error(`Background draft_argument failed for operation ${operationId}:`, err));

    await auditToolCall(session, "draft_argument", caseId, { operationId, regenerate });
    return { content: [{ type: "text" as const, text: JSON.stringify({ operationId, status: "queued" }) }] };
  });

  server.registerTool("validate_draft", {
    title: "Validate Draft",
    description: "Validate the current argument draft against available evidence",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "drafts:validate");
    const vlimit = getToolRateLimit("validate_draft");
    if (vlimit && toolRateLimit("validate_draft", session.organizationId, vlimit)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded for validate_draft" }) }] };
    }
    await loadAndVerifyCase(caseId, session);
    const result = await validateDraft(caseId);
    await auditToolCall(session, "validate_draft", caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("save_draft", {
    title: "Save Draft",
    description: "Save the current argument draft as a new version",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "drafts:save");
    const dispute = await loadAndVerifyCase(caseId, session);

    if (!dispute.argumentDraft) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No draft to save" }) }] };
    }

    const db = admin.firestore();
    const versions = dispute.argumentVersions || [];
    const newVersion = {
      version: versions.length + 1,
      content: dispute.argumentDraft,
      isCurrent: true,
      isSubmitted: false,
      createdAt: admin.firestore.Timestamp.now(),
    };

    // Mark old versions as not current
    const updatedVersions = versions.map((v: any) => ({ ...v, isCurrent: false }));
    updatedVersions.push(newVersion);

    await db.collection("disputes").doc(caseId).update({
      argumentVersions: updatedVersions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await auditToolCall(session, "save_draft", caseId, { version: newVersion.version });
    return { content: [{ type: "text" as const, text: JSON.stringify({ version: newVersion.version, saved: true }) }] };
  });

  server.registerTool("summarize_case", {
    title: "Summarize Case",
    description: "Generate a concise summary of a dispute case for a specific audience",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      audience: z.enum(["staff", "manager", "executive"]).describe("Target audience for the summary"),
    },
  }, async ({ caseId, audience }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const slimit = getToolRateLimit("summarize_case");
    if (slimit && toolRateLimit("summarize_case", session.organizationId, slimit)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded for summarize_case" }) }] };
    }
    const dispute = await loadAndVerifyCase(caseId, session);

    const caseContext = JSON.stringify({
      id: dispute.id,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      lifecycleStatus: dispute.lifecycleStatus,
      respondBy: dispute.respondBy,
      evidencePlan: dispute.evidencePlan
        ? { recommendation: dispute.evidencePlan.recommendation, winnability: dispute.evidencePlan.winnability }
        : null,
      hasDraft: !!dispute.argumentDraft,
    });

    const prompts: Record<string, string> = {
      staff: `Summarize this dispute case for front-desk staff. Focus on what actions they need to take and what evidence to gather. Be concise.\n\n${caseContext}`,
      manager: `Summarize this dispute case for a hotel manager. Include financial impact, current status, and recommended next steps.\n\n${caseContext}`,
      executive: `Provide an executive summary of this dispute case. Focus on financial exposure, win probability, and strategic recommendation in 2-3 sentences.\n\n${caseContext}`,
    };

    const result = await getTextCompletion(prompts[audience]);
    await auditToolCall(session, "summarize_case", caseId, { audience });
    return { content: [{ type: "text" as const, text: result.text || "Unable to generate summary" }] };
  });
}
