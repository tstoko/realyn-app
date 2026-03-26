/**
 * Rate Limiter for Firebase Cloud Functions
 * 
 * Uses Firestore to track request counts with sliding window algorithm.
 * Suitable for serverless environments where in-memory rate limiting is not possible.
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// ============================================================
// Types
// ============================================================

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Identifier type for rate limiting */
  keyType: "ip" | "user" | "organization" | "custom";
  /**
   * Behavior when the rate limiter encounters an internal error (e.g. Firestore failure).
   * - 'open': allow the request through (safe for webhooks that must not lose events)
   * - 'closed': deny the request (safe for expensive operations like AI calls, PSP submissions)
   * Defaults to 'open' for backward compatibility.
   */
  failMode?: "open" | "closed";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until the limit resets
}

// ============================================================
// Default Configurations
// ============================================================

export const RATE_LIMIT_CONFIGS = {
  /** Webhook endpoints - high limit, fail-open (must not lose events) */
  webhook: {
    maxRequests: 1000,
    windowSeconds: 60,
    keyType: "ip" as const,
    failMode: "open" as const,
  },
  /** AI endpoints - moderate limit, fail-closed (expensive operations) */
  ai: {
    maxRequests: 30,
    windowSeconds: 60,
    keyType: "user" as const,
    failMode: "closed" as const,
  },
  /** Data export - low limit, fail-closed (prevent abuse) */
  dataExport: {
    maxRequests: 5,
    windowSeconds: 3600, // 1 hour
    keyType: "user" as const,
    failMode: "closed" as const,
  },
  /** Data deletion - very low limit, fail-closed (safety-critical) */
  dataDeletion: {
    maxRequests: 3,
    windowSeconds: 86400, // 24 hours
    keyType: "user" as const,
    failMode: "closed" as const,
  },
  /** General API - moderate limit, fail-open */
  general: {
    maxRequests: 100,
    windowSeconds: 60,
    keyType: "ip" as const,
    failMode: "open" as const,
  },
} as const;

// ============================================================
// Rate Limiter Class
// ============================================================

export class RateLimiter {
  private db: admin.firestore.Firestore;
  private collectionName = "_rateLimits";

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Check if a request should be allowed based on rate limits
   * 
   * @param key - Unique identifier for the rate limit (IP, userId, etc.)
   * @param config - Rate limit configuration
   * @returns RateLimitResult indicating if request is allowed
   */
  async checkLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;
    const docId = `${config.keyType}:${this.sanitizeKey(key)}`;
    const docRef = this.db.collection(this.collectionName).doc(docId);

    try {
      const result = await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const data = doc.data() as RateLimitData | undefined;

        // Filter out expired entries
        const validRequests = (data?.requests || []).filter(
          (timestamp) => timestamp > windowStart
        );

        const currentCount = validRequests.length;
        const allowed = currentCount < config.maxRequests;
        const resetAt = new Date(windowStart + config.windowSeconds * 1000);

        if (allowed) {
          // Add the new request timestamp
          validRequests.push(now);
          transaction.set(docRef, {
            requests: validRequests,
            lastUpdated: FieldValue.serverTimestamp(),
          });
        }

        return {
          allowed,
          remaining: Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0)),
          resetAt,
          retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
        };
      });

      return result;
    } catch (error) {
      console.error("Rate limiter error:", error);
      const failMode = config.failMode || "open";
      if (failMode === "closed") {
        // Fail-closed: deny the request when the limiter can't verify the count.
        // Use this for expensive operations (AI calls, PSP submissions) to prevent
        // abuse when Firestore is unavailable.
        console.warn(`Rate limiter fail-CLOSED for key ${docId} — denying request`);
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(now + config.windowSeconds * 1000),
          retryAfter: config.windowSeconds,
        };
      }
      // Fail-open: allow the request through (default for webhooks, general API).
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now + config.windowSeconds * 1000),
      };
    }
  }

  /**
   * Get the current rate limit status without consuming a request
   */
  async getStatus(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;
    const docId = `${config.keyType}:${this.sanitizeKey(key)}`;
    const docRef = this.db.collection(this.collectionName).doc(docId);

    try {
      const doc = await docRef.get();
      const data = doc.data() as RateLimitData | undefined;

      const validRequests = (data?.requests || []).filter(
        (timestamp) => timestamp > windowStart
      );

      const currentCount = validRequests.length;
      const resetAt = new Date(windowStart + config.windowSeconds * 1000);

      return {
        allowed: currentCount < config.maxRequests,
        remaining: Math.max(0, config.maxRequests - currentCount),
        resetAt,
        retryAfter: currentCount >= config.maxRequests
          ? Math.ceil((resetAt.getTime() - now) / 1000)
          : undefined,
      };
    } catch (error) {
      console.error("Rate limiter status error:", error);
      const failMode = config.failMode || "open";
      return {
        allowed: failMode === "open",
        remaining: failMode === "open" ? config.maxRequests : 0,
        resetAt: new Date(now + config.windowSeconds * 1000),
      };
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetLimit(key: string, keyType: RateLimitConfig["keyType"]): Promise<void> {
    const docId = `${keyType}:${this.sanitizeKey(key)}`;
    await this.db.collection(this.collectionName).doc(docId).delete();
  }

  /**
   * Clean up old rate limit entries (run periodically)
   */
  async cleanup(olderThanSeconds: number = 86400): Promise<number> {
    const cutoff = Date.now() - olderThanSeconds * 1000;
    const snapshot = await this.db
      .collection(this.collectionName)
      .where("lastUpdated", "<", new Date(cutoff))
      .limit(500)
      .get();

    const batch = this.db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return snapshot.size;
  }

  /**
   * Sanitize key to be a valid Firestore document ID
   */
  private sanitizeKey(key: string): string {
    // Replace invalid characters and limit length
    return key
      .replace(/[\/\.\#\$\[\]]/g, "_")
      .substring(0, 100);
  }
}

// ============================================================
// Internal Types
// ============================================================

interface RateLimitData {
  requests: number[];
  lastUpdated: admin.firestore.Timestamp;
}

// ============================================================
// Singleton Instance
// ============================================================

let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Extract IP address from request
 */
export function getClientIP(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  // Check for forwarded IP (from load balancers, proxies)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return ip.trim();
  }
  
  // Check for real IP header
  const realIP = req.headers["x-real-ip"];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }
  
  // Fall back to direct IP
  return req.ip || "unknown";
}

/**
 * Apply rate limit and return response if limit exceeded
 * 
 * @returns null if allowed, Response object if rate limited
 */
export async function applyRateLimit(
  req: { headers: Record<string, string | string[] | undefined>; ip?: string },
  res: { 
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (name: string, value: string | number) => void;
  },
  key: string,
  config: RateLimitConfig
): Promise<boolean> {
  const limiter = getRateLimiter();
  const result = await limiter.checkLimit(key, config);

  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", config.maxRequests);
  res.setHeader("X-RateLimit-Remaining", result.remaining);
  res.setHeader("X-RateLimit-Reset", Math.floor(result.resetAt.getTime() / 1000));

  if (!result.allowed) {
    res.setHeader("Retry-After", result.retryAfter || config.windowSeconds);
    res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter,
    });
    return false;
  }

  return true;
}
