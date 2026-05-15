/**
 * Tests for the RAG prompt-injection helper.
 *
 * The helper is the single source of truth for how scheme-rulebook RAG
 * context is shaped into specialist prompts. These tests pin its observable
 * behaviour:
 *
 *   - Feature-flag gate (`RAG_RETRIEVAL_ENABLED=false`) collapses to empty.
 *   - Empty queries collapse to empty without calling the vector store.
 *   - Vector-store errors collapse to empty (fail-safe contract).
 *   - Healthy retrieval returns chunks ranked by score and exposes the top.
 *   - The reference-material block format is stable: heading + per-chunk
 *     numbered sources separated by `---`.
 *   - The query-builder is PII-free and includes the right deterministic
 *     dispute facts.
 */

import {
  buildReferenceMaterialBlock,
  buildRulebookRetrievalQuery,
  isRagRetrievalEnabled,
  lookupReasonCodeDescription,
  retrieveRulebookForPrompt,
} from "../ragPromptInjection";
import {
  _resetVectorStoreForTests,
  configureVectorStore,
  type VectorStorePort,
  type VectorMatch,
} from "../ragService";
import { _resetEmbeddingClientForTests } from "../embeddingService";
import { _resetSparseEmbeddingClientForTests } from "../sparseEmbeddingService";
import { RAG_NAMESPACES, RAG_SCHEMA_VERSION, EMBEDDING_MODEL } from "../../config/ragConfig";
import type { DisputeCase } from "../../types/aiDispute";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildDispute(overrides: Partial<DisputeCase> = {}): DisputeCase {
  return {
    disputeId: "disp_test_1",
    organizationId: "org_test",
    pspProvider: "stripe",
    pspReasonCode: "10.4",
    amount: 25000,
    currency: "usd",
    reason: "fraudulent",
    customerExplanation: "I never made this charge",
    transactionDate: "2026-04-01",
    respondByDate: "2026-04-30",
    merchantVertical: "hospitality",
    ...overrides,
  };
}

function fakeMatch(
  id: string,
  score: number,
  text: string,
  source: string,
  network: "visa" | "mastercard" = "visa",
): VectorMatch {
  return {
    id,
    score,
    metadata: {
      namespace: RAG_NAMESPACES.rulebooks,
      schemaVersion: RAG_SCHEMA_VERSION,
      embeddingModel: EMBEDDING_MODEL,
      tokenCount: 100,
      indexedAt: "2026-04-15T00:00:00Z",
      text,
      chunkIndex: 0,
      source,
      network,
      documentName: network === "visa" ? "Visa Public Rules" : "MC Chargeback Guide",
      documentVersion: "2024-04-15",
      reasonCodes: [],
    },
  };
}

function makeStore(matches: VectorMatch[]): VectorStorePort {
  return {
    query: jest.fn(async () => matches),
  };
}

function makeFailingStore(message: string): VectorStorePort {
  return {
    query: jest.fn(async () => {
      throw new Error(message);
    }),
  };
}

// ---------------------------------------------------------------------------
// Stub the dense-embedding path. Both providers live behind embedQuery; the
// `EMBEDDING_PROVIDER` constant decides which is hit at runtime, and we stub
// both so swapping the provider in `ragConfig.ts` doesn't break this suite.
// ---------------------------------------------------------------------------

// Pinecone Inference mock — handles both the dense embed call (e5-large /
// any model returning a dense `values` array) and the sparse embed call
// (pinecone-sparse-english-v0 returning a `sparseValues` object). Routing
// keys off the `model` field of the request so the same mock services both
// providers without test churn.
jest.mock("@pinecone-database/pinecone", () => {
  return {
    Pinecone: jest.fn().mockImplementation(() => ({
      inference: {
        embed: jest.fn(async (req: { model: string; inputs: string[] }) => {
          const isSparse = req.model.includes("sparse");
          if (isSparse) {
            return {
              data: req.inputs.map(() => ({
                sparseValues: { indices: [1, 7, 42], values: [0.4, 0.3, 0.2] },
              })),
              usage: { totalTokens: 7 },
            };
          }
          return {
            data: req.inputs.map(() => ({ values: new Array(1024).fill(0.01) })),
            usage: { totalTokens: 5 },
          };
        }),
      },
    })),
  };
});


// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("ragPromptInjection", () => {
  const ORIGINAL_ENV = { ...process.env };
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PINECONE_API_KEY: "test-pinecone-key" };
    delete process.env.RAG_RETRIEVAL_ENABLED;
    _resetVectorStoreForTests();
    _resetEmbeddingClientForTests();
    _resetSparseEmbeddingClientForTests();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetVectorStoreForTests();
    _resetEmbeddingClientForTests();
    _resetSparseEmbeddingClientForTests();
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // isRagRetrievalEnabled
  // -------------------------------------------------------------------------

  describe("isRagRetrievalEnabled", () => {
    test("defaults to enabled when env var unset", () => {
      delete process.env.RAG_RETRIEVAL_ENABLED;
      expect(isRagRetrievalEnabled()).toBe(true);
    });

    test("only the literal string 'false' disables retrieval", () => {
      process.env.RAG_RETRIEVAL_ENABLED = "false";
      expect(isRagRetrievalEnabled()).toBe(false);
    });

    test("malformed values (typos) leave RAG enabled", () => {
      for (const value of ["FALSE", "no", "0", "off", "disabled"]) {
        process.env.RAG_RETRIEVAL_ENABLED = value;
        expect(isRagRetrievalEnabled()).toBe(true);
      }
    });

    test("'true' enables retrieval", () => {
      process.env.RAG_RETRIEVAL_ENABLED = "true";
      expect(isRagRetrievalEnabled()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // buildRulebookRetrievalQuery
  // -------------------------------------------------------------------------

  describe("buildRulebookRetrievalQuery", () => {
    test("includes network, code, description, amount, vertical", () => {
      const q = buildRulebookRetrievalQuery(
        buildDispute({ pspReasonCode: "10.4", amount: 25000, currency: "usd" }),
        "Cardholder claims CNP transaction was unauthorized",
      );
      expect(q).toContain("Network");
      expect(q).toContain("10.4");
      expect(q).toContain("Cardholder claims CNP");
      expect(q).toContain("250.00 USD");
      expect(q).toContain("hospitality");
    });

    test("does not leak PII (cardholder name, email, free-form claim)", () => {
      const q = buildRulebookRetrievalQuery(
        buildDispute({
          guest: { firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
          customerExplanation: "I never made this charge — Alice Smith",
        }),
      );
      expect(q).not.toContain("Alice");
      expect(q).not.toContain("Smith");
      expect(q).not.toContain("@example.com");
      expect(q).not.toContain("never made this charge");
    });

    test("returns empty string when both code and network are missing", () => {
      const q = buildRulebookRetrievalQuery(
        buildDispute({ pspReasonCode: undefined, reason: null, amount: 0, currency: "" }),
      );
      expect(q).toBe("");
    });

    test("network detection works for stripe English reasons via mapping", () => {
      const q = buildRulebookRetrievalQuery(
        buildDispute({ pspProvider: "stripe", pspReasonCode: "fraudulent", reason: "fraudulent" }),
      );
      // Stripe 'fraudulent' maps to 10.4 → visa
      expect(q.toLowerCase()).toContain("network visa");
    });
  });

  // -------------------------------------------------------------------------
  // lookupReasonCodeDescription
  // -------------------------------------------------------------------------

  describe("lookupReasonCodeDescription", () => {
    test("returns the static description for a known code", () => {
      const d = lookupReasonCodeDescription(buildDispute({ pspReasonCode: "10.4" }));
      expect(d).toContain("CNP");
    });

    test("returns undefined for unknown codes", () => {
      const d = lookupReasonCodeDescription(buildDispute({ pspReasonCode: "999.99", reason: null }));
      expect(d).toBeUndefined();
    });

    test("maps stripe English reasons through to a known code", () => {
      const d = lookupReasonCodeDescription(
        buildDispute({ pspProvider: "stripe", pspReasonCode: "fraudulent", reason: "fraudulent" }),
      );
      expect(typeof d).toBe("string");
      expect(d!.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // buildReferenceMaterialBlock
  // -------------------------------------------------------------------------

  describe("buildReferenceMaterialBlock", () => {
    test("returns empty string when no chunks", () => {
      expect(buildReferenceMaterialBlock([])).toBe("");
    });

    test("renders heading + numbered sources separated by ---", () => {
      const block = buildReferenceMaterialBlock([
        {
          id: "1",
          text: "First chunk text.",
          score: 0.9,
          source: "Visa Public Rules v2024, §10.4",
          metadata: {} as any,
        },
        {
          id: "2",
          text: "Second chunk text.",
          score: 0.8,
          source: "MC Chargeback Guide v2024, Ch. 7",
          metadata: {} as any,
        },
      ]);
      expect(block).toContain("## REFERENCE MATERIAL");
      expect(block).toContain("[1] Visa Public Rules v2024, §10.4");
      expect(block).toContain("First chunk text.");
      expect(block).toContain("[2] MC Chargeback Guide v2024, Ch. 7");
      expect(block).toContain("Second chunk text.");
      expect(block).toContain("---");
    });

    test("instructs the model not to invent rule text", () => {
      const block = buildReferenceMaterialBlock([
        {
          id: "1",
          text: "Some rule.",
          score: 0.9,
          source: "X",
          metadata: {} as any,
        },
      ]);
      expect(block.toLowerCase()).toContain("authoritative");
      expect(block.toLowerCase()).toMatch(/cite|section/);
    });
  });

  // -------------------------------------------------------------------------
  // retrieveRulebookForPrompt — feature flag + fail-safe contract
  // -------------------------------------------------------------------------

  describe("retrieveRulebookForPrompt", () => {
    test("returns disabled empty result when feature flag is off", async () => {
      process.env.RAG_RETRIEVAL_ENABLED = "false";
      const store = makeStore([]);
      configureVectorStore(store);

      const result = await retrieveRulebookForPrompt({
        disputeCase: buildDispute(),
        stage: "evidence_planning",
      });

      expect(result.disabled).toBe(true);
      expect(result.chunks).toEqual([]);
      expect(result.topScore).toBe(0);
      expect(store.query).not.toHaveBeenCalled();
    });

    test("returns empty when query text would be empty (no code, no network)", async () => {
      const store = makeStore([fakeMatch("a", 0.9, "x", "y")]);
      configureVectorStore(store);

      const result = await retrieveRulebookForPrompt({
        disputeCase: buildDispute({ pspReasonCode: undefined, reason: null, amount: 0, currency: "" }),
        stage: "evidence_planning",
      });

      expect(result.chunks).toEqual([]);
      expect(result.disabled).toBe(false);
      expect(store.query).not.toHaveBeenCalled();
    });

    test("collapses to empty result when vector store throws (fail-safe)", async () => {
      configureVectorStore(makeFailingStore("Pinecone exploded"));

      const result = await retrieveRulebookForPrompt({
        disputeCase: buildDispute(),
        stage: "argument_generation",
      });

      expect(result.chunks).toEqual([]);
      expect(result.topScore).toBe(0);
      expect(result.disabled).toBe(false);
    });

    test("returns chunks above MIN_RELEVANCE_SCORE with correct topScore", async () => {
      const store = makeStore([
        fakeMatch("hi", 0.92, "Top match text.", "Visa Public Rules, §10.4"),
        fakeMatch("mid", 0.55, "Lesser match text.", "Visa Public Rules, §10.4"),
        fakeMatch("low", 0.10, "Below threshold.", "Visa Public Rules, §X"),
      ]);
      configureVectorStore(store);

      const result = await retrieveRulebookForPrompt({
        disputeCase: buildDispute(),
        stage: "evidence_planning",
      });

      expect(result.disabled).toBe(false);
      // Default MIN_RELEVANCE_SCORE is 0.35 — third match drops out
      expect(result.chunks.length).toBe(2);
      expect(result.topScore).toBeCloseTo(0.92, 5);
      expect(result.chunks[0].score).toBeCloseTo(0.92, 5);
    });

    test("passes a network filter when network can be inferred", async () => {
      const queryFn: jest.Mock = jest.fn(async () => [] as VectorMatch[]);
      const store: VectorStorePort = { query: queryFn };
      configureVectorStore(store);

      await retrieveRulebookForPrompt({
        disputeCase: buildDispute({ pspReasonCode: "10.4" }),
        stage: "evidence_planning",
      });

      expect(queryFn).toHaveBeenCalledTimes(1);
      const call = queryFn.mock.calls[0][0];
      expect(call.namespace).toBe(RAG_NAMESPACES.rulebooks);
      expect(call.filter).toEqual({ network: { $eq: "visa" } });
    });

    test("forwards a sparseVector to the store when both dense and sparse embed succeed", async () => {
      const queryFn: jest.Mock = jest.fn(async () => [] as VectorMatch[]);
      configureVectorStore({ query: queryFn });

      // Default fetch + Pinecone stubs from beforeEach return non-empty embeddings,
      // so the hybrid path should fire.
      await retrieveRulebookForPrompt({
        disputeCase: buildDispute({ pspReasonCode: "10.4" }),
        stage: "evidence_planning",
      });

      expect(queryFn).toHaveBeenCalledTimes(1);
      const call = queryFn.mock.calls[0][0];
      expect(call.sparseVector).toBeDefined();
      expect(Array.isArray(call.sparseVector!.indices)).toBe(true);
      expect(Array.isArray(call.sparseVector!.values)).toBe(true);
      expect(call.sparseVector!.indices.length).toBe(call.sparseVector!.values.length);
      // Dense vector also present
      expect(Array.isArray(call.vector)).toBe(true);
      expect(call.vector.length).toBeGreaterThan(0);
    });

    test("emits a structured [rag] log line on success", async () => {
      configureVectorStore(makeStore([fakeMatch("hi", 0.91, "x", "src")]));

      await retrieveRulebookForPrompt({
        disputeCase: buildDispute({ disputeId: "abc123" }),
        stage: "argument_generation",
      });

      const matched = logSpy.mock.calls.find(
        (args) =>
          typeof args[0] === "string" &&
          args[0].includes("[rag]") &&
          args[0].includes("abc123") &&
          args[0].includes("argument_generation") &&
          args[0].includes("status=ok"),
      );
      expect(matched).toBeDefined();
    });
  });
});
