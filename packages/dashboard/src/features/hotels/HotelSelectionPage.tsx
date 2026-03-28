
import React, { useState, useEffect } from 'react';
import type { Hotel, Organization } from '@realyn/shared';
import { PropertyCardGridSkeleton } from '@realyn/shared';
import { HotelEditModal } from './HotelEditModal';
import { ConfirmationModal } from '../../components/shared/ConfirmationModal';
import { useOrganizations } from '../../hooks/useOrganizations';
import { NoPropertiesEmptyState } from '../../components/shared/EmptyState';
import { mergePspCredentials } from '../../services/pspCredentialMerger';
import { saveOperaCloudConfig } from '../../services/operaCloudService';
import type { PspCredentials, OperaCloudCredentials } from './IntegrationsTab';

interface HotelSelectionPageProps {
  onSelectHotel: (hotel: Hotel) => void;
}

// Helper function to convert Organization to Hotel (for backward compatibility)
export function organizationToHotel(org: Organization): Hotel {
  // Defensive checks: ensure integrations objects exist
  const pspIntegrations = org.pspIntegrations || {};
  
  // Determine primary PSP from integrations
  // Check if integration object exists (not just status) to determine which PSP is selected
  const primaryPSP = pspIntegrations.stripe ? 'stripe' :
                     pspIntegrations.adyen ? 'adyen' : 'none';

  // Get status from the selected PSP (default to 'not_connected' if not set)
  const pspStatus = primaryPSP === 'stripe' ? (pspIntegrations.stripe?.status || 'not_connected') :
                   primaryPSP === 'adyen' ? (pspIntegrations.adyen?.status || 'not_connected') : 'not_connected';
  
  // Extract credentials for editing (masked in UI)
  // Provide defaults for required fields
  const hotel: Hotel = {
    id: org.id || '',
    name: org.name || 'Unnamed Account',
    location: org.location || '',
    industry: org.industry,
    teams: org.teams || [],
    documents: org.documents || [],
    integrations: {
      psp: { type: primaryPSP, status: pspStatus || 'not_connected' },
    },
    automationSettings: org.automationSettings || {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    users: org.users || [],
    isDemo: org.isDemo,
  };

  // Extract Stripe credentials (with optional chaining)
  if (pspIntegrations.stripe) {
    hotel.stripeSecretKey = pspIntegrations.stripe.secretKey;
    hotel.stripeWebhookSecret = pspIntegrations.stripe.webhookSecret;
    hotel.stripeMerchantAccountId = pspIntegrations.stripe.merchantAccountId;
  }

  // Extract Adyen credentials (with optional chaining)
  if (pspIntegrations.adyen) {
    hotel.adyenApiKey = pspIntegrations.adyen.apiKey;
    // Handle both old single merchantAccount and new merchantAccounts array
    if (pspIntegrations.adyen.merchantAccounts && Array.isArray(pspIntegrations.adyen.merchantAccounts) && pspIntegrations.adyen.merchantAccounts.length > 0) {
      hotel.adyenMerchantAccounts = [...pspIntegrations.adyen.merchantAccounts];
      hotel.adyenMerchantAccount = pspIntegrations.adyen.merchantAccounts[0]; // For backward compatibility
    } else if (pspIntegrations.adyen.merchantAccount) {
      hotel.adyenMerchantAccount = pspIntegrations.adyen.merchantAccount;
      hotel.adyenMerchantAccounts = [pspIntegrations.adyen.merchantAccount];
    } else {
      hotel.adyenMerchantAccounts = [];
    }
    hotel.adyenWebhookUsername = pspIntegrations.adyen.webhookUsername;
    hotel.adyenWebhookPassword = pspIntegrations.adyen.webhookPassword;
    hotel.adyenLiveEndpointPrefix = pspIntegrations.adyen.liveEndpointPrefix;
  }

  if (org.operaCloudIntegration) {
    hotel.operaCloudIntegration = org.operaCloudIntegration;
  }

  return hotel;
}

export const HotelSelectionPage: React.FC<HotelSelectionPageProps> = ({ onSelectHotel }) => {
  const { organizations, loading, error, save, remove } = useOrganizations();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [hotelToRemove, setHotelToRemove] = useState<Hotel | null>(null);

  // Convert organizations to hotels when data loads
  useEffect(() => {
    if (organizations.length > 0) {
      const convertedHotels: Hotel[] = [];
      let successCount = 0;
      let failureCount = 0;

      organizations.forEach((org) => {
        try {
          const hotel = organizationToHotel(org);
          convertedHotels.push(hotel);
          successCount++;
          console.log(`✓ Successfully converted organization to hotel: ${org.name} (${org.id})`);
        } catch (error) {
          failureCount++;
          console.error(`✗ Failed to convert organization to hotel:`, {
            organizationId: org.id,
            organizationName: org.name || 'Unknown',
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            organizationData: org,
          });
        }
      });

      if (successCount > 0 || failureCount === 0) {
        setHotels(convertedHotels);
      }

      if (failureCount > 0) {
        console.warn(`Organization conversion summary: ${successCount} succeeded, ${failureCount} failed out of ${organizations.length} total`);
      } else {
        console.log(`Organization conversion summary: All ${successCount} organizations converted successfully`);
      }
    } else {
      setHotels([]);
      if (organizations.length === 0 && !loading) {
        console.log('No organizations found to convert');
      }
    }
  }, [organizations, loading]);


  const confirmRemoveHotel = (e: React.MouseEvent, hotel: Hotel) => {
    e.stopPropagation();
    setHotelToRemove(hotel);
  };

  const handleRemoveHotel = async () => {
    if (hotelToRemove) {
      try {
        await remove(hotelToRemove.id);
        setHotelToRemove(null);
      } catch (error) {
        console.error('Error removing hotel:', error);
        // Error handling could show a toast notification here
      }
    }
  };

  const handleEditHotel = (e: React.MouseEvent, hotel: Hotel) => {
    e.stopPropagation();
    setEditingHotel(hotel);
    setIsEditModalOpen(true);
  };

  const handleAddNewHotel = () => {
    const newId = `org_${new Date().getTime()}`; 
    setEditingHotel({ 
        id: newId, 
        name: '', 
        location: '', 
        teams: [], 
        documents: [],
        integrations: { psp: { type: 'none', status: 'not_connected' } },
        automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 100, autoMarkNotContested: false },
        users: []
    });
    setIsEditModalOpen(true);
  };

  const handleSaveHotel = async (
    hotelToSave: Hotel, 
    _mewsCredentials?: { apiKey: string; accessToken: string; propertyId: string },
    pspCredentials?: PspCredentials,
    _operaCloudCredentials?: OperaCloudCredentials
  ) => {
    try {
      const existingOrg = organizations.find(org => org.id === hotelToSave.id);
      
      const organization: Organization = {
        id: hotelToSave.id,
        name: hotelToSave.name,
        location: hotelToSave.location,
        industry: hotelToSave.industry,
        teams: hotelToSave.teams,
        documents: hotelToSave.documents,
        users: hotelToSave.users,
        automationSettings: hotelToSave.automationSettings,
        pspIntegrations: mergePspCredentials(hotelToSave, existingOrg?.pspIntegrations || {}, pspCredentials),
        operaCloudIntegration: hotelToSave.operaCloudIntegration,
        createdAt: existingOrg?.createdAt || new Date(),
        updatedAt: new Date(),
      };
      
      await save(organization);

      if (hotelToSave.operaCloudIntegration && hotelToSave.operaCloudIntegration.gatewayUrl) {
        await saveOperaCloudConfig(hotelToSave.id, hotelToSave.operaCloudIntegration);
      }

      setIsEditModalOpen(false);
      setEditingHotel(null);
    } catch (error) {
      console.error('Error saving hotel:', error);
      alert(`Failed to save account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setEditingHotel(null);
  };

  const IntegrationBadge: React.FC<{ type: string, status: string }> = ({ type, status }) => {
      if (type === 'none') return null;
      const isConnected = status === 'connected';
      return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${isConnected ? 'bg-green-900/20 text-green-400 border-green-900/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-400' : 'bg-slate-500'}`}></span>
              {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
      )
  }

  if (loading) {
    return (
      <>
        <div className="md:flex md:items-center md:justify-between mb-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-3xl font-bold leading-7 text-slate-50 sm:text-4xl sm:truncate font-heading tracking-tight">Accounts</h2>
            <p className="mt-2 text-lg text-slate-400">Manage disputes and automation settings across your portfolio.</p>
          </div>
        </div>
        <PropertyCardGridSkeleton cards={3} />
      </>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-400 mb-4">Error loading organizations: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
        <div className="md:flex md:items-center md:justify-between mb-10">
            <div className="flex-1 min-w-0">
                <h2 className="text-3xl font-bold leading-7 text-slate-50 sm:text-4xl sm:truncate font-heading tracking-tight">Accounts</h2>
                <p className="mt-2 text-lg text-slate-400">Manage disputes and automation settings across your portfolio.</p>
            </div>
             <div className="mt-6 flex md:mt-0 md:ml-4">
                <button
                    onClick={handleAddNewHotel}
                    className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-xl shadow-lg shadow-cyan-500/20 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 focus:ring-offset-slate-950 transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add New Account
                </button>
             </div>
        </div>
        
          {hotels.length === 0 ? (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800">
              <NoPropertiesEmptyState onAddProperty={handleAddNewHotel} />
            </div>
          ) : (
          <div className="grid gap-8 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {hotels.map((hotel) => (
              <div
                  key={hotel.id}
                  onClick={() => onSelectHotel(hotel)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectHotel(hotel); } }}
                  className="group relative bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition-all duration-300 ease-out cursor-pointer hover:shadow-2xl hover:shadow-cyan-900/10 overflow-hidden focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  role="button"
                  tabIndex={0}
              >
                  {/* Card Top Color Bar */}
                  <div className="h-1.5 w-full bg-gradient-to-r from-slate-800 to-slate-700 group-hover:from-cyan-500 group-hover:to-blue-600 transition-all duration-500"></div>
                  
                  <div className="p-7">
                      <div className="flex justify-between items-start">
                         <div>
                             <h2 className="text-xl font-bold text-slate-100 group-hover:text-cyan-400 transition-colors font-heading">{hotel.name}</h2>
                             <div className="flex items-center mt-1 text-slate-400 group-hover:text-slate-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm">{hotel.location}</span>
                             </div>
                         </div>
                      </div>

                      <div className="mt-6 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Industry</span>
                              <span className={hotel.industry ? 'text-slate-200' : 'text-slate-600 italic'}>{hotel.industry || 'Not set'}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Payment Provider</span>
                              <div className="flex gap-2">
                                  <IntegrationBadge type={hotel.integrations.psp.type} status={hotel.integrations.psp.status} />
                                  {hotel.integrations.psp.type === 'none' && <span className="text-slate-600 italic">None</span>}
                              </div>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Automation</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${hotel.automationSettings.autoSubmissionEnabled ? 'bg-cyan-900/20 text-cyan-300 border-cyan-900/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                  {hotel.automationSettings.autoSubmissionEnabled ? 'Auto-Submit On' : 'Auto-Submit Off'}
                              </span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="px-7 py-4 bg-slate-950/30 border-t border-slate-800/50 flex justify-between items-center">
                      <button
                          onClick={(e) => handleEditHotel(e, hotel)}
                          className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-wider transition-colors"
                      >
                          Settings
                      </button>
                      <button
                          onClick={(e) => confirmRemoveHotel(e, hotel)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                      </button>
                  </div>
              </div>
              ))}
          </div>
          )}

      {isEditModalOpen && editingHotel && (
        <HotelEditModal hotel={editingHotel} onSave={handleSaveHotel} onClose={handleCloseModal} />
      )}
      {hotelToRemove && (
        <ConfirmationModal 
          isOpen={!!hotelToRemove}
          onClose={() => setHotelToRemove(null)}
          onConfirm={handleRemoveHotel}
          title="Remove Account"
          message={`Are you sure you want to permanently remove "${hotelToRemove.name}"? This action cannot be undone.`}
          confirmButtonText="Remove"
          confirmButtonVariant="danger"
        />
      )}
    </>
  );
};