import { describe, it, expect } from "vitest";
import { projectCase, projectCaseList } from "../dto/caseDto.js";

describe("projectCase", () => {
  it("projects basic dispute fields", () => {
    const dispute = {
      id: "d1",
      organizationId: "org1",
      pspProvider: "stripe",
      pspDisputeId: "dp_123",
      amount: 15000,
      currency: "usd",
      status: "needs_response",
      lifecycleStatus: "evidence_gathering",
      reason: "10.4",
      createdAt: new Date("2024-01-01"),
    };

    const dto = projectCase(dispute);
    expect(dto.id).toBe("d1");
    expect(dto.organizationId).toBe("org1");
    expect(dto.pspProvider).toBe("stripe");
    expect(dto.amount).toBe(15000);
    expect(dto.currency).toBe("usd");
    expect(dto.status).toBe("needs_response");
  });

  it("returns null for evidencePlanSummary when no plan exists", () => {
    const dto = projectCase({ id: "d1", status: "open" });
    expect(dto.evidencePlanSummary).toBeNull();
  });

  it("projects evidence plan summary when present", () => {
    const dispute = {
      id: "d1",
      status: "open",
      evidencePlan: {
        recommendation: "fight",
        winnability: "high",
        requirements: [{ id: "r1" }, { id: "r2" }],
      },
    };
    const dto = projectCase(dispute);
    expect(dto.evidencePlanSummary).toEqual({
      recommendation: "fight",
      winnability: "high",
      requirementCount: 2,
    });
  });

  it("returns null for draftSummary when no draft exists", () => {
    const dto = projectCase({ id: "d1", status: "open" });
    expect(dto.draftSummary).toBeNull();
  });

  it("computes daysRemaining from respondBy date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const dto = projectCase({ id: "d1", status: "open", respondBy: future });
    expect(dto.daysRemaining).toBe(5);
  });

  it("returns null daysRemaining when no respondBy", () => {
    const dto = projectCase({ id: "d1", status: "open" });
    expect(dto.daysRemaining).toBeNull();
  });
});

describe("projectCaseList", () => {
  it("maps multiple disputes", () => {
    const disputes = [
      { id: "d1", status: "open" },
      { id: "d2", status: "closed" },
    ];
    const list = projectCaseList(disputes);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("d1");
    expect(list[1].id).toBe("d2");
  });
});
