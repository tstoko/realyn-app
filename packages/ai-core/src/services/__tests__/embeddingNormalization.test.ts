/**
 * Tests for L2 normalisation of dense vectors.
 *
 * Schema-v2 Pinecone indexes use `metric: dotproduct` so dense + sparse
 * hybrid retrieval can share the same index. For dotproduct retrieval to
 * match cosine retrieval (which is what we actually want for sentence-style
 * embeddings), every dense vector must be L2-normalised at both upsert and
 * query time.
 *
 * These tests pin:
 *   - `l2Normalize` mathematics: output magnitude = 1, direction preserved.
 *   - `embedDocuments` / `embedQuery` always emit unit-length vectors,
 *     regardless of provider's raw output magnitude.
 *   - Zero vector edge case doesn't divide-by-zero.
 */

import {
  embedDocuments,
  embedQuery,
  l2Normalize,
  _resetEmbeddingClientForTests,
} from "../embeddingService";
import { _resetVoyageClientForTests } from "../voyageEmbeddingClient";

function magnitude(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

// Provider stubs — we want to verify that the public embedDocuments/Query
// surfaces normalise regardless of which provider produced the vector.
jest.mock("@pinecone-database/pinecone", () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    inference: {
      embed: jest.fn(async () => ({
        // Deliberately non-unit-length to verify normalisation kicks in.
        data: [{ values: [3, 4] }],
        usage: { totalTokens: 5 },
      })),
    },
  })),
}));

function installFetchStub(values: number[]) {
  (globalThis as any).fetch = jest.fn(async () =>
    new Response(
      JSON.stringify({
        object: "list",
        data: [{ object: "embedding", embedding: values, index: 0 }],
        model: "voyage-law-2",
        usage: { total_tokens: 5 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

describe("l2Normalize", () => {
  test("output magnitude is 1 for non-zero input", () => {
    const v = l2Normalize([3, 4]);
    expect(magnitude(v)).toBeCloseTo(1, 10);
    // Direction preserved: 3/5, 4/5
    expect(v[0]).toBeCloseTo(0.6, 10);
    expect(v[1]).toBeCloseTo(0.8, 10);
  });

  test("returns zero vector unchanged (no divide-by-zero)", () => {
    const v = l2Normalize([0, 0, 0]);
    expect(v).toEqual([0, 0, 0]);
  });

  test("preserves direction for arbitrary positive and negative components", () => {
    const v = l2Normalize([1, -2, 2]);
    expect(magnitude(v)).toBeCloseTo(1, 10);
    // Original magnitude is 3, so each component is divided by 3.
    expect(v[0]).toBeCloseTo(1 / 3, 10);
    expect(v[1]).toBeCloseTo(-2 / 3, 10);
    expect(v[2]).toBeCloseTo(2 / 3, 10);
  });

  test("preserves length", () => {
    const v = l2Normalize(new Array(1024).fill(0.5));
    expect(v).toHaveLength(1024);
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });
});

describe("embedDocuments / embedQuery emit unit-length vectors", () => {
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_FETCH = (globalThis as any).fetch;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      PINECONE_API_KEY: "pcsk-test",
      VOYAGE_API_KEY: "voyage-test",
    };
    _resetEmbeddingClientForTests();
    _resetVoyageClientForTests();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    (globalThis as any).fetch = ORIGINAL_FETCH;
    _resetVoyageClientForTests();
    jest.restoreAllMocks();
  });

  test("embedDocuments returns unit-length vectors via Voyage provider", async () => {
    // Voyage stub returns non-unit-length raw vector (magnitude 5)
    installFetchStub([3, 0, 4]);

    const result = await embedDocuments(["test"]);
    expect(result.success).toBe(true);
    expect(result.vectors).toHaveLength(1);
    expect(magnitude(result.vectors![0])).toBeCloseTo(1, 6);
  });

  test("embedQuery returns a unit-length vector via Voyage provider", async () => {
    installFetchStub([5, 0, 12]); // magnitude 13

    const result = await embedQuery("test");
    expect(result.success).toBe(true);
    expect(result.vector).toBeDefined();
    expect(magnitude(result.vector!)).toBeCloseTo(1, 6);
  });

  test("normalisation is a no-op for already-unit-length vectors (within float tolerance)", async () => {
    // Pre-normalise by hand to a known unit vector
    const unit = l2Normalize([1, 2, 3]);
    installFetchStub(unit);

    const result = await embedQuery("test");
    expect(result.success).toBe(true);
    // Each component matches within float precision; magnitude still 1.
    for (let i = 0; i < unit.length; i++) {
      expect(result.vector![i]).toBeCloseTo(unit[i], 10);
    }
    expect(magnitude(result.vector!)).toBeCloseTo(1, 6);
  });
});
