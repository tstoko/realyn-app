
import React, { useState, useMemo, useCallback } from 'react';
import { FilterControls, FilterState } from './FilterControls';
import { DisputeTable } from './DisputeTable';
import { useDisputes } from '../hooks/useDisputes';
import { Spinner } from './Spinner';
import type { SortState, Dispute, User, Hotel } from '../types';
import { DashboardSummary } from './DashboardSummary';
import { AIActions } from './AIActions';
import { InternalStatus } from '../types';
import { useToast } from '../hooks/useToast';

interface DisputeDashboardProps {
  user: User;
  hotel: Hotel;
  disputes: Dispute[];
  isLoading: boolean;
}

type View = 'all_disputes' | 'awaiting_action';

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
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <button onClick={onClear} className="text-sm font-semibold hover:underline">Clear Selection</button>
    </div>
  )
};

export const DisputeDashboard: React.FC<DisputeDashboardProps> = ({ user, hotel, disputes: allDisputes, isLoading }) => {
  const [filters, setFilters] = useState<FilterState>({ status: 'all' });
  const [sort, setSort] = useState<SortState>({ field: 'createdAt', direction: 'desc' });
  const [currentView, setCurrentView] = useState<View>('all_disputes');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedDisputes, setSelectedDisputes] = useState<string[]>([]);
  const addToast = useToast();

  // Power-user table state
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof Dispute>>(new Set(['createdAt', 'internalStatus', 'respondBy', 'reason', 'amount', 'stripeDisputeId']));
  const [rowDensity, setRowDensity] = useState<'comfortable' | 'compact'>('comfortable');
  
  const { updateDispute, updateMultipleDisputes } = useDisputes(hotel.id);
  
  const disputesAwaitingAction = useMemo(() => {
    return allDisputes.filter(d => d.automationStatus === 'awaiting_info' || d.automationStatus === 'manual_review');
  }, [allDisputes]);
  
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
    if (filters.status && filters.status !== 'all') data = data.filter(d => d.stripeStatus === filters.status);
    if (filters.automationStatus && filters.automationStatus !== 'all') data = data.filter(d => d.automationStatus === filters.automationStatus);
    if (filters.reason && filters.reason !== 'all') data = data.filter(d => d.reason === filters.reason);
    if (filters.searchText) data = data.filter(d => d.customerExplanation.toLowerCase().includes(filters.searchText!.toLowerCase()));
    
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
    const headers = ["Dispute ID", "Stripe Dispute ID", "Amount", "Currency", "Stripe Status", "Reason", "Created At", "Respond By", "Customer Explanation", "AI Status"];
    const formatCsvValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        let str = String(value);
        if (str.includes('"') || str.includes(',')) str = `"${str.replace(/"/g, '""')}"`;
        return str;
    };
    const csvRows = [headers.join(',')];
    filteredAndSortedDisputes.forEach(d => {
        csvRows.push([d.id, d.stripeDisputeId, (d.amount / 100).toFixed(2), d.currency, d.stripeStatus, d.reason, d.createdAt, d.respondBy, d.customerExplanation, d.automationStatus].map(formatCsvValue).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `disputes_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    addToast({ type: 'success', message: 'CSV export started.' });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 w-full">
        <div className="flex-shrink-0">
          <DashboardSummary allDisputes={allDisputes} />
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-shrink-0 flex items-center justify-between mb-4">
               <div className="hidden sm:block">
                 <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setCurrentView('all_disputes')} className={`group inline-flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${currentView === 'all_disputes' ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-slate-400 hover:text-slate-50 hover:border-slate-500'}`}>
                        All Disputes
                        <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${currentView === 'all_disputes' ? 'bg-cyan-900/50 text-cyan-500' : 'bg-slate-700 text-slate-200'}`}>{allDisputes.length}</span>
                    </button>
                    <button onClick={() => setCurrentView('awaiting_action')} className={`group relative inline-flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${currentView === 'awaiting_action' ? 'border-cyan-500 text-cyan-500' : 'border-transparent text-slate-400 hover:text-slate-50 hover:border-slate-500'}`}>
                        Awaiting Your Action
                        {disputesAwaitingAction.length > 0 && <span className="ml-2 inline-flex items-center justify-center h-5 w-5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">{disputesAwaitingAction.length}</span>}
                    </button>
                </nav>
               </div>
               <div className="sm:hidden w-full">
                  <select id="tabs" name="tabs" className="block w-full rounded-md border-slate-700 bg-slate-900 focus:border-cyan-600 focus:ring-cyan-600" onChange={(e) => setCurrentView(e.target.value as View)} value={currentView}>
                    <option value="all_disputes">All Disputes ({allDisputes.length})</option>
                    <option value="awaiting_action">Awaiting Action ({disputesAwaitingAction.length})</option>
                  </select>
                </div>
            </div>

            <div className="flex-1 bg-slate-900 shadow-md rounded-xl border border-slate-800 flex flex-col min-h-0 overflow-hidden">
                {currentView === 'all_disputes' && (
                  <>
                    <div className="flex-shrink-0 p-4 sm:p-5 bg-slate-900 border-b border-slate-800">
                        <FilterControls 
                          onFilterChange={handleFilterChange} 
                          onExportCSV={handleExportCSV}
                          disputesCount={filteredAndSortedDisputes.length}
                          visibleColumns={visibleColumns}
                          onVisibleColumnsChange={setVisibleColumns}
                          rowDensity={rowDensity}
                          onRowDensityChange={setRowDensity}
                        />
                    </div>
                    {isLoading ? <div className="flex-1 flex justify-center items-center"><Spinner /></div> : (
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
                  </>
                )}
                {currentView === 'awaiting_action' && (
                    <div className="flex-1 overflow-y-auto">
                      <AIActions disputes={disputesAwaitingAction} updateDispute={updateDispute} user={user} hotel={hotel} />
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
