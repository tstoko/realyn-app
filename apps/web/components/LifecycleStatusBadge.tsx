import React from 'react';
import type { DisputeLifecycleStatus } from '../types';

interface LifecycleStatusBadgeProps {
  status: DisputeLifecycleStatus;
}

export const LifecycleStatusBadge: React.FC<LifecycleStatusBadgeProps> = ({ status }) => {
  const statusStyles: Record<DisputeLifecycleStatus, string> = {
    new: 'bg-blue-900/50 text-blue-300',
    evidence_in_progress: 'bg-yellow-900/50 text-yellow-300',
    draft_ready: 'bg-indigo-900/50 text-indigo-300',
    submitted: 'bg-purple-900/50 text-purple-300',
    under_review: 'bg-slate-700 text-slate-300',
    won: 'bg-green-900/50 text-green-300',
    lost: 'bg-red-900/50 text-red-300',
    not_contested: 'bg-slate-700 text-slate-400',
  };

  const style = statusStyles[status] || statusStyles.new;
  const label = status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style} capitalize`}>
      {label}
    </span>
  );
};
