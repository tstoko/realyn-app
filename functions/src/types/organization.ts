import * as admin from "firebase-admin";
import { OperaCloudConfig } from "../services/pms/providers/operaCloud/types";

export type PSPType = "stripe" | "adyen";

/**
 * Base interface for all PSP integrations.
 * Every PSP-specific integration type extends this with its own fields.
 */
export interface PSPIntegrationBase {
  /** Connection status */
  status: "connected" | "not_connected" | "error";
  /** When the integration was first connected */
  connectedAt?: Date;
  /** When the integration was last tested via "Test Connection" */
  lastTestedAt?: Date;
}

export interface StripeIntegration extends PSPIntegrationBase {
  secretKey?: string; // Encrypted - Restricted API key from Stripe (for manual setup)
  accessToken?: string; // Encrypted - OAuth access token from Stripe Connect
  webhookSecret: string; // Encrypted - Webhook signing secret
  merchantAccountId?: string;
  stripeUserId?: string; // Stripe Connect user ID (for OAuth setup)
  webhookEndpointId?: string; // Stripe webhook endpoint ID (for OAuth setup)
  status: "connected" | "not_connected";
}

export interface AdyenIntegration extends PSPIntegrationBase {
  apiKey?: string; // Encrypted - API key for Adyen API calls
  merchantAccounts?: string[]; // Array of merchant accounts - used to identify organization (optional for backward compatibility)
  merchantAccount?: string; // Legacy - kept for backward compatibility during migration
  webhookUsername?: string; // Encrypted - Webhook authentication username
  webhookPassword?: string; // Encrypted - Webhook HMAC password
  liveEndpointPrefix?: string;
}

export interface PSPIntegrations {
  stripe?: StripeIntegration;
  adyen?: AdyenIntegration;
}

export interface AutomationSettings {
  autoSubmissionEnabled: boolean;
  autoSubmissionMinAmount: number;
  autoMarkNotContested: boolean;
}

export interface Team {
  name: string;
  email: string;
}

export interface HotelDocument {
  id: string;
  name: string;
  category: "Cancellation Policy" | "Terms of Service" | "House Rules" | "Other";
  fileName: string;
  fileSize: number;
}

export interface HotelUser {
  id: string;
  name: string;
  email: string;
  role: "Manager" | "Staff";
  password?: string; // Encrypted
}

export interface PMSIntegrationConfig {
  type: "opera_csv" | "opera_xml" | "opera_delimited" | "mews_api" | "none";
  lastImportAt?: admin.firestore.Timestamp;
  lastImportId?: string;
  reservationCount?: number;
}

export interface Organization {
  id: string;
  name: string;
  location: string;
  pspIntegrations: PSPIntegrations;
  pmsIntegration?: PMSIntegrationConfig;
  operaCloudIntegration?: OperaCloudConfig;
  automationSettings: AutomationSettings;
  teams: Team[];
  documents: HotelDocument[];
  users: HotelUser[];
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

