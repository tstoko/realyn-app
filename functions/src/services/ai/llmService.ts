import OpenAI from "openai";
import { z } from "zod";

// ============================================================
// LLM Service - Generic OpenAI Integration
// ============================================================

// Initialize OpenAI client
// API key is loaded from environment variable OPENAI_API_KEY
let openaiClient: OpenAI | null = null;
let clientInitError: string | null = null;

/**
 * Get or initialize the OpenAI client
 * Returns null if initialization fails (API key missing, etc.)
 */
function getOpenAIClient(): OpenAI | null {
  // If we already tried and failed, return null immediately
  if (clientInitError) {
    return null;
  }
  
  if (!openaiClient) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        clientInitError = "OPENAI_API_KEY environment variable is not set";
        console.warn(`OpenAI client initialization failed: ${clientInitError}`);
        return null;
      }
      openaiClient = new OpenAI({ apiKey });
    } catch (error) {
      clientInitError = error instanceof Error ? error.message : String(error);
      console.warn(`OpenAI client initialization failed: ${clientInitError}`);
      return null;
    }
  }
  return openaiClient;
}

/**
 * Check if OpenAI client is available
 */
export function isOpenAIAvailable(): boolean {
  return getOpenAIClient() !== null;
}

/**
 * Get the initialization error if any
 */
export function getOpenAIInitError(): string | null {
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

/**
 * Image input for vision-enabled LLM calls
 */
export interface ImageInput {
  url: string;
  description?: string;
}

/**
 * Options for vision-enabled LLM calls
 */
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

// Default options - using GPT-5.2 for professional-grade output
const DEFAULT_OPTIONS: Required<LLMCallOptions> = {
  model: "gpt-5.2",
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
 * Call OpenAI API with structured JSON output and Zod validation
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
  
  // Check if client is available before attempting calls
  const client = getOpenAIClient();
  if (!client) {
    const initError = getOpenAIInitError() || "OpenAI client not available";
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
      const response = await client.chat.completions.create({
        model: opts.model,
        temperature: opts.temperature,
        max_completion_tokens: opts.maxTokens, // GPT-5.2 uses max_completion_tokens
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: opts.systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      rawResponse = content || undefined;

      if (!content) {
        throw new Error("Empty response from OpenAI");
      }

      // Parse JSON response
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}...`);
      }

      // Validate with Zod schema
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
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`LLM call attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < opts.retries) {
        await sleep(opts.retryDelay * (attempt + 1)); // Exponential backoff
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
 * Call OpenAI API with vision capabilities - can process images
 * Uses GPT-5.2's native multimodal support for document analysis
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

  const client = getOpenAIClient();
  if (!client) {
    const initError = getOpenAIInitError() || "OpenAI client not available";
    console.warn(`LLM vision call skipped: ${initError}. Fallback will be used.`);
    return {
      success: false,
      error: initError,
    };
  }

  // Build content array with text and images
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" | "low" | "auto" } }
  > = [{ type: "text", text: prompt }];

  // Add images to the content
  for (const image of images) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: image.url,
        detail: "high", // Use high detail for document analysis
      },
    });

    // Add image description if provided
    if (image.description) {
      userContent.push({
        type: "text",
        text: `[The above image is: ${image.description}]`,
      });
    }
  }

  let lastError: Error | null = null;
  let rawResponse: string | undefined;

  console.log(`[Vision API] Calling OpenAI with model: ${opts.model}, ${images.length} images`);

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: opts.model,
        temperature: opts.temperature,
        max_completion_tokens: opts.maxTokens, // GPT-5.2 uses max_completion_tokens
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: opts.systemPrompt,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      });

      console.log(`[Vision API] Response received, model used: ${response.model || 'not specified'}`);

      const content = response.choices[0]?.message?.content;
      rawResponse = content || undefined;

      if (!content) {
        throw new Error("Empty response from OpenAI");
      }

      // Parse JSON response
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}...`);
      }

      // Validate with Zod schema
      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        const errors = validated.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        throw new Error(`Response validation failed: ${errors}`);
      }

      // Log if parsed JSON includes a model field (vision function)
      if ((parsed as any)?.model) {
        console.log(`[Vision API] WARNING: Parsed JSON includes model field: ${(parsed as any).model}`);
      }

      return {
        success: true,
        data: validated.data,
        rawResponse,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
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
  // Replace template variables
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
  
  // Check if client is available
  const client = getOpenAIClient();
  if (!client) {
    const initError = getOpenAIInitError() || "OpenAI client not available";
    return { success: false, error: initError };
  }

  try {
    const response = await client.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature,
      max_completion_tokens: opts.maxTokens, // GPT-5.2 uses max_completion_tokens
      messages: [
        {
          role: "system",
          content: opts.systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
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

