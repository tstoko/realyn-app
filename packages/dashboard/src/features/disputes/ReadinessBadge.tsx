import React from 'react';

export interface ReadinessData {
  caseId: string;
  completenessPercent: number;
  deadlineRisk: 'low' | 'medium' | 'high' | 'critical';
  expectedWinRate: number;
  readyForArgument: boolean;
  missingCriticalCount: number;
  daysUntilDeadline?: number;
  summary?: string;
}

interface ReadinessBadgeProps {
  readiness: ReadinessData;
  compact?: boolean;
}

const riskStyles: Record<ReadinessData['deadlineRisk'], { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-emerald-900/30 border-emerald-700/40', text: 'text-emerald-400', label: 'Low Risk' },
  medium: { bg: 'bg-amber-900/30 border-amber-700/40', text: 'text-amber-400', label: 'Medium Risk' },
  high: { bg: 'bg-orange-900/30 border-orange-700/40', text: 'text-orange-400', label: 'High Risk' },
  critical: { bg: 'bg-red-900/30 border-red-700/40', text: 'text-red-400', label: 'Critical' },
};

function winRateColor(rate: number): string {
  if (rate >= 70) return 'text-emerald-400';
  if (rate >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function completenessColor(pct: number): string {
  if (pct >= 80) return 'from-emerald-600 to-emerald-400';
  if (pct >= 50) return 'from-amber-600 to-amber-400';
  return 'from-red-600 to-red-400';
}

export const ReadinessBadge: React.FC<ReadinessBadgeProps> = ({ readiness, compact = false }) => {
  const risk = riskStyles[readiness.deadlineRisk];

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${risk.bg} ${risk.text}`}>
          {risk.label}
        </span>
        <span className="text-xs text-slate-400">
          {readiness.completenessPercent}% complete
        </span>
        {readiness.readyForArgument && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border bg-cyan-900/30 text-cyan-400 border-cyan-700/40">
            Ready
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-4">
      {/* Top row: completeness + ready badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Case Readiness</h4>
        {readiness.readyForArgument ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-900/30 text-cyan-400 border border-cyan-700/40">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            Ready for Argument
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Not Ready
          </span>
        )}
      </div>

      {/* Completeness bar */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400">Evidence Completeness</span>
          <span className="text-slate-300 font-medium">{readiness.completenessPercent}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${completenessColor(readiness.completenessPercent)} transition-all duration-500`}
            style={{ width: `${readiness.completenessPercent}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Win rate */}
        <div className="text-center">
          <p className={`text-lg font-bold ${winRateColor(readiness.expectedWinRate)}`}>
            {readiness.expectedWinRate}%
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Win Rate</p>
        </div>

        {/* Deadline risk */}
        <div className="text-center">
          <p className={`text-lg font-bold ${risk.text}`}>
            {readiness.daysUntilDeadline != null ? `${readiness.daysUntilDeadline}d` : '—'}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">{risk.label}</p>
        </div>

        {/* Missing critical */}
        <div className="text-center">
          <p className={`text-lg font-bold ${readiness.missingCriticalCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {readiness.missingCriticalCount}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Missing</p>
        </div>
      </div>

      {/* Summary */}
      {readiness.summary && (
        <p className="text-xs text-slate-400 leading-relaxed">{readiness.summary}</p>
      )}
    </div>
  );
};

export default ReadinessBadge;
