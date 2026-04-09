import type { Request, Response, NextFunction } from "express";

interface SlidingWindowEntry {
  timestamps: number[];
}

const windows = new Map<string, SlidingWindowEntry>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isRateLimited(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => t > now - windowMs);
  if (entry.timestamps.length >= maxPerMinute) return true;
  entry.timestamps.push(now);
  return false;
}

export function ipRateLimit(maxPerMinute: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    if (isRateLimited(`ip:${ip}`, maxPerMinute)) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}

export function toolRateLimit(
  toolName: string,
  orgId: string,
  maxPerMinute: number,
): boolean {
  return isRateLimited(`tool:${toolName}:${orgId}`, maxPerMinute);
}

const TOOL_RATE_LIMITS: Record<string, number> = {
  draft_argument: 5,
  plan_evidence: 5,
  summarize_case: 10,
  submit_to_psp: 3,
  validate_draft: 10,
  retrieve_operational_evidence: 5,
  get_case: 30,
  list_cases: 20,
  check_evidence_gaps: 15,
  assess_readiness: 15,
  get_evidence_progress: 20,
  get_scheme_rules: 20,
  get_operation: 30,
};

export function getToolRateLimit(toolName: string): number | undefined {
  return TOOL_RATE_LIMITS[toolName];
}
