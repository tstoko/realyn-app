/**
 * Tests for AI dispute handlers (planEvidence, draftArgument, toggleAIPlan).
 *
 * Coverage focus (per docs/post-hardening-plan.md §B4):
 *   - Auth gate: `verifyUserInOrganization` is hit before any rate-limit /
 *     Firestore work.
 *   - Plan-limit gate: `assertFeatureEnabled("aiDraftsEnabled")` rejects with
 *     402-ish payload before further work.
 *   - Validation: missing organizationId / disputeId / useAIPlan returns 400.
 *   - Atomic queue / claim transitions for planEvidence + draftArgument.
 *   - Internal-error path returns the generic `{ error, errorId }` shape and
 *     does NOT leak the raw error message.
 */

// --- mock auth + plan enforcement BEFORE importing the handler -------------

jest.mock("../../utils/authMiddleware", () => {
  const actual = jest.requireActual("../../utils/authMiddleware");
  return {
    ...actual,
    verifyUser: jest.fn(),
    verifyUserInOrganization: jest.fn(),
  };
});

jest.mock("../../utils/planEnforcement", () => {
  const actual = jest.requireActual("../../utils/planEnforcement");
  return {
    ...actual,
    assertFeatureEnabled: jest.fn(),
  };
});

jest.mock("../../services/ai/evidencePlanningService", () => ({
  triggerEvidencePlanning: jest.fn(),
  regenerateEvidencePlan: jest.fn(),
  updateEvidenceItemStatus: jest.fn(),
  getEvidenceProgress: jest.fn(),
  toggleAIPlanMode: jest.fn(),
}));

jest.mock("../../services/ai/argumentGenerator", () => ({
  generateDisputeArgument: jest.fn(),
}));

jest.mock("../../services/ai/disputeCaseBuilder", () => ({
  buildDisputeCase: jest.fn(),
}));

jest.mock("../../services/evidenceService", () => ({
  getEvidenceFiles: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/knowledgeBaseService", () => ({
  getPSPFormats: jest.fn().mockResolvedValue([]),
  getWinPatterns: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../utils/auditTrailHelper", () => ({
  addAuditTrailEntry: jest.fn().mockResolvedValue(undefined),
  createSystemAuditEntry: jest.fn().mockResolvedValue(undefined),
  createErrorAuditEntry: jest.fn().mockResolvedValue(undefined),
}));

// --- in-memory firestore double --------------------------------------------

const disputeStore = new Map<string, any>();
const disputeUpdates: Array<{ disputeId: string; update: any }> = [];

function disputeRef(id: string) {
  return {
    id,
    get: jest.fn(async () => {
      const v = disputeStore.get(id);
      return { exists: !!v, data: () => v };
    }),
    update: jest.fn(async (update: any) => {
      disputeUpdates.push({ disputeId: id, update });
      const existing = disputeStore.get(id) || {};
      // For `update("subscription.x": ...)` style, store flat — tests assert raw shape.
      disputeStore.set(id, { ...existing, ...update });
    }),
  };
}

jest.mock("firebase-admin", () => {
  const collection = jest.fn((name: string) => ({
    doc: jest.fn((id: string) => {
      if (name === "disputes") return disputeRef(id);
      return { id, get: jest.fn(async () => ({ exists: false })) };
    }),
  }));
  const firestoreInstance = {
    collection,
    runTransaction: jest.fn(async (fn: any) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        update: async (ref: any, data: any) => ref.update(data),
        set: async (ref: any, data: any) => {
          if (typeof ref.set === "function") return ref.set(data);
          return ref.update(data);
        },
      };
      return fn(tx);
    }),
  };
  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => firestoreInstance),
    apps: [{}], // pretend already initialised
    FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TS") },
  };
});

import { planEvidence, draftArgument, toggleAIPlan } from "../aiDisputeHandlers";
import {
  verifyUser,
  verifyUserInOrganization,
} from "../../utils/authMiddleware";
import { assertFeatureEnabled, PlanLimitError } from "../../utils/planEnforcement";
import { buildDisputeCase } from "../../services/ai/disputeCaseBuilder";
import { generateDisputeArgument } from "../../services/ai/argumentGenerator";
import { toggleAIPlanMode } from "../../services/ai/evidencePlanningService";

void verifyUser; // type-only reference suppressing unused import warning
const mockedVerifyUserInOrg = verifyUserInOrganization as jest.MockedFunction<typeof verifyUserInOrganization>;
const mockedAssertFeature = assertFeatureEnabled as jest.MockedFunction<typeof assertFeatureEnabled>;
const mockedBuildDisputeCase = buildDisputeCase as jest.MockedFunction<typeof buildDisputeCase>;
const mockedGenerateArg = generateDisputeArgument as jest.MockedFunction<typeof generateDisputeArgument>;
const mockedToggleAI = toggleAIPlanMode as jest.MockedFunction<typeof toggleAIPlanMode>;

// --- helpers ---------------------------------------------------------------

function buildReq(overrides: Record<string, any> = {}): any {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost",
    ...(overrides.headers || {}),
  };
  return {
    method: "POST",
    body: {},
    query: {},
    ...overrides,
    headers,
    get: (n: string) => headers[n.toLowerCase()],
    header: (n: string) => headers[n.toLowerCase()],
  };
}

function buildRes(): any {
  const res: any = {
    headersSent: false,
    statusCode: 200,
    status: jest.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res;
}

function authPass() {
  mockedVerifyUserInOrg.mockResolvedValue({
    success: true,
    uid: "user_1",
    email: "u@example.com",
    role: "user",
    organizationId: "org_1",
  });
  mockedAssertFeature.mockResolvedValue();
}

beforeEach(() => {
  disputeStore.clear();
  disputeUpdates.length = 0;
  mockedVerifyUserInOrg.mockReset();
  mockedAssertFeature.mockReset();
  mockedBuildDisputeCase.mockReset();
  mockedGenerateArg.mockReset();
  mockedToggleAI.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// planEvidence
// ---------------------------------------------------------------------------

describe("planEvidence", () => {
  test("returns 405 for non-POST", async () => {
    const res = buildRes();
    await (planEvidence as any)(buildReq({ method: "GET" }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test("returns 400 when organizationId missing in body", async () => {
    const res = buildRes();
    await (planEvidence as any)(buildReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing organizationId in request body" });
  });

  test("returns 401 when auth fails", async () => {
    mockedVerifyUserInOrg.mockResolvedValue({
      success: false,
      error: "Unauthorized: bad token",
    });
    const res = buildRes();
    await (planEvidence as any)(buildReq({ body: { organizationId: "org_1" } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns 403 when org membership check fails", async () => {
    mockedVerifyUserInOrg.mockResolvedValue({
      success: false,
      error: "Forbidden: Access denied to this organization",
    });
    const res = buildRes();
    await (planEvidence as any)(buildReq({ body: { organizationId: "org_1" } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("returns plan-limit error when aiDraftsEnabled is false", async () => {
    mockedVerifyUserInOrg.mockResolvedValue({
      success: true,
      uid: "user_1",
      organizationId: "org_1",
      role: "user",
    });
    mockedAssertFeature.mockRejectedValue(
      new PlanLimitError("aiDraftsEnabled", "AI drafts not enabled on your plan"),
    );
    const res = buildRes();
    await (planEvidence as any)(buildReq({ body: { organizationId: "org_1" } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.code).toBe("PLAN_LIMIT");
    expect(body.feature).toBe("aiDraftsEnabled");
  });

  test("returns 400 when disputeId missing", async () => {
    authPass();
    const res = buildRes();
    await (planEvidence as any)(buildReq({ body: { organizationId: "org_1" }, query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing disputeId parameter" });
  });

  test("returns 404 when dispute does not exist", async () => {
    authPass();
    const res = buildRes();
    await (planEvidence as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "missing_disp" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("returns 403 when dispute belongs to a different org", async () => {
    authPass();
    disputeStore.set("disp_1", { organizationId: "other_org" });
    const res = buildRes();
    await (planEvidence as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_1" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("queues a plan when status is unset", async () => {
    authPass();
    disputeStore.set("disp_1", { organizationId: "org_1" });
    const res = buildRes();
    await (planEvidence as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_1" } }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      status: "queued",
      message: "Evidence plan generation queued. You will be notified when complete.",
    });
    const update = disputeUpdates.find((u) => u.disputeId === "disp_1");
    expect(update?.update.evidencePlanStatus).toBe("queued");
  });

  test("does not double-queue when status is already 'queued' or 'generating'", async () => {
    authPass();
    disputeStore.set("disp_2", { organizationId: "org_1", evidencePlanStatus: "generating" });
    const res = buildRes();
    await (planEvidence as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_2" } }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      status: "queued",
      message: "Evidence plan generation is already in progress.",
    });
    expect(disputeUpdates.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// draftArgument
// ---------------------------------------------------------------------------

describe("draftArgument", () => {
  test("returns 401 when auth fails — does not call generator", async () => {
    mockedVerifyUserInOrg.mockResolvedValue({
      success: false,
      error: "Unauthorized: bad token",
    });
    const res = buildRes();
    await (draftArgument as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_1" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockedBuildDisputeCase).not.toHaveBeenCalled();
    expect(mockedGenerateArg).not.toHaveBeenCalled();
  });

  test("returns 400 when evidence plan not yet generated", async () => {
    authPass();
    disputeStore.set("disp_3", { organizationId: "org_1" }); // no evidencePlan
    const res = buildRes();
    await (draftArgument as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_3" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe("Evidence plan not generated yet");
  });

  test("returns cached draft when one already exists and regenerate is false", async () => {
    authPass();
    const cachedDraft = { executiveSummary: "Cached" } as any;
    disputeStore.set("disp_4", {
      organizationId: "org_1",
      evidencePlan: { requirements: [] },
      argumentDraft: cachedDraft,
    });
    const res = buildRes();
    await (draftArgument as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_4" } }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      argument: cachedDraft,
      cached: true,
    });
    expect(mockedGenerateArg).not.toHaveBeenCalled();
  });

  test("internal error path returns generic 500 + errorId (no leak)", async () => {
    authPass();
    disputeStore.set("disp_5", {
      organizationId: "org_1",
      evidencePlan: { requirements: [] },
    });
    mockedBuildDisputeCase.mockResolvedValue({
      disputeId: "disp_5",
      organizationId: "org_1",
      pspProvider: "stripe",
      amount: 1000,
      currency: "usd",
      reason: null,
    } as any);
    mockedGenerateArg.mockImplementation(async () => {
      throw new Error("super-secret pipeline error: db creds <REDACTED>");
    });

    const res = buildRes();
    await (draftArgument as any)(
      buildReq({ body: { organizationId: "org_1" }, query: { disputeId: "disp_5" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe("Internal server error");
    expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("REDACTED");
  });
});

// ---------------------------------------------------------------------------
// toggleAIPlan
// ---------------------------------------------------------------------------

describe("toggleAIPlan", () => {
  test("returns 401 when auth fails", async () => {
    mockedVerifyUserInOrg.mockResolvedValue({
      success: false,
      error: "Unauthorized: bad token",
    });
    const res = buildRes();
    await (toggleAIPlan as any)(
      buildReq({
        body: { organizationId: "org_1", useAIPlan: true },
        query: { disputeId: "disp_1" },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns 400 when useAIPlan field is missing", async () => {
    authPass();
    const res = buildRes();
    await (toggleAIPlan as any)(
      buildReq({
        body: { organizationId: "org_1" },
        query: { disputeId: "disp_1" },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("returns 403 when dispute belongs to a different org", async () => {
    authPass();
    disputeStore.set("disp_t", { organizationId: "other_org" });
    const res = buildRes();
    await (toggleAIPlan as any)(
      buildReq({
        body: { organizationId: "org_1", useAIPlan: true },
        query: { disputeId: "disp_t" },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("happy path: toggle succeeds and returns useAIPlan", async () => {
    authPass();
    disputeStore.set("disp_t", { organizationId: "org_1" });
    mockedToggleAI.mockResolvedValue(true);
    const res = buildRes();
    await (toggleAIPlan as any)(
      buildReq({
        body: { organizationId: "org_1", useAIPlan: true },
        query: { disputeId: "disp_t" },
      }),
      res,
    );
    expect(mockedToggleAI).toHaveBeenCalledWith("disp_t", true);
    expect(res.json).toHaveBeenCalledWith({ success: true, useAIPlan: true });
  });
});
