import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as admin from "firebase-admin";
import { z } from "zod";
import { getCurrentSession } from "../auth/session.js";
import { requirePermission } from "../types/mcp.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { auditToolCall } from "../middleware/auditLogger.js";
import { toolRateLimit, getToolRateLimit } from "../middleware/rateLimiter.js";
import { projectCase, projectCaseList } from "../dto/caseDto.js";
import { projectEvidenceGaps } from "../dto/evidenceDto.js";
import { projectOperation } from "../dto/operationDto.js";
import {
  assessReadiness,
  getEvidenceProgress,
  getApplicableRules,
  detectNetworkFromCode,
  getOperation,
  getSchemeRule,
  getEvidenceRequirements,
  getPSPFormats,
  getWinPatterns,
} from "@realyn/core";

function checkToolRate(toolName: string, orgId: string): string | null {
  const limit = getToolRateLimit(toolName);
  if (limit && toolRateLimit(toolName, orgId, limit)) {
    return JSON.stringify({ error: `Rate limit exceeded for ${toolName}` });
  }
  return null;
}

export function registerReadTools(server: McpServer): void {
  server.registerTool("get_case", {
    title: "Get Case",
    description: "Retrieve a dispute case summary by ID",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const err = checkToolRate("get_case", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const dispute = await loadAndVerifyCase(caseId, session);
    await auditToolCall(session, "get_case", caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify(projectCase(dispute), null, 2) }] };
  });

  server.registerTool("list_cases", {
    title: "List Cases",
    description: "List dispute cases for the current organization with optional filters",
    inputSchema: {
      status: z.string().optional().describe("Filter by dispute status"),
      lifecycleStatus: z.string().optional().describe("Filter by lifecycle status"),
      limit: z.number().optional().default(25).describe("Max results (default 25)"),
      cursor: z.string().optional().describe("Pagination cursor (last document ID)"),
    },
  }, async ({ status, lifecycleStatus, limit, cursor }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:list");
    const err = checkToolRate("list_cases", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const db = admin.firestore();
    let query: admin.firestore.Query = db
      .collection("disputes")
      .where("organizationId", "==", session.organizationId);

    if (status) query = query.where("status", "==", status);
    if (lifecycleStatus) query = query.where("lifecycleStatus", "==", lifecycleStatus);
    query = query.orderBy("createdAt", "desc").limit(limit ?? 25);

    if (cursor) {
      const cursorDoc = await db.collection("disputes").doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const cases = snap.docs.map((d) => projectCase({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ cases, nextCursor }, null, 2) }],
    };
  });

  server.registerTool("check_evidence_gaps", {
    title: "Check Evidence Gaps",
    description: "Identify missing evidence for a dispute case",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "evidence:read");
    const err = checkToolRate("check_evidence_gaps", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const dispute = await loadAndVerifyCase(caseId, session);
    await auditToolCall(session, "check_evidence_gaps", caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify(projectEvidenceGaps(dispute), null, 2) }] };
  });

  server.registerTool("assess_readiness", {
    title: "Assess Readiness",
    description: "Compute and persist a readiness assessment for a dispute case",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const err = checkToolRate("assess_readiness", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    await loadAndVerifyCase(caseId, session);
    const assessment = await assessReadiness(caseId, {
      type: "mcp_client",
      userId: session.userId,
      sessionId: session.sessionId,
    });
    await auditToolCall(session, "assess_readiness", caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify(assessment, null, 2) }] };
  });

  server.registerTool("get_evidence_progress", {
    title: "Get Evidence Progress",
    description: "Get evidence collection progress for a dispute case",
    inputSchema: { caseId: z.string().describe("The dispute case ID") },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    requirePermission(session, "evidence:read");
    const err = checkToolRate("get_evidence_progress", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    await loadAndVerifyCase(caseId, session);
    const progress = await getEvidenceProgress(caseId);
    return { content: [{ type: "text" as const, text: JSON.stringify(progress, null, 2) }] };
  });

  server.registerTool("get_scheme_rules", {
    title: "Get Scheme Rules",
    description: "Look up enriched card scheme dispute rules for a reason code (includes merchant obligations, cardholder burden, citations when populated)",
    inputSchema: { reasonCode: z.string().describe("The dispute reason code (e.g. '10.4')") },
  }, async ({ reasonCode }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const err = checkToolRate("get_scheme_rules", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const network = detectNetworkFromCode(reasonCode);
    // Try enriched KB first, fall back to ruleset service
    const kbRule = await getSchemeRule(network, reasonCode);
    if (kbRule) {
      return { content: [{ type: "text" as const, text: JSON.stringify(kbRule, null, 2) }] };
    }
    const rules = await getApplicableRules(network, reasonCode);
    return { content: [{ type: "text" as const, text: JSON.stringify(rules, null, 2) }] };
  });

  server.registerTool("get_evidence_requirements", {
    title: "Get Evidence Requirements",
    description: "Get vertical-specific evidence requirements for a reason code (from the knowledge base)",
    inputSchema: {
      reasonCode: z.string().describe("The dispute reason code (e.g. '10.4')"),
      verticalId: z.string().optional().describe("The vertical (e.g. 'hospitality', 'ticketing'). Defaults to 'general'."),
    },
  }, async ({ reasonCode, verticalId }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const err = checkToolRate("get_evidence_requirements", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const network = detectNetworkFromCode(reasonCode);
    const reqs = await getEvidenceRequirements(reasonCode, network, verticalId || "general");
    if (!reqs) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ message: "No evidence requirements found for this code/vertical combination. Knowledge base may not be populated yet." }) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(reqs, null, 2) }] };
  });

  server.registerTool("get_psp_formats", {
    title: "Get PSP Formats",
    description: "Get evidence format rules for a payment service provider (from the knowledge base)",
    inputSchema: {
      pspProvider: z.enum(["stripe", "adyen", "other"]).describe("The PSP provider"),
    },
  }, async ({ pspProvider }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const err = checkToolRate("get_psp_formats", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const formats = await getPSPFormats(pspProvider);
    if (formats.length === 0) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ message: `No PSP format rules found for ${pspProvider}. Knowledge base may not be populated yet.` }) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(formats, null, 2) }] };
  });

  server.registerTool("get_win_patterns", {
    title: "Get Win Patterns",
    description: "Get historical win/loss patterns for a reason code and vertical (from the knowledge base)",
    inputSchema: {
      reasonCode: z.string().describe("The dispute reason code (e.g. '10.4')"),
      verticalId: z.string().optional().describe("The vertical (e.g. 'hospitality', 'ticketing'). Defaults to 'general'."),
    },
  }, async ({ reasonCode, verticalId }) => {
    const session = getCurrentSession();
    requirePermission(session, "cases:read");
    const err = checkToolRate("get_win_patterns", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const network = detectNetworkFromCode(reasonCode);
    const patterns = await getWinPatterns(reasonCode, network, verticalId || "general");
    if (patterns.length === 0) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ message: "No win patterns found. Data accumulates as disputes are resolved." }) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(patterns, null, 2) }] };
  });

  server.registerTool("get_operation", {
    title: "Get Operation",
    description: "Check the status of a long-running operation",
    inputSchema: { operationId: z.string().describe("The operation ID") },
  }, async ({ operationId }) => {
    const session = getCurrentSession();
    const err = checkToolRate("get_operation", session.organizationId);
    if (err) return { content: [{ type: "text" as const, text: err }] };
    const op = await getOperation(operationId);
    if (!op) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Operation not found" }) }] };
    if (session.role !== "admin" && op.organizationId !== session.organizationId) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Access denied" }) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(projectOperation(op), null, 2) }] };
  });
}
