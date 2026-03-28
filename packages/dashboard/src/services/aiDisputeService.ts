/**
 * AI Dispute Service
 * 
 * Frontend service for interacting with AI dispute handlers
 */

import { auth } from '@realyn/shared';
import type { EvidencePlan, EvidenceItem, EvidenceRequirementStatus } from '@realyn/shared';
import { getFunctionsBaseUrl, FUNCTIONS_BASE_URL } from '../config/environment';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const idToken = await currentUser.getIdToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` };
}

async function callEvidenceWriteHandler(body: Record<string, any>): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/evidenceWriteHandler`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
  return data;
}

// =============================================================================
// Types
// =============================================================================

export interface EvidenceProgress {
  completed: number;
  total: number;
  requiredCompleted: number;
  requiredTotal: number;
  isComplete: boolean;
}

export interface PlanEvidenceResponse {
  success: boolean;
  status?: 'generating' | 'complete' | 'error';
  message?: string;
  plan?: EvidencePlan;
  evidenceItems?: EvidenceItem[];
  error?: string;
}

export interface UpdateEvidenceItemResponse {
  success: boolean;
  progress?: EvidenceProgress;
  error?: string;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Generate an evidence plan for a dispute
 * 
 * @param disputeId - The Firestore document ID of the dispute
 * @param organizationId - The organization ID
 * @param regenerate - Whether to regenerate an existing plan
 * @returns The generated evidence plan
 */
export async function generateEvidencePlan(
  disputeId: string,
  organizationId: string,
  regenerate: boolean = false
): Promise<PlanEvidenceResponse> {
  try {
    const baseUrl = getFunctionsBaseUrl();
    const fullUrl = `${baseUrl}/planEvidence?disputeId=${disputeId}`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId,
        regenerate,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP error ${response.status}`,
      };
    }

    return data as PlanEvidenceResponse;
  } catch (error) {
    console.error('Error generating evidence plan:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update the status of an evidence item
 * 
 * @param disputeId - The Firestore document ID
 * @param organizationId - The organization ID
 * @param requirementId - The requirement ID to update
 * @param status - The new status
 * @param fileId - Optional file ID if uploaded
 * @param fileName - Optional file name
 * @param uploadedBy - Optional user ID
 * @param notes - Optional notes
 */
export async function updateEvidenceItemStatus(
  disputeId: string,
  organizationId: string,
  requirementId: string,
  status: EvidenceRequirementStatus,
  fileId?: string,
  fileName?: string,
  uploadedBy?: string,
  notes?: string
): Promise<UpdateEvidenceItemResponse> {
  try {
    const baseUrl = getFunctionsBaseUrl();
    const response = await fetch(`${baseUrl}/updateEvidenceItem?disputeId=${disputeId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId,
        requirementId,
        status,
        fileId,
        fileName,
        uploadedBy,
        notes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP error ${response.status}`,
      };
    }

    return data as UpdateEvidenceItemResponse;
  } catch (error) {
    console.error('Error updating evidence item:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get evidence progress for a dispute
 * 
 * @param disputeId - The Firestore document ID
 */
export async function getEvidenceProgress(disputeId: string): Promise<EvidenceProgress | null> {
  try {
    const baseUrl = getFunctionsBaseUrl();
    const response = await fetch(`${baseUrl}/getProgress?disputeId=${disputeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('Error getting evidence progress:', data.error);
      return null;
    }

    return data.progress as EvidenceProgress;
  } catch (error) {
    console.error('Error getting evidence progress:', error);
    return null;
  }
}

/**
 * Toggle AI plan mode for a dispute
 * 
 * @param disputeId - The Firestore document ID
 * @param organizationId - The organization ID
 * @param useAIPlan - Whether to use AI-guided mode
 */
export async function toggleAIPlanMode(
  disputeId: string,
  organizationId: string,
  useAIPlan: boolean
): Promise<boolean> {
  try {
    const baseUrl = getFunctionsBaseUrl();
    const response = await fetch(`${baseUrl}/toggleAIPlan?disputeId=${disputeId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId,
        useAIPlan,
      }),
    });

    const data = await response.json();
    return response.ok && data.success;
  } catch (error) {
    console.error('Error toggling AI plan mode:', error);
    return false;
  }
}

// =============================================================================
// Evidence Write Functions (via Cloud Function)
// =============================================================================

/**
 * Update evidence items via Cloud Function
 */
export async function updateEvidenceItemsLocal(
  disputeId: string,
  evidenceItems: EvidenceItem[],
  organizationId: string
): Promise<boolean> {
  try {
    await callEvidenceWriteHandler({
      action: 'updateEvidenceItems',
      disputeId,
      organizationId,
      evidenceItems,
    });
    return true;
  } catch (error) {
    console.error('Error updating evidence items:', error);
    return false;
  }
}

/**
 * Mark a single requirement as uploaded via Cloud Function
 */
export async function markRequirementUploaded(
  disputeId: string,
  requirementId: string,
  fileId: string,
  fileName: string,
  uploadedBy?: string,
  organizationId?: string
): Promise<boolean> {
  try {
    await callEvidenceWriteHandler({
      action: 'markRequirementUploaded',
      disputeId,
      organizationId: organizationId || '',
      requirementId,
      fileId,
      fileName,
      uploadedBy,
    });
    return true;
  } catch (error) {
    console.error('Error marking requirement uploaded:', error);
    return false;
  }
}

/**
 * Mark a requirement as not available via Cloud Function
 */
export async function markRequirementNotAvailable(
  disputeId: string,
  requirementId: string,
  notes?: string,
  organizationId?: string
): Promise<boolean> {
  try {
    await callEvidenceWriteHandler({
      action: 'markRequirementNotAvailable',
      disputeId,
      organizationId: organizationId || '',
      requirementId,
      notes,
    });
    return true;
  } catch (error) {
    console.error('Error marking requirement not available:', error);
    return false;
  }
}

/**
 * Add audit trail entry for evidence-related actions via Cloud Function
 */
export async function addEvidenceAuditEntry(
  disputeId: string,
  action: string,
  description: string,
  status: 'pending' | 'success' | 'failure' | 'in_progress' = 'success',
  userId?: string,
  userName?: string,
  category?: 'dispute_received' | 'pms_matching' | 'evidence_planning' | 'evidence_upload' | 'argument_generation' | 'submission' | 'status_change' | 'user_action' | 'error',
  metadata?: {
    fileNames?: string[];
    requirementIds?: string[];
    fileCount?: number;
    duration?: number;
    errorCode?: string;
    errorMessage?: string;
    [key: string]: any;
  },
  relatedResources?: {
    evidenceFileIds?: string[];
    evidencePlanId?: string;
    argumentVersionId?: string;
  },
  organizationId?: string
): Promise<boolean> {
  try {
    const entry: any = {
      title: action,
      description,
      status,
    };

    if (userId && userName) {
      entry.actor = { type: 'user', userId, userName };
    } else {
      entry.actor = { type: 'system' };
    }
    if (category) entry.category = category;
    if (metadata) entry.metadata = metadata;
    if (relatedResources) entry.relatedResources = relatedResources;

    await callEvidenceWriteHandler({
      action: 'addAuditEntry',
      disputeId,
      organizationId: organizationId || '',
      entry,
    });
    return true;
  } catch (error) {
    console.error('Error adding audit entry:', error);
    return false;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate local evidence progress from plan and items
 */
export function calculateEvidenceProgress(
  plan: EvidencePlan | undefined,
  evidenceItems: EvidenceItem[]
): EvidenceProgress {
  if (!plan || evidenceItems.length === 0) {
    return {
      completed: 0,
      total: 0,
      requiredCompleted: 0,
      requiredTotal: 0,
      isComplete: false,
    };
  }
  
  const requiredReqs = plan.requirements.filter(r => r.required);
  const requiredIds = requiredReqs.map(r => r.id);
  
  const completed = evidenceItems.filter(
    i => i.status === 'uploaded' || i.status === 'not_applicable'
  ).length;
  
  const requiredCompleted = evidenceItems.filter(
    i => requiredIds.includes(i.requirementId) &&
         (i.status === 'uploaded' || i.status === 'not_applicable')
  ).length;
  
  return {
    completed,
    total: plan.requirements.length,
    requiredCompleted,
    requiredTotal: requiredReqs.length,
    isComplete: requiredCompleted >= requiredReqs.length,
  };
}

/**
 * Get display name for evidence category
 */
export function getCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    pms_data: 'Transaction Records',
    policy: 'Policies & Terms',
    proof_of_stay: 'Proof of Service',
    communications: 'Customer Communications',
    payment_data: 'Payment Verification',
    incident_reports: 'Incident Reports',
    delivery: 'Delivery Proof',
    other: 'Other Evidence',
  };
  return names[category] || category;
}

/**
 * Get icon for evidence category
 */
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    pms_data: '📊',
    policy: '📋',
    proof_of_stay: '🔑',
    communications: '💬',
    payment_data: '💳',
    incident_reports: '⚠️',
    delivery: '📦',
    other: '📁',
  };
  return icons[category] || '📄';
}

/**
 * Initialize evidence items from a plan (all pending)
 */
export function initializeEvidenceItems(plan: EvidencePlan): EvidenceItem[] {
  return plan.requirements.map((req) => ({
    requirementId: req.id,
    status: 'pending' as const,
  }));
}

