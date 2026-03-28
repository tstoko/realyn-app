import type { Dispute, DisputeLifecycleStatus } from '@realyn/shared';

const READ_ONLY_LIFECYCLES: DisputeLifecycleStatus[] = [
  'submitted',
  'under_review',
  'won',
  'lost',
  'not_contested',
];

/**
 * Disputes that should not allow evidence uploads / plan regen / argument edits in the dashboard.
 */
export function isDisputeEvidenceReadOnly(dispute: Dispute): boolean {
  const lc = dispute.lifecycleStatus;
  if (lc && READ_ONLY_LIFECYCLES.includes(lc)) {
    return true;
  }
  const s = dispute.status;
  if (s === 'won' || s === 'lost' || s === 'under_review') {
    return true;
  }
  return false;
}
