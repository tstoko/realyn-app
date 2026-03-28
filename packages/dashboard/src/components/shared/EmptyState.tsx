import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Reusable empty state component for when there's no data to display
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}) => (
  <div className={`text-center py-16 px-6 ${className}`}>
    <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-slate-900 mb-4 ring-1 ring-slate-800">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-slate-100 font-heading">{title}</h3>
    <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">{description}</p>
    {(action || secondaryAction) && (
      <div className="mt-6 flex items-center justify-center gap-4">
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-500 transition-colors"
          >
            {action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="text-sm font-medium text-cyan-500 hover:text-cyan-400 transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    )}
  </div>
);

// Pre-configured empty state variants for common use cases

interface NoDisputesEmptyStateProps {
  hasFilters?: boolean;
  onClearFilters?: () => void;
}

export const NoDisputesEmptyState: React.FC<NoDisputesEmptyStateProps> = ({
  hasFilters = false,
  onClearFilters,
}) => (
  <EmptyState
    icon={
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-8 w-8 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    }
    title={hasFilters ? 'No Matching Disputes' : 'No Disputes Yet'}
    description={
      hasFilters
        ? "We couldn't find any disputes matching your current filters. Try adjusting your search criteria."
        : "Great news! You don't have any disputes to manage. New disputes will appear here automatically when they're received from your payment provider."
    }
    action={
      hasFilters && onClearFilters
        ? { label: 'Clear Filters', onClick: onClearFilters }
        : undefined
    }
  />
);

export const NoPropertiesEmptyState: React.FC<{ onAddProperty?: () => void }> = ({
  onAddProperty,
}) => (
  <EmptyState
    icon={
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-8 w-8 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    }
    title="No Accounts Yet"
    description="Get started by adding your first account. Connect your payment provider to start managing disputes automatically."
    action={onAddProperty ? { label: 'Add Account', onClick: onAddProperty } : undefined}
  />
);

export const NoAnalyticsDataEmptyState: React.FC = () => (
  <EmptyState
    icon={
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-8 w-8 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    }
    title="No Analytics Data"
    description="Analytics will appear here once you have disputes to analyze. Dispute data is synced automatically from your payment provider."
  />
);
