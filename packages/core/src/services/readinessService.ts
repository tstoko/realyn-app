import * as admin from "firebase-admin";
import type { AuditTrailActor } from "../utils/auditTrailHelper";
import { getDisputeCodeInfo } from "../config/disputeCodeMapping";

export interface EvidenceCompleteness {
  requiredFulfilled: number;
  requiredTotal: number;
  optionalFulfilled: number;
  optionalTotal: number;
  percentComplete: number;
}

export type DeadlineRisk = "critical" | "urgent" | "normal" | "comfortable";
export type Winnability = "high" | "medium" | "low";
export type DraftStatus = "none" | "generated" | "validated" | "approved" | "submitted";
export type OverallReadiness =
  | "ready_for_draft"
  | "ready_for_review"
  | "ready_for_submission"
  | "blocked"
  | "not_contested";

export interface BlockingIssue {
  issue: string;
  severity: "critical" | "major" | "minor";
}

export interface ReadinessAssessment {
  caseId: string;
  assessedAt: admin.firestore.Timestamp;
  version: number;
  assessedBy: AuditTrailActor;
  evidenceCompleteness: EvidenceCompleteness;
  deadlineRisk: DeadlineRisk;
  daysRemaining: number | null;
  winnability: Winnability;
  recommendation: "fight" | "accept";
  draftStatus: DraftStatus;
  blockingIssues: BlockingIssue[];
  overallReadiness: OverallReadiness;
}

function getDb() {
  return admin.firestore();
}

function computeDaysRemaining(respondBy: any): number | null {
  if (!respondBy) return null;
  const deadline =
    respondBy instanceof admin.firestore.Timestamp
      ? respondBy.toDate()
      : new Date(respondBy);
  const now = new Date();
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeDeadlineRisk(daysRemaining: number | null): DeadlineRisk {
  if (daysRemaining === null) return "normal";
  if (daysRemaining <= 2) return "critical";
  if (daysRemaining <= 5) return "urgent";
  if (daysRemaining <= 10) return "normal";
  return "comfortable";
}

function computeDraftStatus(dispute: any): DraftStatus {
  if (!dispute.argumentDraft) return "none";
  const versions = dispute.argumentVersions || [];
  const submitted = versions.some((v: any) => v.isCurrent && v.isSubmitted);
  if (submitted) return "submitted";
  if (dispute.draftValidation) return "validated";
  return "generated";
}

export async function assessReadiness(
  caseId: string,
  assessedBy?: AuditTrailActor,
): Promise<ReadinessAssessment> {
  const db = getDb();
  const disputeDoc = await db.collection("disputes").doc(caseId).get();
  if (!disputeDoc.exists) {
    throw new Error(`Dispute ${caseId} not found`);
  }
  const dispute = disputeDoc.data()!;

  const plan = dispute.evidencePlan;
  const requirements = plan?.requirements || [];

  let requiredFulfilled = 0;
  let requiredTotal = 0;
  let optionalFulfilled = 0;
  let optionalTotal = 0;

  for (const req of requirements) {
    const isFulfilled =
      req.status === "fulfilled" || req.status === "auto_fulfilled";
    if (req.priority === "required" || req.priority === "critical") {
      requiredTotal++;
      if (isFulfilled) requiredFulfilled++;
    } else {
      optionalTotal++;
      if (isFulfilled) optionalFulfilled++;
    }
  }

  const totalItems = requiredTotal + optionalTotal;
  const totalFulfilled = requiredFulfilled + optionalFulfilled;
  const percentComplete = totalItems > 0 ? Math.round((totalFulfilled / totalItems) * 100) : 0;

  const daysRemaining = computeDaysRemaining(dispute.respondBy);
  const deadlineRisk = computeDeadlineRisk(daysRemaining);
  const draftStatus = computeDraftStatus(dispute);

  const codeInfo = dispute.reason ? getDisputeCodeInfo(dispute.reason) : null;
  const winnability: Winnability = plan?.winnability || codeInfo?.defaultWinnability || "medium";
  const recommendation: "fight" | "accept" =
    (plan?.recommendation as "fight" | "accept" | undefined) ??
    (codeInfo?.defaultRecommendation === "accept" ? "accept" : "fight");

  const blockingIssues: BlockingIssue[] = [];

  if (requiredFulfilled < requiredTotal) {
    const missing = requiredTotal - requiredFulfilled;
    blockingIssues.push({
      issue: `${missing} required evidence item(s) not yet fulfilled`,
      severity: missing > 2 ? "critical" : "major",
    });
  }

  if (daysRemaining !== null && daysRemaining <= 0) {
    blockingIssues.push({
      issue: "Response deadline has passed",
      severity: "critical",
    });
  } else if (daysRemaining !== null && daysRemaining <= 2) {
    blockingIssues.push({
      issue: `Only ${daysRemaining} day(s) remaining before deadline`,
      severity: "critical",
    });
  }

  if (!plan) {
    blockingIssues.push({
      issue: "No evidence plan generated yet",
      severity: "major",
    });
  }

  let overallReadiness: OverallReadiness;
  if (dispute.lifecycleStatus === "not_contested" || dispute.internalStatus === "accepted") {
    overallReadiness = "not_contested";
  } else if (blockingIssues.some((i) => i.severity === "critical")) {
    overallReadiness = "blocked";
  } else if (draftStatus === "validated" || draftStatus === "approved") {
    overallReadiness = "ready_for_submission";
  } else if (draftStatus === "generated") {
    overallReadiness = "ready_for_review";
  } else if (requiredFulfilled >= requiredTotal && requiredTotal > 0) {
    overallReadiness = "ready_for_draft";
  } else {
    overallReadiness = "blocked";
  }

  const actor: AuditTrailActor = assessedBy || { type: "system" };

  const existingHistory: any[] = dispute.readinessHistory || [];
  const version = existingHistory.length + 1;

  const assessment: ReadinessAssessment = {
    caseId,
    assessedAt: admin.firestore.Timestamp.now(),
    version,
    assessedBy: actor,
    evidenceCompleteness: {
      requiredFulfilled,
      requiredTotal,
      optionalFulfilled,
      optionalTotal,
      percentComplete,
    },
    deadlineRisk,
    daysRemaining,
    winnability,
    recommendation,
    draftStatus,
    blockingIssues,
    overallReadiness,
  };

  await db
    .collection("disputes")
    .doc(caseId)
    .update({
      readinessAssessment: assessment,
      readinessHistory: admin.firestore.FieldValue.arrayUnion(assessment),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return assessment;
}

export async function getLatestReadiness(
  caseId: string,
): Promise<ReadinessAssessment | null> {
  const db = getDb();
  const doc = await db.collection("disputes").doc(caseId).get();
  if (!doc.exists) return null;
  return (doc.data()?.readinessAssessment as ReadinessAssessment) || null;
}
