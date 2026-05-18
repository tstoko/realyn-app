import { z } from "zod";
import type { Timestamp } from "./timestamp";
import type { SubscriptionStatus } from "./billing";
import { subscriptionStatusSchema } from "./billing";

/**
 * Document categories surfaced in the dashboard's policy library. The
 * set is hospitality-centric for v0 — W1.x replaces this with the
 * vertical-driven categories pulled from `@realyn/ontology/vertical`.
 */
export type DocumentCategory =
  | "Cancellation Policy"
  | "Terms of Service"
  | "House Rules"
  | "Terms & Conditions"
  | "Other";

export interface HotelDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  fileName: string;
  fileSize: number;
}

/**
 * Hospitality-flavoured user role. Currently distinct from the
 * platform-level `UserRole` because the dashboard renders these labels
 * directly. W2.x folds both into a single RBAC model.
 */
export interface HotelUser {
  id: string;
  name: string;
  email: string;
  role: "Manager" | "Staff";
  firebaseUid?: string;
}

export interface Team {
  name: string;
  email: string;
}

export const inviteStatusSchema = z.enum([
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export interface Invite {
  id: string;
  organizationId: string;
  email: string;
  role: "Manager" | "Staff";
  invitedBy: string;
  status: InviteStatus;
  createdAt: Timestamp | Date;
  expiresAt: Timestamp | Date;
}

/**
 * Per-org automation policy. Read by the AI pipeline before it
 * auto-submits or auto-classifies a dispute. Mirrors the dashboard's
 * "Automation Settings" panel.
 */
export interface AutomationSettings {
  autoSubmissionEnabled: boolean;
  autoSubmissionMinAmount: number;
  autoMarkNotContested: boolean;
}

export const automationSettingsSchema: z.ZodType<AutomationSettings> = z.object(
  {
    autoSubmissionEnabled: z.boolean(),
    autoSubmissionMinAmount: z.number(),
    autoMarkNotContested: z.boolean(),
  },
);

/**
 * Flat "connection state" indicator surfaced on the dashboard hotel
 * card. Read for display only — the actual credentials live inside
 * `PSPIntegrationsConfig`.
 */
export interface PSPIntegration {
  type: "none" | "stripe" | "adyen";
  status: "connected" | "not_connected" | "error";
}

/**
 * Shared base for all PSP integration configs. Each provider extends
 * with provider-specific credentials.
 */
export interface PSPIntegrationBase {
  status?: "connected" | "not_connected" | "error";
  connectedAt?: Date;
  lastTestedAt?: Date;
}

export interface StripeIntegrationConfig extends PSPIntegrationBase {
  secretKey?: string;
  accessToken?: string;
  webhookSecret?: string;
  merchantAccountId?: string;
  stripeUserId?: string;
  webhookEndpointId?: string;
}

export interface AdyenIntegrationConfig extends PSPIntegrationBase {
  apiKey?: string;
  merchantAccounts?: string[];
  merchantAccount?: string;
  webhookUsername?: string;
  webhookPassword?: string;
  liveEndpointPrefix?: string;
}

export interface PSPIntegrationsConfig {
  stripe?: StripeIntegrationConfig;
  adyen?: AdyenIntegrationConfig;
}

/**
 * Flat indicator of the active PMS integration. Pre-dates the
 * `EvidenceSourceClient` connector model that W1.2 introduces; once
 * connectors land, this collapses into the more general
 * `EvidenceSourceConnection` (see partner-readiness-plan W2.3).
 */
export interface PMSIntegration {
  type:
    | "none"
    | "opera_cloud_api"
    | "opera_csv"
    | "opera_xml"
    | "opera_delimited"
    | "mews_api";
  reservationCount?: number;
  lastImportAt?: Date;
  lastImportId?: string;
}

export interface OperaCloudIntegration {
  gatewayUrl: string;
  authMode: "ocim" | "ssd";
  oauthClientId: string;
  oauthClientSecret?: string;
  appKey?: string;
  enterpriseId?: string;
  hotelCodes: string[];
  integrationUsername?: string;
  integrationPassword?: string;
  status: "connected" | "not_connected" | "error";
  lastTestedAt?: Date;
}

/**
 * Frontend view-model — flattened representation of an Organization
 * with PSP credentials surfaced as denormalized fields for editing.
 * Constructed by the dashboard's `HotelContext`; never persisted.
 * Eventually superseded by Organization once the dashboard is refactored
 * to read the canonical shape directly.
 */
export interface Hotel {
  id: string;
  name: string;
  location: string;
  industry?: string;
  teams: Team[];
  documents: HotelDocument[];
  users: HotelUser[];
  integrations: { psp: PSPIntegration };
  pmsIntegration?: PMSIntegration;
  operaCloudIntegration?: OperaCloudIntegration;
  automationSettings: AutomationSettings;
  isDemo?: boolean;

  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripeMerchantAccountId?: string;
  adyenApiKey?: string;
  adyenMerchantAccount?: string;
  adyenMerchantAccounts?: string[];
  adyenWebhookUsername?: string;
  adyenWebhookPassword?: string;
  adyenLiveEndpointPrefix?: string;
}

/**
 * Canonical Organization document. Persisted under
 * `organizations/{orgId}` in Firestore.
 *
 * History: the v0 name was "hotel" and survives in the `Hotel` view-
 * model above. W2.3 in the partner-readiness plan extends this with
 * `vertical`, `mode`, `evidenceSources`, `promptOverrides`, and
 * `ontologyVersion` — not in P0.3 scope to keep the skeleton a pure
 * move.
 */
export interface Organization {
  id: string;
  name: string;
  location: string;
  industry?: string;
  pspIntegrations: PSPIntegrationsConfig;
  pmsIntegrations?: Record<string, unknown>;
  pmsIntegration?: PMSIntegration;
  operaCloudIntegration?: OperaCloudIntegration;
  automationSettings: AutomationSettings;
  teams: Team[];
  documents: HotelDocument[];
  users: HotelUser[];
  isDemo?: boolean;
  subscription?: {
    planId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for Organization. Loose at v0 — PSP credentials and inline
 * subscription / integration shapes are typed as `z.unknown()` because
 * they are written directly from PSP webhooks / dashboard forms and have
 * not yet been validated at any boundary. W1.1 tightens this.
 *
 * As with `disputeSchema`, we deliberately do NOT annotate the result
 * as `z.ZodType<Organization>` — `z.unknown()` widens the inferred
 * shape past the strict interface. The interface remains the source of
 * truth; the schema is a runtime safety net.
 */
export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  industry: z.string().optional(),
  pspIntegrations: z.unknown(),
  pmsIntegrations: z.record(z.unknown()).optional(),
  pmsIntegration: z.unknown().optional(),
  operaCloudIntegration: z.unknown().optional(),
  automationSettings: automationSettingsSchema,
  teams: z.array(z.unknown()),
  documents: z.array(z.unknown()),
  users: z.array(z.unknown()),
  isDemo: z.boolean().optional(),
  subscription: z
    .object({
      planId: z.string(),
      stripeCustomerId: z.string(),
      stripeSubscriptionId: z.string(),
      status: subscriptionStatusSchema,
      currentPeriodEnd: z.date(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export interface ActivityLogItem {
  id: string;
  user: { name: string; id: string };
  action: string;
  target: { type: string; name: string };
  timestamp: Date;
}
