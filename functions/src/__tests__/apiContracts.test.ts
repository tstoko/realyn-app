/**
 * API Contract Tests
 *
 * Validates that the Zod schemas in contracts/ are internally consistent
 * and that well-formed payloads pass while malformed ones are rejected.
 * In CI, this test runs via `npm test` in the functions package.
 */

import {
  PlanEvidenceRequestSchema,
  PlanEvidenceSuccessResponseSchema,
  DraftArgumentRequestSchema,
  DraftArgumentSuccessResponseSchema,
  UpdateEvidenceItemRequestSchema,
  UpdateEvidenceItemSuccessResponseSchema,
  EvidenceItemStatusSchema,
  GetProgressSuccessResponseSchema,
  ToggleAIPlanRequestSchema,
  ToggleAIPlanSuccessResponseSchema,
  GenericErrorResponseSchema,
} from "../contracts/aiDisputeContracts";

import {
  SubmitDisputeRequestSchema,
  StripeSubmitSuccessResponseSchema,
  AdyenSubmitSuccessResponseSchema,
  UnifiedSubmitSuccessResponseSchema,
  SubmitDisputeErrorResponseSchema,
} from "../contracts/submitDisputeContracts";

// ---------------------------------------------------------------------------
// planEvidence
// ---------------------------------------------------------------------------

describe("planEvidence contracts", () => {
  it("accepts a valid request", () => {
    const result = PlanEvidenceRequestSchema.safeParse({
      organizationId: "org_123",
      regenerate: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts request without optional regenerate", () => {
    const result = PlanEvidenceRequestSchema.safeParse({
      organizationId: "org_123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects request missing organizationId", () => {
    const result = PlanEvidenceRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a valid success response", () => {
    const result = PlanEvidenceSuccessResponseSchema.safeParse({
      success: true,
      status: "queued",
      message: "Evidence plan generation queued.",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// draftArgument
// ---------------------------------------------------------------------------

describe("draftArgument contracts", () => {
  it("accepts a valid request", () => {
    const result = DraftArgumentRequestSchema.safeParse({
      organizationId: "org_abc",
      regenerate: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cached success response", () => {
    const result = DraftArgumentSuccessResponseSchema.safeParse({
      success: true,
      argument: { executiveSummary: "Test", paragraphs: [], conclusion: "Done" },
      cached: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a generated success response with version", () => {
    const result = DraftArgumentSuccessResponseSchema.safeParse({
      success: true,
      argument: { executiveSummary: "Test", paragraphs: [], conclusion: "Done" },
      cached: false,
      version: 2,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateEvidenceItem
// ---------------------------------------------------------------------------

describe("updateEvidenceItem contracts", () => {
  it("accepts a valid request", () => {
    const result = UpdateEvidenceItemRequestSchema.safeParse({
      requirementId: "req-1",
      status: "uploaded",
      fileId: "file_abc",
      fileName: "folio.pdf",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = UpdateEvidenceItemRequestSchema.safeParse({
      requirementId: "req-1",
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("validates all valid status values", () => {
    for (const status of ["pending", "uploaded", "not_available", "not_applicable"]) {
      const result = EvidenceItemStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it("accepts a valid success response with progress", () => {
    const result = UpdateEvidenceItemSuccessResponseSchema.safeParse({
      success: true,
      progress: {
        completed: 3,
        total: 5,
        requiredCompleted: 2,
        requiredTotal: 3,
        isComplete: false,
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getProgress
// ---------------------------------------------------------------------------

describe("getProgress contracts", () => {
  it("accepts a valid success response", () => {
    const result = GetProgressSuccessResponseSchema.safeParse({
      success: true,
      progress: {
        completed: 5,
        total: 5,
        requiredCompleted: 3,
        requiredTotal: 3,
        isComplete: true,
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toggleAIPlan
// ---------------------------------------------------------------------------

describe("toggleAIPlan contracts", () => {
  it("accepts a valid request", () => {
    const result = ToggleAIPlanRequestSchema.safeParse({
      organizationId: "org_123",
      useAIPlan: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects request missing useAIPlan", () => {
    const result = ToggleAIPlanRequestSchema.safeParse({
      organizationId: "org_123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid success response", () => {
    const result = ToggleAIPlanSuccessResponseSchema.safeParse({
      success: true,
      useAIPlan: true,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Generic error
// ---------------------------------------------------------------------------

describe("GenericErrorResponse", () => {
  it("accepts a standard error response", () => {
    const result = GenericErrorResponseSchema.safeParse({
      error: "Something went wrong",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// submitDisputeResponse
// ---------------------------------------------------------------------------

describe("submitDisputeResponse contracts", () => {
  it("accepts a valid request", () => {
    const result = SubmitDisputeRequestSchema.safeParse({
      disputeId: "disp_123",
      organizationId: "org_abc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts request with optional evidence", () => {
    const result = SubmitDisputeRequestSchema.safeParse({
      disputeId: "disp_123",
      organizationId: "org_abc",
      evidence: {
        textEvidence: { paymentData: "some data" },
        productDescription: "Hotel stay",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects request missing disputeId", () => {
    const result = SubmitDisputeRequestSchema.safeParse({
      organizationId: "org_abc",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a Stripe success response", () => {
    const result = StripeSubmitSuccessResponseSchema.safeParse({
      success: true,
      message: "Dispute response submitted",
      disputeStatus: "under_review",
      evidenceFilesSubmitted: 3,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an Adyen success response", () => {
    const result = AdyenSubmitSuccessResponseSchema.safeParse({
      success: true,
      message: "Dispute response submitted",
      defenseReference: "defense_disp123_1712345",
      evidenceFilesSubmitted: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a unified success response", () => {
    const result = UnifiedSubmitSuccessResponseSchema.safeParse({
      success: true,
      message: "Dispute response submitted",
      evidenceFilesSubmitted: 4,
      pspResponseId: "ref_abc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an error response", () => {
    const result = SubmitDisputeErrorResponseSchema.safeParse({
      success: false,
      message: "Stripe credentials not found",
      error: "Stripe credentials not found (secretKey or accessToken required)",
      errorCode: "missing_credentials",
    });
    expect(result.success).toBe(true);
  });
});
