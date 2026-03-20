import React from 'react';

interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton component with pulse animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-800 rounded ${className}`} />
);

/**
 * Skeleton for table rows - matches DisputeTable structure
 */
export const TableRowSkeleton: React.FC = () => (
  <tr className="border-b border-slate-800/50">
    {/* Checkbox */}
    <td className="px-3 py-4">
      <Skeleton className="h-4 w-4 rounded" />
    </td>
    {/* Created Date */}
    <td className="px-3 py-4">
      <Skeleton className="h-4 w-24" />
    </td>
    {/* Status */}
    <td className="px-3 py-4">
      <Skeleton className="h-6 w-28 rounded-full" />
    </td>
    {/* Timeline */}
    <td className="px-3 py-4">
      <Skeleton className="h-5 w-16 rounded-full" />
    </td>
    {/* Amount */}
    <td className="px-3 py-4 text-right">
      <Skeleton className="h-4 w-20 ml-auto" />
    </td>
    {/* Reason */}
    <td className="px-3 py-4">
      <Skeleton className="h-4 w-32" />
    </td>
    {/* Reference */}
    <td className="px-3 py-4">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
    </td>
    {/* Actions */}
    <td className="px-3 py-4">
      <Skeleton className="h-8 w-8 rounded ml-auto" />
    </td>
  </tr>
);

/**
 * Multiple table row skeletons for loading state
 */
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
    {Array.from({ length: rows }).map((_, i) => (
      <TableRowSkeleton key={i} />
    ))}
  </tbody>
);

/**
 * Skeleton for stat cards - matches StatCard structure
 */
export const StatCardSkeleton: React.FC = () => (
  <div className="group relative bg-slate-900/50 backdrop-blur-sm rounded-2xl p-5 border border-slate-800 overflow-hidden">
    <div className="relative flex items-start justify-between">
      <div className="flex-1 min-w-0 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="ml-4 flex-shrink-0">
        <Skeleton className="h-12 w-12 rounded-xl" />
      </div>
    </div>
  </div>
);

/**
 * Multiple stat card skeletons in a grid
 */
export const StatCardGridSkeleton: React.FC<{ cards?: number }> = ({ cards = 4 }) => (
  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: cards }).map((_, i) => (
      <StatCardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Skeleton for hotel/property cards - matches HotelSelectionPage card structure
 */
export const PropertyCardSkeleton: React.FC = () => (
  <div className="group relative bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-800 overflow-hidden">
    {/* Top color bar */}
    <Skeleton className="h-1.5 w-full" />
    
    <div className="p-7">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
    </div>
    
    <div className="px-7 py-4 bg-slate-950/30 border-t border-slate-800/50 flex justify-between items-center">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-4" />
    </div>
  </div>
);

/**
 * Multiple property card skeletons in a grid
 */
export const PropertyCardGridSkeleton: React.FC<{ cards?: number }> = ({ cards = 3 }) => (
  <div className="grid gap-8 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: cards }).map((_, i) => (
      <PropertyCardSkeleton key={i} />
    ))}
  </div>
);
