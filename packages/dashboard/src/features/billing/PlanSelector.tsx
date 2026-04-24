import React, { useState } from 'react';
import { PLANS, isSubscriptionActive } from '@realyn/shared';
import type { Organization } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../../config/environment';
import { getCloudFunctionJsonHeaders } from '../../services/cloudFunctionAuth';

interface PlanSelectorProps {
  organization: Organization | null;
}

export const PlanSelector: React.FC<PlanSelectorProps> = ({ organization }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');

  const currentPlanId = organization?.subscription?.planId;
  const isActive = isSubscriptionActive(organization?.subscription?.status);

  const handleSelectPlan = async (planId: string) => {
    setLoading(planId);
    setError(null);

    try {
      const authResult = await getCloudFunctionJsonHeaders();
      if (!authResult.ok) throw new Error(authResult.error);

      const priceMap: Record<string, string | undefined> = {
        starter_monthly: import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY,
        starter_yearly: import.meta.env.VITE_STRIPE_PRICE_STARTER_YEARLY,
        professional_monthly: import.meta.env.VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY,
        professional_yearly: import.meta.env.VITE_STRIPE_PRICE_PROFESSIONAL_YEARLY,
      };

      const priceId = priceMap[`${planId}_${billingInterval}`];
      if (!priceId) {
        throw new Error(`Stripe price not configured for ${planId} (${billingInterval}). Set VITE_STRIPE_PRICE_${planId.toUpperCase()}_${billingInterval.toUpperCase()} in your environment.`);
      }

      const response = await fetch(`${FUNCTIONS_BASE_URL}/createCheckoutSession`, {
        method: 'POST',
        headers: authResult.headers,
        body: JSON.stringify({ priceId, planId, billingInterval }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create checkout session');

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const featureLabels: Record<string, string> = {
    maxDisputesPerMonth: 'Disputes / month',
    maxTeamMembers: 'Team members',
    aiDraftsEnabled: 'AI-powered drafts',
    pmsIntegration: 'PMS integration',
    prioritySupport: 'Priority support',
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-50">Choose your plan</h2>
        <p className="mt-2 text-slate-400">Start with a 14-day free trial. No credit card required.</p>

        <div className="mt-4 inline-flex items-center bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setBillingInterval('monthly')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              billingInterval === 'monthly'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingInterval('yearly')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              billingInterval === 'yearly'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Yearly <span className="text-xs text-green-400 ml-1">Save 20%</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = currentPlanId === plan.id && isActive;
          const price = billingInterval === 'yearly' ? plan.yearlyPriceUsd : plan.monthlyPriceUsd;
          const perMonth = billingInterval === 'yearly' ? Math.round(plan.yearlyPriceUsd / 12) : plan.monthlyPriceUsd;

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-6 transition-all ${
                isCurrent
                  ? 'border-cyan-500 bg-cyan-500/5'
                  : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-4 px-3 py-0.5 bg-cyan-600 text-white text-xs font-medium rounded-full">
                  Current Plan
                </div>
              )}

              <h3 className="text-xl font-bold text-slate-50">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{plan.description}</p>

              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-50">${perMonth}</span>
                <span className="text-slate-400 text-sm">/month</span>
                {billingInterval === 'yearly' && (
                  <span className="block text-xs text-slate-500 mt-1">
                    ${price} billed annually
                  </span>
                )}
              </div>

              <ul className="mt-6 space-y-3">
                {Object.entries(plan.features).map(([key, value]) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    {value === true || (typeof value === 'number' && value !== 0) ? (
                      <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span className={value ? 'text-slate-300' : 'text-slate-500'}>
                      {typeof value === 'number' && value > 0
                        ? `${value} ${featureLabels[key] || key}`
                        : typeof value === 'number' && value === -1
                        ? `Unlimited ${(featureLabels[key] || key).toLowerCase()}`
                        : featureLabels[key] || key}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isCurrent || loading === plan.id}
                className={`w-full mt-6 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  isCurrent
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50'
                }`}
              >
                {loading === plan.id ? 'Redirecting...' : isCurrent ? 'Current Plan' : 'Start Free Trial'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
