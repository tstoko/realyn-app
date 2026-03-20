import React, { useState, useEffect } from 'react';
import type { Dispute, User, Hotel } from '@realyn/shared';
import { EvidenceDashboard } from './EvidenceDashboard';
import { DisputeDetailModal } from '../disputes/DisputeDetailModal';

interface AIActionsProps {
    disputes: Dispute[];
    updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
    user: User;
    hotel: Hotel;
}

export const AIActions: React.FC<AIActionsProps> = ({ disputes, updateDispute, user, hotel }) => {
    const [modalDispute, setModalDispute] = useState<Dispute | null>(null);
    const [detailDispute, setDetailDispute] = useState<Dispute | null>(null);
    
    // This effect synchronizes the currently open modal's data with the main disputes list.
    // This is crucial for reflecting state changes made inside the modal (e.g., approving a draft) back into the modal's UI instantly.
    useEffect(() => {
      if (detailDispute) {
        const updatedDispute = disputes.find(d => d.id === detailDispute.id);
        if (updatedDispute) {
          setDetailDispute(updatedDispute);
        }
      }
      if (modalDispute) {
        const updatedDispute = disputes.find(d => d.id === modalDispute.id);
        if (updatedDispute) {
          setModalDispute(updatedDispute);
        }
      }
    }, [disputes, detailDispute?.id, modalDispute?.id]);

    if (disputes.length === 0) {
        return (
            <div className="text-center py-20 px-6">
                 <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                <h3 className="mt-4 text-lg font-semibold text-slate-50 font-heading">All Clear!</h3>
                <p className="mt-1 text-sm text-slate-400">The AI is handling everything and doesn't need your help right now.</p>
            </div>
        )
    }

    const getActionText = (dispute: Dispute) => {
        switch (dispute.automationStatus) {
            case 'awaiting_info':
                return 'Provide Info';
            case 'manual_review':
                return 'Review Dispute';
            default:
                return 'Take Action';
        }
    };
    
    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    };

    return (
        <>
        <div className="p-1 sm:p-4 space-y-4">
           {disputes.map(dispute => (
               <div key={dispute.id} className="bg-slate-900 p-4 rounded-lg shadow-sm border border-slate-800 transition-shadow hover:shadow-md">
                   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                       <div>
                            <p className="font-mono text-sm text-cyan-500 font-medium">{dispute.pspDisputeId}</p>
                            <p className="text-xl font-semibold text-slate-50">{formatCurrency(dispute.amount, dispute.currency)}</p>
                       </div>
                       <div className="mt-4 sm:mt-0 sm:ml-4 flex items-center space-x-3">
                            <button
                                onClick={() => setDetailDispute(dispute)}
                                className="inline-flex items-center px-3 py-1.5 border border-slate-700 text-xs font-medium rounded-md text-slate-400 bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600"
                            >
                                View Details
                            </button>
                            <button
                                onClick={() => setModalDispute(dispute)}
                                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600"
                            >
                                {getActionText(dispute)}
                            </button>
                       </div>
                   </div>
                   <div className="mt-4 pt-4 border-t border-dashed border-slate-800">
                       <p className="text-sm font-semibold text-slate-50">What the AI needs:</p>
                       <div className="mt-2 text-sm text-amber-200 bg-amber-900/20 p-3 rounded-md border border-amber-900/50">
                           <p>
                             {dispute.missingEvidence || 'Manual review of the case is required.'}
                           </p>
                           {dispute.awaitingInfoFrom && <p className="mt-1 font-medium"> (Requested from: <span className="font-bold">{dispute.awaitingInfoFrom}</span>)</p>}
                       </div>
                   </div>
               </div>
           ))}
        </div>
        {modalDispute && <EvidenceDashboard dispute={modalDispute} onClose={() => setModalDispute(null)} updateDispute={updateDispute} hotel={hotel} user={user} />}
        {detailDispute && <DisputeDetailModal dispute={detailDispute} onClose={() => setDetailDispute(null)} updateDispute={updateDispute} user={user} hotel={hotel} />}
        </>
    );
};