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

function magnitude(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

// Pinecone Inference mock with controllable raw output. Tests set
// `nextRawVectors` to inject non-unit-length vectors so we can verify the
// public embedDocuments/embedQuery surfaces always emit normalised output.
let nextRawVectors: number[][] = [[3, 4]]; // default magnitude 5 (3²+4² = 25)

jest.mock("@pinecone-database/pinecone", () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    inference: {
      embed: jest.fn(async () => ({
        data: nextRawVectors.map((values) => ({ values })),
        usage: { totalTokens: 5 },
      })),
    },
  })),
}));

function setRawVectors(values: number[][]) {
  nextRawVectors = values;
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

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PINECONE_API_KEY: "pcsk-test" };
    setRawVectors([[3, 4]]); // reset to default magnitude-5 vector
    _resetEmbeddingClientForTests();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test("embedDocuments returns unit-length vectors when provider raw output is not unit length", async () => {
    setRawVectors([[3, 0, 4]]); // raw magnitude 5
    const result = await embedDocuments(["test"]);
    expect(result.success).toBe(true);
    expect(result.vectors).toHaveLength(1);
    expect(magnitude(result.vectors![0])).toBeCloseTo(1, 6);
  });

  test("embedQuery returns a unit-length vector", async () => {
    setRawVectors([[5, 0, 12]]); // raw magnitude 13
    const result = await embedQuery("test");
    expect(result.success).toBe(true);
    expect(result.vector).toBeDefined();
    expect(magnitude(result.vector!)).toBeCloseTo(1, 6);
  });

  test("normalisation is a no-op for already-unit-length vectors (within float tolerance)", async () => {
    const unit = l2Normalize([1, 2, 3]);
    setRawVectors([unit]);

    const result = await embedQuery("test");
    expect(result.success).toBe(true);
    for (let i = 0; i < unit.length; i++) {
      expect(result.vector![i]).toBeCloseTo(unit[i], 10);
    }
    expect(magnitude(result.vector!)).toBeCloseTo(1, 6);
  });

  test("embedDocuments normalises every vector in a multi-text batch", async () => {
    setRawVectors([
      [3, 0, 4],   // mag 5
      [0, 5, 12],  // mag 13
      [1, 1, 1],   // mag √3
    ]);
    const result = await embedDocuments(["a", "b", "c"]);
    expect(result.success).toBe(true);
    expect(result.vectors).toHaveLength(3);
    for (const v of result.vectors!) {
      expect(magnitude(v)).toBeCloseTo(1, 6);
    }
  });
});
