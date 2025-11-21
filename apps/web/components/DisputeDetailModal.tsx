
import React, { useState } from 'react';
import type { Dispute, AutomationStep, User, Note, Hotel } from '../types';
import { StatusBadge } from './StatusBadge';
import { AutomationStatusBadge } from './AutomationStatusBadge';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ClockIcon } from './icons/ClockIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { LifecycleStatusBadge } from './LifecycleStatusBadge';
import { useToast } from '../hooks/useToast';

interface DisputeDetailModalProps {
  dispute: Dispute;
  onClose: () => void;
  updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
  user: User;
  hotel: Hotel;
}

const baseInputStyle = "block w-full text-sm rounded-md bg-slate-700 border-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-cyan-600";
const darkSelectStyle = `${baseInputStyle} pl-3 pr-10 py-1.5`;
const darkTextAreaStyle = `${baseInputStyle} px-3 py-2`;

const AuditTrailItem: React.FC<{ step: AutomationStep }> = ({ step }) => {
    const Icon = {
        success: CheckCircleIcon,
        in_progress: ClockIcon,
        failure: ExclamationIcon,
        pending: ClockIcon,
    }[step.status];

    const iconBgColor = {
        success: 'bg-green-500',
        in_progress: 'bg-blue-500',
        failure: 'bg-red-500',
        pending: 'bg-slate-400',
    }[step.status];

    const formatDate = (date: Date) => {
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    return (
        <li className="ml-8">
            <span className={`absolute flex items-center justify-center w-8 h-8 ${iconBgColor} rounded-full -left-4 ring-8 ring-slate-900`}>
                <Icon className="w-5 h-5 text-white" />
            </span>
            <div className="flex items-center justify-between mb-1">
                <h5 className="text-sm font-semibold text-slate-50 font-heading">{step.title}</h5>
                <time className="text-xs font-normal text-slate-400">{formatDate(step.timestamp)}</time>
            </div>
            <p className="text-sm text-slate-400">{step.description}</p>
        </li>
    );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            active ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:bg-slate-800/50'
        }`}
    >
        {children}
    </button>
);


export const DisputeDetailModal: React.FC<DisputeDetailModalProps> = ({ dispute, onClose, updateDispute, user, hotel }) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'ai' | 'notes'>('audit');
  const [draftResponse, setDraftResponse] = useState(dispute.aiDraftResponse);
  const [newNote, setNewNote] = useState('');
  const addToast = useToast();

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(amount / 100);
  };
  
  const formatDate = (date?: Date | null) => {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleApproveDraft = () => {
    const newStatus = !dispute.isDraftApproved;
    updateDispute(dispute.id, { isDraftApproved: newStatus });
    addToast({ type: 'success', message: `Draft marked as ${newStatus ? 'approved' : 'unapproved'}.` });
  };
  
  const handleRegenerateDraft = () => {
      // In a real app, this would be an API call. Here we just reset to the mock data.
      setDraftResponse(dispute.aiDraftResponse);
      addToast({ type: 'info', message: 'AI draft has been regenerated.' });
  };

  const handleAddNote = () => {
    if (newNote.trim() === '') return;
    const note: Note = {
      id: `note_${new Date().getTime()}`,
      author: user.name,
      timestamp: new Date(),
      text: newNote.trim(),
    };
    updateDispute(dispute.id, { internalNotes: [...dispute.internalNotes, note] });
    setNewNote('');
  };

  const handleTeamAssignment = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateDispute(dispute.id, { assignedTeam: e.target.value });
  };

  const handleSubmitToPsp = () => {
    const newAuditStep = {
        timestamp: new Date(),
        title: 'Submitted to Payment Provider',
        description: `Evidence package submitted by ${user.name}.`,
        status: 'success' as const
    };
    const newNote: Note = {
      id: `note_${new Date().getTime()}`,
      author: 'System',
      timestamp: new Date(),
      text: 'Evidence submitted to payment provider.'
    };

    updateDispute(dispute.id, {
        lifecycleStatus: 'submitted',
        automationStatus: 'submitted',
        auditTrail: [...dispute.auditTrail, newAuditStep],
        internalNotes: [...dispute.internalNotes, newNote]
    });
    addToast({ type: 'success', message: 'Evidence has been submitted.' });
    onClose();
  };
  
  const canSubmit = ['evidence_in_progress', 'draft_ready'].includes(dispute.lifecycleStatus) && dispute.isDraftApproved;
  
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
                  <p className="text-sm font-mono text-slate-400 mt-1">{dispute.stripeDisputeId}</p>
                  
                  <div className="mt-4 border-t border-slate-800 pt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
                      <div>
                          <dt className="text-sm font-medium text-slate-400">Amount</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-50">{formatCurrency(dispute.amount, dispute.currency)}</dd>
                      </div>
                      <div>
                          <dt className="text-sm font-medium text-slate-400">Lifecycle Status</dt>
                          <dd className="mt-1 text-sm"><LifecycleStatusBadge status={dispute.lifecycleStatus} /></dd>
                      </div>
                      <div>
                          <dt className="text-sm font-medium text-slate-400">Assigned Team</dt>
                          <dd className="mt-1 text-sm">
                            <select value={dispute.assignedTeam || ''} onChange={handleTeamAssignment} className={darkSelectStyle}>
                                <option value="">Unassigned</option>
                                {hotel.teams.map(team => <option key={team.name} value={team.name}>{team.name}</option>)}
                            </select>
                          </dd>
                      </div>
                      <div>
                          <dt className="text-sm font-medium text-slate-400">Respond By</dt>
                          <dd className="mt-1 text-sm font-semibold text-slate-50">{formatDate(dispute.respondBy)}</dd>
                      </div>
                  </div>
              </div>
          </div>

          <div className="px-4 py-4 sm:px-6 sm:py-4 bg-slate-900">
              <div className="flex space-x-2 border-b border-slate-800 pb-2">
                  <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}>Audit Trail</TabButton>
                  <TabButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')}>AI Assistant</TabButton>
                  <TabButton active={activeTab === 'notes'} onClick={() => setActiveTab('notes')}>Internal Notes ({dispute.internalNotes.length})</TabButton>
              </div>

              <div className="pt-6 min-h-[300px] max-h-[50vh] overflow-y-auto pr-2">
                {activeTab === 'audit' && (
                  <div className="space-y-6">
                      <div>
                        <h4 className="text-md font-semibold text-slate-50 font-heading">Customer's Claim</h4>
                        <blockquote className="mt-2 p-3 bg-slate-800/50 border-l-4 border-slate-600 text-sm text-slate-400 italic">
                            "{dispute.customerExplanation}"
                        </blockquote>
                      </div>

                      <div className="pt-2">
                        <h4 className="text-md font-semibold text-slate-50 mb-4 font-heading">Automation Log</h4>
                        {/* Added ml-6 to prevent icon cutoff */}
                        <ol className="relative border-l border-slate-800 space-y-8 ml-6">
                            {dispute.auditTrail.map((step, index) => (
                                <AuditTrailItem key={index} step={step} />
                            ))}
                        </ol>
                      </div>
                  </div>
                )}
                {activeTab === 'ai' && (
                    <div className="space-y-6">
                        <div>
                            <h4 className="font-semibold text-slate-50 font-heading">AI Summary</h4>
                            <p className="text-sm text-slate-400 mt-1">{dispute.aiSummary}</p>
                        </div>
                        <div className="pt-2">
                            <h4 className="font-semibold text-slate-50 font-heading">AI Draft Response</h4>
                            <textarea value={draftResponse} onChange={(e) => setDraftResponse(e.target.value)} rows={8} className={`mt-2 ${darkTextAreaStyle}`}></textarea>
                            <div className="mt-4 bg-slate-800/50 p-4 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                                <div className="flex items-center">
                                    <button 
                                        id="approve-draft"
                                        onClick={handleApproveDraft} 
                                        className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800/50 focus:ring-cyan-600 ${dispute.isDraftApproved ? 'bg-cyan-600' : 'bg-slate-600'}`}
                                    >
                                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${dispute.isDraftApproved ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                    <label htmlFor="approve-draft" className="ml-3 text-sm font-medium text-slate-50 cursor-pointer">
                                        Mark draft as approved
                                    </label>
                                </div>
                                <button 
                                    onClick={handleRegenerateDraft}
                                    className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-slate-700 text-xs font-medium rounded-md text-slate-400 bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600"
                                >
                                    Regenerate Draft
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'notes' && (
                    <div className="space-y-4">
                        <div className="space-y-3 pr-2">
                            {dispute.internalNotes.map(note => (
                                <div key={note.id} className="bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                                    <p className="text-sm text-slate-400 whitespace-pre-wrap">{note.text}</p>
                                    <p className="text-xs text-slate-500 text-right mt-2 pt-2 border-t border-dashed border-slate-700">
                                        <strong>{note.author}</strong> on {formatDate(note.timestamp)}
                                    </p>
                                </div>
                            ))}
                            {dispute.internalNotes.length === 0 && <p className="text-sm text-center text-slate-500 py-8">No notes yet.</p>}
                        </div>
                        <div className="pt-4 border-t border-slate-800">
                             <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={3} placeholder="Add a new note..." className={darkTextAreaStyle}></textarea>
                             <div className="text-right mt-2">
                                <button 
                                    onClick={handleAddNote} 
                                    className="px-4 py-1.5 bg-slate-700 text-white text-sm font-medium rounded-md hover:bg-slate-600 disabled:opacity-50" disabled={!newNote.trim()}
                                >
                                    Add Note
                                </button>
                             </div>
                        </div>
                    </div>
                )}
              </div>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-4 sm:px-6 flex flex-row-reverse items-center border-t border-slate-800">
            {['evidence_in_progress', 'draft_ready'].includes(dispute.lifecycleStatus) && (
              <button
                type="button"
                onClick={handleSubmitToPsp}
                disabled={!canSubmit}
                title={!dispute.isDraftApproved ? 'You must approve the AI draft before submitting' : 'Submit evidence to the payment provider'}
                className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-cyan-600 text-base font-medium text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit to Payment Provider
              </button>
            )}
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-700 shadow-sm px-4 py-2 bg-slate-900 text-base font-medium text-slate-50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={() => addToast({type: 'info', message: 'Download evidence pack (mocked).'})}
            >
                Download Evidence Pack (PDF)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-700 shadow-sm px-4 py-2 bg-slate-900 text-base font-medium text-slate-50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
            {['evidence_in_progress', 'draft_ready'].includes(dispute.lifecycleStatus) && !dispute.isDraftApproved &&
                <p className="text-xs text-amber-500 mr-auto flex items-center pr-4">Approve the AI draft to enable submission.</p>
            }
          </div>
        </div>
      </div>
    </div>
  );
};
