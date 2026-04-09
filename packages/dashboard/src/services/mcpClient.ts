/**
 * MCP Client Service
 *
 * Lightweight browser-compatible client for the MCP Streamable HTTP protocol.
 * Manages session lifecycle, tool calling, and operation polling against the
 * Realyn MCP server.
 */

import { auth } from '@realyn/shared';
import { getMcpServerUrl } from '../config/environment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface McpToolResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface OperationStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: { step: string; percent: number };
  result?: unknown;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let sessionId: string | null = null;
let requestCounter = 0;

function getBaseUrl(): string {
  return getMcpServerUrl().replace(/\/$/, '');
}

async function getAuthToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("User not authenticated");
  return currentUser.getIdToken();
}

async function sendJsonRpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const baseUrl = getBaseUrl();
  const token = await getAuthToken();

  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: ++requestCounter,
    method,
    params,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // Capture session ID from response
  const newSessionId = response.headers.get("mcp-session-id");
  if (newSessionId) {
    sessionId = newSessionId;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`MCP request failed (${response.status}): ${errorText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  // Handle SSE responses (tool results may come via SSE)
  if (contentType.includes("text/event-stream")) {
    return parseSseResponse(response);
  }

  return (await response.json()) as JsonRpcResponse;
}

async function parseSseResponse(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();
      if (data) {
        try {
          return JSON.parse(data) as JsonRpcResponse;
        } catch {
          // Continue to next event
        }
      }
    }
  }

  throw new Error("No valid JSON-RPC response in SSE stream");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize a new MCP session. Call once on component mount.
 * The session is automatically established on the first tool call,
 * but calling this explicitly ensures connectivity early.
 */
export async function initSession(): Promise<void> {
  sessionId = null;
  requestCounter = 0;

  const response = await sendJsonRpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "realyn-dashboard", version: "0.1.0" },
  });

  if (response.error) {
    throw new Error(`MCP init failed: ${response.error.message}`);
  }
}

/**
 * Call an MCP tool by name.
 */
export async function callTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResponse<T>> {
  try {
    const response = await sendJsonRpc("tools/call", {
      name: toolName,
      arguments: args,
    });

    if (response.error) {
      return { ok: false, error: response.error.message };
    }

    const result = response.result as ToolCallResult;
    if (result.isError) {
      const errText = result.content?.[0]?.text || "Unknown tool error";
      return { ok: false, error: errText };
    }

    const textContent = result.content?.find((c) => c.type === "text");
    if (!textContent) {
      return { ok: true, data: undefined };
    }

    try {
      const parsed = JSON.parse(textContent.text) as T;
      return { ok: true, data: parsed };
    } catch {
      return { ok: true, data: textContent.text as unknown as T };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Poll an operation until it completes or fails.
 */
export async function pollOperation(
  operationId: string,
  options?: { intervalMs?: number; maxAttempts?: number; onProgress?: (status: OperationStatus) => void },
): Promise<McpToolResponse<OperationStatus>> {
  const interval = options?.intervalMs ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 120;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await callTool<OperationStatus>("get_operation", { operationId });

    if (!result.ok) {
      return result;
    }

    const status = result.data!;
    options?.onProgress?.(status);

    if (status.status === "completed" || status.status === "failed") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return { ok: false, error: "Operation polling timed out" };
}

/**
 * Close the current MCP session. Call on unmount.
 */
export async function closeSession(): Promise<void> {
  if (!sessionId) return;

  try {
    const baseUrl = getBaseUrl();
    const token = await getAuthToken();

    await fetch(`${baseUrl}/mcp`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "mcp-session-id": sessionId,
      },
    });
  } catch {
    // Best-effort cleanup
  } finally {
    sessionId = null;
    requestCounter = 0;
  }
}

/**
 * Check if the MCP server is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

