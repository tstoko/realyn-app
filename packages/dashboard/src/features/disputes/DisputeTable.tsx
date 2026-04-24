
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Dispute, SortState, User, Hotel } from '@realyn/shared';
import { InformationCircleIcon } from '@realyn/shared';
import { StatusBadge } from './StatusBadge';
import { EvidenceDashboard } from '../evidence/EvidenceDashboard';
import { DisputeDetailModal } from './DisputeDetailModal';
import { DisputeWorkflowBadge } from './DisputeWorkflowBadge';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { NoDisputesEmptyState } from '../../components/shared/EmptyState';
import { isDisputeEvidenceReadOnly } from './disputeEvidenceReadOnly';

const SortIcon: React.FC<{ direction?: 'asc' | 'desc' }> = ({ direction }) => {
  if (!direction) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    )
  }
  if (direction === 'asc') {
     return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
     )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
    return (
        <div className="group relative flex items-center">
            {children}
            <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 bg-slate-800 text-slate-200 text-xs rounded-lg py-2 px-3 z-50 shadow-xl border border-slate-700/50 backdrop-blur-sm pointer-events-none">
                {text}
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-800"></div>
            </div>
        </div>
    );
};

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
    const { copy, copied } = useCopyToClipboard();
    
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                copy(text);
            }}
            className={`p-1 rounded transition-all duration-200 ${
                copied 
                    ? 'text-green-400 bg-green-500/10' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
            title={copied ? 'Copied!' : `Copy ${label}`}
        >
            {copied ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            )}
        </button>
    );
};

const EvidenceProgress: React.FC<{ dispute: Dispute }> = ({ dispute }) => {
    // Don't show if no evidence plan exists
    if (!dispute.evidencePlan?.requirements || dispute.evidencePlan.requirements.length === 0) {
        return null;
    }
    
    const total = dispute.evidencePlan.requirements.length;
    const completed = dispute.evidenceItems?.filter(
        i => i.status === 'uploaded' || i.status === 'not_applicable'
    ).length || 0;
    
    const percentage = Math.round((completed / total) * 100);
    const isComplete = completed >= total;
    
    // Color based on completion
    const barColor = isComplete 
        ? 'bg-green-500' 
        : percentage >= 50 
            ? 'bg-cyan-500' 
            : 'bg-amber-500';
    
    return (
        <div className="flex items-center gap-1.5 mt-1">
            <div className="w-12 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${barColor} transition-all duration-300`} 
                    style={{ width: `${percentage}%` }} 
                />
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums">
                {completed}/{total}
            </span>
            {isComplete && (
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            )}
        </div>
    );
};

const SortableHeader: React.FC<{
    label: string;
    field: keyof Dispute;
    currentSort: SortState;
    onSort: (field: keyof Dispute) => void;
    className?: string;
    tooltip?: string;
    align?: 'left' | 'right' | 'center';
}> = ({ label, field, currentSort, onSort, className = '', tooltip, align = 'left' }) => {
    const isCurrent = currentSort.field === field;
    const alignClass = align === 'right' ? 'justify-end' : (align === 'center' ? 'justify-center' : 'justify-start');
    
    const content = (
      <div className={`flex items-center space-x-1 truncate ${alignClass}`}>
          <span className={isCurrent ? 'text-slate-200 truncate' : 'truncate'}>{label}</span>
          <span className={`flex-shrink-0 transition-opacity ${isCurrent ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>
            <SortIcon direction={isCurrent ? currentSort.direction : undefined} />
          </span>
          {tooltip && <InformationCircleIcon className="h-3.5 w-3.5 text-slate-600 hover:text-slate-400 flex-shrink-0" />}
      </div>
    );

    return (
        <th scope="col" className={`px-3 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group select-none sticky top-0 bg-slate-900 z-10 shadow-[0_1px_0_0_rgba(30,41,59,1)] ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} onClick={() => onSort(field)}>
            {tooltip ? <Tooltip text={tooltip}>{content}</Tooltip> : content}
        </th>
    );
};

interface DisputeTableProps {
    disputes: Dispute[];
    sort: SortState;
    onSortChange: (sort: SortState) => void;
    updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
    user: User;
    hotel: Hotel;
    currentPage: number;
    rowsPerPage: number;
    onPageChange: (page: number) => void;
    onRowsPerPageChange: (rows: number) => void;
    selectedDisputes: string[];
    onSelectionChange: (selectedIds: string[]) => void;
    visibleColumns: Set<keyof Dispute>;
    rowDensity: 'comfortable' | 'compact';
}

export const DisputeTable: React.FC<DisputeTableProps> = ({ 
    disputes, sort, onSortChange, updateDispute, user, hotel,
    currentPage, rowsPerPage, onPageChange, onRowsPerPageChange,
    selectedDisputes, onSelectionChange, visibleColumns, rowDensity
}) => {
    const [modalDispute, setModalDispute] = useState<Dispute | null>(null);
    const [detailDispute, setDetailDispute] = useState<Dispute | null>(null);
    const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
    
    const rowPadding = rowDensity === 'comfortable' ? 'py-4' : 'py-2.5';

    const paginatedDisputes = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        return disputes.slice(start, end);
    }, [disputes, currentPage, rowsPerPage]);

    useEffect(() => {
        if (selectAllCheckboxRef.current) {
            const numSelected = selectedDisputes.length;
            const numOnPage = paginatedDisputes.length;
            selectAllCheckboxRef.current.indeterminate = numSelected > 0 && numSelected < numOnPage;
        }
    }, [selectedDisputes, paginatedDisputes]);
    
    useEffect(() => {
      if (detailDispute) {
        const updatedDispute = disputes.find(d => d.id === detailDispute.id);
        if (updatedDispute) setDetailDispute(updatedDispute);
      }
      if (modalDispute) {
        const updatedDispute = disputes.find(d => d.id === modalDispute.id);
        if (updatedDispute) setModalDispute(updatedDispute);
      }
    }, [disputes, detailDispute, modalDispute]);


    const handleSort = (field: keyof Dispute) => {
        const direction = sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc';
        onSortChange({ field, direction });
    };
    
    const totalPages = Math.ceil(disputes.length / rowsPerPage);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            onSelectionChange(paginatedDisputes.map(d => d.id));
        } else {
            onSelectionChange([]);
        }
    };

    const handleSelectRow = (disputeId: string) => {
        const newSelection = selectedDisputes.includes(disputeId)
            ? selectedDisputes.filter(id => id !== disputeId)
            : [...selectedDisputes, disputeId];
        onSelectionChange(newSelection);
    };

    if (disputes.length === 0) {
        return (
            <NoDisputesEmptyState 
                hasFilters={true} 
                onClearFilters={() => window.location.reload()} 
            />
        );
    }

    const formatCurrency = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
    const formatDate = (timestamp?: Date | { toDate(): Date } | string | null) => {
        if (!timestamp) return 'N/A';
        const d = typeof (timestamp as any)?.toDate === 'function'
          ? (timestamp as any).toDate()
          : timestamp instanceof Date ? timestamp : new Date(timestamp as string);
        if (isNaN(d.getTime())) return 'N/A';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const TimeToRespond: React.FC<{ respondBy: Date | { toDate(): Date } | null | undefined }> = ({ respondBy }) => {
        if (!respondBy) return <span className="text-slate-500">-</span>;
        const resolved = typeof (respondBy as any).toDate === 'function' ? (respondBy as any).toDate() : respondBy;
        
        const now = new Date();
        const diffMs = resolved.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
        
        const exactDate = resolved.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
        
        // Overdue
        if (diffDays < 0) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Overdue
                </span>
            );
        }
        
        // Critical: less than 24 hours
        if (diffHours <= 24) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                    <svg className="w-3 h-3 mr-1 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {diffHours}h left
                </span>
            );
        }
        
        // Urgent: 1-3 days
        if (diffDays <= 3) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
                    <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {diffDays}d left
                </span>
            );
        }
        
        // Warning: 4-7 days
        if (diffDays <= 7) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    {diffDays}d left
                </span>
            );
        }
        
        // Normal: 8+ days
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/15 text-slate-400 border border-slate-500/25">
                {diffDays}d left
            </span>
        );
    };
    
    // Updated column widths and alignment
    const tableHeaders: { key: keyof Dispute | string, label: string, width: string, tooltip?: string, align?: 'left' | 'right' }[] = [
        { key: 'createdAt', label: 'Created', width: 'w-32' },
        { key: 'internalStatus', label: 'Status', tooltip: 'Evidence workflow when a plan or draft exists; otherwise internal status', width: 'w-40' },
        { key: 'respondBy', label: 'Timeline', tooltip: 'Time remaining', width: 'w-28' },
        { key: 'amount', label: 'Amount', width: 'w-32', align: 'right' }, // Right aligned for financial data
        { key: 'reason', label: 'Reason', width: 'w-48' }, // Widened for legibility
        { key: 'pspDisputeId', label: 'Reference', width: '' }, // Fills remaining space
    ];

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-1 w-full overflow-hidden relative">
                <div className="absolute inset-0 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                    <table className="w-full min-w-[700px] table-fixed border-collapse">
                        <thead>
                            <tr>
                                <th scope="col" className="w-12 px-3 py-4 sticky top-0 bg-slate-900 z-10 shadow-[0_1px_0_0_rgba(30,41,59,1)]">
                                    <div className="flex items-center justify-center">
                                        <input type="checkbox" className="h-4 w-4 rounded border-slate-600 text-cyan-600 bg-slate-800 focus:ring-cyan-600 focus:ring-offset-slate-900 transition duration-150 ease-in-out" 
                                            ref={selectAllCheckboxRef}
                                            checked={paginatedDisputes.length > 0 && paginatedDisputes.every(d => selectedDisputes.includes(d.id))}
                                            onChange={handleSelectAll}
                                        />
                                    </div>
                                </th>
                                {tableHeaders.map(header => {
                                    if (header.key !== 'pspDisputeId' && !visibleColumns.has(header.key as keyof Dispute) && !['internalStatus', 'respondBy'].includes(header.key)) return null;

                                    const sortableFields: (keyof Dispute)[] = ['createdAt', 'reason', 'amount'];
                                    if(sortableFields.includes(header.key as keyof Dispute)) {
                                        return <SortableHeader key={header.key} label={header.label} field={header.key as keyof Dispute} currentSort={sort} onSort={handleSort} tooltip={header.tooltip} className={header.width} align={header.align} />
                                    }
                                    
                                    const alignClass = header.align === 'right' ? 'text-right' : 'text-left';
                                    const justifyClass = header.align === 'right' ? 'justify-end' : 'justify-start';

                                    return <th key={header.key} scope="col" className={`px-3 py-4 ${alignClass} text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10 shadow-[0_1px_0_0_rgba(30,41,59,1)] ${header.width}`}>
                                        {header.tooltip ? 
                                            <Tooltip text={header.tooltip}>
                                                <div className={`flex items-center truncate ${justifyClass}`}>
                                                    {header.label}
                                                    <InformationCircleIcon className="h-3.5 w-3.5 ml-1.5 text-slate-600 flex-shrink-0" />
                                                </div>
                                            </Tooltip> : 
                                            <span className="truncate block">{header.label}</span>
                                        }
                                    </th>
                                })}
                                <th scope="col" className="w-16 relative px-3 py-4 sticky top-0 bg-slate-900 z-10 shadow-[0_1px_0_0_rgba(30,41,59,1)]"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
                            {paginatedDisputes.map((dispute) => (
                                <tr 
                                    key={dispute.id} 
                                    className={`group transition-colors duration-200 hover:bg-slate-800/60 cursor-pointer ${selectedDisputes.includes(dispute.id) ? 'bg-cyan-900/10' : ''}`}
                                    onClick={() => setDetailDispute(dispute)}
                                >
                                    <td className={`px-3 ${rowPadding} text-center`} onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" className="h-4 w-4 rounded border-slate-600 text-cyan-600 bg-slate-800 focus:ring-cyan-600 focus:ring-offset-slate-900 transition duration-150 ease-in-out" checked={selectedDisputes.includes(dispute.id)} onChange={() => handleSelectRow(dispute.id)} />
                                    </td>
                                    
                                    {visibleColumns.has('createdAt') && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm text-slate-300`}>{formatDate(dispute.createdAt)}</td>}
                                    {(visibleColumns.has('internalStatus') || true) && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm`}>
                                        <div className="flex flex-col">
                                            <DisputeWorkflowBadge dispute={dispute} />
                                            <EvidenceProgress dispute={dispute} />
                                        </div>
                                    </td>}
                                    {(visibleColumns.has('respondBy') || true) && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm truncate`}><TimeToRespond respondBy={dispute.respondBy} /></td>}
                                    {visibleColumns.has('amount') && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm font-semibold text-slate-100 truncate text-right`}>{formatCurrency(dispute.amount, dispute.currency)}</td>}
                                    
                                    {visibleColumns.has('reason') && (
                                        <td className={`px-3 ${rowPadding} whitespace-nowrap text-xs text-slate-300 font-medium capitalize truncate max-w-[1px]`} title={dispute.reason?.replace(/_/g, ' ')}>
                                            <div className="flex items-center space-x-2">
                                                <span className="truncate block">{dispute.reason?.replace(/_/g, ' ') || 'N/A'}</span>
                                                {(dispute.pspDisputeId?.includes('demo') || dispute.id?.includes('demo')) && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 flex-shrink-0">
                                                        DEMO
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    
                                    {(visibleColumns.has('pspDisputeId') || true) && <td className={`px-3 ${rowPadding} text-sm text-slate-400 font-mono max-w-[1px]`}>
                                        <div className="flex items-start gap-1.5">
                                            <div className="flex flex-col truncate min-w-0 flex-1">
                                                <span className="text-cyan-500 truncate">{dispute.pspDisputeId}</span>
                                                {dispute.pspPaymentId && <span className="text-slate-600 text-xs mt-0.5 truncate">{dispute.pspPaymentId}</span>}
                                            </div>
                                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <CopyButton text={dispute.pspDisputeId ?? ''} label="Dispute ID" />
                                            </div>
                                        </div>
                                    </td>}

                                    <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm font-medium text-right`}>
                                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            {isDisputeEvidenceReadOnly(dispute) ? (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setModalDispute(dispute); }}
                                                className="p-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-slate-200 shadow-sm transition-colors"
                                                title="View case"
                                                aria-label="View case"
                                              >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setModalDispute(dispute); }}
                                                className="p-1.5 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow-sm transition-colors"
                                                title="Gather Evidence"
                                                aria-label="Gather Evidence"
                                              >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                              </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Pagination Controls */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-slate-900 border-t border-slate-800 z-10">
                <div className="flex-1 flex justify-between sm:hidden">
                    <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="relative inline-flex items-center px-4 py-2 border border-slate-700 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50">Previous</button>
                    <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-700 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50">Next</button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-slate-500">
                            Showing <span className="font-medium text-slate-200">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-medium text-slate-200">{Math.min(currentPage * rowsPerPage, disputes.length)}</span> of{' '}
                            <span className="font-medium text-slate-200">{disputes.length}</span> results
                        </p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <select value={rowsPerPage} onChange={(e) => onRowsPerPageChange(Number(e.target.value))} className="text-xs rounded-lg bg-slate-800 border-slate-700 text-slate-300 focus:ring-cyan-500 focus:border-cyan-500 py-1.5 pl-2 pr-8">
                            {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size} per page</option>)}
                        </select>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-700 bg-slate-800 text-sm font-medium text-slate-400 hover:bg-slate-700 disabled:opacity-50">
                                <span className="sr-only">Previous</span>
                                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button key={page} onClick={() => onPageChange(page)} className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === page ? 'z-10 bg-cyan-900/50 border-cyan-500 text-cyan-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
                                    {page}
                                </button>
                            ))}
                            <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-700 bg-slate-800 text-sm font-medium text-slate-400 hover:bg-slate-700 disabled:opacity-50">
                                <span className="sr-only">Next</span>
                                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
            {modalDispute && (
              <EvidenceDashboard
                dispute={modalDispute}
                onClose={() => setModalDispute(null)}
                updateDispute={updateDispute}
                hotel={hotel}
                user={user}
                readOnly={isDisputeEvidenceReadOnly(modalDispute)}
              />
            )}
            {detailDispute && <DisputeDetailModal dispute={detailDispute} onClose={() => setDetailDispute(null)} updateDispute={updateDispute} user={user} hotel={hotel} />}
        </div>
    );
};
