import type { McpSession } from "../types/mcp.js";
import { createMcpAuditEntry } from "@realyn/core";

export async function auditToolCall(
  session: McpSession,
  toolName: string,
  caseId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await createMcpAuditEntry(
      caseId,
      `MCP: ${toolName}`,
      `Tool ${toolName} invoked via MCP`,
      session.sessionId,
      session.userId,
      undefined,
      "user_action",
      metadata,
    );
  } catch (err) {
    console.error(`Failed to audit tool call ${toolName}:`, err);
  }
}
