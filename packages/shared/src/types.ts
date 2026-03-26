import { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Users & Preferences
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  phone?: string;
  organizationId?: string;
  hotelName?: string;
  tosAcceptedAt?: Date | string;
  tosVersion?: string;
  privacyAcceptedAt?: Date | string;
  privacyVersion?: string;
}

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
  theme: 'dark' | 'light' | 'system';
  timezone: string;
  language: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  twoFactorEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export type DisputeStatus =
  | 'needs_response'
  | 'won'
  | 'lost'
  | 'under_review'
  | 'warning_closed';

export type AutomationStatus =
  | 'auditing'
  | 'awaiting_info'
  | 'responding'
  | 'submitted'
  | 'manual_review'
  | 'unwinnable'
  | 'complete';

export type DisputeLifecycleStatus =
  | 'new'
  | 'evidence_in_progress'
  | 'draft_ready'
  | 'submitted'
  | 'under_review'
  | 'won'
  | 'lost'
  | 'not_contested';

export type InternalStatus =
  | 'needs_review'
  | 'awaiting_docs'
  | 'ready_to_submit'
  | 'resolved';

export interface Note {
  id: string;
  author: string;
  timestamp: Date | string;
  text: string;
}

export type AuditTrailCategory =
  | 'dispute_received'
  | 'pms_matching'
  | 'evidence_planning'
  | 'evidence_upload'
  | 'argument_generation'
  | 'submission'
  | 'status_change'
  | 'user_action'
  | 'integration_config'
  | 'pms_import'
  | 'error';

export interface AutomationStep {
  timestamp: Date;
  title: string;
  description: string;
  status: 'pending' | 'success' | 'failure' | 'in_progress';
  actor?: { type: 'user'; userId: string; userName: string } | { type: 'system' };
  category?: AuditTrailCategory;
  metadata?: Record<string, unknown>;
  relatedResources?: {
    evidenceFileIds?: string[];
    evidencePlanId?: string;
    argumentVersionId?: string;
  };
}

export interface Dispute {
  id: string;
  organizationId?: string;

  // Legacy Stripe fields (kept for backward compat)
  stripeDisputeId?: string;
  stripePaymentIntentId?: string;

  // PSP-agnostic fields
  pspProvider?: 'stripe' | 'adyen' | 'unknown';
  pspDisputeId?: string;
  pspPaymentId?: string;
  pspTransactionDate?: Date | Timestamp | null;
  pspLast4Digits?: string | null;

  status: DisputeStatus;
  reason?: string | null;
  amount: number;
  currency: string;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  respondBy?: Timestamp | Date;
  customerExplanation?: string;

  // AI / Automation
  automationStatus?: AutomationStatus;
  awaitingInfoFrom?: string;
  missingEvidence?: string[];
  auditTrail?: AutomationStep[];
  aiSummary?: string;
  aiDraftResponse?: string;
  isDraftApproved?: boolean;
  lifecycleStatus?: DisputeLifecycleStatus;
  internalNotes?: Note[];
  assignedTeam?: string;
  assigneeId?: string | null;
  internalStatus?: InternalStatus;

  // Evidence
  evidencePlan?: EvidencePlan;
  evidenceItems?: EvidenceItem[];
  evidencePlanGeneratedAt?: Date;
  evidencePlanVersions?: EvidencePlan[];
  useAIPlan?: boolean;
  evidencePlanStatus?: string;
  evidencePlanError?: string | null;

  // Arguments
  argumentDraft?: DisputeArgument;
  argumentDraftGeneratedAt?: Date;
  argumentVersions?: ArgumentVersion[];
  argumentSubmittedAt?: Date;
}

export interface FilterState {
  status?: 'all' | DisputeStatus;
  reason?: 'all' | string;
  searchText?: string;
}

export interface SortState {
  field: keyof Dispute;
  direction: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Evidence & Arguments
// ---------------------------------------------------------------------------

export type EvidenceCategory =
  | 'pms_data'
  | 'policy'
  | 'proof_of_stay'
  | 'communications'
  | 'payment_data'
  | 'incident_reports'
  | 'delivery'
  | 'other';

export type EvidenceRequirementStatus = 'pending' | 'uploaded' | 'not_available' | 'not_applicable';

export interface EvidenceRequirement {
  id: string;
  category: EvidenceCategory;
  label: string;
  tag?: string;
  description: string;
  example?: string;
  sourceHint?: string;
  instructions?: string;
  required: boolean;
  priority: number;
}

export interface EvidenceItem {
  requirementId: string;
  status: EvidenceRequirementStatus;
  fileId?: string;
  fileName?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  notes?: string;
}

export interface EvidencePlan {
  disputeCategory: string;
  disputeSubtype?: string;
  reasonCode?: string;
  network?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';
  recommendation: 'fight' | 'accept';
  winnability: 'high' | 'medium' | 'low';
  winnabilityReason: string;
  requirements: EvidenceRequirement[];
  summary: string;
  generatedAt?: string;
  model?: string;
}

export interface TimelineEvent {
  date: string;
  description: string;
  evidenceId?: string;
}

export interface ArgumentParagraph {
  heading: string;
  content: string;
  evidenceReferences?: string[];
}

export interface DisputeArgument {
  executiveSummary: string;
  timeline: TimelineEvent[];
  paragraphs: ArgumentParagraph[];
  customerClaimRebuttal?: string;
  conclusion: string;
  uncategorizedText?: string;
  productDescription?: string;
  customerName?: string;
  customerEmail?: string;
  billingAddress?: string;
  shippingAddress?: string;
  customerSignature?: string;
  receipt?: string;
  serviceDates?: string;
  cancellationPolicy?: string;
  cancellationPolicyDisclosure?: string;
  refundPolicy?: string;
  refundPolicyDisclosure?: string;
  refundRefusalExplanation?: string;
  customerCommunication?: string;
  generatedAt?: string | Date;
  model?: string;
  version?: number;
}

export interface ArgumentVersion {
  argument: DisputeArgument;
  generatedAt: Date;
  version: number;
  isCurrent: boolean;
  isSubmitted: boolean;
  submittedAt?: Date;
}

// ---------------------------------------------------------------------------
// Hotel building-blocks
// ---------------------------------------------------------------------------

export interface Team {
  name: string;
  email: string;
}

export type DocumentCategory = 'Cancellation Policy' | 'Terms of Service' | 'House Rules' | 'Other';

export interface HotelDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  fileName: string;
  fileSize: number;
}

export interface HotelUser {
  id: string;
  name: string;
  email: string;
  role: 'Manager' | 'Staff';
  password: string;
}

export interface AutomationSettings {
  autoSubmissionEnabled: boolean;
  autoSubmissionMinAmount: number;
  autoMarkNotContested: boolean;
}

// ---------------------------------------------------------------------------
// PSP (Payment Service Provider)
// ---------------------------------------------------------------------------

export interface PSPIntegration {
  type: 'none' | 'stripe' | 'adyen';
  status: 'connected' | 'not_connected' | 'error';
}

/**
 * Base interface for all PSP integration configs.
 * Each provider extends this with provider-specific fields.
 */
export interface PSPIntegrationBase {
  status?: 'connected' | 'not_connected' | 'error';
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

// ---------------------------------------------------------------------------
// PMS (Property Management System)
// ---------------------------------------------------------------------------

export interface PMSIntegration {
  type: 'none' | 'opera_csv' | 'opera_xml' | 'opera_delimited' | 'mews_api';
  reservationCount?: number;
  lastImportAt?: Date;
  lastImportId?: string;
}

// ---------------------------------------------------------------------------
// OPERA Cloud (OHIP)
// ---------------------------------------------------------------------------

export interface OperaCloudIntegration {
  gatewayUrl: string;
  authMode: 'ocim' | 'ssd';
  oauthClientId: string;
  oauthClientSecret?: string;
  appKey?: string;
  enterpriseId?: string;
  hotelCodes: string[];
  integrationUsername?: string;
  integrationPassword?: string;
  status: 'connected' | 'not_connected' | 'error';
  lastTestedAt?: Date;
}

// ---------------------------------------------------------------------------
// Hotel (frontend view-model — flattened from Organization)
// ---------------------------------------------------------------------------

export interface Hotel {
  id: string;
  name: string;
  location: string;
  teams: Team[];
  documents: HotelDocument[];
  users: HotelUser[];
  integrations: { psp: PSPIntegration };
  pmsIntegration?: PMSIntegration;
  operaCloudIntegration?: OperaCloudIntegration;
  automationSettings: AutomationSettings;
  isDemo?: boolean;

  // Denormalized PSP credential fields used during editing
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

// ---------------------------------------------------------------------------
// Organization (Firestore document shape)
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  location: string;
  pspIntegrations: PSPIntegrationsConfig;
  pmsIntegrations?: Record<string, unknown>;
  pmsIntegration?: PMSIntegration;
  operaCloudIntegration?: OperaCloudIntegration;
  automationSettings: AutomationSettings;
  teams: Team[];
  documents: HotelDocument[];
  users: HotelUser[];
  isDemo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityLogItem {
  id: string;
  user: { name: string; id: string };
  action: string;
  target: { type: string; name: string };
  timestamp: Date;
}
