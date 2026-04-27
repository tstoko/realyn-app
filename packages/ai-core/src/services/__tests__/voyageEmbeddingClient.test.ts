/**
 * Tests for the Voyage AI embedding client.
 *
 * Pin the contract that:
 *   - The REST envelope matches Voyage's documented shape (model, input,
 *     input_type, Bearer auth).
 *   - `passage` (our internal vocabulary) maps to Voyage's `document`.
 *   - Batches respect `EMBED_BATCH_SIZE` (multiple POSTs for big inputs).
 *   - Out-of-order `index` fields in the response are reordered correctly.
 *   - Network errors, non-2xx responses, and shape mismatches all collapse
 *     to `{ success: false, error }` rather than throw.
 *   - Missing `VOYAGE_API_KEY` short-circuits to `success: false`.
 */

import {
  _resetVoyageClientForTests,
  voyageEmbed,
  isVoyageAvailable,
} from "../voyageEmbeddingClient";

function fakeFetch(
  body: unknown,
  init: { status?: number; throws?: Error } = {},
): { fn: jest.Mock; calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = jest.fn(async (url: string, fetchInit?: RequestInit) => {
    calls.push({ url, init: fetchInit });
    if (init.throws) throw init.throws;
    const status = init.status ?? 200;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn: fn as unknown as jest.Mock, calls };
}

describe("voyageEmbeddingClient", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, VOYAGE_API_KEY: "test-voyage-key" };
    _resetVoyageClientForTests();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetVoyageClientForTests();
    jest.restoreAllMocks();
  });

  test("isVoyageAvailable is true when VOYAGE_API_KEY is set", () => {
    expect(isVoyageAvailable()).toBe(true);
  });

  test("isVoyageAvailable is false when VOYAGE_API_KEY is missing", () => {
    delete process.env.VOYAGE_API_KEY;
    _resetVoyageClientForTests();
    expect(isVoyageAvailable()).toBe(false);
  });

  test("returns success:false when VOYAGE_API_KEY is missing without calling fetch", async () => {
    delete process.env.VOYAGE_API_KEY;
    _resetVoyageClientForTests();
    const { fn } = fakeFetch({});

    const r = await voyageEmbed(["hello"], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/VOYAGE_API_KEY/);
    expect(fn).not.toHaveBeenCalled();
  });

  test("happy path: embeds a single text and returns the vector", async () => {
    const expectedVec = new Array(1024).fill(0.01);
    const { fn, calls } = fakeFetch({
      object: "list",
      data: [{ object: "embedding", embedding: expectedVec, index: 0 }],
      model: "voyage-law-2",
      usage: { total_tokens: 7 },
    });

    const r = await voyageEmbed(["hello"], "voyage-law-2", "passage", fn as any);

    expect(r.success).toBe(true);
    expect(r.vectors).toHaveLength(1);
    expect(r.vectors![0]).toEqual(expectedVec);
    expect(r.tokensUsed).toBe(7);
    expect(r.dim).toBe(1024);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.voyageai.com/v1/embeddings");
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.model).toBe("voyage-law-2");
    expect(body.input).toEqual(["hello"]);
    expect(body.input_type).toBe("document");

    const headers = calls[0].init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-voyage-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("input type 'query' maps to Voyage's 'query'", async () => {
    const { fn, calls } = fakeFetch({
      object: "list",
      data: [{ object: "embedding", embedding: new Array(1024).fill(0), index: 0 }],
      model: "voyage-law-2",
    });

    await voyageEmbed(["q"], "voyage-law-2", "query", fn as any);
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.input_type).toBe("query");
  });

  test("empty input returns success without calling fetch", async () => {
    const { fn } = fakeFetch({});
    const r = await voyageEmbed([], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(true);
    expect(r.vectors).toEqual([]);
    expect(r.tokensUsed).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });

  test("batches inputs at EMBED_BATCH_SIZE", async () => {
    // Build 130 inputs; with EMBED_BATCH_SIZE=64 expect 3 POSTs (64, 64, 2).
    const inputs = Array.from({ length: 130 }, (_, i) => `t${i}`);

    let callCount = 0;
    const fn = jest.fn(async (_url: string, fetchInit?: RequestInit) => {
      callCount++;
      const batch = JSON.parse(fetchInit!.body as string).input as string[];
      const data = batch.map((_, i) => ({
        object: "embedding",
        embedding: new Array(1024).fill(0.001 * callCount),
        index: i,
      }));
      return new Response(
        JSON.stringify({ object: "list", data, model: "voyage-law-2", usage: { total_tokens: batch.length } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const r = await voyageEmbed(inputs, "voyage-law-2", "passage", fn as unknown as typeof fetch);
    expect(r.success).toBe(true);
    expect(r.vectors).toHaveLength(130);
    expect(callCount).toBe(3);
    expect(r.tokensUsed).toBe(130);
  });

  test("reorders embeddings by row.index when API returns out of order", async () => {
    const v0 = new Array(1024).fill(0.1);
    const v1 = new Array(1024).fill(0.2);
    const v2 = new Array(1024).fill(0.3);
    // Return rows out of order (2, 0, 1) — the client must place them in
    // input order (0, 1, 2).
    const { fn } = fakeFetch({
      object: "list",
      data: [
        { object: "embedding", embedding: v2, index: 2 },
        { object: "embedding", embedding: v0, index: 0 },
        { object: "embedding", embedding: v1, index: 1 },
      ],
      model: "voyage-law-2",
    });

    const r = await voyageEmbed(["a", "b", "c"], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(true);
    expect(r.vectors![0]).toEqual(v0);
    expect(r.vectors![1]).toEqual(v1);
    expect(r.vectors![2]).toEqual(v2);
  });

  test("non-2xx response collapses to success:false with the status in the error", async () => {
    const { fn } = fakeFetch("rate limited", { status: 429 });
    const r = await voyageEmbed(["x"], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/429/);
    expect(r.error).toMatch(/rate limited/);
  });

  test("network error collapses to success:false", async () => {
    const { fn } = fakeFetch({}, { throws: new Error("ECONNRESET") });
    const r = await voyageEmbed(["x"], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/ECONNRESET/);
  });

  test("response shape mismatch collapses to success:false", async () => {
    const { fn } = fakeFetch({
      object: "list",
      data: [], // expected 1, got 0
      model: "voyage-law-2",
    });
    const r = await voyageEmbed(["x"], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/shape mismatch/);
  });

  test("malformed row.index collapses to success:false", async () => {
    const { fn } = fakeFetch({
      object: "list",
      data: [{ object: "embedding", embedding: new Array(1024).fill(0), index: 99 }],
      model: "voyage-law-2",
    });
    const r = await voyageEmbed(["x"], "voyage-law-2", "passage", fn as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/malformed/);
  });
});
