/**
 * Thin re-export of the shared embedding service.
 *
 * All logic lives in `@realyn/ai-core/services/embeddingService`. This file
 * exists so functions-layer consumers have a consistent local import path
 * that mirrors `llmService.ts`.
 */

export * from "@realyn/ai-core/services/embeddingService";
