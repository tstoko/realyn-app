import { z } from "zod";
import type { TelemetryContext } from "../../telemetry";

/**
 * Identifier for a concrete LLM provider implementation.
 */
export type LlmProviderName = "anthropic" | "openai";

/**
 * Options for a single LLM call. Wire-compatible with the public
 * `LLMCallOptions` shape that the pre-abstraction codebase consumed —
 * see `llmService.ts` for the back-compat re-export.
 *
 * `model` is provider-specific. When omitted, the provider's default
 * (resolved from `OPENAI_MODEL` / `ANTHROPIC_MODEL` env vars or a
 * built-in fallback) is used.
 */
export interface LlmCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  retries?: number;
  retryDelay?: number;
  /** When set, the provider emits an AITelemetryEvent on completion. */
  telemetry?: TelemetryContext;
}

export interface LlmImageInput {
  url: string;
  description?: string;
}

export interface LlmVisionCallOptions extends LlmCallOptions {
  images?: LlmImageInput[];
}

export interface LlmTextOptions extends Omit<LlmCallOptions, "systemPrompt"> {
  /**
   * Optional system prompt override. Defaults to a provider-specific
   * "respond in plain text" instruction.
   */
  systemPrompt?: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCallResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawResponse?: string;
  usage?: LlmUsage;
}

export interface LlmTextResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Contract that every concrete LLM provider must satisfy. The pipeline
 * code in `llmService.ts` and downstream specialists are kept
 * provider-agnostic by speaking only this interface.
 *
 * Implementations MUST:
 *
 *   1. Return a non-null result from every call — no thrown exceptions
 *      that escape the provider boundary. Pipeline fallbacks rely on
 *      `result.success === false` rather than try/catch around every
 *      site.
 *   2. Honour the `retries` option and apply a back-off identical to
 *      the pre-abstraction `llmService` (linear `retryDelay * (n+1)`).
 *   3. Emit telemetry via `getTelemetryEmitter()` when the caller
 *      supplies `options.telemetry`, regardless of success/failure.
 *      Telemetry failures MUST be swallowed; they must never break the
 *      pipeline.
 *   4. Validate the parsed response against the supplied zod schema
 *      and surface validation errors via `result.error`, NOT throw.
 *
 * Implementations SHOULD:
 *
 *   - Use the provider's native structured-output mechanism when
 *     available (OpenAI's `response_format: json_schema`, Anthropic
 *     tool use, etc.) and fall back to prompt-engineered JSON parsing
 *     only when the native mechanism is unavailable.
 *   - Read their model default from a provider-specific env var
 *     (`OPENAI_MODEL`, `ANTHROPIC_MODEL`) so the default can be
 *     adjusted without redeploying code.
 */
export interface LlmProvider {
  readonly name: LlmProviderName;

  /**
   * True iff the provider has a usable client. False when an API key
   * is missing or the SDK failed to initialise — callers use this to
   * decide whether to attempt a call at all.
   */
  isAvailable(): boolean;

  /**
   * Human-readable reason for `isAvailable() === false`. `null` when
   * the provider is ready. Surfaces missing-key errors to the logs.
   */
  initError(): string | null;

  /**
   * Call the provider with a prompt + zod schema for structured
   * output. The schema is the source of truth for the response shape.
   */
  call<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LlmCallOptions,
  ): Promise<LlmCallResult<T>>;

  /**
   * Vision-enabled call. `options.images` are inlined into the user
   * message in whatever shape the provider's API expects.
   */
  callWithVision<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LlmVisionCallOptions,
  ): Promise<LlmCallResult<T>>;

  /**
   * Plain text completion (no schema). Used by minor pipeline paths
   * that need a string back, not a structured object.
   */
  getTextCompletion(
    prompt: string,
    options?: LlmTextOptions,
  ): Promise<LlmTextResult>;
}
