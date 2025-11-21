
import React, { useState, useEffect, useRef } from 'react';
import type { FilterState, Dispute, DisputeStatus, AutomationStatus } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';

interface FilterControlsProps {
  onFilterChange: (filters: FilterState) => void;
  onExportCSV: () => void;
  disputesCount: number;
  
  visibleColumns: Set<keyof Dispute>;
  onVisibleColumnsChange: (columns: Set<keyof Dispute>) => void;
  rowDensity: 'comfortable' | 'compact';
  onRowDensityChange: (density: 'comfortable' | 'compact') => void;
}

const allColumns: { key: keyof Dispute, label: string }[] = [
    { key: 'createdAt', label: 'Created' },
    { key: 'internalStatus', label: 'Internal Status' },
    { key: 'respondBy', label: 'Time to Respond' },
    { key: 'reason', label: 'Reason' },
    { key: 'amount', label: 'Amount' },
    { key: 'stripeDisputeId', label: 'Dispute / Payment' },
];

const statusOptions: Array<{ value: 'all' | DisputeStatus, label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'needs_response', label: 'Needs Response' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
    { value: 'warning_closed', label: 'Closed' },
];

const automationStatusOptions: Array<{ value: 'all' | AutomationStatus, label: string }> = [
    { value: 'all', label: 'All AI Statuses' },
    { value: 'auditing', label: 'Auditing' },
    { value: 'awaiting_info', label: 'Awaiting Info' },
    { value: 'responding', label: 'Responding' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'manual_review', label: 'Manual Review' },
    { value: 'unwinnable', label: 'Unwinnable' },
    { value: 'complete', label: 'Complete' },
];

const reasonOptions: Array<{ value: 'all' | string, label: string }> = [
    { value: 'all', label: 'All Reasons' },
    { value: 'fraudulent', label: 'Fraudulent' },
    { value: 'product_not_received', label: 'Product Not Received' },
    { value: 'credit_not_processed', label: 'Credit Not Processed' },
    { value: 'general', label: 'General' }
];

// Modern input style - cleaner, subtle borders, focus ring
const baseInputStyle = "w-full text-sm rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 shadow-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200 placeholder:text-slate-500";
const selectStyle = `${baseInputStyle} pl-3 pr-10 py-2.5 capitalize cursor-pointer hover:bg-slate-800`;
const searchInputStyle = `${baseInputStyle} pl-10 pr-12 py-2.5`;

export const FilterControls: React.FC<FilterControlsProps> = ({ 
    onFilterChange, onExportCSV, disputesCount,
    visibleColumns, onVisibleColumnsChange,
    rowDensity, onRowDensityChange
}) => {
    const [filters, setFilters] = useState<FilterState>({
        status: 'all',
        reason: 'all',
        automationStatus: 'all',
        searchText: '',
        startDate: undefined,
        endDate: undefined,
    });
    
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
             onFilterChange(filters);
        }, 300); // Debounce input to avoid excessive re-renders
        return () => clearTimeout(timeoutId);
    }, [filters, onFilterChange]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleResetFilters = () => {
        setFilters({
            status: 'all',
            reason: 'all',
            automationStatus: 'all',
            searchText: '',
            startDate: undefined,
            endDate: undefined,
        });
    };
    
    const handleColumnToggle = (key: keyof Dispute) => {
        const newSet = new Set(visibleColumns);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        onVisibleColumnsChange(newSet);
    };

    return (
        <div className="space-y-4 filter-controls">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full">
                <div className="relative md:col-span-3 group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 group-focus-within:text-cyan-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input ref={searchInputRef} type="text" name="searchText" value={filters.searchText} onChange={handleInputChange} placeholder="Search disputes..." className={searchInputStyle} />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <kbd className="inline-flex items-center border border-slate-700 rounded px-1.5 text-[10px] font-sans font-bold text-slate-500">
                          /
                        </kbd>
                    </div>
                </div>
                <div className="md:col-span-2">
                    <select name="status" value={filters.status} onChange={handleInputChange} className={selectStyle}>
                        {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <select name="automationStatus" value={filters.automationStatus} onChange={handleInputChange} className={selectStyle}>
                        {automationStatusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <select name="reason" value={filters.reason} onChange={handleInputChange} className={selectStyle}>
                        {reasonOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2 md:col-span-3 justify-end">
                    <button onClick={handleResetFilters} title="Reset filters" className="p-2.5 rounded-lg text-slate-400 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-cyan-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button onClick={onExportCSV} disabled={disputesCount === 0} className="flex-shrink-0 inline-flex items-center justify-center px-4 py-2.5 border border-slate-700 rounded-lg shadow-sm text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                        <DownloadIcon className="h-4 w-4 mr-2" />
                        Export
                    </button>
                </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                <div>
                    {/* Left side placeholder or for future controls */}
                </div>
                <div className="flex items-center space-x-6">
                     <div className="relative inline-block text-left">
                        <button onClick={() => setIsColumnsDropdownOpen(prev => !prev)} className="inline-flex items-center text-xs font-semibold text-slate-400 hover:text-cyan-400 uppercase tracking-wider transition-colors">
                          Columns
                          <svg className={`-mr-1 ml-1 h-4 w-4 transition-transform ${isColumnsDropdownOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        {isColumnsDropdownOpen && (
                          <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-xl bg-slate-900 ring-1 ring-slate-800 z-20 border border-slate-700 overflow-hidden">
                            <div className="py-1">
                              {allColumns.map(col => (
                                <label key={col.key} className="flex items-center px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer transition-colors">
                                  <input type="checkbox" checked={visibleColumns.has(col.key)} onChange={() => handleColumnToggle(col.key)} className="h-4 w-4 rounded border-slate-600 text-cyan-600 bg-slate-800 focus:ring-cyan-600 focus:ring-offset-slate-900" />
                                  <span className="ml-3">{col.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center text-xs font-medium text-slate-400">
                        <span className="mr-3 uppercase tracking-wider font-semibold">Density</span>
                        <div className="flex items-center rounded-lg bg-slate-800 p-1 border border-slate-700">
                            <button onClick={() => onRowDensityChange('comfortable')} className={`px-3 py-1 rounded-md transition-all ${rowDensity === 'comfortable' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>Relaxed</button>
                            <button onClick={() => onRowDensityChange('compact')} className={`px-3 py-1 rounded-md transition-all ${rowDensity === 'compact' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>Compact</button>
                        </div>
                      </div>
                </div>
            </div>
        </div>
    );
};
export type { FilterState };
