import * as admin from "firebase-admin";

export interface CaseSummaryDto {
  id: string;
  organizationId: string;
  pspProvider?: string;
  pspDisputeId?: string;
  amount?: number;
  currency?: string;
  status: string;
  lifecycleStatus?: string;
  automationStatus?: string;
  internalStatus?: string;
  reason?: string;
  customerExplanation?: string;
  respondBy?: string;
  daysRemaining: number | null;
  createdAt?: string;
  updatedAt?: string;
  assigneeId?: string;
  assignedTeam?: string;
  evidencePlanSummary: {
    recommendation: string;
    winnability: string;
    requirementCount: number;
  } | null;
  draftSummary: {
    version: number;
    generatedAt?: string;
    isSubmitted: boolean;
  } | null;
}

function toISOString(val: any): string | undefined {
  if (!val) return undefined;
  if (val instanceof admin.firestore.Timestamp) return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return undefined;
}

function computeDaysRemaining(respondBy: any): number | null {
  if (!respondBy) return null;
  const deadline =
    respondBy instanceof admin.firestore.Timestamp
      ? respondBy.toDate()
      : new Date(respondBy);
  const now = new Date();
  return Math.ceil(
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function projectCase(dispute: any): CaseSummaryDto {
  const versions = dispute.argumentVersions || [];
  return {
    id: dispute.id,
    organizationId: dispute.organizationId,
    pspProvider: dispute.pspProvider,
    pspDisputeId: dispute.pspDisputeId,
    amount: dispute.amount,
    currency: dispute.currency,
    status: dispute.status,
    lifecycleStatus: dispute.lifecycleStatus,
    automationStatus: dispute.automationStatus,
    internalStatus: dispute.internalStatus,
    reason: dispute.reason,
    customerExplanation: dispute.customerExplanation,
    respondBy: toISOString(dispute.respondBy),
    daysRemaining: computeDaysRemaining(dispute.respondBy),
    createdAt: toISOString(dispute.createdAt),
    updatedAt: toISOString(dispute.updatedAt),
    assigneeId: dispute.assigneeId,
    assignedTeam: dispute.assignedTeam,
    evidencePlanSummary: dispute.evidencePlan
      ? {
          recommendation: dispute.evidencePlan.recommendation,
          winnability: dispute.evidencePlan.winnability,
          requirementCount: dispute.evidencePlan.requirements?.length ?? 0,
        }
      : null,
    draftSummary: dispute.argumentDraft
      ? {
          version:
            versions.filter((v: any) => v.isCurrent).length || 1,
          generatedAt: toISOString(dispute.argumentDraftGeneratedAt),
          isSubmitted:
            versions.some(
              (v: any) => v.isCurrent && v.isSubmitted,
            ) ?? false,
        }
      : null,
  };
}

export function projectCaseList(disputes: any[]): CaseSummaryDto[] {
  return disputes.map(projectCase);
}
