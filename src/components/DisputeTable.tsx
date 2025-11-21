import React from 'react';
import { StatusBadge } from './StatusBadge';
import type { Dispute, SortState } from '../types';

interface DisputeTableProps {
    disputes: Dispute[];
    sort: SortState;
    onSortChange: (sort: SortState) => void;
}

const SortableHeader: React.FC<{
    label: string;
    field: keyof Dispute;
    currentSort: SortState;
    onSort: (field: keyof Dispute) => void;
}> = ({ label, field, currentSort, onSort }) => {
    const isCurrent = currentSort.field === field;
    const directionIcon = isCurrent ? (currentSort.direction === 'asc' ? '▲' : '▼') : '';
    return (
        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => onSort(field)}>
            <div className="flex items-center">
                <span>{label}</span>
                <span className="ml-2">{directionIcon}</span>
            </div>
        </th>
    );
};

export const DisputeTable: React.FC<DisputeTableProps> = ({ disputes, sort, onSortChange }) => {
    
    const handleSort = (field: keyof Dispute) => {
        const direction = sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc';
        onSortChange({ field, direction });
    };

    if (disputes.length === 0) {
        return (
            <div className="text-center py-16">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No disputes found</h3>
                <p className="mt-1 text-sm text-gray-500">Adjust your filters or wait for new disputes to arrive.</p>
            </div>
        );
    }

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch (error) {
            return 'N/A';
        }
    };
    
    return (
        <div className="flex flex-col">
            <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                    <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <SortableHeader label="Created" field="createdAt" currentSort={sort} onSort={handleSort} />
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <SortableHeader label="Reason" field="reason" currentSort={sort} onSort={handleSort} />
                                    <SortableHeader label="Amount / Payment" field="amount" currentSort={sort} onSort={handleSort} />
                                    <SortableHeader label="Respond By" field="respondBy" currentSort={sort} onSort={handleSort} />
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispute ID</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {disputes.map((dispute) => (
                                    <tr key={dispute.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(dispute.createdAt)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm"><StatusBadge status={dispute.status} /></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{dispute.reason?.replace(/_/g, ' ') || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <div className="font-medium">{formatCurrency(dispute.amount, dispute.currency)}</div>
                                            {dispute.stripePaymentIntentId && (
                                                <a
                                                    href={`https://dashboard.stripe.com/test/payments/${dispute.stripePaymentIntentId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-gray-500 font-mono text-xs hover:text-brand-primary"
                                                >
                                                    {dispute.stripePaymentIntentId}
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(dispute.respondBy)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                             <a
                                                href={`https://dashboard.stripe.com/test/disputes/${dispute.stripeDisputeId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:text-brand-primary"
                                            >
                                                {dispute.stripeDisputeId}
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

