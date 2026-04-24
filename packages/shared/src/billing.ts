export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';

export interface Subscription {
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface PlanFeatures {
  maxDisputesPerMonth: number;
  maxTeamMembers: number;
  aiDraftsEnabled: boolean;
  pmsIntegration: boolean;
  prioritySupport: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  features: PlanFeatures;
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small hotels getting started with chargeback management.',
    monthlyPriceUsd: 49,
    yearlyPriceUsd: 470,
    features: {
      maxDisputesPerMonth: 25,
      maxTeamMembers: 3,
      aiDraftsEnabled: true,
      pmsIntegration: false,
      prioritySupport: false,
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing hotels that need full automation and integrations.',
    monthlyPriceUsd: 149,
    yearlyPriceUsd: 1430,
    features: {
      maxDisputesPerMonth: -1,
      maxTeamMembers: -1,
      aiDraftsEnabled: true,
      pmsIntegration: true,
      prioritySupport: true,
    },
  },
];

export function getPlanById(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId);
}

export function isSubscriptionActive(status: SubscriptionStatus | undefined): boolean {
  return status === 'active' || status === 'trialing';
}
