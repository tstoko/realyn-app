export interface EvidenceRequirementDto {
  id: string;
  category: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  source?: string;
  fulfilledAt?: string;
}

export interface EvidenceInventoryDto {
  caseId: string;
  planExists: boolean;
  requirements: EvidenceRequirementDto[];
  totalRequired: number;
  totalFulfilled: number;
  percentComplete: number;
}

export interface EvidenceGapDto {
  requirementId: string;
  category: string;
  title: string;
  priority: string;
  canAutoFulfill: boolean;
  suggestedAction: string;
}

export interface EvidenceGapsDto {
  caseId: string;
  gaps: EvidenceGapDto[];
  totalGaps: number;
  autoFulfillableCount: number;
  manualCount: number;
}

export function projectEvidenceInventory(dispute: any): EvidenceInventoryDto {
  const plan = dispute.evidencePlan;
  const requirements = plan?.requirements || [];

  const mapped: EvidenceRequirementDto[] = requirements.map((r: any) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    source: r.source,
    fulfilledAt: r.fulfilledAt,
  }));

  const fulfilled = mapped.filter(
    (r) => r.status === "fulfilled" || r.status === "auto_fulfilled",
  ).length;

  return {
    caseId: dispute.id,
    planExists: !!plan,
    requirements: mapped,
    totalRequired: mapped.length,
    totalFulfilled: fulfilled,
    percentComplete:
      mapped.length > 0 ? Math.round((fulfilled / mapped.length) * 100) : 0,
  };
}

export function projectEvidenceGaps(dispute: any): EvidenceGapsDto {
  const plan = dispute.evidencePlan;
  const requirements = plan?.requirements || [];

  const gaps: EvidenceGapDto[] = requirements
    .filter(
      (r: any) =>
        r.status !== "fulfilled" &&
        r.status !== "auto_fulfilled" &&
        r.status !== "not_applicable",
    )
    .map((r: any) => ({
      requirementId: r.id,
      category: r.category,
      title: r.title,
      priority: r.priority,
      canAutoFulfill: r.canAutoFulfill === true,
      suggestedAction: r.canAutoFulfill
        ? "Use retrieve_operational_evidence to auto-collect"
        : "Use request_human_evidence to ask staff",
    }));

  return {
    caseId: dispute.id,
    gaps,
    totalGaps: gaps.length,
    autoFulfillableCount: gaps.filter((g) => g.canAutoFulfill).length,
    manualCount: gaps.filter((g) => !g.canAutoFulfill).length,
  };
}
