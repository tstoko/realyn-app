import { describe, it, expect } from "vitest";
import { projectOrg, projectIntegrationStatus } from "../dto/orgDto.js";

describe("projectOrg", () => {
  it("strips credentials from output", () => {
    const org = {
      id: "org1",
      name: "Test Hotel",
      location: "NYC",
      industry: "hospitality",
      teams: [{ id: "t1" }],
      documents: [{ id: "d1" }, { id: "d2" }],
      pspIntegrations: {
        stripe: {
          status: "connected",
          secretKey: "sk_live_secret",
          accessToken: "tok_secret",
        },
      },
      operaCloudIntegration: {
        status: "connected",
        oauthClientSecret: "secret123",
      },
    };

    const dto = projectOrg(org);
    expect(dto.id).toBe("org1");
    expect(dto.name).toBe("Test Hotel");
    expect(dto.teamCount).toBe(1);
    expect(dto.documentCount).toBe(2);
    expect(dto.integrationStatus.stripe).toBe(true);
    expect(dto.integrationStatus.operaCloud).toBe(true);

    const json = JSON.stringify(dto);
    expect(json).not.toContain("sk_live_secret");
    expect(json).not.toContain("tok_secret");
    expect(json).not.toContain("secret123");
  });

  it("handles missing integrations", () => {
    const org = { id: "org1", name: "Bare Hotel" };
    const dto = projectOrg(org);
    expect(dto.integrationStatus.stripe).toBe(false);
    expect(dto.integrationStatus.adyen).toBe(false);
    expect(dto.integrationStatus.operaCloud).toBe(false);
    expect(dto.integrationStatus.pmsType).toBe("none");
  });
});

describe("projectIntegrationStatus", () => {
  it("returns connection status without credentials", () => {
    const org = {
      id: "org1",
      pspIntegrations: {
        stripe: { status: "connected", merchantAccountId: "acct_123", secretKey: "sk_live_xxx" },
      },
    };
    const dto = projectIntegrationStatus(org);
    expect(dto.stripe.connected).toBe(true);
    expect(dto.stripe.merchantAccountId).toBe("acct_123");
    const json = JSON.stringify(dto);
    expect(json).not.toContain("sk_live_xxx");
  });
});
