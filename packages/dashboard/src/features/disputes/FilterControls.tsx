
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { FilterState, Dispute, DisputeStatus } from '@realyn/shared';
import { DownloadIcon } from '@realyn/shared';

interface FilterControlsProps {
  onFilterChange: (filters: FilterState) => void;
  onExportCSV: () => void;
  disputesCount: number;
  disputes: Dispute[];
}


// Helper function to format status labels
const formatStatusLabel = (status: DisputeStatus): string => {
    const labels: Record<DisputeStatus, string> = {
        'needs_response': 'Needs Response',
        'under_review': 'Under Review',
        'won': 'Won',
        'lost': 'Lost',
        'warning_closed': 'Closed',
    };
    return labels[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Helper function to format reason labels
const formatReasonLabel = (reason: string): string => {
    return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Modern input style - cleaner, subtle borders, focus ring
const baseInputStyle = "w-full text-sm rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 shadow-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200 placeholder:text-slate-500";
const selectStyle = `${baseInputStyle} pl-3 pr-10 py-2.5 capitalize cursor-pointer hover:bg-slate-800`;
const searchInputStyle = `${baseInputStyle} pl-10 pr-12 py-2.5`;

export const FilterControls: React.FC<FilterControlsProps> = ({ 
    onFilterChange, onExportCSV, disputesCount, disputes
}) => {
    // Generate dynamic status options from disputes
    const statusOptions = useMemo(() => {
        const statusSet = new Set<DisputeStatus>();
        disputes.forEach(dispute => {
            if (dispute.status) {
                statusSet.add(dispute.status);
            }
        });
        
        const options: Array<{ value: 'all' | DisputeStatus, label: string }> = [
            { value: 'all', label: 'All Statuses' }
        ];
        
        // Sort statuses for consistent ordering
        const sortedStatuses = Array.from(statusSet).sort();
        sortedStatuses.forEach(status => {
            options.push({ value: status, label: formatStatusLabel(status) });
        });
        
        return options;
    }, [disputes]);

    // Generate dynamic reason options from disputes
    const reasonOptions = useMemo(() => {
        const reasonSet = new Set<string>();
        disputes.forEach(dispute => {
            if (dispute.reason) {
                reasonSet.add(dispute.reason);
            }
        });
        
        const options: Array<{ value: 'all' | string, label: string }> = [
            { value: 'all', label: 'All Reasons' }
        ];
        
        // Sort reasons alphabetically for consistent ordering
        const sortedReasons = Array.from(reasonSet).sort();
        sortedReasons.forEach(reason => {
            options.push({ value: reason, label: formatReasonLabel(reason) });
        });
        
        return options;
    }, [disputes]);
    const [filters, setFilters] = useState<FilterState>({
        status: 'all',
        reason: 'all',
        searchText: '',
    });
    
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
            searchText: '',
        });
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
        </div>
    );
};
export type { FilterState };
