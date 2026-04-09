import { describe, it, expect } from "vitest";
import { projectEvidenceInventory, projectEvidenceGaps } from "../dto/evidenceDto.js";

describe("projectEvidenceInventory", () => {
  it("returns empty inventory when no plan exists", () => {
    const result = projectEvidenceInventory({ id: "d1" });
    expect(result.planExists).toBe(false);
    expect(result.requirements).toEqual([]);
    expect(result.totalRequired).toBe(0);
    expect(result.percentComplete).toBe(0);
  });

  it("computes percent complete correctly", () => {
    const dispute = {
      id: "d1",
      evidencePlan: {
        requirements: [
          { id: "r1", category: "pms_data", title: "Folio", priority: "required", status: "fulfilled" },
          { id: "r2", category: "policy", title: "Policy", priority: "required", status: "pending" },
          { id: "r3", category: "communications", title: "Emails", priority: "optional", status: "auto_fulfilled" },
          { id: "r4", category: "payment_data", title: "Auth", priority: "optional", status: "pending" },
        ],
      },
    };
    const result = projectEvidenceInventory(dispute);
    expect(result.planExists).toBe(true);
    expect(result.totalRequired).toBe(4);
    expect(result.totalFulfilled).toBe(2);
    expect(result.percentComplete).toBe(50);
  });
});

describe("projectEvidenceGaps", () => {
  it("returns only unfulfilled requirements as gaps", () => {
    const dispute = {
      id: "d1",
      evidencePlan: {
        requirements: [
          { id: "r1", category: "pms_data", title: "Folio", priority: "required", status: "fulfilled" },
          { id: "r2", category: "policy", title: "Policy", priority: "required", status: "pending", canAutoFulfill: false },
          { id: "r3", category: "proof_of_stay", title: "Check-in", priority: "optional", status: "pending", canAutoFulfill: true },
        ],
      },
    };
    const result = projectEvidenceGaps(dispute);
    expect(result.totalGaps).toBe(2);
    expect(result.autoFulfillableCount).toBe(1);
    expect(result.manualCount).toBe(1);
    expect(result.gaps[0].requirementId).toBe("r2");
    expect(result.gaps[1].canAutoFulfill).toBe(true);
  });

  it("excludes not_applicable items from gaps", () => {
    const dispute = {
      id: "d1",
      evidencePlan: {
        requirements: [
          { id: "r1", category: "delivery", title: "Shipping", priority: "optional", status: "not_applicable" },
        ],
      },
    };
    const result = projectEvidenceGaps(dispute);
    expect(result.totalGaps).toBe(0);
  });
});
