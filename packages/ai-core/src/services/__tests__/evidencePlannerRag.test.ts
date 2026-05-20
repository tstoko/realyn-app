/**
 * Integration test for `generateEvidencePlan` ↔ RAG wiring.
 *
 * Black-box behaviour pinned here:
 *
 *   1. When the configured vector store returns rulebook chunks, the prompt
 *      sent to the LLM contains a `## REFERENCE MATERIAL` section.
 *   2. When the store returns no chunks (e.g. empty index, low scores, RAG
 *      disabled, retrieval error), the prompt does NOT contain the section
 *      and the deterministic pipeline output is identical.
 *
 * Both cases use a fake LLM so we don't make network calls. The fake captures
 * the prompt for assertions and returns a minimal valid evidence plan.
 */

import {
  configureVectorStore,
  _resetVectorStoreForTests,
  type VectorMatch,
  type VectorStorePort,
} from "../ragService";
import { _resetEmbeddingClientForTests } from "../embeddingService";
import { _resetSparseEmbeddingClientForTests } from "../sparseEmbeddingService";
import { generateEvidencePlan } from "../evidencePlanner";
import { RAG_NAMESPACES, RAG_SCHEMA_VERSION, EMBEDDING_MODEL } from "../../config/ragConfig";
import type { DisputeCase, EvidencePlan } from "../../types/aiDispute";

// ---------------------------------------------------------------------------
// LLM client mock — capture prompts, return a valid plan
// ---------------------------------------------------------------------------

const capturedPrompts: string[] = [];

jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(async (params: any) => {
          const userMessage = params.messages[0];
          const promptText =
            typeof userMessage.content === "string"
              ? userMessage.content
              : userMessage.content
                  .filter((c: any) => c.type === "text")
                  .map((c: any) => c.text)
                  .join("\n");
          capturedPrompts.push(promptText);

          const plan: EvidencePlan = {
            disputeCategory: "Consumer Dispute",
            disputeSubtype: "Service Not Received",
            recommendation: "fight",
            winnability: "medium",
            winnabilityReason: "Sufficient evidence likely available",
            summary: "Hotel stay dispute. Evidence available.",
            requirements: [
              {
                id: "req-1",
                category: "pms_data",
                label: "Reservation Folio",
                description: "Folio with charges and dates",
                example: "Folio export",
                sourceHint: "PMS",
                instructions: "Export folio from PMS for the stay dates.",
                required: true,
                priority: 1,
              },
            ],
          };
          return {
            content: [{ type: "text", text: JSON.stringify(plan) }],
            usage: { input_tokens: 100, output_tokens: 200 },
          };
        }),
      },
    })),
  };
});

// Pinecone Inference is stubbed via the @pinecone-database/pinecone module
// mock so dense + sparse embed calls don't reach the network. The mock
// routes by request `model` so the same fake services both the dense
// `multilingual-e5-large` calls and the sparse `pinecone-sparse-english-v0`
// calls.
jest.mock("@pinecone-database/pinecone", () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    inference: {
      embed: jest.fn(async (req: { model: string; inputs: string[] }) => {
        const isSparse = req.model.includes("sparse");
        if (isSparse) {
          return {
            data: req.inputs.map(() => ({
              sparseValues: { indices: [1, 7], values: [0.4, 0.3] },
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
}));


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function dispute(): DisputeCase {
  return {
    disputeId: "disp_evp_test",
    organizationId: "org_test",
    pspProvider: "stripe",
    pspReasonCode: "10.4",
    amount: 50000,
    currency: "usd",
    reason: "fraudulent",
    customerExplanation: "I never made this charge",
    transactionDate: "2026-04-01",
    respondByDate: "2026-04-30",
    merchantVertical: "hospitality",
    hotelProfile: { name: "Test Hotel" },
  };
}

function rulebookMatch(id: string, score: number, text: string, source: string): VectorMatch {
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
      network: "visa" as const,
      documentName: "Visa Public Rules",
      documentVersion: "2024-04-15",
      reasonCodes: [],
    },
  };
}

const fakeStoreWithMatches: VectorStorePort = {
  query: jest.fn(async () => [
    rulebookMatch(
      "v1",
      0.91,
      "Section 11.4: For card-not-present fraud disputes, the merchant must prove the cardholder authenticated with 3D Secure or that the transaction otherwise complied with EMV.",
      "Visa Public Rules v2024, §11.4 Card-Not-Present Fraud",
    ),
    rulebookMatch(
      "v2",
      0.78,
      "Compelling evidence rule: prior undisputed transactions by the same cardholder within the last 120 days may be cited.",
      "Visa Public Rules v2024, §10.4 Compelling Evidence",
    ),
  ]),
};

const fakeEmptyStore: VectorStorePort = {
  query: jest.fn(async () => []),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("generateEvidencePlan ↔ RAG", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    capturedPrompts.length = 0;
    process.env = {
      ...ORIGINAL_ENV,
      ANTHROPIC_API_KEY: "sk-ant-test",
      PINECONE_API_KEY: "pcsk-test",
    };
    delete process.env.RAG_RETRIEVAL_ENABLED;
    _resetVectorStoreForTests();
    _resetEmbeddingClientForTests();
    _resetSparseEmbeddingClientForTests();
    jest.spyOn(console, "log").mockImplementation(() => {});
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

  test("injects ## REFERENCE MATERIAL when retrieval returns chunks", async () => {
    configureVectorStore(fakeStoreWithMatches);

    const plan = await generateEvidencePlan(dispute());

    expect(plan).not.toBeNull();
    expect(capturedPrompts.length).toBe(1);

    const prompt = capturedPrompts[0];
    expect(prompt).toContain("## REFERENCE MATERIAL");
    expect(prompt).toContain("Visa Public Rules v2024, §11.4");
    expect(prompt).toContain("Compelling evidence rule");
    expect(prompt.toLowerCase()).toContain("authoritative");
  });

  test("does NOT inject ## REFERENCE MATERIAL when retrieval returns no chunks", async () => {
    configureVectorStore(fakeEmptyStore);

    const plan = await generateEvidencePlan(dispute());

    expect(plan).not.toBeNull();
    expect(capturedPrompts.length).toBe(1);

    const prompt = capturedPrompts[0];
    expect(prompt).not.toContain("## REFERENCE MATERIAL");
  });

  test("does NOT inject ## REFERENCE MATERIAL when feature flag is off, even with matches available", async () => {
    process.env.RAG_RETRIEVAL_ENABLED = "false";
    const queryFn = jest.fn(async () => [
      rulebookMatch("v1", 0.99, "shouldn't be here", "ignored source"),
    ]);
    configureVectorStore({ query: queryFn });

    const plan = await generateEvidencePlan(dispute());

    expect(plan).not.toBeNull();
    expect(queryFn).not.toHaveBeenCalled();
    expect(capturedPrompts[0]).not.toContain("## REFERENCE MATERIAL");
  });

  test("falls back gracefully when vector store throws", async () => {
    configureVectorStore({
      query: jest.fn(async () => {
        throw new Error("Pinecone outage");
      }),
    });

    const plan = await generateEvidencePlan(dispute());

    expect(plan).not.toBeNull();
    // No reference material section because retrieval failed
    expect(capturedPrompts[0]).not.toContain("## REFERENCE MATERIAL");
    // Plan still got generated from the deterministic + LLM path
    expect(plan?.requirements.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Orchestrator-supplied RAG result: caching across revision attempts
  // ---------------------------------------------------------------------------
  //
  // When the evidence-planning orchestrator runs its revision loop, it resolves
  // retrieval once before the loop and passes the result via
  // `SpecialistContext.rulebookRagResult`. The planner MUST consume that
  // cached result and MUST NOT issue a fresh vector-store call. Without this
  // contract, every revision attempt fans out another Pinecone read with an
  // identical deterministic query — the smell observed in prod logs
  // (`[rag] chunksReturned=5 topScore=6.864` ×3 per dispute).

  test("uses context.rulebookRagResult and skips live retrieval when supplied", async () => {
    const queryFn = jest.fn(async () => [
      rulebookMatch("ignored", 0.99, "this store should never be queried", "ignored source"),
    ]);
    configureVectorStore({ query: queryFn });

    const cachedChunk = {
      id: "cached-1",
      text:
        "Section 11.4 (orchestrator-cached): merchant must prove 3D Secure authentication.",
      score: 0.95,
      source: "Visa Public Rules v2024, §11.4 (cached)",
      metadata: {
        namespace: RAG_NAMESPACES.rulebooks,
        schemaVersion: RAG_SCHEMA_VERSION,
        embeddingModel: EMBEDDING_MODEL,
        tokenCount: 80,
        indexedAt: "2026-04-15T00:00:00Z",
        text:
          "Section 11.4 (orchestrator-cached): merchant must prove 3D Secure authentication.",
        chunkIndex: 0,
        source: "Visa Public Rules v2024, §11.4 (cached)",
        network: "visa" as const,
        documentName: "Visa Public Rules",
        documentVersion: "2024-04-15",
        reasonCodes: [],
      },
    };

    const plan = await generateEvidencePlan(dispute(), {
      rulebookRagResult: {
        chunks: [cachedChunk],
        topScore: 0.95,
        disabled: false,
      },
    });

    expect(plan).not.toBeNull();
    expect(queryFn).not.toHaveBeenCalled();

    const prompt = capturedPrompts[0];
    expect(prompt).toContain("## REFERENCE MATERIAL");
    expect(prompt).toContain("orchestrator-cached");
    expect(prompt).toContain("Visa Public Rules v2024, §11.4 (cached)");
  });

  test("uses an empty context.rulebookRagResult to suppress the section without hitting Pinecone", async () => {
    const queryFn = jest.fn(async () => [
      rulebookMatch("ignored", 0.99, "shouldn't be reached", "ignored source"),
    ]);
    configureVectorStore({ query: queryFn });

    const plan = await generateEvidencePlan(dispute(), {
      rulebookRagResult: { chunks: [], topScore: 0, disabled: false },
    });

    expect(plan).not.toBeNull();
    expect(queryFn).not.toHaveBeenCalled();
    expect(capturedPrompts[0]).not.toContain("## REFERENCE MATERIAL");
  });
});
