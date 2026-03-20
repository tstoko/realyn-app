import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, where, onSnapshot, doc, updateDoc, Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { db } from '@realyn/shared';
import type { Dispute, AutomationStep, Note } from '@realyn/shared';

/**
 * Convert Firestore data to Dispute type with defaults for missing fields
 */
function mapFirestoreToDispute(docId: string, data: any): Dispute {
  // Helper to convert Firestore Timestamp to Date
  const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value instanceof FirestoreTimestamp) return value.toDate();
    if (value.toDate && typeof value.toDate === 'function') return value.toDate();
    return null;
  };

  // Read status with backward compatibility for old field name
  const status = data.status || data.stripeStatus || 'under_review';
  
  // PSP Provider - default to 'stripe' for backward compatibility
  const pspProvider = data.pspProvider || 'stripe';
  const pspDisputeId = data.pspDisputeId || data.stripeDisputeId || docId;
  const pspPaymentId = data.pspPaymentId || data.stripePaymentIntentId || null;

  // Convert Timestamps to Dates
  const createdAt = toDate(data.createdAt) || new Date();
  const updatedAt = toDate(data.updatedAt) || new Date();
  const respondBy = toDate(data.respondBy);
  const pspTransactionDate = toDate(data.pspTransactionDate) || createdAt;

  // Map audit trail if it exists, otherwise create default
  // Handle both old format (action/details) and new format (title/description)
  let auditTrail: AutomationStep[] = [];
  if (Array.isArray(data.auditTrail)) {
    auditTrail = data.auditTrail.map((step: any) => {
      // Support old format with action/details
      const title = step.title || step.action || '';
      let description = step.description || '';
      
      // If using old format with details object, convert it to description string
      if (!description && step.details) {
        if (typeof step.details === 'object') {
          description = Object.entries(step.details)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        } else {
          description = String(step.details);
        }
      }
      
      // Handle old format timestamp (ISO string) vs new format (Firestore Timestamp)
      const timestamp = toDate(step.timestamp) || new Date();
      
      // Build the enhanced AutomationStep with backward compatibility
      const enhancedStep: AutomationStep = {
        timestamp,
        title,
        description: description || '',
        status: step.status || 'pending',
      };

      // Add new fields if they exist, otherwise set defaults for old entries
      if (step.actor) {
        enhancedStep.actor = step.actor;
      } else {
        // Default to system for old entries
        enhancedStep.actor = { type: 'system' };
      }

      if (step.category) {
        enhancedStep.category = step.category;
      } else {
        // Infer category from title for old entries
        const titleLower = title.toLowerCase();
        if (titleLower.includes('dispute received') || titleLower.includes('received')) {
          enhancedStep.category = 'dispute_received';
        } else if (titleLower.includes('evidence plan')) {
          enhancedStep.category = 'evidence_planning';
        } else if (titleLower.includes('evidence') && (titleLower.includes('upload') || titleLower.includes('collected'))) {
          enhancedStep.category = 'evidence_upload';
        } else if (titleLower.includes('argument')) {
          enhancedStep.category = 'argument_generation';
        } else if (titleLower.includes('submitted') || titleLower.includes('submit')) {
          enhancedStep.category = 'submission';
        } else if (titleLower.includes('status') || titleLower.includes('won') || titleLower.includes('lost')) {
          enhancedStep.category = 'status_change';
        } else if (titleLower.includes('failed') || titleLower.includes('error')) {
          enhancedStep.category = 'error';
        } else {
          enhancedStep.category = 'user_action';
        }
      }

      if (step.metadata) {
        enhancedStep.metadata = step.metadata;
      }

      if (step.relatedResources) {
        enhancedStep.relatedResources = step.relatedResources;
      }
      
      return enhancedStep;
    });
  } else {
    // Create a default audit trail entry
    auditTrail = [{
      timestamp: createdAt,
      title: 'Dispute Received',
      description: `Reason: ${data.reason || 'unknown'}. Amount: ${(data.amount / 100).toFixed(2)} ${data.currency?.toUpperCase() || 'USD'}`,
      status: 'success',
      actor: { type: 'system' },
      category: 'dispute_received',
      metadata: {
        pspProvider: data.pspProvider,
        amount: data.amount,
        currency: data.currency,
        reason: data.reason,
      },
    }];
  }

  // Map internal notes
  let internalNotes: Note[] = [];
  if (Array.isArray(data.internalNotes)) {
    internalNotes = data.internalNotes.map((note: any) => ({
      id: note.id || Math.random().toString(),
      author: note.author || 'System',
      timestamp: toDate(note.timestamp) || new Date(),
      text: note.text || '',
    }));
  }

  // AI Evidence Planning fields
  const evidencePlan = data.evidencePlan || undefined;
  const evidenceItems = Array.isArray(data.evidenceItems) ? data.evidenceItems : [];
  const evidencePlanGeneratedAt = toDate(data.evidencePlanGeneratedAt) || undefined;
  const evidencePlanVersions = Array.isArray(data.evidencePlanVersions) ? data.evidencePlanVersions : [];
  const useAIPlan = data.useAIPlan !== undefined ? data.useAIPlan : true;
  const evidencePlanStatus = data.evidencePlanStatus || undefined;
  const evidencePlanError = data.evidencePlanError || null;

  // Argument draft fields
  const argumentDraft = data.argumentDraft || undefined;
  const argumentDraftGeneratedAt = toDate(data.argumentDraftGeneratedAt) || undefined;
  const argumentVersions = Array.isArray(data.argumentVersions)
    ? data.argumentVersions.map((v: any) => ({
        ...v,
        generatedAt: toDate(v.generatedAt) || new Date(),
      }))
    : [];
  const argumentSubmittedAt = toDate(data.argumentSubmittedAt) || undefined;

  return {
    id: docId,
    organizationId: data.organizationId || 'default_org',
    
    // PSP Information
    pspProvider: pspProvider,
    pspDisputeId: pspDisputeId,
    pspPaymentId: pspPaymentId || '',
    pspTransactionDate: pspTransactionDate,
    pspLast4Digits: data.pspLast4Digits || null,
    
    // Unified Dispute Data
    amount: data.amount || 0,
    currency: data.currency || 'usd',
    status: status,
    reason: data.reason || null,
    respondBy: respondBy ?? undefined,
    createdAt: createdAt,
    updatedAt: updatedAt,
    customerExplanation: data.customerExplanation || data.reason ? `Dispute reason: ${data.reason}` : '',
    
    // AI-related fields
    automationStatus: data.automationStatus || 'manual_review',
    awaitingInfoFrom: data.awaitingInfoFrom,
    missingEvidence: data.missingEvidence,
    auditTrail: auditTrail,
    aiSummary: data.aiSummary || '',
    aiDraftResponse: data.aiDraftResponse || '',
    isDraftApproved: data.isDraftApproved || false,
    lifecycleStatus: data.lifecycleStatus || 'new',
    internalNotes: internalNotes,
    assignedTeam: data.assignedTeam,
    assigneeId: data.assigneeId || null,
    internalStatus: data.internalStatus || 'needs_review',
    
    // AI Evidence Planning
    evidencePlan,
    evidenceItems,
    evidencePlanGeneratedAt,
    evidencePlanVersions,
    useAIPlan,
    evidencePlanStatus,
    evidencePlanError,
    
    // Argument fields
    argumentDraft,
    argumentDraftGeneratedAt,
    argumentVersions,
    argumentSubmittedAt,
  };
}

export const useDisputes = (organizationId?: string | null) => {
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        // For regular users, filter by organizationId at query level to avoid permissions issues
        // For admins (organizationId is null/undefined), query all disputes
        let q;
        if (organizationId) {
            // Use where clause to filter by organizationId - this is more efficient and avoids permissions issues
            q = query(
                collection(db, 'disputes'), 
                where('organizationId', '==', organizationId),
                orderBy('createdAt', 'desc')
            );
        } else {
            // Admin query - get all disputes
            q = query(collection(db, 'disputes'), orderBy('createdAt', 'desc'));
        }
        
        // Use onSnapshot for real-time updates (enables async evidence plan generation)
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const fetchedDisputes = snapshot.docs.map(doc => 
                    mapFirestoreToDispute(doc.id, doc.data())
                );
                setDisputes(fetchedDisputes);
                setLoading(false);
            },
            (err: any) => {
                console.error('Error fetching disputes:', err);
                console.error('Error code:', err.code);
                console.error('OrganizationId used:', organizationId);
                setError(err.message);
                setDisputes([]);
                setLoading(false);
            }
        );

        // Cleanup: unsubscribe from real-time updates when component unmounts
        return () => unsubscribe();
    }, [organizationId]);

    const updateDispute = useCallback(async (disputeId: string, updates: Partial<Dispute>) => {
        try {
            // Convert Date objects to Firestore Timestamps
            const firestoreUpdates: any = { ...updates };
            
            if (firestoreUpdates.createdAt instanceof Date) {
                firestoreUpdates.createdAt = FirestoreTimestamp.fromDate(firestoreUpdates.createdAt);
            }
            if (firestoreUpdates.updatedAt instanceof Date) {
                firestoreUpdates.updatedAt = FirestoreTimestamp.fromDate(firestoreUpdates.updatedAt);
            } else {
                firestoreUpdates.updatedAt = FirestoreTimestamp.now();
            }
            if (firestoreUpdates.respondBy instanceof Date) {
                firestoreUpdates.respondBy = FirestoreTimestamp.fromDate(firestoreUpdates.respondBy);
            } else if (firestoreUpdates.respondBy === null) {
                firestoreUpdates.respondBy = null;
            }

            // Update in Firestore
            const disputeRef = doc(db, 'disputes', disputeId);
            await updateDoc(disputeRef, firestoreUpdates);

            // Update local state
        setDisputes(currentDisputes => {
            const index = currentDisputes.findIndex(d => d.id === disputeId);
            if (index === -1) return currentDisputes;

            const updatedDisputes = [...currentDisputes];
            const updatedDispute = { ...updatedDisputes[index], ...updates, updatedAt: new Date() };
            updatedDisputes[index] = updatedDispute;
            
            return updatedDisputes;
        });
        } catch (err: any) {
            console.error('Error updating dispute:', err);
            throw err;
        }
    }, []);
    
    const updateMultipleDisputes = useCallback(async (disputeIds: string[], updates: Partial<Dispute>) => {
        try {
            // Convert Date objects to Firestore Timestamps
            const firestoreUpdates: any = { ...updates };
            
            if (firestoreUpdates.updatedAt instanceof Date) {
                firestoreUpdates.updatedAt = FirestoreTimestamp.fromDate(firestoreUpdates.updatedAt);
            } else {
                firestoreUpdates.updatedAt = FirestoreTimestamp.now();
            }

            // Update all disputes in Firestore
            const updatePromises = disputeIds.map(disputeId => {
                const disputeRef = doc(db, 'disputes', disputeId);
                return updateDoc(disputeRef, firestoreUpdates);
            });

            await Promise.all(updatePromises);

            // Update local state
        setDisputes(currentDisputes => {
            const updatedDisputes = [...currentDisputes];
            let changed = false;
            disputeIds.forEach(disputeId => {
                const index = updatedDisputes.findIndex(d => d.id === disputeId);
                if (index !== -1) {
                    updatedDisputes[index] = { ...updatedDisputes[index], ...updates, updatedAt: new Date() };
                    changed = true;
                }
            });
            return changed ? updatedDisputes : currentDisputes;
        });
        } catch (err: any) {
            console.error('Error updating multiple disputes:', err);
            throw err;
        }
    }, []);

    return { disputes, loading, error, updateDispute, updateMultipleDisputes };
};
