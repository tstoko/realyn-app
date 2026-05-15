/**
 * Tests for the rerank port + maybeRerank helper.
 *
 * Pin the contract that:
 *   - `RERANK_ENABLED` is opt-in: default unset / "false" / typos all stay
 *     OFF (mirror of the RAG_RETRIEVAL_ENABLED safety polarity, but inverted
 *     because rerank is a more invasive feature with vendor risk).
 *   - When enabled with a port configured, maybeRerank reorders chunks by
 *     port-returned scores and clips to topN.
 *   - Reranker scores replace upstream similarity scores so MIN_RELEVANCE_SCORE
 *     filtering downstream operates on the same scale.
 *   - When disabled, maybeRerank returns the input unchanged (clipped to topN).
 *   - When enabled but no port configured, maybeRerank returns the input
 *     unchanged AND emits a [rerank] warn.
 *   - When the port throws, maybeRerank falls back to input order. Never
 *     blocks the retrieval pipeline.
 *   - Out-of-bounds index entries from a misbehaving reranker are dropped
 *     defensively.
 */

import {
  _resetRerankPortForTests,
  configureRerankPort,
  getRerankPort,
  isRerankEnabled,
  maybeRerank,
  type RerankPort,
} from "../rerankService";
import { RAG_NAMESPACES, RAG_SCHEMA_VERSION, EMBEDDING_MODEL } from "../../config/ragConfig";
import type { RetrievedChunk } from "../../types/rag";

function chunk(id: string, score: number, text: string): RetrievedChunk {
  return {
    id,
    text,
    score,
    source: `src-${id}`,
    metadata: {
      namespace: RAG_NAMESPACES.rulebooks,
      schemaVersion: RAG_SCHEMA_VERSION,
      embeddingModel: EMBEDDING_MODEL,
      tokenCount: 100,
      indexedAt: "2026-04-15T00:00:00Z",
      text,
      chunkIndex: 0,
      source: `src-${id}`,
      network: "visa",
      documentName: "Visa Public Rules",
      documentVersion: "2024-04-15",
      reasonCodes: [],
    },
  };
}

describe("isRerankEnabled", () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test("defaults to OFF when RERANK_ENABLED is unset", () => {
    delete process.env.RERANK_ENABLED;
    expect(isRerankEnabled()).toBe(false);
  });

  test("only the literal string 'true' enables rerank", () => {
    process.env.RERANK_ENABLED = "true";
    expect(isRerankEnabled()).toBe(true);
  });

  test("malformed values (typos) leave rerank OFF", () => {
    for (const v of ["TRUE", "1", "yes", "on", "enabled", "false"]) {
      process.env.RERANK_ENABLED = v;
      expect(isRerankEnabled()).toBe(false);
    }
  });
});

describe("configureRerankPort / getRerankPort", () => {
  beforeEach(() => _resetRerankPortForTests());
  afterEach(() => _resetRerankPortForTests());

  test("getRerankPort returns null when nothing configured", () => {
    expect(getRerankPort()).toBeNull();
  });

  test("configureRerankPort registers the last-set port", () => {
    const portA: RerankPort = { rerank: jest.fn() };
    const portB: RerankPort = { rerank: jest.fn() };
    configureRerankPort(portA);
    expect(getRerankPort()).toBe(portA);
    configureRerankPort(portB);
    expect(getRerankPort()).toBe(portB);
  });
});

describe("maybeRerank", () => {
  const ORIGINAL_ENV = { ...process.env };
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetRerankPortForTests();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetRerankPortForTests();
    jest.restoreAllMocks();
  });

  test("empty chunks return immediately without calling the port", async () => {
    process.env.RERANK_ENABLED = "true";
    const port: RerankPort = { rerank: jest.fn() };
    configureRerankPort(port);
    const r = await maybeRerank({ query: "q", chunks: [], topN: 5 });
    expect(r).toEqual([]);
    expect(port.rerank).not.toHaveBeenCalled();
  });

  test("disabled: returns input order (clipped to topN), port never called", async () => {
    delete process.env.RERANK_ENABLED;
    const port: RerankPort = { rerank: jest.fn() };
    configureRerankPort(port);
    const input = [chunk("a", 0.9, "a"), chunk("b", 0.8, "b"), chunk("c", 0.7, "c")];
    const r = await maybeRerank({ query: "q", chunks: input, topN: 2 });
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
    expect(port.rerank).not.toHaveBeenCalled();
  });

  test("enabled but no port configured: returns input (clipped) and warns", async () => {
    process.env.RERANK_ENABLED = "true";
    const input = [chunk("a", 0.9, "a"), chunk("b", 0.8, "b")];
    const r = await maybeRerank({ query: "q", chunks: input, topN: 1 });
    expect(r.map((c) => c.id)).toEqual(["a"]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[rerank] enabled but no rerank port"));
  });

  test("enabled with port: reorders by reranker scores and clips to topN", async () => {
    process.env.RERANK_ENABLED = "true";
    // Hybrid order: a (0.9) > b (0.8) > c (0.7)
    // Reranker prefers c > a > b
    const port: RerankPort = {
      rerank: jest.fn().mockResolvedValue([
        { index: 2, score: 0.95 },
        { index: 0, score: 0.80 },
        { index: 1, score: 0.40 },
      ]),
    };
    configureRerankPort(port);

    const input = [chunk("a", 0.9, "a"), chunk("b", 0.8, "b"), chunk("c", 0.7, "c")];
    const r = await maybeRerank({ query: "q", chunks: input, topN: 2 });

    expect(r).toHaveLength(2);
    expect(r[0].id).toBe("c");
    expect(r[0].score).toBeCloseTo(0.95, 5);
    expect(r[1].id).toBe("a");
    expect(r[1].score).toBeCloseTo(0.80, 5);

    // Logs latency
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[rerank\] reranked 3 → 2 in \d+ms/));
  });

  test("reranker scores replace upstream similarity scores", async () => {
    process.env.RERANK_ENABLED = "true";
    const port: RerankPort = {
      rerank: jest.fn().mockResolvedValue([{ index: 0, score: 0.42 }]),
    };
    configureRerankPort(port);

    const input = [chunk("a", 0.95, "a")]; // upstream score 0.95
    const r = await maybeRerank({ query: "q", chunks: input, topN: 1 });

    expect(r[0].score).toBeCloseTo(0.42, 5); // replaced
    // Other chunk fields preserved
    expect(r[0].id).toBe("a");
    expect(r[0].text).toBe("a");
    expect(r[0].metadata).toEqual(input[0].metadata);
  });

  test("port throws: falls back to input order (clipped) and warns", async () => {
    process.env.RERANK_ENABLED = "true";
    const port: RerankPort = {
      rerank: jest.fn().mockRejectedValue(new Error("Pinecone rerank rate limit")),
    };
    configureRerankPort(port);

    const input = [chunk("a", 0.9, "a"), chunk("b", 0.8, "b"), chunk("c", 0.7, "c")];
    const r = await maybeRerank({ query: "q", chunks: input, topN: 2 });

    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
    // Original scores preserved (no replacement)
    expect(r[0].score).toBeCloseTo(0.9, 5);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[rerank] failed"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Pinecone rerank rate limit"));
  });

  test("out-of-bounds index entries from reranker are dropped defensively", async () => {
    process.env.RERANK_ENABLED = "true";
    const port: RerankPort = {
      rerank: jest.fn().mockResolvedValue([
        { index: 0, score: 0.9 },
        { index: 99, score: 0.8 }, // out of bounds — should be dropped
        { index: -1, score: 0.7 }, // negative — should be dropped
        { index: 1, score: 0.6 },
      ]),
    };
    configureRerankPort(port);

    const input = [chunk("a", 0.5, "a"), chunk("b", 0.5, "b")];
    const r = await maybeRerank({ query: "q", chunks: input, topN: 5 });

    expect(r).toHaveLength(2);
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
