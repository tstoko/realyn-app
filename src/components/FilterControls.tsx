import React, { useState } from 'react';
import type { FilterState, SortState, DisputeStatus } from '../types';

interface FilterControlsProps {
  onFilterChange: (filters: FilterState) => void;
  onSortChange: (sort: SortState) => void;
  initialSort: SortState;
}

const statusOptions: Array<{ value: 'all' | DisputeStatus, label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'needs_response', label: 'Needs Response' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
    { value: 'warning_closed', label: 'Closed' },
];

export const FilterControls: React.FC<FilterControlsProps> = ({ onFilterChange }) => {
    const [status, setStatus] = useState<'all' | DisputeStatus>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleApplyFilters = () => {
        onFilterChange({
            status,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
        });
    };
    
    const handleClearFilters = () => {
        setStatus('all');
        setStartDate('');
        setEndDate('');
        onFilterChange({ status: 'all' });
    };

    return (
        <div className="p-4 bg-gray-50 border-b border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                        id="status"
                        name="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as 'all' | DisputeStatus)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm rounded-md"
                    >
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">From</label>
                    <input
                        type="date"
                        id="start-date"
                        name="start-date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm rounded-md"
                    />
                </div>
                <div>
                    <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">To</label>
                    <input
                        type="date"
                        id="end-date"
                        name="end-date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm rounded-md"
                    />
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={handleApplyFilters}
                        className="w-full justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary"
                    >
                        Apply
                    </button>
                    <button
                        onClick={handleClearFilters}
                        className="w-full justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary"
                    >
                        Clear
                    </button>
                </div>
            </div>
        </div>
    );
};

