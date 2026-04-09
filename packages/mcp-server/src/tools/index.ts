import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./readTools.js";
import { registerEvidenceTools } from "./evidenceTools.js";
import { registerDraftTools } from "./draftTools.js";
import { registerWorkflowTools } from "./workflowTools.js";

export function registerTools(server: McpServer): void {
  registerReadTools(server);
  registerEvidenceTools(server);
  registerDraftTools(server);
  registerWorkflowTools(server);
}
