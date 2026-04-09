import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadinessPrompts } from "./readinessPrompts.js";
import { registerDraftingPrompts } from "./draftingPrompts.js";
import { registerAnalysisPrompts } from "./analysisPrompts.js";

export function registerPrompts(server: McpServer): void {
  registerReadinessPrompts(server);
  registerDraftingPrompts(server);
  registerAnalysisPrompts(server);
}
