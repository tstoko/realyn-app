import React from 'react';
import type { DisputeStatus } from '../types';

interface StatusBadgeProps {
  status: DisputeStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusStyles: Record<DisputeStatus, { text: string, bg: string }> = {
    needs_response: { text: 'text-yellow-800', bg: 'bg-yellow-100' },
    won: { text: 'text-green-800', bg: 'bg-green-100' },
    lost: { text: 'text-red-800', bg: 'bg-red-100' },
    under_review: { text: 'text-blue-800', bg: 'bg-blue-100' },
    warning_closed: { text: 'text-gray-800', bg: 'bg-gray-100' },
  };

  const { text, bg } = statusStyles[status] || statusStyles.warning_closed;
  const label = status.replace(/_/g, ' ');

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bg} ${text} capitalize`}>
      {label}
    </span>
  );
};

