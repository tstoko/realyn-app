import * as admin from "firebase-admin";

// Server-side copy of plan definitions -- must stay in sync with packages/shared/src/billing.ts
export interface PlanFeatures {
  maxDisputesPerMonth: number;
  maxTeamMembers: number;
  aiDraftsEnabled: boolean;
  pmsIntegration: boolean;
  prioritySupport: boolean;
}

interface PlanDef {
  id: string;
  features: PlanFeatures;
}

const PLANS: PlanDef[] = [
  {
    id: "starter",
    features: {
      maxDisputesPerMonth: 25,
      maxTeamMembers: 3,
      aiDraftsEnabled: true,
      pmsIntegration: false,
      prioritySupport: false,
    },
  },
  {
    id: "professional",
    features: {
      maxDisputesPerMonth: -1,
      maxTeamMembers: -1,
      aiDraftsEnabled: true,
      pmsIntegration: true,
      prioritySupport: true,
    },
  },
];

export const FREE_TIER_FEATURES: PlanFeatures = {
  maxDisputesPerMonth: 5,
  maxTeamMembers: 1,
  aiDraftsEnabled: false,
  pmsIntegration: false,
  prioritySupport: false,
};

const TRIAL_FEATURES: PlanFeatures = {
  maxDisputesPerMonth: 25,
  maxTeamMembers: 3,
  aiDraftsEnabled: true,
  pmsIntegration: false,
  prioritySupport: false,
};

export function isKnownPlanId(id: string): boolean {
  return PLANS.some((p) => p.id === id);
}

function getPlanFeaturesById(planId: string): PlanFeatures {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan && planId !== "free" && planId !== "unknown") {
    console.warn(`[planEnforcement] Unrecognized planId "${planId}" — falling back to free tier`);
  }
  return plan?.features ?? FREE_TIER_FEATURES;
}

export class PlanLimitError extends Error {
  public readonly code = "PLAN_LIMIT" as const;
  public readonly httpStatus = 403;
  constructor(
    public readonly feature: string,
    message?: string,
  ) {
    super(message ?? `Plan limit reached: ${feature}`);
    this.name = "PlanLimitError";
  }
}

export interface OrgPlanContext {
  subscription: { planId: string; status: string } | null;
  features: PlanFeatures;
  isActive: boolean;
}

export async function getOrgPlanFeatures(
  organizationId: string,
): Promise<OrgPlanContext> {
  const db = admin.firestore();
  const orgDoc = await db.collection("organizations").doc(organizationId).get();
  if (!orgDoc.exists) {
    return { subscription: null, features: FREE_TIER_FEATURES, isActive: false };
  }

  const data = orgDoc.data();
  const sub = data?.subscription;

  if (!sub || !sub.status) {
    return { subscription: null, features: FREE_TIER_FEATURES, isActive: false };
  }

  const isActive = sub.status === "active" || sub.status === "trialing";
  if (!isActive) {
    return { subscription: sub, features: FREE_TIER_FEATURES, isActive: false };
  }

  if (sub.status === "trialing" && !sub.stripeSubscriptionId) {
    return { subscription: sub, features: TRIAL_FEATURES, isActive: true };
  }

  const features = getPlanFeaturesById(sub.planId);
  return { subscription: sub, features, isActive: true };
}

export async function assertFeatureEnabled(
  organizationId: string,
  feature: keyof PlanFeatures,
): Promise<void> {
  const { features } = await getOrgPlanFeatures(organizationId);
  const value = features[feature];
  if (value === false || value === 0) {
    throw new PlanLimitError(
      feature,
      `Your current plan does not include ${feature}. Please upgrade.`,
    );
  }
}

export async function assertDisputeQuota(
  organizationId: string,
): Promise<{ quotaExceeded: boolean }> {
  const { features, subscription } = await getOrgPlanFeatures(organizationId);

  if (features.maxDisputesPerMonth === -1) {
    return { quotaExceeded: false };
  }

  const periodStart = getPeriodStart(subscription);
  const db = admin.firestore();
  const countSnap = await db
    .collection("disputes")
    .where("organizationId", "==", organizationId)
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(periodStart))
    .count()
    .get();

  const currentCount = countSnap.data().count;
  return { quotaExceeded: currentCount >= features.maxDisputesPerMonth };
}

export async function assertTeamSeatQuota(
  organizationId: string,
  opts?: { excludePendingCount?: number },
): Promise<void> {
  const { features } = await getOrgPlanFeatures(organizationId);

  if (features.maxTeamMembers === -1) {
    return;
  }

  const db = admin.firestore();
  const membersSnap = await db
    .collection("users")
    .where("organizationId", "==", organizationId)
    .count()
    .get();

  const pendingSnap = await db
    .collection("organizations")
    .doc(organizationId)
    .collection("invites")
    .where("status", "==", "pending")
    .count()
    .get();

  const totalSeats =
    membersSnap.data().count +
    pendingSnap.data().count -
    (opts?.excludePendingCount ?? 0);
  if (totalSeats >= features.maxTeamMembers) {
    throw new PlanLimitError(
      "maxTeamMembers",
      `Team seat limit reached (${features.maxTeamMembers}). Please upgrade your plan.`,
    );
  }
}

function getPeriodStart(
  subscription: { planId: string; status: string; currentPeriodEnd?: unknown } | null,
): Date {
  if (subscription?.currentPeriodEnd) {
    const periodEnd =
      subscription.currentPeriodEnd instanceof admin.firestore.Timestamp
        ? subscription.currentPeriodEnd.toDate()
        : new Date(subscription.currentPeriodEnd as string | number);
    const start = new Date(periodEnd);
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function sendPlanLimitError(
  res: { status: (code: number) => { json: (body: unknown) => void } },
  err: PlanLimitError,
): void {
  res.status(err.httpStatus).json({
    success: false,
    code: err.code,
    feature: err.feature,
    error: err.message,
  });
}
