import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";
import { registerPrompts } from "./prompts/index.js";

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "realyn-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
        logging: {},
      },
    },
  );

  registerResources(server);
  registerTools(server);
  registerPrompts(server);

  return server;
}
