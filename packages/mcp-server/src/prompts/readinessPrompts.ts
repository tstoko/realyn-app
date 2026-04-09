import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCurrentSession } from "../auth/session.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { projectCase } from "../dto/caseDto.js";
import { projectEvidenceGaps } from "../dto/evidenceDto.js";
import { assessReadiness, getApplicableRules, detectNetworkFromCode } from "@realyn/core";

function buildContext(parts: Record<string, unknown>): string {
  return Object.entries(parts)
    .map(([key, val]) => `## ${key}\n${JSON.stringify(val, null, 2)}`)
    .join("\n\n");
}

export function registerReadinessPrompts(server: McpServer): void {
  server.registerPrompt("review_case_readiness", {
    title: "Review Case Readiness",
    description: "Assess whether a dispute case is ready for submission",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const readiness = await assessReadiness(caseId);
    const gaps = projectEvidenceGaps(dispute);
    const network = dispute.reason ? detectNetworkFromCode(dispute.reason) : "unknown";
    const rules = dispute.reason ? await getApplicableRules(network, dispute.reason) : null;

    const context = buildContext({
      "Case Summary": projectCase(dispute),
      "Readiness Assessment": readiness,
      "Evidence Gaps": gaps,
      "Scheme Rules": rules,
    });

    return {
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Review the readiness of this dispute case for submission. Identify blockers, risks, and recommended next steps.\n\n${context}` },
      }],
    };
  });

  server.registerPrompt("recommend_next_action", {
    title: "Recommend Next Action",
    description: "Determine the single most impactful next action for a dispute case",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const readiness = await assessReadiness(caseId);
    const gaps = projectEvidenceGaps(dispute);

    const context = buildContext({
      "Case Summary": projectCase(dispute),
      "Readiness": readiness,
      "Gaps": gaps,
    });

    return {
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Based on the current state of this dispute case, what is the single most impactful next action? Be specific and actionable.\n\n${context}` },
      }],
    };
  });

  server.registerPrompt("assess_winnability", {
    title: "Assess Winnability",
    description: "Deep win probability assessment for a dispute case",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const network = dispute.reason ? detectNetworkFromCode(dispute.reason) : "unknown";
    const rules = dispute.reason ? await getApplicableRules(network, dispute.reason) : null;

    const context = buildContext({
      "Case Summary": projectCase(dispute),
      "Scheme Rules": rules,
      "Evidence Plan": dispute.evidencePlan ?? "No plan yet",
    });

    return {
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Provide a deep assessment of the win probability for this dispute. Consider the reason code, available evidence, scheme rules, and any weaknesses.\n\n${context}` },
      }],
    };
  });
}
