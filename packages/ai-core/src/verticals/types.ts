import type { EvidenceCategory } from "../types/aiDispute";

export interface VerticalDefinition {
  id: string;
  displayName: string;
  evidenceTypes: readonly string[];
  evidenceCategories: EvidenceCategory[];
  autoFulfillableTags: Record<string, (match: any) => boolean>;
  promptLabels: {
    entityName: string;
    bookingLabel: string;
    guestLabel: string;
    merchantLabel: string;
  };
  systemPrompts: {
    evidencePlanner: string;
    enhancedEvidencePlanner: string;
    relevanceScorer: string;
    qualityChecker: string;
    argumentGenerator: string;
  };
  operationalSystemType: string;
}
