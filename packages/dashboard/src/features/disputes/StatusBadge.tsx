import React from 'react';
import type { DisputeStatus } from '@realyn/shared';

interface StatusBadgeProps {
  status: DisputeStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  if (!status) return null;

  const statusStyles: Record<DisputeStatus, { text: string, bg: string, border: string, dot: string }> = {
    needs_response: { 
        text: 'text-amber-200', 
        bg: 'bg-amber-900/20', 
        border: 'border-amber-700/30',
        dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' 
    },
    won: { 
        text: 'text-emerald-200', 
        bg: 'bg-emerald-900/20', 
        border: 'border-emerald-700/30',
        dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
    },
    lost: { 
        text: 'text-red-200', 
        bg: 'bg-red-900/20', 
        border: 'border-red-700/30',
        dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]' 
    },
    under_review: { 
        text: 'text-blue-200', 
        bg: 'bg-blue-900/20', 
        border: 'border-blue-700/30',
        dot: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]' 
    },
    warning_closed: { 
        text: 'text-slate-300', 
        bg: 'bg-slate-800/50', 
        border: 'border-slate-700/50',
        dot: 'bg-slate-500' 
    },
  };

  const { text, bg, border, dot } = statusStyles[status] || statusStyles.warning_closed;
  const label = status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text} border ${border} capitalize transition-colors`}>
      <span className={`-ml-0.5 mr-1.5 h-1.5 w-1.5 rounded-full ${dot}`}></span>
      {label}
    </span>
  );
};