import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as admin from "firebase-admin";
import { getCurrentSession } from "../auth/session.js";
import { loadAndVerifyCase } from "../middleware/orgScope.js";
import { projectCase } from "../dto/caseDto.js";
import { projectEvidenceInventory, projectEvidenceGaps } from "../dto/evidenceDto.js";

export function registerCaseResources(server: McpServer): void {
  server.registerResource(
    "case-summary",
    new ResourceTemplate("realyn://cases/{caseId}", { list: undefined }),
    { description: "Complete summary of a dispute case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      return { contents: [{ uri: uri.href, text: JSON.stringify(projectCase(dispute), null, 2) }] };
    },
  );

  server.registerResource(
    "case-evidence",
    new ResourceTemplate("realyn://cases/{caseId}/evidence", { list: undefined }),
    { description: "Evidence inventory for a dispute case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      return { contents: [{ uri: uri.href, text: JSON.stringify(projectEvidenceInventory(dispute), null, 2) }] };
    },
  );

  server.registerResource(
    "case-gaps",
    new ResourceTemplate("realyn://cases/{caseId}/gaps", { list: undefined }),
    { description: "Evidence gaps for a dispute case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      return { contents: [{ uri: uri.href, text: JSON.stringify(projectEvidenceGaps(dispute), null, 2) }] };
    },
  );

  server.registerResource(
    "case-readiness",
    new ResourceTemplate("realyn://cases/{caseId}/readiness", { list: undefined }),
    { description: "Readiness assessment for a dispute case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      const readiness = dispute.readinessAssessment ?? null;
      return { contents: [{ uri: uri.href, text: JSON.stringify(readiness, null, 2) }] };
    },
  );

  server.registerResource(
    "case-timeline",
    new ResourceTemplate("realyn://cases/{caseId}/timeline", { list: undefined }),
    { description: "Audit timeline for a dispute case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      const timeline = (dispute.auditTrail || []).map((e: any) => ({
        timestamp: e.timestamp?.toDate?.()?.toISOString() ?? e.timestamp,
        title: e.title,
        description: e.description,
        status: e.status,
        actor: e.actor,
        category: e.category,
      }));
      return { contents: [{ uri: uri.href, text: JSON.stringify(timeline, null, 2) }] };
    },
  );

  server.registerResource(
    "case-draft",
    new ResourceTemplate("realyn://cases/{caseId}/draft", { list: undefined }),
    { description: "Current argument draft for a dispute case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      const draft = dispute.argumentDraft
        ? {
            content: dispute.argumentDraft,
            generatedAt: dispute.argumentDraftGeneratedAt,
            versions: (dispute.argumentVersions || []).map((v: any) => ({
              version: v.version,
              isCurrent: v.isCurrent,
              isSubmitted: v.isSubmitted,
              createdAt: v.createdAt,
            })),
          }
        : null;
      return { contents: [{ uri: uri.href, text: JSON.stringify(draft, null, 2) }] };
    },
  );

  server.registerResource(
    "case-draft-validation",
    new ResourceTemplate("realyn://cases/{caseId}/draft/validation", { list: undefined }),
    { description: "Draft validation results", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      return { contents: [{ uri: uri.href, text: JSON.stringify(dispute.draftValidation ?? null, null, 2) }] };
    },
  );

  server.registerResource(
    "case-scheme-context",
    new ResourceTemplate("realyn://cases/{caseId}/scheme-context", { list: undefined }),
    { description: "Card scheme rules applicable to this case", mimeType: "application/json" },
    async (uri, { caseId }) => {
      const session = getCurrentSession();
      const dispute = await loadAndVerifyCase(caseId as string, session);
      const { getApplicableRules } = await import("@realyn/core");
      const { detectNetworkFromCode } = await import("@realyn/core");
      const network = dispute.reason ? detectNetworkFromCode(dispute.reason) : "unknown";
      const rules = dispute.reason ? await getApplicableRules(network, dispute.reason) : null;
      return { contents: [{ uri: uri.href, text: JSON.stringify(rules, null, 2) }] };
    },
  );
}
