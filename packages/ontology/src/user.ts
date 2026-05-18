import { z } from "zod";

/**
 * Canonical role of a User within an Organization. Currently a
 * coarse-grained pair until RBAC lands in W2.x.
 */
export const userRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Canonical User document. The dashboard, functions, and ai-core all
 * read this shape; persisted under `users/{userId}` in Firestore.
 *
 * `hotelName` is the historical field name from the v0 product; the
 * partner-readiness plan replaces this with `organizationId` + a
 * canonical `Organization.name` lookup. Field is kept here for
 * back-compat with documents written before the rename.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  organizationId?: string;
  hotelName?: string;
  tosAcceptedAt?: Date | string;
  tosVersion?: string;
  privacyAcceptedAt?: Date | string;
  privacyVersion?: string;
}

/**
 * Zod schema mirroring the User interface. Loose by design at v0 — we do
 * NOT call `.strict()` because existing Firestore documents may carry
 * fields that pre-date this schema. W1.1 tightens this once the data
 * has been audited.
 */
export const userSchema: z.ZodType<User> = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
  phone: z.string().optional(),
  organizationId: z.string().optional(),
  hotelName: z.string().optional(),
  tosAcceptedAt: z.union([z.date(), z.string()]).optional(),
  tosVersion: z.string().optional(),
  privacyAcceptedAt: z.union([z.date(), z.string()]).optional(),
  privacyVersion: z.string().optional(),
});

/**
 * Per-user UI/notification preferences. Stored under
 * `users/{userId}/preferences/main`. No zod schema in P0.3 — this type
 * is consumed only by the dashboard today and there is no cross-package
 * validation site for it.
 */
export interface UserPreferences {
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    onActionRequired: boolean;
    onStatusChange: boolean;
    onPaymentAlert: boolean;
    weeklySummary: boolean;
  };
  theme: "dark" | "light" | "system";
  timezone: string;
  language: string;
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
  timeFormat: "12h" | "24h";
  twoFactorEnabled: boolean;
}
