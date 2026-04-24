/**
 * Knowledge Base Types
 *
 * Defines the 5-table data model for the Knowledge Base.
 * These collections live in Firestore and are populated per-client
 * during onboarding. The AI pipeline falls back to static data from
 * disputeCodeMapping.ts when these collections are empty.
 *
 * Collections:
 *   schemeRules/{network}_{reasonCode}
 *   evidenceRequirements/{network}_{reasonCode}_{verticalId}
 *   pspFormats/{pspProvider}_{evidenceSlot}
 *   evidenceOutputTemplates/{evidenceType}_{verticalId}_{pspProvider}
 *   winPatterns/{network}_{reasonCode}_{verticalId}
 */

import type { CardNetwork } from "../config/disputeCodeMapping";
import type { EvidenceCategory } from "./aiDispute";

export type { CardNetwork, EvidenceCategory };

// ---------------------------------------------------------------------------
// 1. Scheme Rules — card network rules per reason code
// ---------------------------------------------------------------------------

export interface SchemeRuleCitation {
  section: string;
  excerpt: string;
}

export interface SchemeRuleTimeLimit {
  days: number;
  fromEvent: string;
}

export interface SchemeRule {
  code: string;
  network: CardNetwork;
  category: string;
  subcategory?: string;
  description: string;

  merchantObligation: string;
  cardholderBurden: string;
  timeLimit: SchemeRuleTimeLimit;
  citations: SchemeRuleCitation[];
  submissionConstraints: string[];

  hotelRelevance: "high" | "medium" | "low";
  commonInHotels: boolean;
  defaultRecommendation: "fight" | "evaluate" | "accept";
  defaultWinnability: "high" | "medium" | "low";
  requiredEvidence: EvidenceCategory[];
  optionalEvidence: EvidenceCategory[];

  effectiveDate: string;
  supersededDate?: string;
}

// ---------------------------------------------------------------------------
// 2. Evidence Requirement Rules — per reason code × vertical
// ---------------------------------------------------------------------------

export type EvidencePriority = "critical" | "high" | "medium" | "low";

export interface EvidenceRequirementItem {
  evidenceType: string;
  category: EvidenceCategory;
  priority: EvidencePriority;
  rationale: string;
  tips: string[];
  canAutoFulfill: boolean;
  sourceSystem?: string;
}

export interface EvidenceRequirementRule {
  reasonCode: string;
  network: CardNetwork;
  verticalId: string;
  requirements: EvidenceRequirementItem[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 3. PSP Format Rules — per PSP × evidence slot
// ---------------------------------------------------------------------------

export type PSPProvider = "stripe" | "adyen" | "other";
export type AcceptedFormat = "pdf" | "text" | "image" | "csv" | "json";

export interface PSPFormatRule {
  pspProvider: PSPProvider;
  evidenceSlot: string;
  apiFieldName: string;
  acceptedFormats: AcceptedFormat[];
  maxSizeBytes: number | null;
  isRequired: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// 4. Evidence Output Templates — per evidence type × vertical × PSP
// ---------------------------------------------------------------------------

export type OutputFormat = "text" | "pdf" | "image" | "passthrough";
export type ExtractionMethod =
  | "pms_folio"
  | "pms_reservation"
  | "pms_activity_log"
  | "policy_text"
  | "communication_log"
  | "custom";

export interface EvidenceOutputTemplate {
  evidenceType: string;
  verticalId: string;
  pspProvider: PSPProvider;
  outputFormat: OutputFormat;
  extractionMethod: ExtractionMethod;
  pspSlotMapping: string;
  templateNotes?: string;
}

// ---------------------------------------------------------------------------
// 5. Win Patterns — historical outcomes
// ---------------------------------------------------------------------------

export interface WinPattern {
  reasonCode: string;
  network: CardNetwork;
  verticalId: string;
  evidenceCombination: string[];
  argumentPatterns: string[];
  winCount: number;
  lossCount: number;
  winRate: number;
  sampleSize: number;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Assembled context — returned by knowledgeBaseService.assembleContext()
// ---------------------------------------------------------------------------

export interface KnowledgeContext {
  schemeRule: SchemeRule | null;
  evidenceRequirements: EvidenceRequirementRule | null;
  pspFormats: PSPFormatRule[];
  outputTemplates: EvidenceOutputTemplate[];
  winPatterns: WinPattern[];
}

// ---------------------------------------------------------------------------
// Collection name constants
// ---------------------------------------------------------------------------

export const KB_COLLECTIONS = {
  SCHEME_RULES: "schemeRules",
  EVIDENCE_REQUIREMENTS: "evidenceRequirements",
  PSP_FORMATS: "pspFormats",
  EVIDENCE_OUTPUT_TEMPLATES: "evidenceOutputTemplates",
  WIN_PATTERNS: "winPatterns",
} as const;

// ---------------------------------------------------------------------------
// Document ID helpers
// ---------------------------------------------------------------------------

export function schemeRuleDocId(network: CardNetwork, reasonCode: string): string {
  return `${network}_${reasonCode}`;
}

export function evidenceRequirementDocId(
  network: CardNetwork,
  reasonCode: string,
  verticalId: string,
): string {
  return `${network}_${reasonCode}_${verticalId}`;
}

export function pspFormatDocId(pspProvider: PSPProvider, evidenceSlot: string): string {
  return `${pspProvider}_${evidenceSlot}`;
}

export function outputTemplateDocId(
  evidenceType: string,
  verticalId: string,
  pspProvider: PSPProvider,
): string {
  return `${evidenceType}_${verticalId}_${pspProvider}`;
}

export function winPatternDocId(
  network: CardNetwork,
  reasonCode: string,
  verticalId: string,
): string {
  return `${network}_${reasonCode}_${verticalId}`;
}
