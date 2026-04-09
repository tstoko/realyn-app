import React, { useEffect, useState } from 'react';
import type { Organization } from '@realyn/shared';
import { useAuthContext } from '@realyn/shared';
import { getOrganization } from '../../services/organizationService';
import { BillingSettings } from './BillingSettings';

export const BillingPage: React.FC = () => {
  const { user } = useAuthContext();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.organizationId) {
      setLoading(false);
      return;
    }
    getOrganization(user.organizationId)
      .then((org) => setOrganization(org))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.organizationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <BillingSettings organization={organization} />
    </div>
  );
};
