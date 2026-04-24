/**
 * AI Pipeline Telemetry
 *
 * Structured event interface for observability. Consumers provide a
 * concrete emitter (e.g., Cloud Logging, Datadog, console) via
 * `configureTelemetry()`. The llmService and specialists call
 * `getTelemetryEmitter()` to emit events.
 */

export interface AITelemetryEvent {
  type: "llm_call" | "specialist_complete" | "fallback_invoked" | "kb_lookup";
  disputeId: string;
  stage: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  success: boolean;
  kbSource?: "firestore" | "static_fallback" | "null";
  error?: string;
}

export interface AITelemetryEmitter {
  emit(event: AITelemetryEvent): void;
}

/** No-op emitter for when telemetry is not configured. */
export const nullTelemetryEmitter: AITelemetryEmitter = {
  emit() {},
};

// ---------------------------------------------------------------------------
// Module-level emitter — set once at application startup
// ---------------------------------------------------------------------------

let _emitter: AITelemetryEmitter = nullTelemetryEmitter;

export function configureTelemetry(emitter: AITelemetryEmitter): void {
  _emitter = emitter;
}

export function getTelemetryEmitter(): AITelemetryEmitter {
  return _emitter;
}

/** Metadata callers attach to LLM calls so the llmService can emit events. */
export interface TelemetryContext {
  disputeId: string;
  stage: string;
}
