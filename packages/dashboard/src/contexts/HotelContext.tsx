import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { Hotel, Dispute } from '@realyn/shared';
import { useAuthContext } from '@realyn/shared';
import { useDisputes } from '../hooks/useDisputes';
import { updateOrganizationDocuments, updateOrganizationIntegrations, getOrganization } from '../services/organizationService';
import { mergePspCredentials } from '../services/pspCredentialMerger';
import { saveOperaCloudConfig } from '../services/operaCloudService';
import type { PspCredentials, OperaCloudCredentials } from '../features/hotels/IntegrationsTab';
import { organizationToHotel } from '../features/hotels/HotelSelectionPage';

interface HotelContextValue {
  /** The currently selected hotel / organization context. null when admin is at portfolio level. */
  hotel: Hotel | null;
  /** Disputes belonging to the current hotel. */
  disputes: Dispute[];
  /** Whether disputes are loading. */
  isLoading: boolean;
  /** True when the user has no organizationId and is not admin. */
  noOrganization: boolean;
  /** Select a hotel (admin navigating into a property). */
  selectHotel: (hotel: Hotel) => void;
  /** Clear the hotel selection (back to portfolio view). */
  clearHotel: () => void;
  /** Update hotel properties (e.g. documents, integrations). */
  updateHotel: (updates: Partial<Hotel>, pspCredentials?: PspCredentials | null, operaCloudCredentials?: OperaCloudCredentials | null) => Promise<void>;
}

const HotelContext = createContext<HotelContextValue | null>(null);

export const HotelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [noOrganization, setNoOrganization] = useState(false);

  // Regular users: load full organization from Firestore (isDemo, integrations, teams, etc.)
  useEffect(() => {
    if (!user) {
      setHotel(null);
      setNoOrganization(false);
      return;
    }
    if (user.role !== 'user') {
      return;
    }
    if (!user.organizationId) {
      setNoOrganization(true);
      setHotel(null);
      return;
    }
    setNoOrganization(false);
    const orgId = user.organizationId;
    const fallbackName = user.hotelName || 'My Account';
    const stubHotel: Hotel = {
      id: orgId,
      name: fallbackName,
      location: '',
      teams: [],
      documents: [],
      integrations: { psp: { type: 'none', status: 'not_connected' } },
      automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
      users: [],
    };
    setHotel(stubHotel);

    let cancelled = false;
    getOrganization(orgId)
      .then((org) => {
        if (cancelled) return;
        if (org) {
          setHotel(organizationToHotel(org));
        }
      })
      .catch(() => {
        /* keep stub */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.organizationId, user?.hotelName]);

  const { disputes, loading: isLoading } = useDisputes(hotel?.id);

  const selectHotel = useCallback((h: Hotel) => setHotel(h), []);
  const clearHotel = useCallback(() => setHotel(null), []);

  const updateHotel = useCallback(async (updates: Partial<Hotel>, pspCredentials?: PspCredentials | null, _operaCloudCredentials?: OperaCloudCredentials | null) => {
    if (!hotel) return;
    try {
      if (updates.documents) {
        await updateOrganizationDocuments(hotel.id, updates.documents);
      }
      if (updates.integrations) {
        const hotelWithUpdates = { ...hotel, ...updates } as Hotel;
        const existingOrg = await getOrganization(hotel.id);
        const existingPspIntegrations = existingOrg?.pspIntegrations || {};
        const mergedIntegrations = mergePspCredentials(hotelWithUpdates, existingPspIntegrations, pspCredentials);
        await updateOrganizationIntegrations(hotel.id, mergedIntegrations);
      }
      if (updates.operaCloudIntegration && updates.operaCloudIntegration.gatewayUrl) {
        await saveOperaCloudConfig(hotel.id, updates.operaCloudIntegration);
      }
      setHotel(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error('Error updating hotel:', error);
      throw error;
    }
  }, [hotel]);

  const value = useMemo<HotelContextValue>(
    () => ({ hotel, disputes, isLoading, noOrganization, selectHotel, clearHotel, updateHotel }),
    [hotel, disputes, isLoading, noOrganization, selectHotel, clearHotel, updateHotel]
  );

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
};

export const useHotelContext = (): HotelContextValue => {
  const ctx = useContext(HotelContext);
  if (!ctx) {
    throw new Error('useHotelContext must be used within a HotelProvider');
  }
  return ctx;
};
