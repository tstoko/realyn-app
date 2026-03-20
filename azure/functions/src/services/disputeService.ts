import { getDisputesContainer } from "./cosmosClient";

// Types
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
export async function upsertUnifiedDispute(data: UnifiedDisputeData): Promise<string> {
  const container = getDisputesContainer();
  
  // Check if dispute exists
  const querySpec = {
    query: "SELECT * FROM c WHERE c.pspProvider = @pspProvider AND c.pspDisputeId = @pspDisputeId",
    parameters: [
      { name: "@pspProvider", value: data.pspProvider },
      { name: "@pspDisputeId", value: data.pspDisputeId },
    ],
  };
  
  const { resources: existing } = await container.items.query<Dispute>(querySpec).fetchAll();
  const now = new Date().toISOString();
  
  if (existing.length === 0) {
    // Create new dispute
    const newDispute: Dispute = {
      id: `disp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId: data.organizationId,
      pspProvider: data.pspProvider,
      pspDisputeId: data.pspDisputeId,
      pspPaymentId: data.pspPaymentId,
      pspTransactionDate: data.pspTransactionDate.toISOString(),
      pspLast4Digits: data.pspLast4Digits,
      stripeDisputeId: data.pspDisputeId,
      stripePaymentIntentId: data.pspPaymentId,
      amount: data.amount,
      currency: data.currency,
      stripeStatus: data.stripeStatus,
      reason: data.reason,
      respondBy: data.respondBy?.toISOString(),
      createdAt: data.pspTransactionDate.toISOString(),
      updatedAt: now,
      customerExplanation: data.customerExplanation || "",
      automationStatus: "auditing",
      lifecycleStatus: "new",
      internalStatus: "needs_review",
      auditTrail: [],
      aiSummary: "",
      aiDraftResponse: "",
      isDraftApproved: false,
      internalNotes: [],
    };
    
    const { resource } = await container.items.create(newDispute);
    console.log(`Created ${data.pspProvider} dispute: ${data.pspDisputeId}`);
    return resource!.id;
  } else {
    // Update existing dispute
    const existingDispute = existing[0];
    const updated = {
      ...existingDispute,
      stripeStatus: data.stripeStatus,
      respondBy: data.respondBy?.toISOString(),
      customerExplanation: data.customerExplanation || existingDispute.customerExplanation,
      updatedAt: now,
    };
    
    await container.item(existingDispute.id, existingDispute.organizationId).replace(updated);
    console.log(`Updated ${data.pspProvider} dispute: ${data.pspDisputeId}`);
    return existingDispute.id;
  }
}

/**
 * Update dispute status
 */
export async function updateDisputeStatus(
  pspProvider: "stripe" | "adyen",
  pspDisputeId: string,
  status: DisputeStatus
): Promise<void> {
  const container = getDisputesContainer();
  
  const querySpec = {
    query: "SELECT * FROM c WHERE c.pspProvider = @pspProvider AND c.pspDisputeId = @pspDisputeId",
    parameters: [
      { name: "@pspProvider", value: pspProvider },
      { name: "@pspDisputeId", value: pspDisputeId },
    ],
  };
  
  const { resources: disputes } = await container.items.query<Dispute>(querySpec).fetchAll();
  
  if (disputes.length === 0) {
    console.warn(`Dispute not found: ${pspProvider}/${pspDisputeId}`);
    return;
  }
  
  const dispute = disputes[0];
  let lifecycleStatus: LifecycleStatus = dispute.lifecycleStatus;
  
  if (status === "won") lifecycleStatus = "won";
  else if (status === "lost") lifecycleStatus = "lost";
  else if (status === "under_review") lifecycleStatus = "under_review";
  
  const updated = {
    ...dispute,
    stripeStatus: status,
    lifecycleStatus,
    updatedAt: new Date().toISOString(),
  };
  
  await container.item(dispute.id, dispute.organizationId).replace(updated);
  console.log(`Updated ${pspProvider} dispute ${pspDisputeId} to status ${status}`);
}

/**
 * Get dispute by ID
 */
export async function getDispute(disputeId: string, organizationId: string): Promise<Dispute | null> {
  const container = getDisputesContainer();
  
  try {
    const { resource } = await container.item(disputeId, organizationId).read<Dispute>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/**
 * Get disputes by organization
 */
export async function getDisputesByOrganization(organizationId: string): Promise<Dispute[]> {
  const container = getDisputesContainer();
  
  const querySpec = {
    query: "SELECT * FROM c WHERE c.organizationId = @organizationId ORDER BY c.createdAt DESC",
    parameters: [{ name: "@organizationId", value: organizationId }],
  };
  
  const { resources } = await container.items.query<Dispute>(querySpec).fetchAll();
  return resources;
}
