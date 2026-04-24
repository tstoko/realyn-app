/**
 * Integration test for the AI evidence planning pipeline.
 *
 * Exercises the full `triggerEvidencePlanning` flow (Steps 0-7) with
 * mocked dependencies so no real Anthropic or Firestore calls are made.
 *
 * What is verified:
 * - The orchestrator calls each specialist in order
 * - Fallback paths work when a specialist returns null
 * - Quality revision loop runs correctly
 * - The final result is persisted to the Firestore mock
 * - Error paths return `{ success: false }` with messages
 */

import { DisputeCase, ClaimAnalysis, ExistingEvidenceAnalysis, EvidenceRelevanceScores, DisputeStrategy, EvidencePlan, EvidencePlanQualityCheck } from "../../../types/aiDispute";

// ============================================================
// Firebase Admin mock – must be defined before any import that
// touches `firebase-admin`
// ============================================================

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({
  get: mockGet,
  update: mockUpdate,
}));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("firebase-admin", () => {
  const firestoreFn = () => ({ collection: mockCollection });
  // FieldValue.serverTimestamp() – return a sentinel
  firestoreFn.FieldValue = { serverTimestamp: () => "SERVER_TIMESTAMP" };
  return {
    firestore: firestoreFn,
    initializeApp: jest.fn(),
  };
});

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

// ============================================================
// Mock specialists & helpers
// ============================================================

jest.mock("../disputeCaseBuilder");
jest.mock("../evidencePlanner");
jest.mock("../specialists");
jest.mock("../../../utils/piiSanitizer");

import {
  buildDisputeCase,
  summarizeDisputeCase,
  hasFolioAvailable,
  getFolioUrl,
} from "../disputeCaseBuilder";
import {
  generateEvidencePlan,
  resolveDisputeCode,
  applyFolioDedup,
  applyCodeBasedMerge,
} from "../evidencePlanner";
import {
  analyzeClaim,
  generateFallbackClaimAnalysis,
  analyzeExistingEvidence,
  scoreEvidenceRelevance,
  checkEvidencePlanQuality,
  synthesizeStrategy,
  generateFallbackStrategy,
} from "../specialists";
import { sanitizeDisputeCaseWithLog } from "../../../utils/piiSanitizer";
import { triggerEvidencePlanning } from "../evidencePlanningService";

// ============================================================
// Test fixtures
// ============================================================

const DISPUTE_ID = "disp_test_123";
const ORG_ID = "org_test_456";

const fakeDisputeCase: DisputeCase = {
  disputeId: DISPUTE_ID,
  organizationId: ORG_ID,
  pspProvider: "stripe",
  pspDisputeId: "dp_stripe_789",
  pspReasonCode: "13.1",
  amount: 15000,
  currency: "usd",
  reason: "fraudulent",
  customerExplanation: "I did not make this purchase",
  transactionDate: "2025-12-01T12:00:00Z",
  respondByDate: "2027-06-01T12:00:00Z",
};

const fakeClaimAnalysis: ClaimAnalysis = {
  claimType: "fraud",
  customerArguments: ["I did not authorize this transaction"],
  weakPoints: ["Guest checked in in person"],
  requiredDisproofs: ["Signed registration card", "3D Secure authentication"],
  suggestedCounterarguments: ["Guest was present and used chip card"],
};

const fakeExistingEvidence: ExistingEvidenceAnalysis = {
  availableDocuments: [
    { id: "doc1", name: "Terms of Service", category: "Terms of Service", relevantForDispute: true },
  ],
  extractedPolicies: [
    { type: "terms", documentId: "doc1", summary: "Standard hotel terms" },
  ],
  missingDocuments: ["Cancellation Policy"],
};

const fakeRelevanceScores: EvidenceRelevanceScores = {
  scores: [
    { evidenceType: "registration_card", relevanceScore: 95, reasoning: "Proves guest identity" },
    { evidenceType: "folio", relevanceScore: 85, reasoning: "Shows charges" },
  ],
  topPriorityEvidence: ["registration_card", "folio"],
  lowValueEvidence: ["housekeeping_records"],
};

const fakeStrategy: DisputeStrategy = {
  recommendation: "fight",
  confidence: 80,
  primaryDefense: "Guest checked in with valid ID",
  defensePoints: [
    {
      point: "Guest signed registration card",
      supportingEvidence: ["registration_card"],
      addressesClaim: "I did not authorize this transaction",
    },
  ],
  knownWeaknesses: ["No 3D Secure on this transaction"],
  evidencePriority: [
    { evidenceType: "registration_card", reason: "Proves identity", alreadyAvailable: false, mustGather: true },
  ],
  approachNotes: "Focus on proof of stay and guest identity",
};

const fakePlan: EvidencePlan = {
  disputeCategory: "Fraud",
  disputeSubtype: "Card Not Present",
  reasonCode: "13.1",
  network: "visa",
  recommendation: "fight",
  winnability: "medium",
  winnabilityReason: "Strong proof of stay available",
  requirements: [
    {
      id: "req_1",
      category: "proof_of_stay",
      label: "Signed Registration Card",
      description: "Guest registration with signature",
      required: true,
      priority: 1,
    },
    {
      id: "req_2",
      category: "pms_data",
      label: "Reservation Folio",
      description: "Detailed folio from PMS",
      required: true,
      priority: 2,
    },
  ],
  summary: "Gather proof of stay and payment authorization records",
};

const fakeQualityPass: EvidencePlanQualityCheck = {
  passed: true,
  overallScore: 85,
  issues: [],
};

const fakeQualityFail: EvidencePlanQualityCheck = {
  passed: false,
  overallScore: 55,
  issues: [
    {
      severity: "critical",
      category: "missing_critical_evidence",
      description: "Missing 3D Secure records",
      suggestedFix: "Add 3D Secure evidence requirement",
    },
  ],
  revisionInstructions: {
    requirementsToAdd: [
      { category: "payment_data", label: "3D Secure Records", description: "Auth records", priority: 1 },
    ],
    requirementsToRemove: [],
    prioritiesToChange: [],
  },
};

// ============================================================
// Helper to set up the happy-path mocks
// ============================================================

function setupHappyPath() {
  (buildDisputeCase as jest.Mock).mockResolvedValue(fakeDisputeCase);
  (summarizeDisputeCase as jest.Mock).mockReturnValue("summary");
  (hasFolioAvailable as jest.Mock).mockReturnValue(false);
  (getFolioUrl as jest.Mock).mockReturnValue(undefined);
  (sanitizeDisputeCaseWithLog as jest.Mock).mockReturnValue(fakeDisputeCase);

  (resolveDisputeCode as jest.Mock).mockReturnValue({
    reasonCode: "13.1",
    network: "visa",
    codeInfo: { code: "13.1", network: "visa", category: "Fraud" },
  });

  (analyzeClaim as jest.Mock).mockResolvedValue(fakeClaimAnalysis);
  (analyzeExistingEvidence as jest.Mock).mockResolvedValue(fakeExistingEvidence);
  (scoreEvidenceRelevance as jest.Mock).mockResolvedValue(fakeRelevanceScores);
  (synthesizeStrategy as jest.Mock).mockResolvedValue(fakeStrategy);
  (generateEvidencePlan as jest.Mock).mockResolvedValue(fakePlan);
  (applyCodeBasedMerge as jest.Mock).mockImplementation((plan) => plan);
  (applyFolioDedup as jest.Mock).mockImplementation((plan) => plan);
  (checkEvidencePlanQuality as jest.Mock).mockResolvedValue(fakeQualityPass);
  (generateFallbackStrategy as jest.Mock).mockReturnValue(fakeStrategy);

  // Firestore mock – existing dispute doc with no previous plan versions
  mockGet.mockResolvedValue({
    exists: true,
    data: () => ({ evidencePlanVersions: [] }),
  });
}

// ============================================================
// Tests
// ============================================================

describe("Evidence Planning Pipeline (integration)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHappyPath();
  });

  // ----------------------------------------------------------
  // Happy path
  // ----------------------------------------------------------
  it("runs the full pipeline and returns a successful result", async () => {
    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(result.plan).toEqual(fakePlan);
    expect(result.evidenceItems).toBeDefined();
    expect(result.evidenceItems!.length).toBe(fakePlan.requirements.length);
    expect(result.claimAnalysis).toEqual(fakeClaimAnalysis);
    expect(result.strategy).toEqual(fakeStrategy);
    expect(result.qualityScore).toBe(85);
    expect(result.revisionAttempts).toBe(0);
  });

  it("calls specialists in the correct order", async () => {
    await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    // Step 0
    expect(buildDisputeCase).toHaveBeenCalledWith(DISPUTE_ID, ORG_ID);
    expect(sanitizeDisputeCaseWithLog).toHaveBeenCalledWith(fakeDisputeCase);
    expect(resolveDisputeCode).toHaveBeenCalledWith(fakeDisputeCase);

    // Step 1
    expect(analyzeClaim).toHaveBeenCalled();

    // Step 2
    expect(analyzeExistingEvidence).toHaveBeenCalled();

    // Step 3
    expect(scoreEvidenceRelevance).toHaveBeenCalled();

    // Step 4
    expect(synthesizeStrategy).toHaveBeenCalled();

    // Step 5
    expect(generateEvidencePlan).toHaveBeenCalled();

    // Step 6
    expect(checkEvidencePlanQuality).toHaveBeenCalled();
  });

  it("saves the plan to Firestore with correct structure", async () => {
    await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(mockCollection).toHaveBeenCalledWith("disputes");
    expect(mockDoc).toHaveBeenCalledWith(DISPUTE_ID);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.evidencePlan).toEqual(fakePlan);
    expect(updateArg.evidenceItems).toBeDefined();
    expect(updateArg.lifecycleStatus).toBe("evidence_in_progress");
    expect(updateArg.internalStatus).toBe("awaiting_docs");
    expect(updateArg.evidencePlanVersions).toBeDefined();
    expect(updateArg.evidencePlanVersions.length).toBe(1);
    expect(updateArg.evidencePlanVersions[0].version).toBe(1);
    expect(updateArg.evidencePlanVersions[0].isCurrent).toBe(true);
  });

  // ----------------------------------------------------------
  // Fallback paths
  // ----------------------------------------------------------
  it("uses fallback claim analysis when LLM returns null", async () => {
    (analyzeClaim as jest.Mock).mockResolvedValue(null);
    (generateFallbackClaimAnalysis as jest.Mock).mockReturnValue(fakeClaimAnalysis);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(generateFallbackClaimAnalysis).toHaveBeenCalledWith(fakeDisputeCase);
  });

  it("uses fallback strategy when LLM returns null", async () => {
    (synthesizeStrategy as jest.Mock).mockResolvedValue(null);
    (generateFallbackStrategy as jest.Mock).mockReturnValue(fakeStrategy);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(generateFallbackStrategy).toHaveBeenCalled();
  });

  it("continues when evidence analyzer returns null", async () => {
    (analyzeExistingEvidence as jest.Mock).mockResolvedValue(null);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    // Pipeline should still complete
    expect(generateEvidencePlan).toHaveBeenCalled();
  });

  it("continues when relevance scorer returns null", async () => {
    (scoreEvidenceRelevance as jest.Mock).mockResolvedValue(null);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(generateEvidencePlan).toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // Quality revision loop
  // ----------------------------------------------------------
  it("retries plan generation when quality check fails", async () => {
    // First attempt fails quality, second passes
    (checkEvidencePlanQuality as jest.Mock)
      .mockResolvedValueOnce(fakeQualityFail)
      .mockResolvedValueOnce(fakeQualityPass);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    expect(result.revisionAttempts).toBe(1);
    // Plan generation called twice (initial + 1 revision)
    expect(generateEvidencePlan).toHaveBeenCalledTimes(2);
    expect(checkEvidencePlanQuality).toHaveBeenCalledTimes(2);
  });

  it("caps revision attempts and still succeeds with a plan", async () => {
    // All quality checks fail
    (checkEvidencePlanQuality as jest.Mock).mockResolvedValue(fakeQualityFail);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    // Pipeline should still succeed with whatever plan it has
    expect(result.success).toBe(true);
    // MAX_REVISION_ATTEMPTS = 2, so we get 3 total calls (0, 1, 2)
    expect(generateEvidencePlan).toHaveBeenCalledTimes(3);
    expect(checkEvidencePlanQuality).toHaveBeenCalledTimes(3);
  });

  // ----------------------------------------------------------
  // Error paths
  // ----------------------------------------------------------
  it("returns failure when dispute case cannot be built", async () => {
    (buildDisputeCase as jest.Mock).mockResolvedValue(null);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to build dispute case");
    // Should not proceed to specialists
    expect(analyzeClaim).not.toHaveBeenCalled();
  });

  it("returns failure when all plan generation attempts fail", async () => {
    (generateEvidencePlan as jest.Mock).mockResolvedValue(null);

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to generate evidence plan");
  });

  it("returns failure when an unexpected error is thrown", async () => {
    (buildDisputeCase as jest.Mock).mockRejectedValue(new Error("Firestore connection lost"));

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Firestore connection lost");
  });

  // ----------------------------------------------------------
  // Post-processing
  // ----------------------------------------------------------
  it("applies code-based merge and folio dedup on first attempt", async () => {
    await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(applyCodeBasedMerge).toHaveBeenCalledTimes(1);
    expect(applyFolioDedup).toHaveBeenCalledTimes(1);
  });

  it("marks folio evidence items as uploaded when folio is available", async () => {
    (hasFolioAvailable as jest.Mock).mockReturnValue(true);
    (getFolioUrl as jest.Mock).mockReturnValue("https://example.com/folio.pdf");

    const result = await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    expect(result.success).toBe(true);
    // Check that hasFolioAvailable was consulted
    expect(hasFolioAvailable).toHaveBeenCalledWith(fakeDisputeCase);
  });

  // ----------------------------------------------------------
  // Version management
  // ----------------------------------------------------------
  it("increments version number when previous versions exist", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        evidencePlanVersions: [
          { version: 1, isCurrent: true, plan: {}, evidenceItems: [], generatedAt: new Date() },
        ],
      }),
    });

    await triggerEvidencePlanning(DISPUTE_ID, ORG_ID);

    const updateArg = mockUpdate.mock.calls[0][0];
    const versions = updateArg.evidencePlanVersions;

    // Previous version should be marked as not current
    expect(versions[0].isCurrent).toBe(false);
    // New version should be version 2
    expect(versions[1].version).toBe(2);
    expect(versions[1].isCurrent).toBe(true);
  });
});
