/**
 * Provider selection contract for the LLM factory.
 *
 * The factory is the single source of truth for which provider runs
 * in this process. These tests pin: default selection, env-var
 * override, unknown-value fallback, memoisation, and the reset helper.
 */
import { AnthropicProvider } from "../providers/anthropic";
import { OpenAIProvider } from "../providers/openai";
import {
  _resetProviderForTests,
  getActiveLlmProviderName,
  getLlmProvider,
} from "../factory";

describe("LLM factory", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    _resetProviderForTests();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetProviderForTests();
    jest.restoreAllMocks();
  });

  test("defaults to OpenAI when LLM_PROVIDER is unset", () => {
    const provider = getLlmProvider();
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe("openai");
    expect(getActiveLlmProviderName()).toBe("openai");
  });

  test("returns Anthropic provider when LLM_PROVIDER=anthropic", () => {
    process.env.LLM_PROVIDER = "anthropic";
    const provider = getLlmProvider();
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe("anthropic");
  });

  test("returns OpenAI provider when LLM_PROVIDER=openai", () => {
    process.env.LLM_PROVIDER = "openai";
    const provider = getLlmProvider();
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  test("is case-insensitive and trims whitespace", () => {
    process.env.LLM_PROVIDER = "  ANTHROPIC  ";
    expect(getLlmProvider()).toBeInstanceOf(AnthropicProvider);
  });

  test("falls back to default on unknown LLM_PROVIDER value and warns", () => {
    process.env.LLM_PROVIDER = "cohere";
    const provider = getLlmProvider();
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/unknown llm_provider/i),
    );
  });

  test("memoises the provider across calls in the same process", () => {
    const a = getLlmProvider();
    const b = getLlmProvider();
    expect(a).toBe(b);
  });

  test("does NOT re-read LLM_PROVIDER after memoisation (must call reset)", () => {
    process.env.LLM_PROVIDER = "openai";
    const first = getLlmProvider();
    expect(first).toBeInstanceOf(OpenAIProvider);

    process.env.LLM_PROVIDER = "anthropic";
    const second = getLlmProvider();
    expect(second).toBe(first); // same instance, no re-resolution

    _resetProviderForTests();
    const third = getLlmProvider();
    expect(third).toBeInstanceOf(AnthropicProvider);
    expect(third).not.toBe(first);
  });

  test("active provider name is null until first resolution", () => {
    expect(getActiveLlmProviderName()).toBeNull();
    getLlmProvider();
    expect(getActiveLlmProviderName()).toBe("openai");
  });
});
