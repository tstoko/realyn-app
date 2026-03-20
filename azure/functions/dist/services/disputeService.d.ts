export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost" | "warning_closed";
export type LifecycleStatus = "new" | "evidence_in_progress" | "draft_ready" | "submitted" | "under_review" | "won" | "lost" | "not_contested";
export type AutomationStatus = "auditing" | "awaiting_info" | "responding" | "submitted" | "manual_review" | "unwinnable" | "complete";
export interface UnifiedDisputeData {
    organizationId: string;
    pspProvider: "stripe" | "adyen";
    pspDisputeId: string;
    pspPaymentId: string;
    pspTransactionDate: Date;
    pspLast4Digits?: string;
    amount: number;
    currency: string;
    stripeStatus: DisputeStatus;
    reason?: string;
    respondBy?: Date;
    customerExplanation?: string;
}
export interface Dispute {
    id: string;
    organizationId: string;
    pspProvider: "stripe" | "adyen";
    pspDisputeId: string;
    pspPaymentId: string;
    pspTransactionDate: string;
    pspLast4Digits?: string;
    stripeDisputeId: string;
    stripePaymentIntentId?: string;
    amount: number;
    currency: string;
    stripeStatus: DisputeStatus;
    reason?: string;
    respondBy?: string;
    createdAt: string;
    updatedAt: string;
    customerExplanation: string;
    automationStatus: AutomationStatus;
    lifecycleStatus: LifecycleStatus;
    internalStatus: string;
    auditTrail: any[];
    aiSummary: string;
    aiDraftResponse: string;
    isDraftApproved: boolean;
    internalNotes: any[];
    evidencePlan?: any;
    evidenceItems?: any[];
    argumentDraft?: any;
}
/**
 * Upsert a dispute from PSP webhook
 */
export declare function upsertUnifiedDispute(data: UnifiedDisputeData): Promise<string>;
/**
 * Update dispute status
 */
export declare function updateDisputeStatus(pspProvider: "stripe" | "adyen", pspDisputeId: string, status: DisputeStatus): Promise<void>;
/**
 * Get dispute by ID
 */
export declare function getDispute(disputeId: string, organizationId: string): Promise<Dispute | null>;
/**
 * Get disputes by organization
 */
export declare function getDisputesByOrganization(organizationId: string): Promise<Dispute[]>;
//# sourceMappingURL=disputeService.d.ts.map