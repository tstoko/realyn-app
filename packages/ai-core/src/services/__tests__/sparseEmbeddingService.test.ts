/**
 * Tests for the sparse / lexical embedding service and the hybrid alpha
 * weighting helper.
 *
 * Pin the contract that:
 *   - Sparse embed returns `{ indices, values }` arrays in lockstep length.
 *   - Out-of-shape SDK responses collapse to `{ success: false, error }`
 *     rather than throwing.
 *   - `applyAlpha` scales dense by alpha and sparse by (1-alpha), preserving
 *     directions.
 *   - `applyAlpha` clamps alpha to [0, 1] so callers can't accidentally
 *     produce negative dense weighting (which would invert ranking).
 *   - alpha=1 produces zeroed sparse values (pure dense); alpha=0 produces
 *     zeroed dense values (pure sparse).
 */

import {
  _resetSparseEmbeddingClientForTests,
  applyAlpha,
  isSparseEmbeddingAvailable,
  sparseEmbedDocuments,
  sparseEmbedQuery,
  SPARSE_EMBEDDING_MODEL,
  type SparseVector,
} from "../sparseEmbeddingService";

describe("applyAlpha", () => {
  test("alpha=0.5 splits weight evenly between dense and sparse", () => {
    const out = applyAlpha([2, 4, 6], { indices: [1, 5], values: [10, 20] }, 0.5);
    expect(out.dense).toEqual([1, 2, 3]);
    expect(out.sparse.indices).toEqual([1, 5]);
    expect(out.sparse.values).toEqual([5, 10]);
  });

  test("alpha=1 zeroes sparse values (pure dense)", () => {
    const out = applyAlpha([1, 2, 3], { indices: [0, 1], values: [10, 20] }, 1);
    expect(out.dense).toEqual([1, 2, 3]);
    expect(out.sparse.values).toEqual([0, 0]);
    expect(out.sparse.indices).toEqual([0, 1]); // indices preserved
  });

  test("alpha=0 zeroes dense values (pure sparse)", () => {
    const out = applyAlpha([1, 2, 3], { indices: [0, 1], values: [10, 20] }, 0);
    expect(out.dense).toEqual([0, 0, 0]);
    expect(out.sparse.values).toEqual([10, 20]);
  });

  test("clamps alpha < 0 to 0", () => {
    const out = applyAlpha([1, 2], { indices: [0], values: [10] }, -0.5);
    expect(out.dense).toEqual([0, 0]);
    expect(out.sparse.values).toEqual([10]);
  });

  test("clamps alpha > 1 to 1", () => {
    const out = applyAlpha([1, 2], { indices: [0], values: [10] }, 1.5);
    expect(out.dense).toEqual([1, 2]);
    expect(out.sparse.values).toEqual([0]);
  });
});

describe("sparseEmbeddingService", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PINECONE_API_KEY: "pcsk-test" };
    _resetSparseEmbeddingClientForTests();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetSparseEmbeddingClientForTests();
    jest.restoreAllMocks();
  });

  test("isSparseEmbeddingAvailable depends on PINECONE_API_KEY", () => {
    expect(isSparseEmbeddingAvailable()).toBe(true);
    delete process.env.PINECONE_API_KEY;
    _resetSparseEmbeddingClientForTests();
    expect(isSparseEmbeddingAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pinecone Inference mock — inference.embed(...) returns sparse entries as
// either:
//   { vectorType: "sparse", sparseValues: number[], sparseIndices: number[] }
//   (SDK 7.x / 2025-10 inference API; what we hit in production)
// or:
//   { sparseValues: { indices: number[], values: number[] } }
//   (older SDK revs; kept for back-compat)
// Both shapes must produce the same internal { indices, values } SparseVector.
// ---------------------------------------------------------------------------

describe("sparseEmbedDocuments / sparseEmbedQuery via mocked Pinecone client", () => {
  const ORIGINAL_ENV = { ...process.env };

  function makeStubbedSdk(getEmbed: () => jest.Mock): void {
    jest.doMock("@pinecone-database/pinecone", () => ({
      Pinecone: jest.fn().mockImplementation(() => ({
        inference: { embed: getEmbed() },
      })),
    }));
  }

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PINECONE_API_KEY: "pcsk-test" };
    jest.resetModules();
    _resetSparseEmbeddingClientForTests();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetSparseEmbeddingClientForTests();
    jest.dontMock("@pinecone-database/pinecone");
    jest.restoreAllMocks();
  });

  test("happy path (SDK 7.x flat shape): sparseValues + sparseIndices arrays", async () => {
    // Pinecone SDK 7.x and the 2025-10 inference API return sparse embeddings
    // as two parallel flat arrays. This is the shape we hit in production.
    const embed = jest.fn(async () => ({
      data: [
        {
          vectorType: "sparse",
          sparseValues: [0.1, 0.5, 0.9],
          sparseIndices: [1, 5, 9],
          sparseTokens: ["visa", "chargeback", "10_4"],
        },
      ],
      usage: { totalTokens: 11 },
    }));
    makeStubbedSdk(() => embed);

    const { sparseEmbedQuery: q, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await q("Visa 10.4 chargeback");

    expect(r.success).toBe(true);
    expect(r.vector).toEqual({ indices: [1, 5, 9], values: [0.1, 0.5, 0.9] });
    expect(r.tokensUsed).toBe(11);
    expect(r.model).toBe(SPARSE_EMBEDDING_MODEL);

    expect(embed).toHaveBeenCalledTimes(1);
    const args = (embed.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(args.model).toBe(SPARSE_EMBEDDING_MODEL);
    expect(args.parameters.inputType).toBe("query");
  });

  test("happy path (legacy nested shape): sparseValues: { indices, values }", async () => {
    // Older Pinecone SDK revs nested the indices/values inside sparseValues.
    // We keep parsing that shape so old fixtures and rolled-back SDKs still
    // work.
    const embed = jest.fn(async () => ({
      data: [{ sparseValues: { indices: [1, 5, 9], values: [0.1, 0.5, 0.9] } }],
      usage: { totalTokens: 11 },
    }));
    makeStubbedSdk(() => embed);

    const { sparseEmbedQuery: q, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await q("Visa 10.4 chargeback");

    expect(r.success).toBe(true);
    expect(r.vector).toEqual({ indices: [1, 5, 9], values: [0.1, 0.5, 0.9] });
  });

  test("happy path: embeds documents with passage input type", async () => {
    const embed = jest.fn(async () => ({
      data: [
        {
          vectorType: "sparse",
          sparseValues: [0.1, 0.2],
          sparseIndices: [1, 2],
        },
        {
          vectorType: "sparse",
          sparseValues: [0.3, 0.4],
          sparseIndices: [3, 4],
        },
      ],
      usage: { totalTokens: 8 },
    }));
    makeStubbedSdk(() => embed);

    const { sparseEmbedDocuments: e, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await e(["t1", "t2"]);

    expect(r.success).toBe(true);
    expect(r.vectors).toHaveLength(2);
    const args = (embed.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(args.parameters.inputType).toBe("passage");
  });

  test("indices/values length mismatch collapses to success:false", async () => {
    const embed = jest.fn(async () => ({
      data: [
        {
          vectorType: "sparse",
          sparseValues: [0.1], // 1 value
          sparseIndices: [1, 2], // 2 indices — mismatch
        },
      ],
      usage: { totalTokens: 5 },
    }));
    makeStubbedSdk(() => embed);

    const { sparseEmbedQuery: q, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await q("anything");

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/length mismatch/);
  });

  test("malformed response (neither flat nor nested sparseValues) collapses to success:false", async () => {
    const embed = jest.fn(async () => ({
      data: [{ values: [0.1, 0.2] }], // dense response shape; should be sparse
      usage: { totalTokens: 5 },
    }));
    makeStubbedSdk(() => embed);

    const { sparseEmbedQuery: q, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await q("anything");

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unexpected sparse embedding response shape/);
  });

  test("empty input returns success without calling SDK", async () => {
    const embed = jest.fn();
    makeStubbedSdk(() => embed);

    const { sparseEmbedDocuments: e, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await e([]);

    expect(r.success).toBe(true);
    expect(r.vectors).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  test("missing PINECONE_API_KEY returns success:false without calling SDK", async () => {
    const embed = jest.fn();
    makeStubbedSdk(() => embed);

    delete process.env.PINECONE_API_KEY;
    const { sparseEmbedQuery: q, _resetSparseEmbeddingClientForTests: reset } = await import(
      "../sparseEmbeddingService"
    );
    reset();
    const r = await q("anything");

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/PINECONE_API_KEY/);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe("type re-exports", () => {
  test("SparseVector shape compiles", () => {
    const v: SparseVector = { indices: [1, 2, 3], values: [0.1, 0.2, 0.3] };
    expect(v.indices.length).toBe(v.values.length);
  });
});
