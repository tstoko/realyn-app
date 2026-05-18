/**
 * Back-compat re-export shim. The canonical billing types and plan
 * catalogue now live in `@realyn/ontology/billing.ts` (see ADR-0001).
 *
 * Do NOT add new entries here. Mutate `@realyn/ontology` instead.
 */
export type {
  SubscriptionStatus,
  Subscription,
  PlanFeatures,
  Plan,
} from "@realyn/ontology";
export {
  PLANS,
  getPlanById,
  isSubscriptionActive,
} from "@realyn/ontology";
