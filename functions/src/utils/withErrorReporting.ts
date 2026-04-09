import { Request, Response } from "express";
import { reportError } from "./errorReporting";

type HttpHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Wraps an HTTP handler with automatic error reporting.
 * Catches unhandled errors, reports them via the ErrorReporter (which forwards
 * to Sentry when SENTRY_DSN is set), and returns a 500 response.
 */
export function withErrorReporting(
  handlerName: string,
  handler: HttpHandler
): HttpHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      reportError(error, {
        functionName: handlerName,
        httpMethod: req.method,
        httpPath: req.path,
      });

      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}
