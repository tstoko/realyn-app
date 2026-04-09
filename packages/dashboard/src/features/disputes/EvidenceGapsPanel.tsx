import React from 'react';

export interface EvidenceGap {
  requirementId: string;
  label: string;
  category: string;
  required: boolean;
  status: 'auto_collected' | 'uploaded' | 'missing' | 'not_applicable';
  sourceHint?: string;
  autoCollectedFrom?: string;
}

export interface EvidenceGapsData {
  caseId: string;
  totalRequirements: number;
  collectedCount: number;
  missingCount: number;
  gaps: EvidenceGap[];
}

interface EvidenceGapsPanelProps {
  gaps: EvidenceGapsData;
  onUploadClick?: (requirementId: string) => void;
}

const statusConfig: Record<EvidenceGap['status'], { icon: string; label: string; className: string }> = {
  auto_collected: {
    icon: '✓',
    label: 'Auto-collected',
    className: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
  },
  uploaded: {
    icon: '✓',
    label: 'Uploaded',
    className: 'bg-green-900/30 text-green-400 border-green-700/40',
  },
  missing: {
    icon: '!',
    label: 'Missing',
    className: 'bg-amber-900/30 text-amber-400 border-amber-700/40',
  },
  not_applicable: {
    icon: '—',
    label: 'N/A',
    className: 'bg-slate-800 text-slate-500 border-slate-700',
  },
};

export const EvidenceGapsPanel: React.FC<EvidenceGapsPanelProps> = ({ gaps, onUploadClick }) => {
  const completionPct = gaps.totalRequirements > 0
    ? Math.round((gaps.collectedCount / gaps.totalRequirements) * 100)
    : 0;

  const missingRequired = gaps.gaps.filter(g => g.status === 'missing' && g.required);
  const missingOptional = gaps.gaps.filter(g => g.status === 'missing' && !g.required);
  const collected = gaps.gaps.filter(g => g.status === 'auto_collected' || g.status === 'uploaded');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Evidence Gaps</h4>
        <span className="text-xs text-slate-400">
          {gaps.collectedCount}/{gaps.totalRequirements} collected
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-600 to-emerald-500 transition-all duration-500"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      {/* Missing required */}
      {missingRequired.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-2">
            Missing &mdash; Required ({missingRequired.length})
          </p>
          <div className="space-y-2">
            {missingRequired.map(gap => (
              <GapRow key={gap.requirementId} gap={gap} onUploadClick={onUploadClick} />
            ))}
          </div>
        </div>
      )}

      {/* Missing optional */}
      {missingOptional.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Missing &mdash; Optional ({missingOptional.length})
          </p>
          <div className="space-y-2">
            {missingOptional.map(gap => (
              <GapRow key={gap.requirementId} gap={gap} onUploadClick={onUploadClick} />
            ))}
          </div>
        </div>
      )}

      {/* Collected items */}
      {collected.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-400/80 uppercase tracking-wider mb-2">
            Collected ({collected.length})
          </p>
          <div className="space-y-1">
            {collected.map(gap => (
              <div
                key={gap.requirementId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/40"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-900/40 text-emerald-400 flex items-center justify-center text-xs font-bold">
                  ✓
                </span>
                <span className="text-sm text-slate-400 truncate">{gap.label}</span>
                {gap.autoCollectedFrom && (
                  <span className="ml-auto text-[10px] text-slate-600 flex-shrink-0">
                    via {gap.autoCollectedFrom}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const GapRow: React.FC<{ gap: EvidenceGap; onUploadClick?: (id: string) => void }> = ({
  gap,
  onUploadClick,
}) => {
  const cfg = statusConfig[gap.status];

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800">
      <span
        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${cfg.className}`}
      >
        {cfg.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{gap.label}</p>
        {gap.sourceHint && (
          <p className="text-[10px] text-slate-500 truncate">Source: {gap.sourceHint}</p>
        )}
      </div>
      {gap.status === 'missing' && onUploadClick && (
        <button
          onClick={() => onUploadClick(gap.requirementId)}
          className="flex-shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-md bg-cyan-900/30 text-cyan-400 border border-cyan-700/40 hover:bg-cyan-900/50 transition-colors"
        >
          Upload
        </button>
      )}
    </div>
  );
};

export default EvidenceGapsPanel;
