
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StatusBadge } from './StatusBadge';
import type { Dispute, SortState, User, Hotel } from '../types';
import { EvidenceModal } from './EvidenceModal';
import { DisputeDetailModal } from './DisputeDetailModal';
import { InternalStatusBadge } from './InternalStatusBadge';
import { InformationCircleIcon } from './icons/InformationCircleIcon';

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
            <div className="text-center py-24 px-6">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-slate-900 mb-4 ring-1 ring-slate-800">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-100 font-heading">No Disputes Found</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-xs mx-auto">We couldn't find any disputes matching your current filters.</p>
                <button onClick={() => window.location.reload()} className="mt-6 text-sm font-medium text-cyan-500 hover:text-cyan-400 transition-colors">Clear all filters</button>
            </div>
        );
    }

    const formatCurrency = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
    const formatDate = (timestamp?: Date | null) => timestamp ? timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

    const TimeToRespond: React.FC<{ respondBy: Date | null | undefined }> = ({ respondBy }) => {
        if (!respondBy) return <span className="text-slate-500">-</span>;
        const diffDays = Math.ceil((respondBy.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return <span className="font-medium text-red-400">Overdue</span>;
        if (diffDays <= 3) return <span className="font-medium text-red-400 truncate">Due {diffDays}d</span>;
        if (diffDays <= 7) return <span className="font-medium text-amber-400 truncate">Due {diffDays}d</span>;
        return <span className="text-slate-400 truncate">Due {diffDays}d</span>;
    };
    
    // Updated column widths and alignment
    const tableHeaders: { key: keyof Dispute | string, label: string, width: string, tooltip?: string, align?: 'left' | 'right' }[] = [
        { key: 'createdAt', label: 'Created', width: 'w-32' },
        { key: 'internalStatus', label: 'Status', tooltip: 'Internal workflow status', width: 'w-36' },
        { key: 'respondBy', label: 'Timeline', tooltip: 'Time remaining', width: 'w-28' },
        { key: 'amount', label: 'Amount', width: 'w-32', align: 'right' }, // Right aligned for financial data
        { key: 'reason', label: 'Reason', width: 'w-48' }, // Widened for legibility
        { key: 'stripeDisputeId', label: 'Reference', width: '' }, // Fills remaining space
    ];

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-1 w-full overflow-hidden relative">
                <div className="absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                    <table className="w-full table-fixed border-collapse">
                        <thead>
                            <tr>
                                <th scope="col" className="w-12 px-3 py-4 sticky top-0 bg-slate-900 z-10 shadow-[0_1px_0_0_rgba(30,41,59,1)]">
                                    <div className="flex items-center justify-center">
                                        <input type="checkbox" className="h-4 w-4 rounded border-slate-600 text-cyan-600 bg-slate-800 focus:ring-cyan-600 focus:ring-offset-slate-900 transition duration-150 ease-in-out" 
                                            ref={selectAllCheckboxRef}
                                            checked={selectedDisputes.length === paginatedDisputes.length && paginatedDisputes.length > 0}
                                            onChange={handleSelectAll}
                                        />
                                    </div>
                                </th>
                                {tableHeaders.map(header => {
                                    if (header.key !== 'stripeDisputeId' && !visibleColumns.has(header.key as keyof Dispute) && !['internalStatus', 'respondBy'].includes(header.key)) return null;

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
                                    className={`group transition-colors duration-200 hover:bg-slate-800/60 ${selectedDisputes.includes(dispute.id) ? 'bg-cyan-900/10' : ''}`}
                                >
                                    <td className={`px-3 ${rowPadding} text-center`}>
                                        <input type="checkbox" className="h-4 w-4 rounded border-slate-600 text-cyan-600 bg-slate-800 focus:ring-cyan-600 focus:ring-offset-slate-900 transition duration-150 ease-in-out" checked={selectedDisputes.includes(dispute.id)} onChange={() => handleSelectRow(dispute.id)} />
                                    </td>
                                    
                                    {visibleColumns.has('createdAt') && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm text-slate-300 cursor-pointer`} onClick={() => setDetailDispute(dispute)}>{formatDate(dispute.createdAt)}</td>}
                                    {(visibleColumns.has('internalStatus') || true) && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm cursor-pointer`} onClick={() => setDetailDispute(dispute)}><InternalStatusBadge status={dispute.internalStatus} /></td>}
                                    {(visibleColumns.has('respondBy') || true) && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm cursor-pointer truncate`} onClick={() => setDetailDispute(dispute)}><TimeToRespond respondBy={dispute.respondBy} /></td>}
                                    {visibleColumns.has('amount') && <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm font-semibold text-slate-100 cursor-pointer truncate text-right`} onClick={() => setDetailDispute(dispute)}>{formatCurrency(dispute.amount, dispute.currency)}</td>}
                                    
                                    {visibleColumns.has('reason') && <td className={`px-3 ${rowPadding} whitespace-nowrap text-xs text-slate-300 font-medium capitalize cursor-pointer truncate max-w-[1px]`} onClick={() => setDetailDispute(dispute)} title={dispute.reason?.replace(/_/g, ' ')}><span className="truncate block">{dispute.reason?.replace(/_/g, ' ') || 'N/A'}</span></td>}
                                    
                                    {(visibleColumns.has('stripeDisputeId') || true) && <td className={`px-3 ${rowPadding} text-sm text-slate-400 font-mono max-w-[1px]`}>
                                        <div className="flex flex-col truncate">
                                            <a href={`#`} onClick={(e) => e.stopPropagation()} className="text-cyan-500 hover:text-cyan-400 hover:underline transition-colors truncate">{dispute.stripeDisputeId}</a>
                                            {dispute.stripePaymentIntentId && <span className="text-slate-600 text-xs mt-0.5 truncate">{dispute.stripePaymentIntentId}</span>}
                                        </div>
                                    </td>}

                                    <td className={`px-3 ${rowPadding} whitespace-nowrap text-sm font-medium text-right`}>
                                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            {(dispute.lifecycleStatus === 'new' || dispute.lifecycleStatus === 'evidence_in_progress') && (
                                                <button onClick={(e) => { e.stopPropagation(); setModalDispute(dispute); }} className="p-1.5 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow-sm transition-colors" title="Gather Evidence">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); setDetailDispute(dispute); }} className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Pagination Controls */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-slate-900 border-t border-slate-800 z-10">
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
            {modalDispute && <EvidenceModal dispute={modalDispute} onClose={() => setModalDispute(null)} updateDispute={updateDispute} hotel={hotel} />}
            {detailDispute && <DisputeDetailModal dispute={detailDispute} onClose={() => setDetailDispute(null)} updateDispute={updateDispute} user={user} hotel={hotel} />}
        </div>
    );
};
