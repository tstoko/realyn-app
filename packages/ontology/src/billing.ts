import { z } from "zod";

/**
 * Lifecycle state of a Stripe subscription, mirrored into our
 * Organization document so the dashboard does not have to round-trip
 * through Stripe on every render.
 */
export const subscriptionStatusSchema = z.enum([
  "active",
  "past_due",
  "canceled",
  "trialing",
  "incomplete",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/**
 * Mirror of the Stripe subscription that gates an Organization's access
 * to paid features. Currently only the fields needed by the dashboard
 * are kept; expand here when adding paywalls.
 */
export interface Subscription {
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export const subscriptionSchema: z.ZodType<Subscription> = z.object({
  planId: z.string(),
  stripeCustomerId: z.string(),
  stripeSubscriptionId: z.string(),
  status: subscriptionStatusSchema,
  currentPeriodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean(),
});

/**
 * Per-plan feature flags. The dashboard reads these to decide what to
 * show / gate in the UI; functions reads them to gate the AI pipeline.
 * `-1` means unlimited.
 */
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

/**
 * Canonical plan catalogue. Moved verbatim from
 * `packages/shared/src/billing.ts`. The copy is hospitality-centric for
 * v0; when partner-readiness W2.3 lands its per-tenant configuration,
 * this list becomes per-vertical.
 */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For small hotels getting started with chargeback management.",
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
    id: "professional",
    name: "Professional",
    description: "For growing hotels that need full automation and integrations.",
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

export function isSubscriptionActive(
  status: SubscriptionStatus | undefined,
): boolean {
  return status === "active" || status === "trialing";
}
