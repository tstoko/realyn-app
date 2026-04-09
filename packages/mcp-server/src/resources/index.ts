import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCaseResources } from "./caseResources.js";
import { registerOrgResources } from "./orgResources.js";
import { registerOperationResources } from "./operationResources.js";

export function registerResources(server: McpServer): void {
  registerCaseResources(server);
  registerOrgResources(server);
  registerOperationResources(server);
}
