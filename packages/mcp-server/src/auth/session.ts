import type { McpSession } from "../types/mcp.js";
import { AsyncLocalStorage } from "node:async_hooks";

const sessionStorage = new AsyncLocalStorage<McpSession>();

export function runWithSession<T>(session: McpSession, fn: () => T): T {
  return sessionStorage.run(session, fn);
}

export function getCurrentSession(): McpSession {
  const session = sessionStorage.getStore();
  if (!session) {
    throw new Error("No MCP session in current context");
  }
  return session;
}

export function tryGetCurrentSession(): McpSession | undefined {
  return sessionStorage.getStore();
}
