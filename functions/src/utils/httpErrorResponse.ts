import { randomBytes } from "crypto";
import type { Response } from "express";

/** Short opaque id for support correlation (logged server-side, returned to client on 5xx). */
export function newSupportErrorId(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Log full error server-side; return a generic 500 JSON body (never leak `error.message`).
 */
export function sendInternalError(
  res: Response,
  err: unknown,
  logLabel: string,
): void {
  const errorId = newSupportErrorId();
  console.error(`[${logLabel}] errorId=${errorId}`, err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error", errorId });
  }
}
