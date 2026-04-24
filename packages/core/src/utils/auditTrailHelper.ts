import * as admin from "firebase-admin";

export type AuditTrailCategory = 
  | 'dispute_received' 
  | 'pms_matching' 
  | 'evidence_planning' 
  | 'evidence_upload' 
  | 'argument_generation' 
  | 'submission' 
  | 'status_change' 
  | 'user_action'
  | 'integration_config'
  | 'pms_import'
  | 'error';

export type AuditTrailActor =
  | { type: 'user'; userId: string; userName: string }
  | { type: 'system' }
  | { type: 'automation' };

export interface AuditTrailMetadata {
  fileNames?: string[];
  requirementIds?: string[];
  fileCount?: number;
  duration?: number; // milliseconds
  errorCode?: string;
  errorMessage?: string;
  pmsMatchConfidence?: 'high' | 'medium' | 'low';
  argumentVersion?: number;
  evidencePlanVersion?: number;
  lifecycleStatusFrom?: string;
  lifecycleStatusTo?: string;
  retryAttempt?: number;
  [key: string]: any; // Allow additional metadata
}

export interface AuditTrailRelatedResources {
  evidenceFileIds?: string[];
  evidencePlanId?: string;
  argumentVersionId?: string;
}

/**
 * Add a standardized audit trail entry to a dispute
 * @param disputeId - The Firestore document ID of the dispute
 * @param title - Short descriptive title for the audit entry
 * @param description - Detailed description of what happened
 * @param status - Status of the action (pending, success, failure, in_progress)
 * @param actor - Optional actor information (user/system/automation)
 * @param category - Optional category for filtering
 * @param metadata - Optional structured metadata
 * @param relatedResources - Optional links to related resources
 */
export async function addAuditTrailEntry(
  disputeId: string,
  title: string,
  description: string,
  status: 'pending' | 'success' | 'failure' | 'in_progress' = 'success',
  actor?: AuditTrailActor,
  category?: AuditTrailCategory,
  metadata?: AuditTrailMetadata,
  relatedResources?: AuditTrailRelatedResources
): Promise<void> {
  const db = admin.firestore();
  try {
    const entry: any = {
      timestamp: admin.firestore.Timestamp.now(),
      title,
      description,
      status,
    };

    if (actor) {
      entry.actor = actor;
    }
    if (category) {
      entry.category = category;
    }
    if (metadata) {
      entry.metadata = metadata;
    }
    if (relatedResources) {
      entry.relatedResources = relatedResources;
    }

    await db.collection("disputes").doc(disputeId).update({
      auditTrail: admin.firestore.FieldValue.arrayUnion(entry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error(`Error adding audit trail entry to dispute ${disputeId}:`, error);
    throw error;
  }
}

/**
 * Create an audit entry for user-initiated actions
 */
export async function createUserAuditEntry(
  disputeId: string,
  title: string,
  description: string,
  userId: string,
  userName: string,
  category?: AuditTrailCategory,
  metadata?: AuditTrailMetadata,
  relatedResources?: AuditTrailRelatedResources
): Promise<void> {
  return addAuditTrailEntry(
    disputeId,
    title,
    description,
    'success',
    { type: 'user', userId, userName },
    category,
    metadata,
    relatedResources
  );
}

/**
 * Create an audit entry for automated/system actions
 */
export async function createSystemAuditEntry(
  disputeId: string,
  title: string,
  description: string,
  category?: AuditTrailCategory,
  metadata?: AuditTrailMetadata,
  relatedResources?: AuditTrailRelatedResources
): Promise<void> {
  return addAuditTrailEntry(
    disputeId,
    title,
    description,
    'success',
    { type: 'system' },
    category,
    metadata,
    relatedResources
  );
}

/**
 * Create an audit entry for errors/failures
 */
export async function createErrorAuditEntry(
  disputeId: string,
  title: string,
  description: string,
  errorCode?: string,
  errorMessage?: string,
  retryAttempt?: number,
  category: AuditTrailCategory = 'error',
  metadata?: AuditTrailMetadata
): Promise<void> {
  const errorMetadata: AuditTrailMetadata = {
    ...metadata,
    errorCode,
    errorMessage,
    retryAttempt,
  };

  return addAuditTrailEntry(
    disputeId,
    title,
    description,
    'failure',
    { type: 'system' },
    category,
    errorMetadata
  );
}

