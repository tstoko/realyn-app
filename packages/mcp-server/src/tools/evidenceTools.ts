import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  triggerEvidencePlanning,
  regenerateEvidencePlan,
  updateEvidenceItemStatus,
  createTask,
  addAuditTrailEntry,
} from "@realyn/core";

export function registerEvidenceTools(server: McpServer): void {
  server.registerTool("plan_evidence", {
    title: "Plan Evidence",
    description: "Generate an AI evidence plan for a dispute case. Returns an operation ID to track progress.",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      regenerate: z.boolean().optional().describe("Whether to regenerate an existing plan"),
    },
  }, async ({ caseId, regenerate }) => {
    const session = getCurrentSession();
    requirePermission(session, "evidence:plan");
    const peLimit = getToolRateLimit("plan_evidence");
    if (peLimit && toolRateLimit("plan_evidence", session.organizationId, peLimit)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded for plan_evidence" }) }] };
    }
    await loadAndVerifyCase(caseId, session);

    const operationId = await createOperation({
      organizationId: session.organizationId,
      caseId,
      type: "plan_evidence",
      initiatedBy: { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
    });

    (async () => {
      try {
        if (regenerate) {
          await regenerateEvidencePlan(caseId, session.organizationId);
        } else {
          await triggerEvidencePlanning(caseId, session.organizationId);
        }
        await completeOperation(operationId);
      } catch (err: any) {
        await failOperation(operationId, { code: "PLANNING_FAILED", message: err.message }).catch(() => {});
      }
    })().catch((err) => console.error(`Background plan_evidence failed for operation ${operationId}:`, err));

    await auditToolCall(session, "plan_evidence", caseId, { operationId, regenerate });
    return { content: [{ type: "text" as const, text: JSON.stringify({ operationId, status: "queued" }) }] };
  });

  server.registerTool("retrieve_operational_evidence", {
    title: "Retrieve Operational Evidence",
    description: "Auto-collect evidence from PMS/operational systems. Returns an operation ID.",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "evidence:retrieve");
    const reLimit = getToolRateLimit("retrieve_operational_evidence");
    if (reLimit && toolRateLimit("retrieve_operational_evidence", session.organizationId, reLimit)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded for retrieve_operational_evidence" }) }] };
    }
    await loadAndVerifyCase(caseId, session);

    const operationId = await createOperation({
      organizationId: session.organizationId,
      caseId,
      type: "retrieve_evidence",
      initiatedBy: { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
    });

    const disputeData = await loadAndVerifyCase(caseId, session);

    (async () => {
      try {
        const core = await import("@realyn/core");
        const plan = disputeData.evidencePlan;
        const evidenceItems = disputeData.evidenceItems || [];
        if (plan && core.autoCollectFromPMS) {
          await core.autoCollectFromPMS(caseId, session.organizationId, plan, evidenceItems);
        }
        await completeOperation(operationId);
      } catch (err: any) {
        await failOperation(operationId, { code: "RETRIEVAL_FAILED", message: err.message }).catch(() => {});
      }
    })().catch((err) => console.error(`Background retrieve_evidence failed for operation ${operationId}:`, err));

    await auditToolCall(session, "retrieve_operational_evidence", caseId, { operationId });
    return { content: [{ type: "text" as const, text: JSON.stringify({ operationId, status: "queued" }) }] };
  });

  server.registerTool("request_human_evidence", {
    title: "Request Human Evidence",
    description: "Create a task requesting staff to provide specific evidence",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      requirementIds: z.array(z.string()).describe("Evidence requirement IDs to request"),
      message: z.string().optional().describe("Optional message to staff"),
    },
  }, async ({ caseId, requirementIds, message }) => {
    const session = getCurrentSession();
    requirePermission(session, "evidence:request");
    await loadAndVerifyCase(caseId, session);

    const taskId = await createTask({
      caseId,
      organizationId: session.organizationId,
      type: "evidence_request",
      title: `Evidence requested for ${requirementIds.length} item(s)`,
      description: message || `Please provide evidence for requirements: ${requirementIds.join(", ")}`,
      priority: "high",
      createdBy: { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
      metadata: { requirementIds },
    });

    await auditToolCall(session, "request_human_evidence", caseId, { taskId, requirementIds });
    return { content: [{ type: "text" as const, text: JSON.stringify({ taskId, status: "created" }) }] };
  });

  server.registerTool("mark_evidence_not_available", {
    title: "Mark Evidence Not Available",
    description: "Mark a specific evidence requirement as not available",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      requirementId: z.string().describe("The evidence requirement ID"),
      notes: z.string().describe("Reason the evidence is not available"),
    },
  }, async ({ caseId, requirementId, notes }) => {
    const session = getCurrentSession();
    requirePermission(session, "evidence:read");
    await loadAndVerifyCase(caseId, session);
    await updateEvidenceItemStatus(caseId, requirementId, "not_available");
    await auditToolCall(session, "mark_evidence_not_available", caseId, { requirementId, notes });
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }] };
  });

  server.registerTool("add_case_note", {
    title: "Add Case Note",
    description: "Add a note to the case audit trail",
    inputSchema: {
      caseId: z.string().describe("The dispute case ID"),
      text: z.string().describe("Note text"),
    },
  }, async ({ caseId, text }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    await loadAndVerifyCase(caseId, session);
    await addAuditTrailEntry(
      caseId,
      "MCP Note",
      text,
      "success",
      { type: "mcp_client", userId: session.userId, sessionId: session.sessionId },
      "user_action",
    );
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }] };
  });
}
