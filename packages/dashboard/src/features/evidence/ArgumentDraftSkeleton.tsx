import React from 'react';

export const ArgumentDraftSkeleton: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Executive Summary skeleton */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="h-4 bg-slate-700 rounded w-1/4 mb-3 animate-pulse"></div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-slate-700 rounded w-4/5 animate-pulse"></div>
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="h-4 bg-slate-700 rounded w-1/4 mb-4 animate-pulse"></div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="w-20 h-3 bg-slate-700 rounded animate-pulse"></div>
              <div className="flex-1">
                <div className="h-3 bg-slate-700 rounded w-full mb-2 animate-pulse"></div>
                <div className="h-3 bg-slate-700 rounded w-3/4 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Paragraphs skeleton */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="h-4 bg-slate-700 rounded w-1/4 mb-4 animate-pulse"></div>
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-4 bg-slate-700 rounded w-1/3 mb-3 animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-slate-700 rounded w-5/6 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Claim Rebuttal skeleton */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-3 animate-pulse"></div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-slate-700 rounded w-4/5 animate-pulse"></div>
        </div>
      </div>

      {/* Conclusion skeleton */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="h-4 bg-slate-700 rounded w-1/4 mb-3 animate-pulse"></div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-slate-700 rounded w-3/4 animate-pulse"></div>
        </div>
      </div>

      {/* Stripe fields skeleton (collapsed) */}
      <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
        <div className="h-4 bg-slate-700 rounded w-1/3 animate-pulse"></div>
      </div>
    </div>
  );
};

