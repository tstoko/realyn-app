import React, { useState } from 'react';

export interface ClaimValidation {
  heading: string;
  severity: 'green' | 'yellow' | 'red';
  feedback: string;
  suggestion?: string;
}

export interface MissingPspField {
  field: string;
  label: string;
  impact: 'required' | 'recommended' | 'optional';
}

export interface ValidationData {
  caseId: string;
  overallScore: number;
  claims: ClaimValidation[];
  missingPspFields: MissingPspField[];
  summary?: string;
}

interface ValidationResultsProps {
  validation: ValidationData;
}

const severityConfig: Record<ClaimValidation['severity'], { dot: string; bg: string; border: string; text: string; label: string }> = {
  green: {
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-900/20',
    border: 'border-emerald-700/40',
    text: 'text-emerald-300',
    label: 'Strong',
  },
  yellow: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-900/20',
    border: 'border-amber-700/40',
    text: 'text-amber-300',
    label: 'Needs Work',
  },
  red: {
    dot: 'bg-red-400',
    bg: 'bg-red-900/20',
    border: 'border-red-700/40',
    text: 'text-red-300',
    label: 'Weak',
  },
};

const impactStyles: Record<MissingPspField['impact'], string> = {
  required: 'bg-red-900/30 text-red-400 border-red-700/40',
  recommended: 'bg-amber-900/30 text-amber-400 border-amber-700/40',
  optional: 'bg-slate-800 text-slate-400 border-slate-700',
};

function overallScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export const ValidationResults: React.FC<ValidationResultsProps> = ({ validation }) => {
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);

  const greenCount = validation.claims.filter(c => c.severity === 'green').length;
  const yellowCount = validation.claims.filter(c => c.severity === 'yellow').length;
  const redCount = validation.claims.filter(c => c.severity === 'red').length;

  return (
    <div className="space-y-4">
      {/* Header with score */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Draft Validation</h4>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            {greenCount}
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ml-1" />
            {yellowCount}
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block ml-1" />
            {redCount}
          </div>
          <span className={`text-sm font-bold ${overallScoreColor(validation.overallScore)}`}>
            {validation.overallScore}/100
          </span>
        </div>
      </div>

      {/* Summary */}
      {validation.summary && (
        <p className="text-xs text-slate-400 leading-relaxed">{validation.summary}</p>
      )}

      {/* Claims */}
      <div className="space-y-2">
        {validation.claims.map((claim, idx) => {
          const cfg = severityConfig[claim.severity];
          const isExpanded = expandedClaim === idx;

          return (
            <div key={idx} className={`rounded-lg border ${cfg.border} overflow-hidden`}>
              <button
                onClick={() => setExpandedClaim(isExpanded ? null : idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left ${cfg.bg} hover:brightness-110 transition-all`}
              >
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="flex-1 text-sm text-slate-200 truncate">{claim.heading}</span>
                <span className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                  {cfg.label}
                </span>
                <svg
                  className={`flex-shrink-0 w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-3 py-3 bg-slate-900/60 space-y-2">
                  <p className="text-xs text-slate-300 leading-relaxed">{claim.feedback}</p>
                  {claim.suggestion && (
                    <div className="flex items-start gap-2 p-2 bg-cyan-900/15 border border-cyan-800/30 rounded-md">
                      <svg className="flex-shrink-0 w-3.5 h-3.5 text-cyan-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs text-cyan-300 leading-relaxed">{claim.suggestion}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Missing PSP fields */}
      {validation.missingPspFields.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Missing PSP Fields ({validation.missingPspFields.length})
          </p>
          <div className="space-y-1.5">
            {validation.missingPspFields.map((field) => (
              <div
                key={field.field}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800"
              >
                <span className="text-sm text-slate-300">{field.label}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${impactStyles[field.impact]}`}>
                  {field.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationResults;
