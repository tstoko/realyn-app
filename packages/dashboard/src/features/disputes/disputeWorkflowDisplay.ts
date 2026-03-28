import type { Dispute } from '@realyn/shared';

/** Keys used for badge styling in DisputeWorkflowBadge */
export type WorkflowDisplayKey =
  | 'won'
  | 'lost'
  | 'submitted'
  | 'under_review'
  | 'argument_ready'
  | 'gathering_evidence'
  | 'plan_ready'
  | 'needs_review'
  | 'awaiting_docs'
  | 'ready_to_submit'
  | 'resolved'
  | 'evidence_complete'
  | 'unknown_internal';

function titleCaseSlug(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Derives the table "Status" label from evidence/argument fields when present,
 * otherwise falls back to internal workflow status.
 */
export function getDisputeWorkflowDisplay(dispute: Dispute): { key: WorkflowDisplayKey; label: string } {
  const lc = dispute.lifecycleStatus;

  if (lc === 'won') return { key: 'won', label: 'Won' };
  if (lc === 'lost') return { key: 'lost', label: 'Lost' };
  if (lc === 'submitted') return { key: 'submitted', label: 'Submitted' };
  if (lc === 'under_review') return { key: 'under_review', label: 'Under review' };

  if (lc === 'plan_ready' && !dispute.argumentDraft && !dispute.evidencePlan) {
    return { key: 'plan_ready', label: 'Plan ready' };
  }

  if (dispute.argumentDraft) {
    return { key: 'argument_ready', label: 'Argument ready' };
  }

  const plan = dispute.evidencePlan;
  const items = dispute.evidenceItems ?? [];
  if (plan) {
    const hasProgress = items.some(i => i.status && i.status !== 'pending');
    if (hasProgress) {
      return { key: 'gathering_evidence', label: 'Gathering evidence' };
    }
    return { key: 'plan_ready', label: 'Plan ready' };
  }

  const internal = dispute.internalStatus ?? 'needs_review';
  const map: Record<string, { key: WorkflowDisplayKey; label: string }> = {
    needs_review: { key: 'needs_review', label: 'Needs review' },
    awaiting_docs: { key: 'awaiting_docs', label: 'Awaiting docs' },
    ready_to_submit: { key: 'ready_to_submit', label: 'Ready to submit' },
    resolved: { key: 'resolved', label: 'Resolved' },
    submitted: { key: 'submitted', label: 'Submitted' },
    evidence_complete: { key: 'evidence_complete', label: 'Evidence complete' },
  };

  if (map[internal]) return map[internal];

  return { key: 'unknown_internal', label: titleCaseSlug(internal) };
}
