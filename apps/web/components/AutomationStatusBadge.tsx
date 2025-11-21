import React from 'react';
import type { AutomationStatus } from '../types';

interface AutomationStatusBadgeProps {
  status: AutomationStatus;
}

export const AutomationStatusBadge: React.FC<AutomationStatusBadgeProps> = ({ status }) => {
  const statusStyles: Record<AutomationStatus, string> = {
    auditing: 'bg-blue-900/50 text-blue-300',
    awaiting_info: 'bg-yellow-900/50 text-yellow-300',
    responding: 'bg-indigo-900/50 text-indigo-300',
    submitted: 'bg-purple-900/50 text-purple-300',
    manual_review: 'bg-red-900/50 text-red-300',
    unwinnable: 'bg-slate-700 text-slate-300',
    complete: 'bg-green-900/50 text-green-300',
  };

  const style = statusStyles[status] || statusStyles.unwinnable;
  const label = status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style} capitalize`}>
      <svg className={`-ml-0.5 mr-1.5 h-2 w-2 text-current`} fill="currentColor" viewBox="0 0 8 8">
        <circle cx={4} cy={4} r={3} />
      </svg>
      {label}
    </span>
  );
};