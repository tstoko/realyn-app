/**
 * OpenAIProvider behaviour pinned via the SDK mock.
 *
 * Mocks the `openai` SDK so no network calls happen. The SDK mock
 * captures the request shape passed to `chat.completions.parse(...)`
 * and lets each test return a tailored fake completion.
 *
 * What we pin:
 *   - JSON Schema response format is attached on every structured call
 *   - System / user / image content shapes are wired through
 *   - Refusal payloads surface as `success: false` with the refusal
 *     reason on `error`
 *   - Response validation re-runs the zod schema (defence in depth)
 *   - Retry / backoff fires `opts.retries + 1` times before giving up
 *   - Telemetry is emitted when `options.telemetry` is supplied
 *   - Missing OPENAI_API_KEY short-circuits without a call
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// SDK mock — must be declared before importing OpenAIProvider
// ---------------------------------------------------------------------------

const parseMock = jest.fn();
const createMock = jest.fn();

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          parse: parseMock,
          create: createMock,
        },
      },
    })),
  };
});

// The zodResponseFormat helper is type-erased internally so we just
// need it to return a recognisable value the tests can assert against.
jest.mock("openai/helpers/zod", () => ({
  __esModule: true,
  zodResponseFormat: jest.fn((schema, name) => ({
    type: "json_schema",
    json_schema: { name, schema: { __test_marker: true } },
  })),
}));

import { OpenAIProvider } from "../providers/openai";
import { configureTelemetry, nullTelemetryEmitter } from "../../../telemetry";

const sampleSchema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

function freshProvider(): OpenAIProvider {
  return new OpenAIProvider();
}

describe("OpenAIProvider", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    parseMock.mockReset();
    createMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
    process.env.OPENAI_API_KEY = "sk-openai-test";
    configureTelemetry(nullTelemetryEmitter);
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    configureTelemetry(nullTelemetryEmitter);
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  test("isAvailable() is false and initError() is set when OPENAI_API_KEY missing", () => {
    delete process.env.OPENAI_API_KEY;
    const p = freshProvider();
    expect(p.isAvailable()).toBe(false);
    expect(p.initError()).toMatch(/OPENAI_API_KEY/);
  });

  test("isAvailable() is true once the key is set", () => {
    const p = freshProvider();
    expect(p.isAvailable()).toBe(true);
    expect(p.initError()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // call() — structured output happy path
  // -------------------------------------------------------------------------

  test("call() returns the parsed payload and the captured usage", async () => {
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: { answer: "yes", confidence: 0.9 },
            content: '{"answer":"yes","confidence":0.9}',
          },
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 34,
        total_tokens: 46,
      },
    });

    const result = await freshProvider().call("question?", sampleSchema);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ answer: "yes", confidence: 0.9 });
    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 34,
      totalTokens: 46,
    });

    const callArgs = parseMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: "system", content: expect.any(String) },
      { role: "user", content: "question?" },
    ]);
    expect(callArgs.response_format).toMatchObject({
      type: "json_schema",
    });
  });

  test("call() honours an explicit model override on options", async () => {
    parseMock.mockResolvedValueOnce({
      choices: [{ message: { parsed: { answer: "x", confidence: 1 } } }],
    });

    await freshProvider().call("p", sampleSchema, { model: "gpt-test-9000" });

    expect(parseMock.mock.calls[0][0].model).toBe("gpt-test-9000");
  });

  test("call() reads OPENAI_MODEL env var as the default model", async () => {
    process.env.OPENAI_MODEL = "gpt-env-override";
    parseMock.mockResolvedValueOnce({
      choices: [{ message: { parsed: { answer: "x", confidence: 1 } } }],
    });

    await freshProvider().call("p", sampleSchema);

    expect(parseMock.mock.calls[0][0].model).toBe("gpt-env-override");
  });

  // -------------------------------------------------------------------------
  // call() — defensive zod re-validation
  // -------------------------------------------------------------------------

  test("call() re-validates the SDK's parsed payload against the zod schema", async () => {
    // SDK returns a payload that DOESN'T satisfy the schema — answer is
    // a number, but the zod schema requires a string. Defence in depth
    // must catch this.
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: { answer: 42, confidence: 0.5 },
          },
        },
      ],
    });
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: { answer: 42, confidence: 0.5 },
          },
        },
      ],
    });
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: { answer: 42, confidence: 0.5 },
          },
        },
      ],
    });

    const result = await freshProvider().call("p", sampleSchema, {
      retries: 2,
      retryDelay: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/validation failed/i);
  });

  test("call() falls back to JSON-parsing message.content when message.parsed missing", async () => {
    // Older SDK versions / unusual cases: parsed is undefined, but
    // content carries the JSON payload.
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '{"answer":"from-content","confidence":0.7}',
          },
        },
      ],
    });

    const result = await freshProvider().call("p", sampleSchema);
    expect(result.success).toBe(true);
    expect(result.data?.answer).toBe("from-content");
  });

  test("call() surfaces refusal payloads as success: false", async () => {
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            refusal: "I cannot help with that request.",
          },
        },
      ],
    });
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            refusal: "I cannot help with that request.",
          },
        },
      ],
    });
    parseMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            refusal: "I cannot help with that request.",
          },
        },
      ],
    });

    const result = await freshProvider().call("p", sampleSchema, {
      retries: 2,
      retryDelay: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/refused/i);
  });

  // -------------------------------------------------------------------------
  // Retry behaviour
  // -------------------------------------------------------------------------

  test("call() retries on failure up to retries+1 times then gives up", async () => {
    parseMock
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockRejectedValueOnce(new Error("boom-3"));

    const result = await freshProvider().call("p", sampleSchema, {
      retries: 2,
      retryDelay: 1,
    });

    expect(result.success).toBe(false);
    expect(parseMock).toHaveBeenCalledTimes(3); // retries + 1
    expect(result.error).toMatch(/boom-3/);
  });

  test("call() returns on first success without burning further retries", async () => {
    parseMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        choices: [
          { message: { parsed: { answer: "ok", confidence: 1 } } },
        ],
      });

    const result = await freshProvider().call("p", sampleSchema, {
      retries: 2,
      retryDelay: 1,
    });

    expect(result.success).toBe(true);
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Telemetry
  // -------------------------------------------------------------------------

  test("call() emits telemetry when options.telemetry is supplied", async () => {
    parseMock.mockResolvedValueOnce({
      choices: [{ message: { parsed: { answer: "x", confidence: 1 } } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });
    const events: unknown[] = [];
    configureTelemetry({ emit: (e) => events.push(e) });

    await freshProvider().call("p", sampleSchema, {
      telemetry: { disputeId: "d_1", stage: "evidence_planning" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "llm_call",
      disputeId: "d_1",
      stage: "evidence_planning",
      success: true,
      tokensIn: 1,
      tokensOut: 2,
    });
  });

  // -------------------------------------------------------------------------
  // No-key short-circuit
  // -------------------------------------------------------------------------

  test("call() short-circuits when OPENAI_API_KEY missing — no SDK call", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await freshProvider().call("p", sampleSchema);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/OPENAI_API_KEY/);
    expect(parseMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Vision
  // -------------------------------------------------------------------------

  test("callWithVision() encodes images as image_url content parts", async () => {
    parseMock.mockResolvedValueOnce({
      choices: [{ message: { parsed: { answer: "I see a folio", confidence: 1 } } }],
    });

    await freshProvider().callWithVision("describe", sampleSchema, {
      images: [
        { url: "https://example.com/a.png", description: "page 1" },
        { url: "https://example.com/b.png" },
      ],
    });

    const userMessage = parseMock.mock.calls[0][0].messages[1];
    expect(userMessage.role).toBe("user");
    expect(userMessage.content).toEqual([
      { type: "text", text: "describe" },
      { type: "image_url", image_url: { url: "https://example.com/a.png" } },
      { type: "text", text: "[The above image is: page 1]" },
      { type: "image_url", image_url: { url: "https://example.com/b.png" } },
    ]);
  });

  // -------------------------------------------------------------------------
  // getTextCompletion
  // -------------------------------------------------------------------------

  test("getTextCompletion() returns the message content directly", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "plain answer" } }],
    });

    const result = await freshProvider().getTextCompletion("hi");
    expect(result).toEqual({ success: true, text: "plain answer" });
  });

  test("getTextCompletion() surfaces empty content as success: false", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "" } }],
    });

    const result = await freshProvider().getTextCompletion("hi");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });
});
