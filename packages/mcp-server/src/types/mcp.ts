export type McpPermission =
  | "cases:read"
  | "cases:list"
  | "evidence:read"
  | "evidence:retrieve"
  | "evidence:plan"
  | "evidence:request"
  | "drafts:generate"
  | "drafts:validate"
  | "drafts:save"
  | "workflow:advance"
  | "submission:submit"
  | "submission:accept";

export interface McpSession {
  organizationId: string;
  userId: string | null;
  role: "admin" | "user";
  authMode: "firebase_token" | "api_key";
  permissions: McpPermission[];
  sessionId: string;
}

const USER_PERMISSIONS: McpPermission[] = [
  "cases:read",
  "cases:list",
  "evidence:read",
  "evidence:retrieve",
  "evidence:plan",
  "evidence:request",
  "drafts:generate",
  "drafts:validate",
  "drafts:save",
];

const ADMIN_PERMISSIONS: McpPermission[] = [
  ...USER_PERMISSIONS,
  "workflow:advance",
  "submission:submit",
  "submission:accept",
];

export function getPermissionsForRole(role: "admin" | "user"): McpPermission[] {
  return role === "admin" ? ADMIN_PERMISSIONS : USER_PERMISSIONS;
}

export function requirePermission(
  session: McpSession,
  permission: McpPermission,
): void {
  if (!session.permissions.includes(permission)) {
    throw new Error(
      `Permission denied: ${permission} not granted for this session`,
    );
  }
}
