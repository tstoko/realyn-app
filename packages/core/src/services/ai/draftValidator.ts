import * as admin from "firebase-admin";
import { getTextCompletion } from "./llmService";
import { getDisputeCodeInfo } from "../../config/disputeCodeMapping";

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
  validatedAt: admin.firestore.Timestamp;
  draftVersion: number;
  overallSupport: OverallSupport;
  supportedClaims: ClaimValidation[];
  weakClaims: WeakClaim[];
  unsupportedClaims: UnsupportedClaim[];
  missingPspFields: MissingPspField[];
  submissionRisk: SubmissionRisk;
}

function getDb() {
  return admin.firestore();
}

const VALIDATION_PROMPT = `You are a chargeback dispute validation specialist. Analyze the following dispute draft argument against the available evidence and return a JSON assessment.

For each claim in the argument:
1. Determine if it is supported by the available evidence
2. If weak, explain why and suggest what evidence would strengthen it
3. If unsupported, explain why

Also check for required PSP submission fields that may be missing.

Return ONLY valid JSON matching this schema:
{
  "overallSupport": "strong" | "adequate" | "weak" | "unsupported",
  "supportedClaims": [{ "claim": string, "evidenceIds": string[] }],
  "weakClaims": [{ "claim": string, "reason": string, "suggestedEvidence": string[] }],
  "unsupportedClaims": [{ "claim": string, "reason": string }],
  "missingPspFields": [{ "field": string, "required": boolean }],
  "submissionRisk": "low" | "medium" | "high"
}`;

export async function validateDraft(
  caseId: string,
): Promise<DraftValidationResult> {
  const db = getDb();
  const disputeDoc = await db.collection("disputes").doc(caseId).get();
  if (!disputeDoc.exists) {
    throw new Error(`Dispute ${caseId} not found`);
  }
  const dispute = disputeDoc.data()!;

  if (!dispute.argumentDraft) {
    throw new Error(`Dispute ${caseId} has no draft argument to validate`);
  }

  const plan = dispute.evidencePlan;
  const requirements = plan?.requirements || [];
  const codeInfo = dispute.reason ? getDisputeCodeInfo(dispute.reason) : null;

  const evidenceItems: Array<{ requirementId: string; status: string; fileId?: string; fileName?: string; notes?: string }> =
    dispute.evidenceItems ?? [];

  const fulfilledEvidence = requirements
    .map((r: any) => {
      const item = evidenceItems.find((i) => i.requirementId === r.id);
      if (!item || (item.status !== "uploaded" && item.status !== "not_applicable")) return null;
      return {
        id: r.id,
        category: r.category,
        label: r.label,
        status: item.status,
        fileName: item.fileName,
        fileId: item.fileId,
      };
    })
    .filter(Boolean);

  const pendingEvidence = requirements
    .map((r: any) => {
      const item = evidenceItems.find((i) => i.requirementId === r.id);
      if (!item || item.status !== "pending") return null;
      return { id: r.id, category: r.category, label: r.label, status: "pending", required: r.required };
    })
    .filter(Boolean);

  const unavailableEvidence = requirements
    .map((r: any) => {
      const item = evidenceItems.find((i) => i.requirementId === r.id);
      if (!item || item.status !== "not_available") return null;
      return { id: r.id, category: r.category, label: r.label, status: "not_available", notes: item.notes };
    })
    .filter(Boolean);

  const versions = dispute.argumentVersions || [];
  const currentVersion = versions.filter((v: any) => v.isCurrent);
  const draftVersion = currentVersion.length || 1;

  const contextPayload = JSON.stringify({
    draftArgument: dispute.argumentDraft,
    availableEvidence: fulfilledEvidence,
    pendingEvidence,
    unavailableEvidence,
    reasonCode: dispute.reason,
    codeInfo: codeInfo
      ? {
          description: codeInfo.description,
          requiredEvidence: codeInfo.requiredEvidence,
          optionalEvidence: codeInfo.optionalEvidence,
        }
      : null,
    pspProvider: dispute.pspProvider,
  });

  const llmResponse = await getTextCompletion(
    `${VALIDATION_PROMPT}\n\nValidate this dispute draft:\n\n${contextPayload}`,
    { temperature: 0.1 },
  );

  let parsed: any;
  try {
    const text = llmResponse.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    parsed = {
      overallSupport: "weak",
      supportedClaims: [],
      weakClaims: [],
      unsupportedClaims: [
        { claim: "entire draft", reason: "Validation parsing failed" },
      ],
      missingPspFields: [],
      submissionRisk: "high",
    };
  }

  const result: DraftValidationResult = {
    caseId,
    validatedAt: admin.firestore.Timestamp.now(),
    draftVersion,
    overallSupport: parsed.overallSupport || "weak",
    supportedClaims: parsed.supportedClaims || [],
    weakClaims: parsed.weakClaims || [],
    unsupportedClaims: parsed.unsupportedClaims || [],
    missingPspFields: parsed.missingPspFields || [],
    submissionRisk: parsed.submissionRisk || "medium",
  };

  await db.collection("disputes").doc(caseId).update({
    draftValidation: result,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return result;
}
