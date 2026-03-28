import React from 'react';
import type { InternalStatus } from '@realyn/shared';

interface InternalStatusBadgeProps {
  status: InternalStatus;
}

export const InternalStatusBadge: React.FC<InternalStatusBadgeProps> = ({ status }) => {
  const statusStyles: Record<InternalStatus, string> = {
    needs_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    awaiting_docs: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    ready_to_submit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    submitted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
    evidence_complete: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  };

  const style = statusStyles[status] || 'bg-slate-100 text-slate-800';
  const label = status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${style} capitalize`}>
      {label}
    </span>
  );
};