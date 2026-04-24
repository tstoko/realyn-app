/**
 * Evidence Analyzer — Firestore-backed wrapper around @realyn/ai-core.
 *
 * The pure analysis logic lives in ai-core. This module provides the
 * OrgDocumentLoader implementation that reads from Firestore.
 */

import * as admin from "firebase-admin";
import { analyzeExistingEvidence as analyzeExistingEvidenceCore } from "@realyn/ai-core/services/specialists/evidenceAnalyzer";
import type { OrgDocumentLoader, OrgDocument } from "@realyn/ai-core";
import type { ExistingEvidenceAnalysis, DisputeCase, ClaimAnalysis } from "../../../types/aiDispute";

const firestoreOrgDocLoader: OrgDocumentLoader = {
  async getOrgDocuments(organizationId: string): Promise<OrgDocument[]> {
    const db = admin.firestore();
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) return [];
    const orgData = orgDoc.data();
    return orgData?.documents || [];
  },
};

export async function analyzeExistingEvidence(
  organizationId: string,
  disputeCase?: DisputeCase,
  claimAnalysis?: ClaimAnalysis,
): Promise<ExistingEvidenceAnalysis | null> {
  return analyzeExistingEvidenceCore(
    organizationId,
    firestoreOrgDocLoader,
    disputeCase,
    claimAnalysis,
  );
}
