/**
 * Error Reporting Utility for Firebase Cloud Functions
 * 
 * Integrates with Google Cloud Error Reporting and provides hooks
 * for external services like Sentry.
 * 
 * Cloud Error Reporting automatically captures errors from Cloud Functions
 * when they're logged to console.error with proper formatting.
 */

import { createLogger, Logger } from "./logger";

// ============================================================
// Types
// ============================================================

export interface ErrorContext {
  userId?: string;
  organizationId?: string;
  disputeId?: string;
  functionName?: string;
  httpMethod?: string;
  httpPath?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ReportedError {
  message: string;
  stack?: string;
  code?: string;
  context: ErrorContext;
  timestamp: string;
  severity: "error" | "critical";
}

// ============================================================
// Error Reporter Class
// ============================================================

export class ErrorReporter {
  private logger: Logger;
  private context: ErrorContext;

  constructor(context: ErrorContext = {}) {
    this.context = context;
    this.logger = createLogger({
      functionName: context.functionName,
      userId: context.userId,
      organizationId: context.organizationId,
      disputeId: context.disputeId,
    });
  }

  /**
   * Report an error to Cloud Error Reporting
   * 
   * @param error - The error to report
   * @param additionalContext - Additional context for the error
   * @param severity - Error severity (error or critical)
   */
  report(
    error: Error | unknown,
    additionalContext?: Partial<ErrorContext>,
    severity: "error" | "critical" = "error"
  ): void {
    const mergedContext = { ...this.context, ...additionalContext };
    
    const reportedError: ReportedError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      code: error instanceof Error ? (error as any).code : undefined,
      context: mergedContext,
      timestamp: new Date().toISOString(),
      severity,
    };

    // Log to Cloud Error Reporting
    // Google Cloud automatically picks up properly formatted errors
    if (severity === "critical") {
      console.error(`CRITICAL ERROR: ${reportedError.message}`, {
        "@type": "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
        ...reportedError,
      });
    } else {
      this.logger.error(reportedError.message, error, mergedContext);
    }

    // Hook for external services (e.g., Sentry)
    this.sendToExternalService(reportedError);
  }

  /**
   * Report a critical error (higher severity)
   */
  reportCritical(error: Error | unknown, additionalContext?: Partial<ErrorContext>): void {
    this.report(error, additionalContext, "critical");
  }

  /**
   * Create a wrapped function that automatically reports errors
   */
  wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    fnName?: string
  ): T {
    const reporter = this;
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        reporter.report(error, { functionName: fnName });
        throw error;
      }
    }) as T;
  }

  /**
   * Send error to external error tracking service (Sentry).
   *
   * This is a no-op when SENTRY_DSN is not configured. To enable:
   * 1. Install @sentry/node in the functions package
   * 2. Set SENTRY_DSN for Gen2: Google Cloud Console → Cloud Run → each function
   *    service → Edit & deploy new revision → Variables & secrets (or .env locally).
   *    Dashboard uses VITE_SENTRY_DSN separately (browser SDK).
   * 3. Errors will be sent automatically
   */
  protected sendToExternalService(error: ReportedError): void {
    const sentryDsn = process.env.SENTRY_DSN;
    if (!sentryDsn) return;

    try {
      // Dynamic import to avoid breaking when @sentry/node is not installed
      const Sentry = require("@sentry/node");

      // Initialize on first call (idempotent — Sentry ignores duplicate init)
      if (!ErrorReporter._sentryInitialized) {
        Sentry.init({
          dsn: sentryDsn,
          environment: process.env.FUNCTIONS_EMULATOR ? "development" : (process.env.GCLOUD_PROJECT?.includes("staging") ? "staging" : "production"),
          tracesSampleRate: 0.1,
        });
        ErrorReporter._sentryInitialized = true;
      }

      Sentry.captureException(new Error(error.message), {
        extra: error.context,
        level: error.severity === "critical" ? "fatal" : "error",
        tags: {
          functionName: error.context.functionName,
          organizationId: error.context.organizationId,
        },
      });
    } catch (sentryError) {
      // Sentry integration is non-blocking — never let it crash the function
      console.warn("Failed to send error to Sentry:", sentryError);
    }
  }

  /** Track whether Sentry has been initialized */
  private static _sentryInitialized = false;
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Create an error reporter with context
 */
export function createErrorReporter(context?: ErrorContext): ErrorReporter {
  return new ErrorReporter(context);
}

/**
 * Create an error reporter for a specific function handler
 */
export function createHandlerErrorReporter(
  functionName: string,
  req?: {
    method?: string;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
  }
): ErrorReporter {
  return new ErrorReporter({
    functionName,
    httpMethod: req?.method,
    httpPath: req?.path,
  });
}

// ============================================================
// Global Error Reporter
// ============================================================

const globalReporter = new ErrorReporter({ functionName: "global" });

/**
 * Report an error using the global reporter
 */
export function reportError(
  error: Error | unknown,
  context?: Partial<ErrorContext>
): void {
  globalReporter.report(error, context);
}

/**
 * Report a critical error using the global reporter
 */
export function reportCriticalError(
  error: Error | unknown,
  context?: Partial<ErrorContext>
): void {
  globalReporter.reportCritical(error, context);
}

// ============================================================
// Error Boundary for Async Handlers
// ============================================================

/**
 * Wrap an async handler with error reporting
 */
export function withErrorReporting<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  context?: ErrorContext
): T {
  const reporter = new ErrorReporter(context);
  return reporter.wrap(handler);
}

// ============================================================
// Alerting Thresholds (for monitoring integration)
// ============================================================

export const ERROR_THRESHOLDS = {
  /** Errors per minute before alerting */
  errorsPerMinute: 10,
  /** Critical errors per hour before alerting */
  criticalPerHour: 5,
  /** Function timeout rate (%) before alerting */
  timeoutRate: 5,
  /** Error rate (%) before alerting */
  errorRate: 1,
} as const;
