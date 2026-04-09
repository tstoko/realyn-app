import { describe, it, expect } from "vitest";
import type { McpSession } from "../types/mcp.js";

function makeSession(overrides: Partial<McpSession> = {}): McpSession {
  return {
    organizationId: "org1",
    userId: "user1",
    role: "user",
    authMode: "firebase_token",
    permissions: [],
    sessionId: "sess1",
    ...overrides,
  };
}

describe("org scope enforcement (unit logic)", () => {
  function checkOrgAccess(
    disputeOrgId: string,
    session: McpSession,
  ): boolean {
    if (session.role === "admin") return true;
    return disputeOrgId === session.organizationId;
  }

  it("allows access to own org", () => {
    const session = makeSession({ organizationId: "org1" });
    expect(checkOrgAccess("org1", session)).toBe(true);
  });

  it("denies access to different org", () => {
    const session = makeSession({ organizationId: "org1" });
    expect(checkOrgAccess("org2", session)).toBe(false);
  });

  it("allows admin access to any org", () => {
    const session = makeSession({ organizationId: "org1", role: "admin" });
    expect(checkOrgAccess("org2", session)).toBe(true);
  });
});
