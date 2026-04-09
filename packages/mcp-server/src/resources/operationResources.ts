import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentSession } from "../auth/session.js";
import { getOperation } from "@realyn/core";
import { projectOperation } from "../dto/operationDto.js";

export function registerOperationResources(server: McpServer): void {
  server.registerResource(
    "operation-status",
    new ResourceTemplate("realyn://operations/{operationId}", { list: undefined }),
    { description: "Status of a long-running operation", mimeType: "application/json" },
    async (uri, { operationId }) => {
      const session = getCurrentSession();
      const op = await getOperation(operationId as string);
      if (!op) throw new Error(`Operation ${operationId} not found`);
      if (session.role !== "admin" && op.organizationId !== session.organizationId) {
        throw new Error("Access denied");
      }
      return { contents: [{ uri: uri.href, text: JSON.stringify(projectOperation(op), null, 2) }] };
    },
  );
}
