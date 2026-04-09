import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCurrentSession } from "../auth/session.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { projectCase } from "../dto/caseDto.js";
import { projectEvidenceInventory } from "../dto/evidenceDto.js";
import { getApplicableRules, detectNetworkFromCode } from "@realyn/core";

function buildContext(parts: Record<string, unknown>): string {
  return Object.entries(parts)
    .map(([key, val]) => `## ${key}\n${JSON.stringify(val, null, 2)}`)
    .join("\n\n");
}

export function registerDraftingPrompts(server: McpServer): void {
  server.registerPrompt("draft_dispute_response", {
    title: "Draft Dispute Response",
    description: "Full workflow prompt: assess case, draft argument, validate",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);
    const evidence = projectEvidenceInventory(dispute);
    const network = dispute.reason ? detectNetworkFromCode(dispute.reason) : "unknown";
    const rules = dispute.reason ? await getApplicableRules(network, dispute.reason) : null;

    const context = buildContext({
      "Case Summary": projectCase(dispute),
      "Evidence Inventory": evidence,
      "Scheme Rules": rules,
      "Existing Draft": dispute.argumentDraft ?? "No draft yet",
    });

    return {
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are helping to draft a dispute response. Follow these steps:
1. Assess the current evidence and identify any critical gaps
2. If evidence is sufficient, use the draft_argument tool to generate a response
3. After drafting, use validate_draft to check the argument quality
4. Summarize findings and recommend next steps

${context}`,
        },
      }],
    };
  });

  server.registerPrompt("prepare_reviewer_handoff", {
    title: "Prepare Reviewer Handoff",
    description: "Create a concise briefing for a human reviewer",
    argsSchema: { caseId: z.string() },
  }, async ({ caseId }) => {
    const session = getCurrentSession();
    const dispute = await loadAndVerifyCase(caseId, session);

    const context = buildContext({
      "Case Summary": projectCase(dispute),
      "Evidence": projectEvidenceInventory(dispute),
      "Draft": dispute.argumentDraft ? "Draft exists" : "No draft",
      "Validation": dispute.draftValidation ?? "Not validated",
      "Readiness": dispute.readinessAssessment ?? "Not assessed",
    });

    return {
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Prepare a concise reviewer handoff briefing for this dispute case. Include:
- Case overview (amount, reason, deadline)
- Current status and what has been done
- Key strengths and weaknesses of the response
- Specific items needing human attention
- Recommended decision (submit/revise/accept)

${context}`,
        },
      }],
    };
  });
}
