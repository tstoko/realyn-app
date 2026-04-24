/**
 * Ports — dependency inversion interfaces for infra dependencies.
 *
 * The ai-core package is pure TypeScript with no Firebase/Firestore deps.
 * Consumers (packages/core, functions/) provide concrete implementations
 * of these interfaces that read from Firestore, APIs, etc.
 */

import type { EvidenceRequirement, EvidenceItem, EvidencePlan } from "./types/aiDispute";
import type {
  SchemeRule,
  EvidenceRequirementRule,
  PSPFormatRule,
  WinPattern,
} from "./types/knowledgeBase";

// ---------------------------------------------------------------------------
// PMS types used by the AI pipeline (shape only — no Firestore)
// ---------------------------------------------------------------------------

export interface PMSFolioLine {
  date: string;
  description: string;
  amount: number;
  category?: string;
}

export interface PMSFolio {
  lines: PMSFolioLine[];
  totalCharges: number;
  totalCredits: number;
  balance: number;
  currency: string;
}

export interface PMSReservation {
  confirmationNumber: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  roomNumber?: string;
  roomType?: string;
  rateCode?: string;
  adults?: number;
  children?: number;
  company?: string;
}

export interface PMSActivityLog {
  timestamp: string;
  action: string;
  details?: string;
  user?: string;
}

export interface PMSMatchResult {
  reservation: PMSReservation;
  folio?: PMSFolio;
  activityLogs: PMSActivityLog[];
  confidence: number;
  confirmationNumber: string;
  source: string;
  ambiguous?: boolean;
}

// ---------------------------------------------------------------------------
// Evidence service types used by argument generator
// ---------------------------------------------------------------------------

export interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storagePath: string;
  downloadURL: string;
  uploadedAt: unknown;
  uploadedBy: string;
  category: string;
}

export type EvidenceSlot =
  | "cancellation_policy"
  | "cancellation_policy_disclosure"
  | "refund_policy"
  | "refund_policy_disclosure"
  | "service_documentation"
  | "customer_communication"
  | "receipt"
  | "duplicate_charge_documentation"
  | "shipping_documentation"
  | "uncategorized_file"
  | "uncategorized_text";

export const EVIDENCE_SLOT_DESCRIPTIONS: Record<EvidenceSlot, string> = {
  cancellation_policy: "Your cancellation policy as shown to the customer",
  cancellation_policy_disclosure: "Proof the customer was shown the cancellation policy",
  refund_policy: "Your refund policy as shown to the customer",
  refund_policy_disclosure: "Proof the customer was shown the refund policy",
  service_documentation: "Documentation showing service was provided (folios, check-in records)",
  customer_communication: "Communications with the customer (emails, messages)",
  receipt: "Receipt or invoice for the transaction",
  duplicate_charge_documentation: "Proof charges are not duplicates",
  shipping_documentation: "Shipping/tracking information",
  uncategorized_file: "Additional supporting documentation",
  uncategorized_text: "Additional text explanation",
};

export interface EnrichedEvidence {
  requirement: EvidenceRequirement;
  item: EvidenceItem;
  file?: EvidenceFile;
  pdfText?: string;
  pdfPageCount?: number;
  structuredPmsText?: string;
  imageUrl?: string;
  evidenceSlot: EvidenceSlot;
  evidenceSlotDescription: string;
  priorityLabel: string;
}

// ---------------------------------------------------------------------------
// Draft validation result (pure version — no admin.firestore.Timestamp)
// ---------------------------------------------------------------------------

export interface ClaimValidation {
  claim: string;
  evidenceIds: string[];
}

export interface WeakClaim {
  claim: string;
  reason: string;
  suggestedEvidence: string[];
}

export interface UnsupportedClaim {
  claim: string;
  reason: string;
}

export interface MissingPspField {
  field: string;
  required: boolean;
}

export type OverallSupport = "strong" | "adequate" | "weak" | "unsupported";
export type SubmissionRisk = "low" | "medium" | "high";

export interface DraftValidationResult {
  caseId: string;
  validatedAt: unknown;
  draftVersion: number;
  overallSupport: OverallSupport;
  supportedClaims: ClaimValidation[];
  weakClaims: WeakClaim[];
  unsupportedClaims: UnsupportedClaim[];
  missingPspFields: MissingPspField[];
  submissionRisk: SubmissionRisk;
}

// ---------------------------------------------------------------------------
// Organization document types used by evidence analyzer
// ---------------------------------------------------------------------------

export interface OrgDocument {
  id: string;
  name: string;
  category: string;
  fileName: string;
  fileSize: number;
}

// ---------------------------------------------------------------------------
// Port interfaces — implementations provided by consumers
// ---------------------------------------------------------------------------

/**
 * Loads enriched evidence for argument generation.
 * In production, reads from Firestore + Storage.
 */
export interface EvidenceLoader {
  getEnrichedEvidence(
    disputeId: string,
    evidencePlan: EvidencePlan,
    evidenceItems: EvidenceItem[],
    options?: {
      preloadedFiles?: EvidenceFile[];
      pmsMatch?: PMSMatchResult;
    },
  ): Promise<EnrichedEvidence[]>;
}

/**
 * Loads organization documents for evidence analysis.
 * In production, reads from Firestore.
 */
export interface OrgDocumentLoader {
  getOrgDocuments(organizationId: string): Promise<OrgDocument[]>;
}

/**
 * Provides knowledge base data for the AI pipeline.
 * In production, reads from Firestore KB collections with
 * fallback to static disputeCodeMapping data.
 */
export interface KBProvider {
  getSchemeRule(network: string, reasonCode: string): Promise<SchemeRule | null>;
  getEvidenceRequirements(
    reasonCode: string,
    network: string,
    verticalId: string,
  ): Promise<EvidenceRequirementRule | null>;
  getPSPFormats(pspProvider: string): Promise<PSPFormatRule[]>;
  getWinPatterns(
    reasonCode: string,
    network: string,
    verticalId: string,
  ): Promise<WinPattern[]>;
}
