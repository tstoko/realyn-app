/**
 * AI Dispute Service
 * 
 * Frontend service for interacting with AI dispute handlers
 */

import { db } from '@realyn/shared';
import { doc, updateDoc, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import type { EvidencePlan, EvidenceItem, EvidenceRequirementStatus } from '@realyn/shared';
import { getFunctionsBaseUrl } from '../config/environment';

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
    // #region agent log
    fetch('http://127.0.0.1:7783/ingest/12aca0fa-d38d-4f94-8099-f2b9b25ce51a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb8daa'},body:JSON.stringify({sessionId:'cb8daa',location:'aiDisputeService.ts:58',message:'generateEvidencePlan called',data:{baseUrl,fullUrl,disputeId,organizationId,regenerate},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
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

    // #region agent log
    fetch('http://127.0.0.1:7783/ingest/12aca0fa-d38d-4f94-8099-f2b9b25ce51a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb8daa'},body:JSON.stringify({sessionId:'cb8daa',location:'aiDisputeService.ts:72',message:'fetch response received',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    const data = await response.json();

    if (!response.ok) {
      // #region agent log
      fetch('http://127.0.0.1:7783/ingest/12aca0fa-d38d-4f94-8099-f2b9b25ce51a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb8daa'},body:JSON.stringify({sessionId:'cb8daa',location:'aiDisputeService.ts:78',message:'response not ok',data:{status:response.status,error:data.error},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return {
        success: false,
        error: data.error || `HTTP error ${response.status}`,
      };
    }

    return data as PlanEvidenceResponse;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7783/ingest/12aca0fa-d38d-4f94-8099-f2b9b25ce51a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb8daa'},body:JSON.stringify({sessionId:'cb8daa',location:'aiDisputeService.ts:88',message:'fetch threw error',data:{errorMessage:error instanceof Error ? error.message : String(error),errorName:error instanceof Error ? error.name : 'unknown'},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
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
// Firestore Direct Functions (for local updates without API call)
// =============================================================================

/**
 * Update evidence items locally in Firestore
 * Use this for quick updates that don't need server-side validation
 */
export async function updateEvidenceItemsLocal(
  disputeId: string,
  evidenceItems: EvidenceItem[]
): Promise<boolean> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    await updateDoc(disputeRef, {
      evidenceItems,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating evidence items locally:', error);
    return false;
  }
}

/**
 * Mark a single requirement as uploaded (local update)
 */
export async function markRequirementUploaded(
  disputeId: string,
  requirementId: string,
  fileId: string,
  fileName: string,
  uploadedBy?: string
): Promise<boolean> {
  try {
    // First get current evidence items
    const disputeRef = doc(db, 'disputes', disputeId);
    const disputeSnap = await getDoc(disputeRef);
    
    if (!disputeSnap.exists()) {
      console.error('Dispute not found');
      return false;
    }
    
    const data = disputeSnap.data();
    const evidenceItems: EvidenceItem[] = data.evidenceItems || [];
    
    // Find and update the item
    const updatedItems = evidenceItems.map(item => {
      if (item.requirementId === requirementId) {
        return {
          ...item,
          status: 'uploaded' as const,
          fileId,
          fileName,
          uploadedAt: new Date().toISOString(),
          uploadedBy,
        };
      }
      return item;
    });
    
    // Check if all required items are complete
    const plan: EvidencePlan | undefined = data.evidencePlan;
    let lifecycleStatus = data.lifecycleStatus;
    let internalStatus = data.internalStatus;
    
    if (plan) {
      const requiredIds = plan.requirements
        .filter(r => r.required)
        .map(r => r.id);
      
      const allRequiredComplete = requiredIds.every(id => {
        const item = updatedItems.find(i => i.requirementId === id);
        return item && (item.status === 'uploaded' || item.status === 'not_applicable');
      });
      
      if (allRequiredComplete) {
        lifecycleStatus = 'draft_ready';
        internalStatus = 'ready_to_submit';
      }
    }
    
    // Update Firestore
    await updateDoc(disputeRef, {
      evidenceItems: updatedItems,
      lifecycleStatus,
      internalStatus,
      updatedAt: serverTimestamp(),
    });
    
    return true;
  } catch (error) {
    console.error('Error marking requirement uploaded:', error);
    return false;
  }
}

/**
 * Mark a requirement as not available
 */
export async function markRequirementNotAvailable(
  disputeId: string,
  requirementId: string,
  notes?: string
): Promise<boolean> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    const disputeSnap = await getDoc(disputeRef);
    
    if (!disputeSnap.exists()) {
      return false;
    }
    
    const data = disputeSnap.data();
    const evidenceItems: EvidenceItem[] = data.evidenceItems || [];
    
    const updatedItems = evidenceItems.map(item => {
      if (item.requirementId === requirementId) {
        return {
          ...item,
          status: 'not_available' as const,
          notes,
        };
      }
      return item;
    });
    
    await updateDoc(disputeRef, {
      evidenceItems: updatedItems,
      updatedAt: serverTimestamp(),
    });
    
    return true;
  } catch (error) {
    console.error('Error marking requirement not available:', error);
    return false;
  }
}

/**
 * Add audit trail entry for evidence-related actions
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
  }
): Promise<boolean> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    const entry: any = {
      timestamp: new Date().toISOString(),
      title: action,
      description,
      status,
    };

    // Add actor information
    if (userId && userName) {
      entry.actor = { type: 'user', userId, userName };
    } else {
      entry.actor = { type: 'system' };
    }

    // Add category if provided
    if (category) {
      entry.category = category;
    }

    // Add metadata if provided
    if (metadata) {
      entry.metadata = metadata;
    }

    // Add related resources if provided
    if (relatedResources) {
      entry.relatedResources = relatedResources;
    }

    await updateDoc(disputeRef, {
      auditTrail: arrayUnion(entry),
      updatedAt: serverTimestamp(),
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
    pms_data: 'Property Management Data',
    policy: 'Policies & Terms',
    proof_of_stay: 'Proof of Stay',
    communications: 'Guest Communications',
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
    pms_data: '🏨',
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

