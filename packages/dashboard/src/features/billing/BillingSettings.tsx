import React, { useState } from 'react';
import { getPlanById, isSubscriptionActive } from '@realyn/shared';
import type { Organization } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../../config/environment';
import { getCloudFunctionJsonHeaders } from '../../services/cloudFunctionAuth';
import { PlanSelector } from './PlanSelector';

interface BillingSettingsProps {
  organization: Organization | null;
}

export const BillingSettings: React.FC<BillingSettingsProps> = ({ organization }) => {
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscription = organization?.subscription;
  const isActive = isSubscriptionActive(subscription?.status);
  const plan = subscription?.planId ? getPlanById(subscription.planId) : null;

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setError(null);

    try {
      const authResult = await getCloudFunctionJsonHeaders();
      if (!authResult.ok) throw new Error(authResult.error);

      const response = await fetch(`${FUNCTIONS_BASE_URL}/createBillingPortalSession`, {
        method: 'POST',
        headers: authResult.headers,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to open billing portal');

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPortalLoading(false);
    }
  };

  if (!subscription || !isActive) {
    return <PlanSelector organization={organization} />;
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    trialing: 'bg-blue-500/20 text-blue-400',
    past_due: 'bg-amber-500/20 text-amber-400',
    canceled: 'bg-red-500/20 text-red-400',
    incomplete: 'bg-slate-500/20 text-slate-400',
  };

  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-50">Billing</h2>
        <p className="mt-1 text-sm text-slate-400">Manage your subscription and payment method.</p>
      </div>

      <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-50">
              {plan?.name || subscription.planId} Plan
            </h3>
            <p className="text-sm text-slate-400">{plan?.description || ''}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[subscription.status] || statusColors.incomplete}`}>
            {subscription.status === 'trialing' ? 'Free Trial' : subscription.status.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700/50">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Next billing date</p>
            <p className="text-sm text-slate-300 mt-1">{periodEnd}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Status</p>
            <p className="text-sm text-slate-300 mt-1 capitalize">{subscription.status.replace('_', ' ')}</p>
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-sm text-amber-300">
              Your subscription will be canceled at the end of the current billing period ({periodEnd}).
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {portalLoading ? 'Opening...' : 'Manage Billing'}
          </button>
        </div>
      </div>
    </div>
  );
};
