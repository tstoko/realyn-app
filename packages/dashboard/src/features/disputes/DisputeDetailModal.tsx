
import React from 'react';
import type { Dispute, User, Hotel } from '@realyn/shared';
import { StatusBadge } from './StatusBadge';
import { AutomationStatusBadge } from './AutomationStatusBadge';
import { useDisputeTasks } from '../../hooks/useDisputeTasks';

interface DisputeDetailModalProps {
  dispute: Dispute;
  onClose: () => void;
  updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
  user: User;
  hotel: Hotel;
}



export const DisputeDetailModal: React.FC<DisputeDetailModalProps> = ({ dispute, onClose, updateDispute, user, hotel }) => {
  const { tasks } = useDisputeTasks(dispute.id);

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

                    {dispute.readinessAssessment && (
                      <div>
                        <h4 className="text-md font-semibold text-slate-50 font-heading">Readiness Assessment</h4>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-400">Evidence</p>
                            <p className="text-lg font-bold text-cyan-400">{dispute.readinessAssessment.evidenceCompleteness.percentComplete}%</p>
                            <p className="text-xs text-slate-500">{dispute.readinessAssessment.evidenceCompleteness.requiredFulfilled}/{dispute.readinessAssessment.evidenceCompleteness.requiredTotal} required</p>
                          </div>
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-400">Winnability</p>
                            <p className={`text-lg font-bold ${dispute.readinessAssessment.winnability === 'high' ? 'text-emerald-400' : dispute.readinessAssessment.winnability === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>
                              {dispute.readinessAssessment.winnability}
                            </p>
                            <p className="text-xs text-slate-500">Rec: {dispute.readinessAssessment.recommendation}</p>
                          </div>
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-400">Deadline</p>
                            <p className={`text-lg font-bold ${dispute.readinessAssessment.deadlineRisk === 'critical' ? 'text-red-400' : dispute.readinessAssessment.deadlineRisk === 'urgent' ? 'text-amber-400' : 'text-slate-300'}`}>
                              {dispute.readinessAssessment.daysRemaining !== null ? `${dispute.readinessAssessment.daysRemaining}d` : 'N/A'}
                            </p>
                            <p className="text-xs text-slate-500">{dispute.readinessAssessment.deadlineRisk}</p>
                          </div>
                          <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-xs text-slate-400">Status</p>
                            <p className="text-sm font-semibold text-slate-200">{dispute.readinessAssessment.overallReadiness.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-slate-500">Draft: {dispute.readinessAssessment.draftStatus}</p>
                          </div>
                        </div>
                        {dispute.readinessAssessment.blockingIssues.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {dispute.readinessAssessment.blockingIssues.map((issue, i) => (
                              <div key={i} className={`text-xs px-2 py-1 rounded ${issue.severity === 'critical' ? 'bg-red-900/30 text-red-300' : issue.severity === 'major' ? 'bg-amber-900/30 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                                {issue.issue}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {dispute.draftValidation && (
                      <div>
                        <h4 className="text-md font-semibold text-slate-50 font-heading">Draft Validation</h4>
                        <div className="mt-2 p-3 bg-slate-800/50 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${dispute.draftValidation.overallSupport === 'strong' ? 'bg-emerald-400' : dispute.draftValidation.overallSupport === 'adequate' ? 'bg-cyan-400' : dispute.draftValidation.overallSupport === 'weak' ? 'bg-amber-400' : 'bg-red-400'}`} />
                            <span className="text-sm font-medium text-slate-200">Support: {dispute.draftValidation.overallSupport}</span>
                            <span className="text-xs text-slate-500 ml-auto">Risk: {dispute.draftValidation.submissionRisk}</span>
                          </div>
                          {dispute.draftValidation.weakClaims.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-amber-400 font-medium">Weak claims:</p>
                              {dispute.draftValidation.weakClaims.map((c, i) => (
                                <p key={i} className="text-xs text-slate-400 pl-2">• {c.claim}: {c.reason}</p>
                              ))}
                            </div>
                          )}
                          {dispute.draftValidation.unsupportedClaims.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-red-400 font-medium">Unsupported claims:</p>
                              {dispute.draftValidation.unsupportedClaims.map((c, i) => (
                                <p key={i} className="text-xs text-slate-400 pl-2">• {c.claim}: {c.reason}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {tasks.length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold text-slate-50 font-heading">Tasks</h4>
                        <div className="mt-2 space-y-2 max-h-[200px] overflow-y-auto">
                          {tasks.map((task) => (
                            <div key={task.id} className="p-2 bg-slate-800/50 rounded-lg flex items-start gap-2">
                              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${task.status === 'open' ? 'bg-amber-400' : task.status === 'in_progress' ? 'bg-cyan-400' : task.status === 'completed' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-slate-200 font-medium">{task.title}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.priority === 'critical' ? 'bg-red-900/50 text-red-300' : task.priority === 'high' ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                                    {task.priority}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 truncate">{task.description}</p>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${task.status === 'open' ? 'bg-amber-900/30 text-amber-300' : task.status === 'completed' ? 'bg-emerald-900/30 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                                {task.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {dispute.auditTrail && dispute.auditTrail.length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold text-slate-50 font-heading">Activity Timeline</h4>
                        <div className="mt-2 space-y-2 max-h-[200px] overflow-y-auto">
                          {dispute.auditTrail.slice().reverse().slice(0, 20).map((entry, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.actor?.type === 'system' ? 'bg-cyan-400' : entry.actor?.type === 'automation' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                                <div className="flex-1 min-w-0">
                                  <span className="text-slate-300">{entry.title}</span>
                                  <p className="text-slate-500 truncate">{entry.description}</p>
                                </div>
                              </div>
                          ))}
                        </div>
                      </div>
                    )}

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
