import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import type { LlmProvider, LlmProviderName } from "./types";

/**
 * LLM provider selection.
 *
 * The active provider is chosen by the `LLM_PROVIDER` env var. Default
 * is `"openai"` — the rollout target after the Anthropic credit-block
 * incident (2026-05). Set `LLM_PROVIDER=anthropic` on a function to
 * route that function's traffic back to Claude without redeploying.
 *
 * Provider instances are memoised per-process so each Cloud Function
 * worker keeps a single SDK client (matches the pre-abstraction
 * behaviour where `llmService.ts` cached the Anthropic client at
 * module scope).
 *
 * IMPORTANT: there is no silent cross-provider fallback. If
 * `LLM_PROVIDER=openai` but `OPENAI_API_KEY` is missing, the call
 * returns `{ success: false, error: "...API_KEY environment variable is
 * not set" }` — the same `success: false` signal the pre-abstraction
 * pipeline already handled via deterministic fallbacks. Pretending the
 * config is right by silently using a different provider would mask
 * real misconfiguration in prod.
 */

let cachedProvider: LlmProvider | null = null;
let cachedProviderName: LlmProviderName | null = null;

const DEFAULT_PROVIDER: LlmProviderName = "openai";

function resolveProviderName(): LlmProviderName {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "openai" || raw === "anthropic") return raw;
  if (raw && raw.length > 0) {
    console.warn(
      `Unknown LLM_PROVIDER="${raw}" — falling back to default "${DEFAULT_PROVIDER}". ` +
        `Valid values: "openai", "anthropic".`,
    );
  }
  return DEFAULT_PROVIDER;
}

function buildProvider(name: LlmProviderName): LlmProvider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
  }
}

/**
 * Returns the active provider for this process. Memoised — re-reading
 * the env var on every call would defeat the SDK client caching that
 * keeps Cloud Functions warm.
 *
 * Call `_resetProviderForTests()` from test setup to force a fresh
 * resolution after mutating env vars.
 */
export function getLlmProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider;

  const name = resolveProviderName();
  cachedProvider = buildProvider(name);
  cachedProviderName = name;
  console.log(`[llm] provider=${name}`);
  return cachedProvider;
}

/**
 * Name of the currently-active provider, after the first call to
 * `getLlmProvider()`. Used by telemetry and logs to attribute calls.
 * Returns `null` if no provider has been resolved yet.
 */
export function getActiveLlmProviderName(): LlmProviderName | null {
  return cachedProviderName;
}

/**
 * Reset the memoised provider. Test-only — production code MUST NOT
 * call this, since it forces every subsequent call to re-allocate an
 * SDK client.
 */
export function _resetProviderForTests(): void {
  cachedProvider = null;
  cachedProviderName = null;
}
