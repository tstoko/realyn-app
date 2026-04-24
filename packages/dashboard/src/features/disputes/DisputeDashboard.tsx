
import React, { useState, useMemo, useCallback } from 'react';
import type { SortState, Dispute, User, Hotel, HotelDocument } from '@realyn/shared';
import { InternalStatus, TableSkeleton, useToast } from '@realyn/shared';
import { FilterControls, FilterState } from './FilterControls';
import { DisputeTable } from './DisputeTable';
import { useDisputes } from '../../hooks/useDisputes';
import { ManagePoliciesModal } from '../hotels/ManagePoliciesModal';
import { ManageIntegrationsModal } from '../hotels/ManageIntegrationsModal';
import type { PspCredentials } from '../hotels/IntegrationsTab';
import { syncDisputes } from '../../services/disputeSyncService';

interface DisputeDashboardProps {
  user: User;
  hotel: Hotel;
  disputes: Dispute[];
  isLoading: boolean;
  onUpdateHotel?: (updates: Partial<Hotel>, pspCredentials?: PspCredentials | null) => Promise<void>;
}

const BulkActionBar: React.FC<{
  selectedCount: number;
  onClear: () => void;
  onUpdate: (updates: Partial<Dispute>) => void;
}> = ({ selectedCount, onClear, onUpdate }) => {
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdate({ internalStatus: e.target.value as InternalStatus });
      onClear();
  };
    
  return (
    <div className="bg-slate-900 text-white p-3 flex items-center justify-between transition-all duration-300 ease-in-out border-b border-slate-700">
      <div className="flex items-center space-x-4">
        <span className="text-sm font-medium">{selectedCount} disputes selected</span>
        <select onChange={handleStatusChange} defaultValue="" className="bg-slate-700 border-slate-600 text-white text-sm rounded-md focus:ring-cyan-600 focus:border-cyan-600">
          <option value="" disabled>Change Status...</option>
          <option value="needs_review">Needs Review</option>
          <option value="awaiting_docs">Awaiting Docs</option>
          <option value="ready_to_submit">Ready to Submit</option>
          <option value="evidence_complete">Evidence complete</option>
          <option value="submitted">Submitted</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <button onClick={onClear} className="text-sm font-semibold hover:underline">Clear Selection</button>
    </div>
  )
};

export const DisputeDashboard: React.FC<DisputeDashboardProps> = ({ user, hotel, disputes: allDisputes, isLoading, onUpdateHotel }) => {
  const [filters, setFilters] = useState<FilterState>({ status: 'all' });
  const [sort, setSort] = useState<SortState>({ field: 'createdAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedDisputes, setSelectedDisputes] = useState<string[]>([]);
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
  const addToast = useToast();

  // Power-user table state
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof Dispute>>(new Set<keyof Dispute>(['createdAt', 'internalStatus', 'respondBy', 'reason', 'amount', 'pspDisputeId']));
  const [rowDensity, setRowDensity] = useState<'comfortable' | 'compact'>('comfortable');
  
  const { updateDispute, updateMultipleDisputes } = useDisputes(hotel.id);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(false);

  const handleSyncDisputes = useCallback(async () => {
    if (isSyncing || syncCooldown) return;
    setIsSyncing(true);
    try {
      const result = await syncDisputes(hotel.id);
      if (result.success) {
        const msg = result.disputesSynced > 0
          ? `Synced ${result.disputesSynced} disputes (${result.disputesCreated} new, ${result.disputesUpdated} updated)`
          : 'No new disputes found';
        addToast({ type: 'success', message: msg });
      } else {
        addToast({ type: 'error', message: result.error || 'Sync failed' });
      }
    } catch (error: any) {
      if (error?.retryAfter) {
        addToast({ type: 'error', message: `Rate limited. Try again in ${Math.ceil(error.retryAfter / 60)} minutes.` });
        setSyncCooldown(true);
        setTimeout(() => setSyncCooldown(false), error.retryAfter * 1000);
      } else {
        addToast({ type: 'error', message: error.message || 'Failed to sync disputes' });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [hotel.id, isSyncing, syncCooldown, addToast]);

  const handleSavePolicies = async (documents: HotelDocument[]) => {
    if (onUpdateHotel) {
      try {
        await onUpdateHotel({ documents });
        addToast({ type: 'success', message: 'Policies saved successfully!' });
      } catch {
        addToast({ type: 'error', message: 'Failed to save policies. Please try again.' });
      }
    }
    setShowPoliciesModal(false);
  };

  const handleSaveIntegrations = async (updatedHotel: Hotel, pspCredentials?: PspCredentials | null) => {
    if (onUpdateHotel) {
      try {
        await onUpdateHotel({ integrations: updatedHotel.integrations }, pspCredentials);
        addToast({ type: 'success', message: 'Integrations saved successfully!' });
      } catch {
        addToast({ type: 'error', message: 'Failed to save integrations. Please try again.' });
      }
    }
    setShowIntegrationsModal(false);
  };
  
  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
    setSelectedDisputes([]);
  }, []);
  
  const handleSortChange = useCallback((newSort: SortState) => {
      setSort(newSort);
      setCurrentPage(1);
  }, []);

  const handleRowsPerPageChange = useCallback((rows: number) => {
      setRowsPerPage(rows);
      setCurrentPage(1);
  }, []);

  const handleBulkUpdate = (updates: Partial<Dispute>) => {
      updateMultipleDisputes(selectedDisputes, updates);
  };

  const filteredAndSortedDisputes = useMemo(() => {
    let data = [...allDisputes];
    if (filters.status && filters.status !== 'all') data = data.filter(d => d.status === filters.status);
    if (filters.reason && filters.reason !== 'all') data = data.filter(d => d.reason === filters.reason);
    if (filters.searchText) data = data.filter(d => (d.customerExplanation ?? '').toLowerCase().includes(filters.searchText!.toLowerCase()));
    
    data.sort((a, b) => {
        const field = sort.field;
        const dir = sort.direction === 'asc' ? 1 : -1;
        const valA = a[field]; const valB = b[field];
        if (valA === null || valA === undefined) return 1; if (valB === null || valB === undefined) return -1;
        if (valA instanceof Date && valB instanceof Date) return (valA.getTime() - valB.getTime()) * dir;
        if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * dir;
        if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
        return 0;
    });
    
    return data;
  }, [allDisputes, filters, sort]);

  const handleExportCSV = () => {
    if (filteredAndSortedDisputes.length === 0) return;
    const headers = ["Dispute ID", "PSP Dispute ID", "Amount", "Currency", "Status", "Reason", "Created At", "Respond By", "Customer Explanation", "AI Status"];
    const formatCsvValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value?.toDate === 'function') return value.toDate().toISOString();
        if (value instanceof Date) return value.toISOString();
        let str = String(value);
        if (str.includes('"') || str.includes(',')) str = `"${str.replace(/"/g, '""')}"`;
        return str;
    };
    const csvRows = [headers.join(',')];
    filteredAndSortedDisputes.forEach(d => {
        csvRows.push([d.id, d.pspDisputeId, (d.amount / 100).toFixed(2), d.currency, d.status, d.reason, d.createdAt, d.respondBy, d.customerExplanation, d.automationStatus].map(formatCsvValue).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `disputes_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    addToast({ type: 'success', message: 'CSV export started.' });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 w-full">
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-shrink-0 flex flex-wrap items-center justify-end mb-4 gap-2">
               <button
                 onClick={handleSyncDisputes}
                 disabled={isSyncing || syncCooldown}
                 className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                 title={syncCooldown ? 'Rate limited — please wait' : 'Sync latest disputes from PSP'}
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-2 flex-shrink-0 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
                 {isSyncing ? 'Syncing...' : syncCooldown ? 'Cooldown' : 'Refresh Disputes'}
               </button>
               <button
                 onClick={() => setShowIntegrationsModal(true)}
                 className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors w-full sm:w-auto"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                 </svg>
                 Manage Integrations
                 {hotel.integrations.psp.type !== 'none' && (
                   <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-cyan-900/50 text-cyan-400 rounded-full capitalize">
                     {hotel.integrations.psp.type}
                   </span>
                 )}
               </button>
               <button
                 onClick={() => setShowPoliciesModal(true)}
                 className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors w-full sm:w-auto"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                 </svg>
                 Manage Policies
                 {hotel.documents.length > 0 && (
                   <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-cyan-900/50 text-cyan-400 rounded-full">
                     {hotel.documents.length}
                   </span>
                 )}
               </button>
            </div>

            <div className="flex-1 bg-slate-900 shadow-md rounded-xl border border-slate-800 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-shrink-0 p-4 sm:p-5 bg-slate-900 border-b border-slate-800">
                    <FilterControls 
                      onFilterChange={handleFilterChange} 
                      onExportCSV={handleExportCSV}
                      disputesCount={filteredAndSortedDisputes.length}
                      disputes={allDisputes}
                    />
                </div>
                {isLoading ? (
                    <div className="flex-1 overflow-hidden">
                        <table className="w-full table-fixed">
                            <thead>
                                <tr>
                                    <th className="w-12 px-3 py-4 bg-slate-900"></th>
                                    <th className="w-32 px-3 py-4 bg-slate-900 text-left text-xs font-semibold text-slate-500 uppercase">Created</th>
                                    <th className="w-36 px-3 py-4 bg-slate-900 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                                    <th className="w-28 px-3 py-4 bg-slate-900 text-left text-xs font-semibold text-slate-500 uppercase">Timeline</th>
                                    <th className="w-32 px-3 py-4 bg-slate-900 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                                    <th className="w-48 px-3 py-4 bg-slate-900 text-left text-xs font-semibold text-slate-500 uppercase">Reason</th>
                                    <th className="px-3 py-4 bg-slate-900 text-left text-xs font-semibold text-slate-500 uppercase">Reference</th>
                                    <th className="w-16 px-3 py-4 bg-slate-900"></th>
                                </tr>
                            </thead>
                            <TableSkeleton rows={5} />
                        </table>
                    </div>
                ) : (
                    <>
                        {selectedDisputes.length > 0 && <BulkActionBar selectedCount={selectedDisputes.length} onClear={() => setSelectedDisputes([])} onUpdate={handleBulkUpdate} />}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            <DisputeTable 
                                disputes={filteredAndSortedDisputes} 
                                sort={sort} 
                                onSortChange={handleSortChange} 
                                updateDispute={updateDispute}
                                user={user}
                                hotel={hotel}
                                currentPage={currentPage}
                                rowsPerPage={rowsPerPage}
                                onPageChange={setCurrentPage}
                                onRowsPerPageChange={handleRowsPerPageChange}
                                selectedDisputes={selectedDisputes}
                                onSelectionChange={setSelectedDisputes}
                                visibleColumns={visibleColumns}
                                rowDensity={rowDensity}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
        
        {showPoliciesModal && (
          <ManagePoliciesModal
            hotel={hotel}
            onSave={handleSavePolicies}
            onClose={() => setShowPoliciesModal(false)}
          />
        )}
        {showIntegrationsModal && (
          <ManageIntegrationsModal
            hotel={hotel}
            onSave={handleSaveIntegrations}
            onClose={() => setShowIntegrationsModal(false)}
            isAdmin={user.role === 'admin'}
          />
        )}
    </div>
  );
};
