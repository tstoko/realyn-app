import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

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
 * `ANTHROPIC_MODEL` env var on the function (no code change required).
 * The historical default before the abstraction was `claude-opus-4-6`;
 * keep that as the floor so a missed env var doesn't silently switch
 * to a cheaper / weaker model.
 */
const DEFAULT_MODEL_FALLBACK = "claude-opus-4-6";

function resolveDefaultModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL_FALLBACK;
}

const DEFAULT_OPTIONS = {
  temperature: 0.2,
  maxTokens: 8192,
  systemPrompt: "You are a helpful assistant that responds in JSON format.",
  retries: 2,
  retryDelay: 1000,
} as const;

const JSON_INSTRUCTION =
  "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences, no explanation outside the JSON object.";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;

  private client: Anthropic | null = null;
  private clientError: string | null = null;

  private getClient(): Anthropic | null {
    if (this.clientError) return null;
    if (this.client) return this.client;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.clientError = "ANTHROPIC_API_KEY environment variable is not set";
      console.warn(
        `Anthropic client initialization failed: ${this.clientError}`,
      );
      return null;
    }

    try {
      this.client = new Anthropic({ apiKey });
      return this.client;
    } catch (error) {
      this.clientError =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `Anthropic client initialization failed: ${this.clientError}`,
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
      const initError = this.initError() || "Anthropic client not available";
      console.warn(`LLM call skipped: ${initError}. Fallback plan will be used.`);
      const failResult: LlmCallResult<T> = { success: false, error: initError };
      this.emitTelemetry(opts, failResult, startMs);
      return failResult;
    }

    let lastError: Error | null = null;
    let rawResponse: string | undefined;

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const response = await client.messages.create({
          model: opts.model,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          system: opts.systemPrompt + JSON_INSTRUCTION,
          messages: [{ role: "user", content: prompt }],
        });

        const textBlock = response.content.find(
          (block) => block.type === "text",
        );
        const content =
          textBlock && textBlock.type === "text" ? textBlock.text : null;
        rawResponse = content || undefined;

        if (!content) throw new Error("Empty response from Anthropic");

        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(
            `Failed to parse JSON response: ${content.substring(0, 200)}...`,
          );
        }

        const validated = schema.safeParse(parsed);
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
          usage: response.usage
            ? {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens:
                  response.usage.input_tokens + response.usage.output_tokens,
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
      const initError = this.initError() || "Anthropic client not available";
      console.warn(
        `LLM vision call skipped: ${initError}. Fallback will be used.`,
      );
      const failResult: LlmCallResult<T> = { success: false, error: initError };
      this.emitTelemetry(opts, failResult, startMs);
      return failResult;
    }

    const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [
      { type: "text", text: prompt },
    ];
    for (const image of images) {
      pushImageToContent(userContent, image);
    }

    let lastError: Error | null = null;
    let rawResponse: string | undefined;

    console.log(
      `[Vision API] Calling Anthropic with model: ${opts.model}, ${images.length} images`,
    );

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const response = await client.messages.create({
          model: opts.model,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          system: opts.systemPrompt + JSON_INSTRUCTION,
          messages: [{ role: "user", content: userContent }],
        });

        console.log(
          `[Vision API] Response received, model used: ${
            response.model || "not specified"
          }`,
        );

        const textBlock = response.content.find(
          (block) => block.type === "text",
        );
        const content =
          textBlock && textBlock.type === "text" ? textBlock.text : null;
        rawResponse = content || undefined;

        if (!content) throw new Error("Empty response from Anthropic");

        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(
            `Failed to parse JSON response: ${content.substring(0, 200)}...`,
          );
        }

        const validated = schema.safeParse(parsed);
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
          usage: response.usage
            ? {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens:
                  response.usage.input_tokens + response.usage.output_tokens,
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
      const initError = this.initError() || "Anthropic client not available";
      return { success: false, error: initError };
    }

    try {
      const response = await client.messages.create({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find(
        (block) => block.type === "text",
      );
      const content =
        textBlock && textBlock.type === "text" ? textBlock.text : null;
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
  userContent: Anthropic.MessageCreateParams["messages"][0]["content"],
  image: LlmImageInput,
): void {
  (userContent as unknown as Anthropic.ImageBlockParam[]).push({
    type: "image",
    source: {
      type: "url",
      url: image.url,
    },
  } as Anthropic.ImageBlockParam);

  if (image.description) {
    (userContent as unknown as Anthropic.TextBlockParam[]).push({
      type: "text",
      text: `[The above image is: ${image.description}]`,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
