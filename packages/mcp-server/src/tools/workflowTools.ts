import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as admin from "firebase-admin";
import { z } from "zod";
import { getCurrentSession } from "../auth/session.js";
import { requirePermission } from "../types/mcp.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { auditToolCall } from "../middleware/auditLogger.js";
import { toolRateLimit, getToolRateLimit } from "../middleware/rateLimiter.js";
import {
  createTask,
  addAuditTrailEntry,
  createPSPAdapter,
  getOrganization,
  getPSPFormats,
} from "@realyn/core";
import type { PSPProvider } from "@realyn/core";

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool("advance_to_review", {
    title: "Advance to Review",
    description: "Move a dispute case to the review lifecycle stage",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "workflow:advance");
    await loadAndVerifyCase(caseId, session);

    const db = admin.firestore();
    await db.collection("disputes").doc(caseId).update({
      lifecycleStatus: "in_review",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await addAuditTrailEntry(
      caseId,
      "Advanced to Review",
      "Case moved to review stage via MCP",
      "success",
      { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
      "status_change",
      { lifecycleStatusFrom: "drafting", lifecycleStatusTo: "in_review" },
    );

    await auditToolCall(session, "advance_to_review", caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, lifecycleStatus: "in_review" }) }] };
  });

  server.registerTool("create_approval_request", {
    title: "Create Approval Request",
    description: "Create a task requesting human approval before submission",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      type: z.enum(["submission", "acceptance"]).describe("What needs approval"),
      message: z.string().optional().describe("Message for the approver"),
    },
  }, async ({ caseId, type, message }) => {
    const session = getCurrentSession();
    requirePermission(session, "workflow:advance");
    await loadAndVerifyCase(caseId, session);

    const taskId = await createTask({
      caseId,
      organizationId: session.organizationId,
      type: "approval_request",
      title: `Approval needed: ${type}`,
      description: message || `Please review and approve ${type} for this dispute case.`,
      priority: "high",
      createdBy: { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
    });

    await auditToolCall(session, "create_approval_request", caseId, { taskId, type });
    return { content: [{ type: "text" as const, text: JSON.stringify({ taskId, status: "created" }) }] };
  });

  server.registerTool("submit_to_psp", {
    title: "Submit to PSP",
    description: "Submit the dispute response to the payment service provider. Requires confirm=true.",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      confirm: z.literal(true).describe("Must be true to confirm submission"),
    },
  }, async ({ caseId, confirm }) => {
    const session = getCurrentSession();
    requirePermission(session, "submission:submit");
    const spLimit = getToolRateLimit("submit_to_psp");
    if (spLimit && toolRateLimit("submit_to_psp", session.organizationId, spLimit)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded for submit_to_psp" }) }] };
    }
    const dispute = await loadAndVerifyCase(caseId, session);

    if (!dispute.argumentDraft) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No argument draft to submit" }) }] };
    }

    if (!dispute.pspProvider || dispute.pspProvider === "unknown") {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Unknown PSP provider" }) }] };
    }

    const org = await getOrganization(session.organizationId);
    if (!org) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Organization not found" }) }] };
    }

    try {
      // Consult PSP format rules for pre-submission validation
      const pspProvider = (["stripe", "adyen"].includes(dispute.pspProvider) ? dispute.pspProvider : "other") as PSPProvider;
      const formatWarnings: string[] = [];
      try {
        const formatRules = await getPSPFormats(pspProvider);
        if (formatRules.length > 0) {
          console.log(`[submit_to_psp] Found ${formatRules.length} PSP format rules for ${pspProvider}`);
          for (const rule of formatRules) {
            if (rule.isRequired) {
              const draft = dispute.argumentDraft || {};
              const fieldValue = (draft as Record<string, unknown>)[rule.apiFieldName];
              if (!fieldValue) {
                formatWarnings.push(`Required PSP field "${rule.apiFieldName}" (${rule.evidenceSlot}) is missing`);
              }
            }
          }
          if (formatWarnings.length > 0) {
            console.warn(`[submit_to_psp] Format warnings: ${formatWarnings.join("; ")}`);
          }
        }
      } catch (fmtErr: any) {
        console.warn(`[submit_to_psp] Could not fetch PSP format rules (non-blocking): ${fmtErr.message}`);
      }

      const adapter = createPSPAdapter(dispute.pspProvider, org.pspIntegrations);
      await (adapter as any).submitDefense(dispute.pspDisputeId, dispute.argumentDraft);

      const db = admin.firestore();
      await db.collection("disputes").doc(caseId).update({
        lifecycleStatus: "submitted",
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await auditToolCall(session, "submit_to_psp", caseId, { pspProvider: dispute.pspProvider });
      const result: Record<string, unknown> = { success: true, status: "submitted" };
      if (formatWarnings.length > 0) {
        result.formatWarnings = formatWarnings;
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }] };
    }
  });

  server.registerTool("accept_dispute", {
    title: "Accept Dispute",
    description: "Accept a dispute (concede). Requires confirm=true.",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      confirm: z.literal(true).describe("Must be true to confirm acceptance"),
    },
  }, async ({ caseId, confirm }) => {
    const session = getCurrentSession();
    requirePermission(session, "submission:accept");
    const dispute = await loadAndVerifyCase(caseId, session);

    const db = admin.firestore();
    await db.collection("disputes").doc(caseId).update({
      lifecycleStatus: "accepted",
      internalStatus: "accepted",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await addAuditTrailEntry(
      caseId,
      "Dispute Accepted",
      "Dispute was accepted (conceded) via MCP",
      "success",
      { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
      "status_change",
    );

    await auditToolCall(session, "accept_dispute", caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, status: "accepted" }) }] };
  });
}
