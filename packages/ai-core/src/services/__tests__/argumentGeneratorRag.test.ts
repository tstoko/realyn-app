/**
 * Integration test for `generateDisputeArgument` ↔ RAG wiring.
 *
 * Pins the same observable contract as the evidence-planner test:
 *   - When chunks are returned, the prompt sent to Anthropic vision contains
 *     a `## REFERENCE MATERIAL` block.
 *   - When the store is empty / RAG is disabled / retrieval fails, the prompt
 *     does NOT contain the block and the deterministic flow is unchanged.
 */

import {
  configureVectorStore,
  _resetVectorStoreForTests,
  type VectorMatch,
  type VectorStorePort,
} from "../ragService";
import { _resetEmbeddingClientForTests } from "../embeddingService";
import { generateDisputeArgument } from "../argumentGenerator";
import { RAG_NAMESPACES, RAG_SCHEMA_VERSION, EMBEDDING_MODEL } from "../../config/ragConfig";
import type { DisputeCase, EvidencePlan, DisputeArgument, EvidenceItem } from "../../types/aiDispute";
import type { EvidenceLoader, EnrichedEvidence } from "../../ports";

// ---------------------------------------------------------------------------
// LLM mock
// ---------------------------------------------------------------------------

const capturedPrompts: string[] = [];

jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(async (params: any) => {
        // The argument generator uses callLLMWithVision, which sends a
        // structured user message: an array of content blocks. The prompt
        // text we care about is in the "text" block(s).
        const userMessage = params.messages[0];
        const promptText =
          typeof userMessage.content === "string"
            ? userMessage.content
            : userMessage.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n");
        capturedPrompts.push(promptText);

        const argument: DisputeArgument = {
          executiveSummary: "We respectfully contest this dispute. Evidence supports our case.",
          timeline: [{ date: "2026-04-01", description: "Charge processed" }],
          paragraphs: [{ heading: "Summary", content: "Service was rendered as agreed." }],
          conclusion: "Charge is valid and should be upheld.",
        };
        return {
          model: "claude-opus-4-7",
          content: [{ type: "text", text: JSON.stringify(argument) }],
          usage: { input_tokens: 200, output_tokens: 400 },
        };
      }),
    },
  })),
}));

jest.mock("@pinecone-database/pinecone", () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    inference: {
      embed: jest.fn(async () => ({
        data: [{ values: new Array(1024).fill(0.01) }],
        usage: { totalTokens: 5 },
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function dispute(): DisputeCase {
  return {
    disputeId: "disp_arg_test",
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

function plan(): EvidencePlan {
  return {
    disputeCategory: "Fraud",
    disputeSubtype: "Card-Not-Present",
    recommendation: "fight",
    winnability: "high",
    winnabilityReason: "Evidence is strong.",
    summary: "Cardholder fraud claim.",
    requirements: [
      {
        id: "req-1",
        category: "payment_data",
        label: "3DS Records",
        description: "3D Secure authentication records",
        required: true,
        priority: 1,
      },
    ],
  };
}

function evidenceItems(): EvidenceItem[] {
  return [
    {
      requirementId: "req-1",
      status: "uploaded",
      fileId: "file-1",
      fileName: "3ds.pdf",
    },
  ];
}

const fakeLoader: EvidenceLoader = {
  async getEnrichedEvidence(disputeId, evidencePlan, items): Promise<EnrichedEvidence[]> {
    return items.map((item) => {
      const requirement = evidencePlan.requirements.find((r) => r.id === item.requirementId)!;
      return {
        requirement,
        item,
        evidenceSlot: "service_documentation",
        evidenceSlotDescription: "Documentation showing service was provided",
        priorityLabel: "CRITICAL",
        pdfText: "Sample 3DS authentication record content.",
      };
    });
  },
};

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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("generateDisputeArgument ↔ RAG", () => {
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
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    _resetVectorStoreForTests();
    _resetEmbeddingClientForTests();
    jest.restoreAllMocks();
  });

  test("injects ## REFERENCE MATERIAL when retrieval returns chunks", async () => {
    configureVectorStore({
      query: jest.fn(async () => [
        rulebookMatch(
          "v1",
          0.93,
          "§11.4: For card-not-present fraud disputes the merchant must produce 3D Secure authentication.",
          "Visa Public Rules v2024, §11.4",
        ),
      ]),
    });

    const argument = await generateDisputeArgument(
      dispute(),
      plan(),
      evidenceItems(),
      "disp_arg_test",
      fakeLoader,
    );

    expect(argument).not.toBeNull();
    expect(capturedPrompts.length).toBe(1);

    const prompt = capturedPrompts[0];
    expect(prompt).toContain("## REFERENCE MATERIAL");
    expect(prompt).toContain("Visa Public Rules v2024, §11.4");
    expect(prompt).toContain("3D Secure authentication");
  });

  test("does NOT inject ## REFERENCE MATERIAL when retrieval returns no chunks", async () => {
    configureVectorStore({ query: jest.fn(async () => [] as VectorMatch[]) });

    const argument = await generateDisputeArgument(
      dispute(),
      plan(),
      evidenceItems(),
      "disp_arg_test",
      fakeLoader,
    );

    expect(argument).not.toBeNull();
    expect(capturedPrompts.length).toBe(1);
    expect(capturedPrompts[0]).not.toContain("## REFERENCE MATERIAL");
  });

  test("does NOT inject ## REFERENCE MATERIAL when feature flag is off", async () => {
    process.env.RAG_RETRIEVAL_ENABLED = "false";
    const queryFn = jest.fn(async () => [
      rulebookMatch("v1", 0.99, "Should not appear", "ignored"),
    ]);
    configureVectorStore({ query: queryFn });

    const argument = await generateDisputeArgument(
      dispute(),
      plan(),
      evidenceItems(),
      "disp_arg_test",
      fakeLoader,
    );

    expect(argument).not.toBeNull();
    expect(queryFn).not.toHaveBeenCalled();
    expect(capturedPrompts[0]).not.toContain("## REFERENCE MATERIAL");
  });

  test("falls back gracefully when vector store throws", async () => {
    configureVectorStore({
      query: jest.fn(async () => {
        throw new Error("Pinecone outage");
      }),
    });

    const argument = await generateDisputeArgument(
      dispute(),
      plan(),
      evidenceItems(),
      "disp_arg_test",
      fakeLoader,
    );

    expect(argument).not.toBeNull();
    expect(capturedPrompts[0]).not.toContain("## REFERENCE MATERIAL");
  });
});
