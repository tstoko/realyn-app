/**
 * Knowledge Base Types (functions copy)
 *
 * Minimal subset of the knowledge base types needed by the evidence
 * auto-collector and PSP mappers in the functions package.
 * The canonical types are in packages/core/src/types/knowledgeBase.ts.
 */

export type CardNetwork = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export type PSPProvider = "stripe" | "adyen" | "other";
export type AcceptedFormat = "pdf" | "text" | "image" | "csv" | "json";
export type OutputFormat = "text" | "pdf" | "image" | "passthrough";
export type ExtractionMethod =
  | "pms_folio"
  | "pms_reservation"
  | "pms_activity_log"
  | "policy_text"
  | "communication_log"
  | "custom";

export interface PSPFormatRule {
  pspProvider: PSPProvider;
  evidenceSlot: string;
  apiFieldName: string;
  acceptedFormats: AcceptedFormat[];
  maxSizeBytes: number | null;
  isRequired: boolean;
  description: string;
}

export interface EvidenceOutputTemplate {
  evidenceType: string;
  verticalId: string;
  pspProvider: PSPProvider;
  outputFormat: OutputFormat;
  extractionMethod: ExtractionMethod;
  pspSlotMapping: string;
  templateNotes?: string;
}

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

export const KB_COLLECTIONS = {
  PSP_FORMATS: "pspFormats",
  EVIDENCE_OUTPUT_TEMPLATES: "evidenceOutputTemplates",
  WIN_PATTERNS: "winPatterns",
} as const;

export function winPatternDocId(
  network: CardNetwork,
  reasonCode: string,
  verticalId: string,
): string {
  return `${network}_${reasonCode}_${verticalId}`;
}
