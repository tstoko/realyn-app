import type { EvidenceCategory } from '@realyn/shared';

/** Align with functions/src/services/ai/disputeCaseBuilder.ts normalizeMerchantVertical */
export function isTicketingIndustry(industry?: string): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase().trim();
  return ['ticketing', 'tickets', 'events', 'live events'].includes(lower);
}

type CategoryDisplay = { label: string; icon: string; description: string };

const HOSPITALITY_DEFAULT: Record<EvidenceCategory, CategoryDisplay> = {
  pms_data: {
    label: 'Transaction Records',
    icon: '📊',
    description: 'Order records, booking confirmations, and transaction history',
  },
  policy: {
    label: 'Policies & Terms',
    icon: '📋',
    description: 'Cancellation, refund, and terms policies',
  },
  proof_of_stay: {
    label: 'Proof of Service',
    icon: '🔑',
    description: 'Service delivery records, access logs, and usage history',
  },
  communications: {
    label: 'Customer Communications',
    icon: '💬',
    description: 'Email, chat, phone logs, and confirmations',
  },
  payment_data: {
    label: 'Payment Verification',
    icon: '💳',
    description: 'Authorization codes, AVS/CVV results, 3D Secure',
  },
  incident_reports: {
    label: 'Incident Reports',
    icon: '⚠️',
    description: 'Damage reports, complaints, incident logs',
  },
  delivery: {
    label: 'Delivery Proof',
    icon: '📦',
    description: 'Shipping and tracking information',
  },
  other: {
    label: 'Other Evidence',
    icon: '📁',
    description: 'Any other relevant documentation',
  },
};

const TICKETING_OVERRIDES: Partial<Record<EvidenceCategory, CategoryDisplay>> = {
  pms_data: {
    label: 'Orders & transactions',
    icon: '📊',
    description: 'Order exports, confirmations, buyer history, and ticket purchase records',
  },
  payment_data: {
    label: 'Payments & PSP records',
    icon: '💳',
    description:
      'Authorisations, settlement detail, refund ledger lines, subscription billing events, and PSP risk or 3DS outcomes',
  },
  policy: {
    label: 'Policies & terms',
    icon: '📋',
    description: 'Event cancellation and refund rules, membership terms, upsell disclosures, and checkout policies',
  },
  communications: {
    label: 'Buyer communications',
    icon: '💬',
    description: 'Email, in-app support, SMS, and push threads about orders, refunds, and event changes',
  },
  proof_of_stay: {
    label: 'Proof of access / attendance',
    icon: '🔑',
    description: 'Redemption logs, QR scans, door entry, and access timestamps',
  },
  incident_reports: {
    label: 'Incident & venue notes',
    icon: '⚠️',
    description: 'Venue incident logs, door policies, and operational notes relevant to the event',
  },
  delivery: {
    label: 'Delivery & fulfilment',
    icon: '📦',
    description: 'Ticket delivery (email, app, wallet), fulfilment timestamps, and access links',
  },
  other: {
    label: 'Supporting documents',
    icon: '📁',
    description: 'Partner agreements, venue letters, ID checks, and any extra context for this dispute',
  },
};

export function getCategoryInfo(
  category: EvidenceCategory,
  industry?: string,
): CategoryDisplay {
  const base = HOSPITALITY_DEFAULT[category];
  if (!isTicketingIndustry(industry)) return base;
  return { ...base, ...TICKETING_OVERRIDES[category] };
}
