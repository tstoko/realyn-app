import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ============================================================
// LLM Service - Anthropic Claude Integration
// ============================================================

let anthropicClient: Anthropic | null = null;
let clientInitError: string | null = null;

function getAnthropicClient(): Anthropic | null {
  if (clientInitError) {
    return null;
  }

  if (!anthropicClient) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        clientInitError = "ANTHROPIC_API_KEY environment variable is not set";
        console.warn(`Anthropic client initialization failed: ${clientInitError}`);
        return null;
      }
      anthropicClient = new Anthropic({ apiKey });
    } catch (error) {
      clientInitError = error instanceof Error ? error.message : String(error);
      console.warn(`Anthropic client initialization failed: ${clientInitError}`);
      return null;
    }
  }
  return anthropicClient;
}

export function isLLMAvailable(): boolean {
  return getAnthropicClient() !== null;
}

export function getLLMInitError(): string | null {
  return clientInitError;
}

// ============================================================
// Types
// ============================================================

export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  retries?: number;
  retryDelay?: number;
}

export interface ImageInput {
  url: string;
  description?: string;
}

export interface LLMVisionCallOptions extends LLMCallOptions {
  images?: ImageInput[];
}

export interface LLMCallResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawResponse?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_OPTIONS: Required<LLMCallOptions> = {
  model: "claude-opus-4-6",
  temperature: 0.2,
  maxTokens: 8192,
  systemPrompt: "You are a helpful assistant that responds in JSON format.",
  retries: 2,
  retryDelay: 1000,
};

// ============================================================
// Main LLM Call Function
// ============================================================

/**
 * Call Anthropic API with structured JSON output and Zod validation
 *
 * @param prompt - The user prompt to send to the LLM
 * @param schema - Zod schema to validate the response
 * @param options - Optional configuration
 * @returns Validated response or error
 */
export async function callLLM<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options?: LLMCallOptions
): Promise<LLMCallResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const client = getAnthropicClient();
  if (!client) {
    const initError = getLLMInitError() || "Anthropic client not available";
    console.warn(`LLM call skipped: ${initError}. Fallback plan will be used.`);
    return {
      success: false,
      error: initError,
    };
  }

  let lastError: Error | null = null;
  let rawResponse: string | undefined;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences, no explanation outside the JSON object.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && textBlock.type === "text" ? textBlock.text : null;
      rawResponse = content || undefined;

      if (!content) {
        throw new Error("Empty response from Anthropic");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}...`);
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        const errors = validated.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        throw new Error(`Response validation failed: ${errors}`);
      }

      return {
        success: true,
        data: validated.data,
        rawResponse,
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            }
          : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`LLM call attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < opts.retries) {
        await sleep(opts.retryDelay * (attempt + 1));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Unknown error",
    rawResponse,
  };
}

// ============================================================
// Vision-Enabled LLM Call Function
// ============================================================

/**
 * Call Anthropic API with vision capabilities - can process images.
 * Uses Claude's native multimodal support for document analysis.
 *
 * @param prompt - The user prompt to send to the LLM
 * @param schema - Zod schema to validate the response
 * @param options - Optional configuration including images
 * @returns Validated response or error
 */
export async function callLLMWithVision<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options?: LLMVisionCallOptions
): Promise<LLMCallResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const images = options?.images || [];

  const client = getAnthropicClient();
  if (!client) {
    const initError = getLLMInitError() || "Anthropic client not available";
    console.warn(`LLM vision call skipped: ${initError}. Fallback will be used.`);
    return {
      success: false,
      error: initError,
    };
  }

  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [
    { type: "text", text: prompt },
  ];

  for (const image of images) {
    (userContent as any[]).push({
      type: "image",
      source: {
        type: "url",
        url: image.url,
      },
    });

    if (image.description) {
      (userContent as any[]).push({
        type: "text",
        text: `[The above image is: ${image.description}]`,
      });
    }
  }

  let lastError: Error | null = null;
  let rawResponse: string | undefined;

  console.log(`[Vision API] Calling Anthropic with model: ${opts.model}, ${images.length} images`);

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences, no explanation outside the JSON object.",
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
      });

      console.log(`[Vision API] Response received, model used: ${response.model || "not specified"}`);

      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && textBlock.type === "text" ? textBlock.text : null;
      rawResponse = content || undefined;

      if (!content) {
        throw new Error("Empty response from Anthropic");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}...`);
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        const errors = validated.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        throw new Error(`Response validation failed: ${errors}`);
      }

      if ((parsed as any)?.model) {
        console.log(`[Vision API] WARNING: Parsed JSON includes model field: ${(parsed as any).model}`);
      }

      return {
        success: true,
        data: validated.data,
        rawResponse,
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            }
          : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`LLM vision call attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < opts.retries) {
        await sleep(opts.retryDelay * (attempt + 1));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Unknown error",
    rawResponse,
  };
}

// ============================================================
// Specialized LLM Functions
// ============================================================

/**
 * Call LLM with a pre-formatted prompt template
 */
export async function callLLMWithTemplate<T>(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>,
  schema: z.ZodSchema<T>,
  options?: LLMCallOptions
): Promise<LLMCallResult<T>> {
  let prompt = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    prompt = prompt.replace(new RegExp(placeholder, "g"), String(value ?? ""));
  }

  return callLLM(prompt, schema, options);
}

/**
 * Simple text completion (no schema validation)
 */
export async function getTextCompletion(
  prompt: string,
  options?: Omit<LLMCallOptions, "systemPrompt">
): Promise<{ success: boolean; text?: string; error?: string }> {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    systemPrompt: "You are a helpful assistant. Respond with plain text.",
  };

  const client = getAnthropicClient();
  if (!client) {
    const initError = getLLMInitError() || "Anthropic client not available";
    return { success: false, error: initError };
  }

  try {
    const response = await client.messages.create({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && textBlock.type === "text" ? textBlock.text : null;
    if (!content) {
      return { success: false, error: "Empty response" };
    }

    return { success: true, text: content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// ============================================================
// Helper Functions
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Estimate token count for a string (rough approximation)
 * ~4 characters per token on average for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to approximate token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) {
    return text;
  }
  return text.substring(0, estimatedChars) + "... [truncated]";
}
