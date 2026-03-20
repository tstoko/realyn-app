import React from 'react';

export const EvidencePlanSkeleton: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content skeleton */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary skeleton */}
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
            <div className="h-4 bg-slate-700 rounded w-3/4 mb-3 animate-pulse"></div>
            <div className="h-3 bg-slate-700 rounded w-full mb-2 animate-pulse"></div>
            <div className="h-3 bg-slate-700 rounded w-5/6 animate-pulse"></div>
          </div>

          {/* Requirements skeleton - show 4-5 placeholder requirements */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="w-8 h-8 bg-slate-700 rounded-lg animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-700 rounded w-1/3 mb-2 animate-pulse"></div>
                    <div className="h-3 bg-slate-700 rounded w-1/2 animate-pulse"></div>
                  </div>
                </div>
                <div className="h-6 bg-slate-700 rounded-full w-24 animate-pulse"></div>
              </div>
              <div className="p-4 pt-0 border-t border-slate-800 bg-slate-900/30">
                <div className="h-3 bg-slate-700 rounded w-full mb-3 animate-pulse"></div>
                <div className="h-3 bg-slate-700 rounded w-4/5 mb-4 animate-pulse"></div>
                {/* Instructions skeleton */}
                <div className="mb-4 p-3 bg-cyan-900/10 border border-cyan-700/30 rounded-lg">
                  <div className="h-3 bg-slate-600 rounded w-1/4 mb-2 animate-pulse"></div>
                  <div className="h-3 bg-slate-600 rounded w-full mb-1 animate-pulse"></div>
                  <div className="h-3 bg-slate-600 rounded w-3/4 animate-pulse"></div>
                </div>
                {/* Dropzone skeleton */}
                <div className="h-32 bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-lg animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar skeleton */}
        <div className="lg:col-span-1">
          <div className="p-6 space-y-6 bg-slate-900/50 rounded-xl border border-slate-800">
            {/* Recommendation skeleton */}
            <div>
              <div className="h-3 bg-slate-700 rounded w-1/3 mb-3 animate-pulse"></div>
              <div className="h-8 bg-slate-700 rounded-full w-32 animate-pulse"></div>
            </div>
            {/* Winnability skeleton */}
            <div>
              <div className="h-3 bg-slate-700 rounded w-1/3 mb-3 animate-pulse"></div>
              <div className="h-8 bg-slate-700 rounded-full w-24 mb-2 animate-pulse"></div>
              <div className="h-3 bg-slate-700 rounded w-full animate-pulse"></div>
            </div>
            {/* Progress bar skeleton */}
            <div>
              <div className="h-3 bg-slate-700 rounded w-1/2 mb-2 animate-pulse"></div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-slate-700 w-3/4 animate-pulse"></div>
              </div>
            </div>
            {/* Summary skeleton */}
            <div className="p-4 bg-cyan-900/10 border border-cyan-900/30 rounded-xl">
              <div className="h-3 bg-slate-600 rounded w-1/4 mb-2 animate-pulse"></div>
              <div className="h-3 bg-slate-600 rounded w-full mb-1 animate-pulse"></div>
              <div className="h-3 bg-slate-600 rounded w-5/6 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

