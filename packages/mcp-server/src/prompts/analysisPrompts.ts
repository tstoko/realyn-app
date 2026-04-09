import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCurrentSession } from "../auth/session.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { projectCase } from "../dto/caseDto.js";
import { projectEvidenceInventory, projectEvidenceGaps } from "../dto/evidenceDto.js";
import { getApplicableRules, detectNetworkFromCode } from "@realyn/core";

function buildContext(parts: Record<string, unknown>): string {
  return Object.entries(parts)
    .map(([key, val]) => `## ${key}\n${JSON.stringify(val, null, 2)}`)
    .join("\n\n");
}

export function registerAnalysisPrompts(server: McpServer): void {
  server.registerPrompt("summarize_evidence_gaps", {
    title: "Summarize Evidence Gaps",
    description: "Actionable gap summary for staff or manager",
    argsSchema: {
      caseId: z.string(),
      audience: z.enum(["staff", "manager"]).default("staff"),
    },
  }, async ({ caseId, audience }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const gaps = projectEvidenceGaps(dispute);

    const context = buildContext({
      "Case": projectCase(dispute),
      "Evidence Gaps": gaps,
    });

    const audienceInstruction = audience === "manager"
      ? "Write for a hotel manager. Focus on impact and resource allocation."
      : "Write for front-desk staff. Focus on specific actions and where to find documents.";

    return {
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Summarize the evidence gaps for this dispute case. ${audienceInstruction}\n\n${context}`,
        },
      }],
    };
  });

  server.registerPrompt("explain_case_weakness", {
    title: "Explain Case Weakness",
    description: "Identify weak points in the dispute response and suggest mitigations",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const network = dispute.reason ? detectNetworkFromCode(dispute.reason) : "unknown";
    const rules = dispute.reason ? await getApplicableRules(network, dispute.reason) : null;

    const context = buildContext({
      "Case": projectCase(dispute),
      "Evidence": projectEvidenceInventory(dispute),
      "Scheme Rules": rules,
      "Draft": dispute.argumentDraft ?? "No draft",
      "Validation": dispute.draftValidation ?? "Not validated",
    });

    return {
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Identify the weak points in this dispute response. For each weakness, explain why it matters and suggest a specific mitigation.\n\n${context}`,
        },
      }],
    };
  });

  server.registerPrompt("compare_evidence_vs_expected", {
    title: "Compare Evidence vs Expected",
    description: "Compare current evidence against what the card scheme rules require",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const evidence = projectEvidenceInventory(dispute);
    const network = dispute.reason ? detectNetworkFromCode(dispute.reason) : "unknown";
    const rules = dispute.reason ? await getApplicableRules(network, dispute.reason) : null;

    const context = buildContext({
      "Case": projectCase(dispute),
      "Current Evidence": evidence,
      "Scheme Rules": rules,
    });

    return {
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Compare the evidence currently collected for this dispute against what the card scheme rules require. Identify matches, gaps, and any evidence that exceeds requirements.\n\n${context}`,
        },
      }],
    };
  });
}
