/**
 * Argument Generator — Firestore-backed wrapper around @realyn/ai-core.
 */

import {
  generateDisputeArgument as generateDisputeArgumentCore,
} from "@realyn/ai-core/services/argumentGenerator";
import type { ArgumentGeneratorContext } from "@realyn/ai-core/services/argumentGenerator";
import type { EvidenceLoader, EnrichedEvidence } from "@realyn/ai-core";
import type {
  DisputeCase,
  EvidencePlan,
  EvidenceItem,
  DisputeArgument,
} from "../../types/aiDispute";
import {
  getEnrichedEvidence as getEnrichedEvidenceFirestore,
} from "../evidenceService";

export type { ArgumentGeneratorContext };

const firestoreEvidenceLoader: EvidenceLoader = {
  async getEnrichedEvidence(
    disputeId,
    evidencePlan,
    evidenceItems,
    options,
  ): Promise<EnrichedEvidence[]> {
    return getEnrichedEvidenceFirestore(disputeId, evidencePlan, evidenceItems, {
      preloadedFiles: options?.preloadedFiles as any,
      pmsMatch: options?.pmsMatch as any,
    }) as unknown as EnrichedEvidence[];
  },
};

export async function generateDisputeArgument(
  disputeCase: DisputeCase,
  evidencePlan: EvidencePlan,
  evidenceItems: EvidenceItem[],
  disputeId: string,
  context?: ArgumentGeneratorContext,
): Promise<DisputeArgument | null> {
  return generateDisputeArgumentCore(
    disputeCase,
    evidencePlan,
    evidenceItems,
    disputeId,
    firestoreEvidenceLoader,
    context,
  );
}
