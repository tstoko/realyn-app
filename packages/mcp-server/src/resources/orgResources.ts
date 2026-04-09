import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as admin from "firebase-admin";
import { getCurrentSession } from "../auth/session.js";
import { loadAndVerifyOrg } from "../middleware/orgScope.js";
import { projectOrg, projectIntegrationStatus } from "../dto/orgDto.js";
import { projectCase } from "../dto/caseDto.js";

export function registerOrgResources(server: McpServer): void {
  server.registerResource(
    "org-summary",
    new ResourceTemplate("realyn://orgs/{orgId}", { list: undefined }),
    { description: "Organization summary (credential-stripped)", mimeType: "application/json" },
    async (uri, { orgId }) => {
      const session = getCurrentSession();
      const org = await loadAndVerifyOrg(orgId as string, session);
      return { contents: [{ uri: uri.href, text: JSON.stringify(projectOrg(org), null, 2) }] };
    },
  );

  server.registerResource(
    "org-integrations",
    new ResourceTemplate("realyn://orgs/{orgId}/integrations", { list: undefined }),
    { description: "Organization integration status", mimeType: "application/json" },
    async (uri, { orgId }) => {
      const session = getCurrentSession();
      const org = await loadAndVerifyOrg(orgId as string, session);
      return { contents: [{ uri: uri.href, text: JSON.stringify(projectIntegrationStatus(org), null, 2) }] };
    },
  );

  server.registerResource(
    "org-cases",
    new ResourceTemplate("realyn://orgs/{orgId}/cases", { list: undefined }),
    { description: "List of dispute cases for an organization", mimeType: "application/json" },
    async (uri, { orgId }) => {
      const session = getCurrentSession();
      if (session.role !== "admin" && orgId !== session.organizationId) {
        throw new Error("Access denied");
      }
      const db = admin.firestore();
      const snap = await db
        .collection("disputes")
        .where("organizationId", "==", orgId)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
      const cases = snap.docs.map((d) => projectCase({ id: d.id, ...d.data() }));
      return { contents: [{ uri: uri.href, text: JSON.stringify(cases, null, 2) }] };
    },
  );
}
