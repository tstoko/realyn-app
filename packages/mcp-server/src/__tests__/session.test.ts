import { describe, it, expect } from "vitest";
import { requirePermission, getPermissionsForRole } from "../types/mcp.js";
import type { McpSession } from "../types/mcp.js";

function makeSession(overrides: Partial<McpSession> = {}): McpSession {
  return {
    organizationId: "org1",
    userId: "user1",
    role: "user",
    authMode: "firebase_token",
    permissions: getPermissionsForRole("user"),
    sessionId: "sess1",
    ...overrides,
  };
}

describe("requirePermission", () => {
  it("does not throw when permission is present", () => {
    const session = makeSession();
    expect(() => requirePermission(session, "cases:read")).not.toThrow();
  });

  it("throws when permission is missing", () => {
    const session = makeSession({ permissions: [] });
    expect(() => requirePermission(session, "cases:read")).toThrow("Permission denied");
  });
});

describe("getPermissionsForRole", () => {
  it("returns all permissions for admin", () => {
    const perms = getPermissionsForRole("admin");
    expect(perms).toContain("cases:read");
    expect(perms).toContain("submission:submit");
    expect(perms.length).toBeGreaterThan(5);
  });

  it("returns all permissions for user", () => {
    const perms = getPermissionsForRole("user");
    expect(perms).toContain("cases:read");
  });
});
