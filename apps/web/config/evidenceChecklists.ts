
export type EvidenceChecklistItemKey = 'pms_data' | 'policy' | 'proof_of_stay' | 'communications' | 'payment_verification' | 'incident_report';
export type ChecklistItemType = 'required' | 'optional';
export type ChecklistItemStatus = ChecklistItemType | 'provided';

export interface EvidenceChecklistItem {
    key: EvidenceChecklistItemKey;
    label: string;
    type: ChecklistItemType;
}

const checklists: Record<string, EvidenceChecklistItem[]> = {
    fraudulent: [
        { key: 'payment_verification', label: 'Payment Verification (AVS/CVV)', type: 'required' },
        { key: 'proof_of_stay', label: 'Proof of Stay (e.g., Reg Card)', type: 'required' },
        { key: 'communications', label: 'Customer Communications', type: 'optional' },
    ],
    product_not_received: [
        { key: 'pms_data', label: 'PMS Folio / Stay Record', type: 'required' },
        { key: 'proof_of_stay', label: 'Proof of Stay (e.g., Wi-Fi logs)', type: 'required' },
        { key: 'communications', label: 'Confirmation Emails', type: 'required' },
    ],
    credit_not_processed: [
        { key: 'policy', label: 'Cancellation / Refund Policy', type: 'required' },
        { key: 'communications', label: 'Cancellation Confirmation', type: 'required' },
        { key: 'pms_data', label: 'PMS Record of Cancellation', type: 'optional' },
    ],
    general: [
        { key: 'pms_data', label: 'PMS Folio / Invoice', type: 'required' },
        { key: 'policy', label: 'Terms of Service', type: 'required' },
        { key: 'communications', label: 'All Customer Communications', type: 'optional' },
        { key: 'incident_report', label: 'Incident Reports or Photos', type: 'optional' },
    ],
    default: [
        { key: 'pms_data', label: 'PMS Folio / Invoice', type: 'required' },
        { key: 'policy', label: 'Relevant Policies (T&Cs, Cancellation)', type: 'required' },
        { key: 'communications', label: 'Customer Communications', type: 'optional' },
    ],
};

export const getChecklistForReason = (reason?: string | null): EvidenceChecklistItem[] => {
    if (reason && checklists[reason]) {
        return checklists[reason];
    }
    return checklists.default;
};
