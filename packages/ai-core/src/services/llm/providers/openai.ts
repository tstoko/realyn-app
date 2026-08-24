import OpenAI from "openai";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note below
import { zodResponseFormat as zodResponseFormatTyped } from "openai/helpers/zod";
import { z } from "zod";

/**
 * Type-erased re-cast of the SDK's `zodResponseFormat`. The SDK's
 * generic signature recurses into very deep auto-parse machinery,
 * which makes `tsc` time out (`Type instantiation is excessively
 * deep`) once we pass it a generic `z.ZodSchema<T>` from outside the
 * provider. We don't need the SDK's compile-time parse-shape guarantee
 * because we re-run `schema.safeParse(message.parsed)` defensively
 * after the call — the schema is the source of truth, not the SDK's
 * inference.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zodResponseFormat = zodResponseFormatTyped as unknown as (
  schema: z.ZodTypeAny,
  name: string,
) => OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"];

import { getTelemetryEmitter } from "../../../telemetry";
import type {
  LlmCallOptions,
  LlmCallResult,
  LlmImageInput,
  LlmProvider,
  LlmTextOptions,
  LlmTextResult,
  LlmVisionCallOptions,
} from "../types";

/**
 * Built-in default model. Override at runtime by setting the
 * `OPENAI_MODEL` env var on the function (no code change required).
 *
 * The user-requested default in this PR is `gpt-5.5` — kept here so
 * a missed env var doesn't fall back to a weaker model. If this exact
 * model identifier is rejected by the OpenAI API, override via the env
 * var without redeploying.
 */
const DEFAULT_MODEL_FALLBACK = "gpt-5.5";

function resolveDefaultModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL_FALLBACK;
}

const DEFAULT_OPTIONS = {
  temperature: 0.2,
  maxTokens: 8192,
  systemPrompt: "You are a helpful assistant that responds in JSON format.",
  retries: 2,
  retryDelay: 1000,
} as const;

/**
 * Stable name used in the JSON Schema attached to the OpenAI request.
 * OpenAI requires a schema name; we pick a generic one because the
 * actual shape comes from the caller-supplied zod schema. The name has
 * no semantic meaning to the model — it shows up in OpenAI dashboards
 * and is otherwise opaque.
 */
const JSON_SCHEMA_NAME = "structured_output";

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai" as const;

  private client: OpenAI | null = null;
  private clientError: string | null = null;

  private getClient(): OpenAI | null {
    if (this.clientError) return null;
    if (this.client) return this.client;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.clientError = "OPENAI_API_KEY environment variable is not set";
      console.warn(
        `OpenAI client initialization failed: ${this.clientError}`,
      );
      return null;
    }

    try {
      this.client = new OpenAI({ apiKey });
      return this.client;
    } catch (error) {
      this.clientError =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `OpenAI client initialization failed: ${this.clientError}`,
      );
      return null;
    }
  }

  isAvailable(): boolean {
    return this.getClient() !== null;
  }

  initError(): string | null {
    if (!this.client) this.getClient();
    return this.clientError;
  }

  async call<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LlmCallOptions,
  ): Promise<LlmCallResult<T>> {
    const opts = mergeOptions(options);
    const startMs = Date.now();

    const client = this.getClient();
    if (!client) {
      const initError = this.initError() || "OpenAI client not available";
      console.warn(`LLM call skipped: ${initError}. Fallback will be used.`);
      const failResult: LlmCallResult<T> = { success: false, error: initError };
      this.emitTelemetry(opts, failResult, startMs);
      return failResult;
    }

    let lastError: Error | null = null;
    let rawResponse: string | undefined;

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        // Use the parse-style endpoint so `zodResponseFormat` enforces
        // a strict JSON Schema on the response. With strict mode, OpenAI
        // guarantees the returned content conforms to the schema; the
        // SDK then runs the same zod schema to populate `.parsed`.
        const completion = await client.chat.completions.parse({
          model: opts.model,
          temperature: opts.temperature,
          max_completion_tokens: opts.maxTokens,
          messages: [
            { role: "system", content: opts.systemPrompt },
            { role: "user", content: prompt },
          ],
          response_format: zodResponseFormat(schema, JSON_SCHEMA_NAME),
        });

        const choice = completion.choices[0];
        const message = choice?.message;
        rawResponse = message?.content ?? undefined;

        if (message?.refusal) {
          throw new Error(`OpenAI refused: ${message.refusal}`);
        }
        // SDK's auto-parse is best-effort; the source of truth is our
        // zod schema. Re-run it on whatever payload came back —
        // covers both `.parsed` and a fallback parse of `.content`.
        const candidatePayload =
          (message?.parsed as unknown) ??
          (message?.content ? safeJsonParse(message.content) : undefined);
        if (candidatePayload === undefined) {
          throw new Error("OpenAI returned no parsed payload");
        }
        const validated = schema.safeParse(candidatePayload);
        if (!validated.success) {
          const errors = validated.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ");
          throw new Error(`Response validation failed: ${errors}`);
        }

        const result: LlmCallResult<T> = {
          success: true,
          data: validated.data,
          rawResponse,
          usage: completion.usage
            ? {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens,
              }
            : undefined,
        };
        this.emitTelemetry(opts, result, startMs);
        return result;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        console.error(
          `LLM call attempt ${attempt + 1} failed:`,
          lastError.message,
        );
        if (attempt < opts.retries) {
          await sleep(opts.retryDelay * (attempt + 1));
        }
      }
    }

    const failResult: LlmCallResult<T> = {
      success: false,
      error: lastError?.message || "Unknown error",
      rawResponse,
    };
    this.emitTelemetry(opts, failResult, startMs);
    return failResult;
  }

  async callWithVision<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LlmVisionCallOptions,
  ): Promise<LlmCallResult<T>> {
    const opts = mergeOptions(options);
    const images = options?.images || [];
    const startMs = Date.now();

    const client = this.getClient();
    if (!client) {
      const initError = this.initError() || "OpenAI client not available";
      console.warn(
        `LLM vision call skipped: ${initError}. Fallback will be used.`,
      );
      const failResult: LlmCallResult<T> = { success: false, error: initError };
      this.emitTelemetry(opts, failResult, startMs);
      return failResult;
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: prompt },
    ];
    for (const image of images) {
      pushImageToContent(userContent, image);
    }

    let lastError: Error | null = null;
    let rawResponse: string | undefined;

    console.log(
      `[Vision API] Calling OpenAI with model: ${opts.model}, ${images.length} images`,
    );

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const completion = await client.chat.completions.parse({
          model: opts.model,
          temperature: opts.temperature,
          max_completion_tokens: opts.maxTokens,
          messages: [
            { role: "system", content: opts.systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: zodResponseFormat(schema, JSON_SCHEMA_NAME),
        });

        const choice = completion.choices[0];
        const message = choice?.message;
        rawResponse = message?.content ?? undefined;

        if (message?.refusal) {
          throw new Error(`OpenAI refused: ${message.refusal}`);
        }
        const candidatePayload =
          (message?.parsed as unknown) ??
          (message?.content ? safeJsonParse(message.content) : undefined);
        if (candidatePayload === undefined) {
          throw new Error("OpenAI returned no parsed payload");
        }
        const validated = schema.safeParse(candidatePayload);
        if (!validated.success) {
          const errors = validated.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ");
          throw new Error(`Response validation failed: ${errors}`);
        }

        const result: LlmCallResult<T> = {
          success: true,
          data: validated.data,
          rawResponse,
          usage: completion.usage
            ? {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens,
              }
            : undefined,
        };
        this.emitTelemetry(opts, result, startMs);
        return result;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        console.error(
          `LLM vision call attempt ${attempt + 1} failed:`,
          lastError.message,
        );
        if (attempt < opts.retries) {
          await sleep(opts.retryDelay * (attempt + 1));
        }
      }
    }

    const failResult: LlmCallResult<T> = {
      success: false,
      error: lastError?.message || "Unknown error",
      rawResponse,
    };
    this.emitTelemetry(opts, failResult, startMs);
    return failResult;
  }

  async getTextCompletion(
    prompt: string,
    options?: LlmTextOptions,
  ): Promise<LlmTextResult> {
    const opts = mergeTextOptions(options);

    const client = this.getClient();
    if (!client) {
      const initError = this.initError() || "OpenAI client not available";
      return { success: false, error: initError };
    }

    try {
      const completion = await client.chat.completions.create({
        model: opts.model,
        temperature: opts.temperature,
        max_completion_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: prompt },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) return { success: false, error: "Empty response" };
      return { success: true, text: content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  private emitTelemetry<T>(
    opts: ReturnType<typeof mergeOptions>,
    result: LlmCallResult<T>,
    startMs: number,
  ): void {
    if (!opts.telemetry) return;
    try {
      getTelemetryEmitter().emit({
        type: "llm_call",
        disputeId: opts.telemetry.disputeId,
        stage: opts.telemetry.stage,
        model: opts.model,
        tokensIn: result.usage?.promptTokens,
        tokensOut: result.usage?.completionTokens,
        latencyMs: Date.now() - startMs,
        success: result.success,
        error: result.error,
      });
    } catch {
      // Telemetry must never break the pipeline.
    }
  }
}

function mergeOptions(options?: LlmCallOptions) {
  return {
    model: options?.model ?? resolveDefaultModel(),
    temperature: options?.temperature ?? DEFAULT_OPTIONS.temperature,
    maxTokens: options?.maxTokens ?? DEFAULT_OPTIONS.maxTokens,
    systemPrompt: options?.systemPrompt ?? DEFAULT_OPTIONS.systemPrompt,
    retries: options?.retries ?? DEFAULT_OPTIONS.retries,
    retryDelay: options?.retryDelay ?? DEFAULT_OPTIONS.retryDelay,
    telemetry: options?.telemetry,
  };
}

function mergeTextOptions(options?: LlmTextOptions) {
  return {
    model: options?.model ?? resolveDefaultModel(),
    temperature: options?.temperature ?? DEFAULT_OPTIONS.temperature,
    maxTokens: options?.maxTokens ?? DEFAULT_OPTIONS.maxTokens,
    systemPrompt:
      options?.systemPrompt ??
      "You are a helpful assistant. Respond with plain text.",
    retries: options?.retries ?? DEFAULT_OPTIONS.retries,
    retryDelay: options?.retryDelay ?? DEFAULT_OPTIONS.retryDelay,
    telemetry: options?.telemetry,
  };
}

function pushImageToContent(
  userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  image: LlmImageInput,
): void {
  userContent.push({
    type: "image_url",
    image_url: { url: image.url },
  });
  if (image.description) {
    userContent.push({
      type: "text",
      text: `[The above image is: ${image.description}]`,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}
