import express from "express";
import type { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { authenticateRequest } from "./auth/firebaseAuth.js";
import { runWithSession } from "./auth/session.js";
import type { McpSession } from "./types/mcp.js";
import { ipRateLimit } from "./middleware/rateLimiter.js";
import { sweepStaleOperations } from "./middleware/operationSweep.js";
import crypto from "node:crypto";

admin.initializeApp();

const server = createMcpServer();

const ALLOWED_ORIGINS: string[] = [
  "https://dashboard.realyn.app",
  "https://realyn.app",
  "https://realyn-dashboard.web.app",
  "https://realyn-app.web.app",
  "https://realyn-app-staging-dashboard.web.app",
  "https://realyn-app-staging-website.web.app",
  "http://localhost:3001",
  "http://localhost:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3000",
];

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use("/mcp", ipRateLimit(100));

const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  session: McpSession;
  lastAccessedAt: number;
}

const sessions = new Map<string, SessionEntry>();

function touchSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) entry.lastAccessedAt = Date.now();
}

function removeSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) {
    try { entry.transport.close?.(); } catch { /* already closed */ }
    sessions.delete(sessionId);
  }
}

// Periodic sweep for expired sessions and stale operations
const operationSweepTimer = setInterval(() => {
  sweepStaleOperations().catch((err) => console.error("Operation sweep error:", err));
}, 5 * 60 * 1000);
operationSweepTimer.unref();

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessions) {
    if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
      removeSession(sid);
    }
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

// --- POST /mcp: initialize or continue a session ---
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const session = await authenticateRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      if (session.role !== "admin" && entry.session.organizationId !== session.organizationId) {
        res.status(403).json({ error: "Session belongs to another organization" });
        return;
      }
      touchSession(sessionId);
      await runWithSession(session, () => entry.transport.handleRequest(req, res, req.body));
      return;
    }

    if (sessions.size >= MAX_SESSIONS) {
      res.status(503).json({ error: "Too many active sessions" });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    transport.onclose = () => {
      const sid = (transport as any)._sessionId;
      if (sid) sessions.delete(sid);
    };

    await server.connect(transport);
    await runWithSession(session, () => transport.handleRequest(req, res, req.body));

    const newSessionId = res.getHeader("mcp-session-id") as string | undefined;
    if (newSessionId) {
      sessions.set(newSessionId, {
        transport,
        session,
        lastAccessedAt: Date.now(),
      });
    }
  } catch (err) {
    console.error("POST /mcp error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// --- GET /mcp: SSE stream for an existing session ---
app.get("/mcp", async (req: Request, res: Response) => {
  try {
    const session = await authenticateRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: "No session. Send an initialization POST first." });
      return;
    }

    const entry = sessions.get(sessionId)!;
    if (session.role !== "admin" && entry.session.organizationId !== session.organizationId) {
      res.status(403).json({ error: "Session belongs to another organization" });
      return;
    }

    touchSession(sessionId);
    await entry.transport.handleRequest(req, res);
  } catch (err) {
    console.error("GET /mcp error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// --- DELETE /mcp: close a session ---
app.delete("/mcp", async (req: Request, res: Response) => {
  try {
    const session = await authenticateRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: "No session to close." });
      return;
    }

    const entry = sessions.get(sessionId)!;
    if (session.role !== "admin" && entry.session.organizationId !== session.organizationId) {
      res.status(403).json({ error: "Session belongs to another organization" });
      return;
    }

    await entry.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  } catch (err) {
    console.error("DELETE /mcp error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "0.1.0", activeSessions: sessions.size });
});

// Global Express error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled Express error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

const port = process.env.PORT || 8080;
const httpServer = app.listen(port, () => {
  console.log(`Realyn MCP server listening on port ${port}`);
});

// Graceful shutdown for Cloud Run SIGTERM
function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  clearInterval(sweepTimer);
  clearInterval(operationSweepTimer);

  httpServer.close(() => {
    for (const [sid] of sessions) {
      removeSession(sid);
    }
    console.log("All sessions closed, exiting.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});
