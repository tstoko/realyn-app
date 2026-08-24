import { z } from "zod";

import { getLlmProvider } from "./llm/factory";
import type {
  LlmCallOptions,
  LlmCallResult,
  LlmImageInput,
  LlmTextOptions,
  LlmTextResult,
  LlmVisionCallOptions,
} from "./llm/types";

// ============================================================
// LLM Service — provider-agnostic facade
// ============================================================
//
// Pre-2026-05 this module spoke directly to the Anthropic SDK. After
// the Anthropic credit-block incident, the implementation was lifted
// behind an `LlmProvider` interface (see `./llm/`). The public surface
// — names, parameter shapes, return shapes — is preserved verbatim so
// existing call sites (planner, argument generator, specialists,
// captureRagBaseline) didn't change.
//
// To switch providers at runtime, set the `LLM_PROVIDER` env var on the
// Cloud Function (or the equivalent shell env when running locally).
// Valid values: `openai` (default), `anthropic`. See
// `./llm/factory.ts` for the resolution rules.

// ------------------------------------------------------------
// Re-exported types (back-compat aliases to the new shared types)
// ------------------------------------------------------------

export type LLMCallOptions = LlmCallOptions;
export type ImageInput = LlmImageInput;
export type LLMVisionCallOptions = LlmVisionCallOptions;
export type LLMCallResult<T> = LlmCallResult<T>;

// ------------------------------------------------------------
// Availability helpers
// ------------------------------------------------------------

export function isLLMAvailable(): boolean {
  return getLlmProvider().isAvailable();
}

export function getLLMInitError(): string | null {
  return getLlmProvider().initError();
}

// ------------------------------------------------------------
// Main entry points
// ------------------------------------------------------------

/**
 * Call the configured LLM provider with a prompt + zod schema for
 * structured output. The provider applies its native
 * structured-output mechanism (OpenAI: `response_format: json_schema`;
 * Anthropic: JSON-instructed prompt + retry on parse failure).
 *
 * @param prompt   - The user prompt to send to the LLM.
 * @param schema   - Zod schema to validate the response.
 * @param options  - Optional configuration.
 */
export async function callLLM<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options?: LlmCallOptions,
): Promise<LlmCallResult<T>> {
  return getLlmProvider().call(prompt, schema, options);
}

/**
 * Call the configured LLM provider with vision support. Images are
 * inlined into the user message in whatever shape the provider's API
 * expects.
 */
export async function callLLMWithVision<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options?: LlmVisionCallOptions,
): Promise<LlmCallResult<T>> {
  return getLlmProvider().callWithVision(prompt, schema, options);
}

/**
 * Call the LLM with a pre-formatted prompt template. Variables are
 * substituted by `{{name}}` placeholders.
 */
export async function callLLMWithTemplate<T>(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>,
  schema: z.ZodSchema<T>,
  options?: LlmCallOptions,
): Promise<LlmCallResult<T>> {
  let prompt = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    prompt = prompt.replace(new RegExp(placeholder, "g"), String(value ?? ""));
  }
  return callLLM(prompt, schema, options);
}

/**
 * Plain text completion (no schema). Used by minor pipeline paths that
 * need a string back, not a structured object.
 */
export async function getTextCompletion(
  prompt: string,
  options?: LlmTextOptions,
): Promise<LlmTextResult> {
  return getLlmProvider().getTextCompletion(prompt, options);
}

// ------------------------------------------------------------
// Helper utilities (kept on the public surface for back-compat)
// ------------------------------------------------------------

/**
 * Estimate token count for a string (rough approximation).
 * ~4 characters per token on average for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to approximate token limit.
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) return text;
  return text.substring(0, estimatedChars) + "... [truncated]";
}
