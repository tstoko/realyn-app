
import React from 'react';
import type { Dispute, User, Hotel } from '@realyn/shared';
import { StatusBadge } from './StatusBadge';
import { AutomationStatusBadge } from './AutomationStatusBadge';

interface DisputeDetailModalProps {
  dispute: Dispute;
  onClose: () => void;
  updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
  user: User;
  hotel: Hotel;
}



export const DisputeDetailModal: React.FC<DisputeDetailModalProps> = ({ dispute, onClose, updateDispute, user, hotel }) => {

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(amount / 100);
  };
  
  const formatDate = (date?: Date | { toDate(): Date } | string | null) => {
    if (!date) return 'N/A';
    const d = typeof (date as any)?.toDate === 'function'
      ? (date as any).toDate()
      : date instanceof Date ? date : new Date(date as string);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  return (
    <div className="fixed z-40 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
              <div className="text-left w-full">
                  <h3 className="text-xl leading-6 font-semibold text-slate-50 font-heading" id="modal-title">
                      Dispute Details
                  </h3>
                  <p className="text-sm font-mono text-slate-400 mt-1">{dispute.pspDisputeId}</p>
                  
                  <div className="mt-4 border-t border-slate-800 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 sm:gap-y-6">
                      <div>
                          <dt className="text-sm font-medium text-slate-400">Amount</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-50">{formatCurrency(dispute.amount, dispute.currency)}</dd>
                      </div>
                      <div>
                          <dt className="text-sm font-medium text-slate-400">Respond By</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-50">{formatDate(dispute.respondBy)}</dd>
                      </div>
                  </div>
              </div>
          </div>

          <div className="px-4 py-4 sm:px-6 sm:py-4 bg-slate-900">
              <div className="pt-6 min-h-[300px] max-h-[50vh] overflow-y-auto pr-2">
                <div className="space-y-6">
                    <div>
                      <h4 className="text-md font-semibold text-slate-50 font-heading">Customer's Claim</h4>
                      <blockquote className="mt-2 p-3 bg-slate-800/50 border-l-4 border-slate-600 text-sm text-slate-400 italic">
                          "{dispute.customerExplanation}"
                      </blockquote>
                    </div>

                </div>
              </div>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-4 sm:px-6 flex flex-row-reverse items-center border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-700 shadow-sm px-4 py-2 bg-slate-900 text-base font-medium text-slate-50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
