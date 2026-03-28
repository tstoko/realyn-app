import React from 'react';
import type { Dispute } from '@realyn/shared';
import { getDisputeWorkflowDisplay, type WorkflowDisplayKey } from './disputeWorkflowDisplay';

interface DisputeWorkflowBadgeProps {
  dispute: Dispute;
}

/** Reflects evidence workflow when plan/items/draft exist; else internal status. Bulk actions still set internalStatus only. */
const styles: Record<WorkflowDisplayKey, string> = {
  won: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  lost: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  submitted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  under_review: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  argument_ready: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  gathering_evidence: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  plan_ready: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  needs_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  awaiting_docs: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  ready_to_submit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  evidence_complete: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  unknown_internal: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

export const DisputeWorkflowBadge: React.FC<DisputeWorkflowBadgeProps> = ({ dispute }) => {
  const { key, label } = getDisputeWorkflowDisplay(dispute);
  const className = styles[key] ?? styles.unknown_internal;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
};
