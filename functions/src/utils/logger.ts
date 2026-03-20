/**
 * Structured Logger for Firebase Cloud Functions
 * 
 * Provides consistent, structured logging with:
 * - Severity levels (debug, info, warn, error)
 * - Contextual metadata (userId, organizationId, disputeId, requestId)
 * - JSON format for Cloud Logging compatibility
 * - Performance timing utilities
 */

import { v4 as uuidv4 } from "uuid";

// ============================================================
// Types
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  disputeId?: string;
  functionName?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface LogEntry {
  severity: string;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  duration?: number;
  [key: string]: unknown;
}

// ============================================================
// Logger Class
// ============================================================

export class Logger {
  private context: LogContext;
  private startTime?: number;

  constructor(context: LogContext = {}) {
    this.context = {
      requestId: context.requestId || uuidv4(),
      ...context,
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Start a timer for performance measurement
   */
  startTimer(): void {
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time since startTimer() was called
   */
  getElapsedMs(): number | undefined {
    if (!this.startTime) return undefined;
    return Date.now() - this.startTime;
  }

  /**
   * Log at DEBUG level (only in non-production or when DEBUG_LOGGING is enabled)
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  /**
   * Log at INFO level
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  /**
   * Log at WARN level
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  /**
   * Log at ERROR level
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: LogEntry["error"] = error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        }
      : error
        ? { message: String(error) }
        : undefined;

    this.log("error", message, { ...data, error: errorData });
  }

  /**
   * Log an operation with automatic timing
   */
  async logOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    data?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    this.info(`${operationName} started`, data);

    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      this.info(`${operationName} completed`, { ...data, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`${operationName} failed`, error, { ...data, duration });
      throw error;
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Skip debug logs in production unless explicitly enabled
    if (level === "debug" && process.env.NODE_ENV === "production" && !process.env.DEBUG_LOGGING) {
      return;
    }

    const entry: LogEntry = {
      severity: level.toUpperCase(),
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      duration: this.getElapsedMs(),
      ...data,
    };

    // Remove undefined values
    const cleaned = JSON.parse(JSON.stringify(entry));

    // Use appropriate console method for Cloud Logging severity recognition
    switch (level) {
      case "debug":
        console.debug(JSON.stringify(cleaned));
        break;
      case "info":
        console.info(JSON.stringify(cleaned));
        break;
      case "warn":
        console.warn(JSON.stringify(cleaned));
        break;
      case "error":
        console.error(JSON.stringify(cleaned));
        break;
    }
  }
}

// ============================================================
// Singleton and Factory Functions
// ============================================================

/**
 * Create a new logger instance with context
 */
export function createLogger(context?: LogContext): Logger {
  return new Logger(context);
}

/**
 * Create a logger for a specific function handler
 */
export function createHandlerLogger(
  functionName: string,
  req?: { headers?: Record<string, string | string[] | undefined> }
): Logger {
  // Extract request ID from header if available
  const requestIdHeader = req?.headers?.["x-request-id"];
  const requestId = Array.isArray(requestIdHeader) 
    ? requestIdHeader[0] 
    : requestIdHeader || uuidv4();

  return new Logger({
    functionName,
    requestId,
  });
}

// ============================================================
// Global Logger (for simple cases)
// ============================================================

const globalLogger = new Logger({ functionName: "global" });

export const log = {
  debug: (message: string, data?: Record<string, unknown>) => globalLogger.debug(message, data),
  info: (message: string, data?: Record<string, unknown>) => globalLogger.info(message, data),
  warn: (message: string, data?: Record<string, unknown>) => globalLogger.warn(message, data),
  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => 
    globalLogger.error(message, error, data),
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Redact sensitive fields from objects before logging
 */
export function redactSensitive<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = ["password", "apiKey", "secretKey", "accessToken", "webhookSecret", "encryptionKey"]
): T {
  const redacted = { ...obj };
  
  for (const field of sensitiveFields) {
    if (field in redacted && redacted[field]) {
      (redacted as Record<string, unknown>)[field] = "[REDACTED]";
    }
  }
  
  return redacted;
}

/**
 * Truncate long strings for logging
 */
export function truncateForLog(str: string, maxLength: number = 500): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated, ${str.length - maxLength} more chars]`;
}
