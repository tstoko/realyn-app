/**
 * Cloud Logging telemetry emitter for Firebase Functions.
 *
 * Emits structured JSON via console.log — Cloud Logging automatically
 * picks up severity and fields. The entries can be queried in
 * Cloud Logging Explorer with:
 *
 *   jsonPayload.ai_telemetry = true
 *   jsonPayload.type = "llm_call"
 *   jsonPayload.disputeId = "abc123"
 */

import type { AITelemetryEmitter, AITelemetryEvent } from "@realyn/ai-core/telemetry";

export const cloudLoggingEmitter: AITelemetryEmitter = {
  emit(event: AITelemetryEvent): void {
    const entry = {
      severity: event.success ? "INFO" : "WARNING",
      ai_telemetry: true,
      ...event,
    };
    console.log(JSON.stringify(entry));
  },
};
