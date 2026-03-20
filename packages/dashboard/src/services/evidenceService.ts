/**
 * Evidence Upload Service
 * Handles uploading evidence files to Firebase Storage and storing metadata in Firestore
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";
import { storage, db } from '@realyn/shared';
import type { EvidenceItem, EvidencePlan, EvidenceCategory } from '@realyn/shared';

export interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storagePath: string;
  downloadURL: string;
  uploadedAt: Date;
  uploadedBy: string;
  category: 'pms' | 'policy' | 'proofOfStay' | 'comms' | 'incidentReports' | 'other';
  requirementId?: string; // Link to AI evidence requirement
}

export interface UploadProgress {
  fileName: string;
  progress: number; // 0-100
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

/**
 * Upload a single evidence file
 */
export async function uploadEvidenceFile(
  disputeId: string,
  organizationId: string,
  file: File,
  category: EvidenceFile['category'],
  userId: string,
  requirementId?: string
): Promise<EvidenceFile> {
  // Validate file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error(`File ${file.name} exceeds 10MB size limit`);
  }

  // Validate file type - check MIME type first, then fall back to file extension
  const allowedTypes = [
    'image/png', 
    'image/jpeg', 
    'image/jpg', 
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'applications/vnd.pdf',
    'text/pdf'
  ];
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf'];
  
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  const fileTypeLower = file.type ? file.type.toLowerCase() : '';
  const isValidType = fileTypeLower && allowedTypes.includes(fileTypeLower);
  const isValidExtension = fileExtension && allowedExtensions.includes(fileExtension);
  
  if (!isValidType && !isValidExtension) {
    throw new Error(`File type not allowed. File: ${file.name}, Type: ${file.type || 'unknown'}. Allowed types: PNG, JPG, PDF`);
  }

  // Create storage path: organizations/{orgId}/disputes/{disputeId}/evidence/{category}/{timestamp}_{filename}
  const timestamp = Date.now();
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `organizations/${organizationId}/disputes/${disputeId}/evidence/${category}/${timestamp}_${sanitizedFileName}`;
  const storageRef = ref(storage, storagePath);

  // Determine content type - use file.type if available, otherwise infer from extension
  let contentType = file.type;
  if (!contentType || contentType === 'application/octet-stream') {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') contentType = 'application/pdf';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    else contentType = 'application/octet-stream';
  }

  // Upload file with explicit content type metadata
  const metadata = { contentType };
  const snapshot = await uploadBytes(storageRef, file, metadata);
  
  // Get download URL
  const downloadURL = await getDownloadURL(snapshot.ref);

  // Create evidence file metadata
  const evidenceFile: EvidenceFile = {
    id: `evidence_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || 'application/octet-stream',
    storagePath,
    downloadURL,
    uploadedAt: new Date(),
    uploadedBy: userId,
    category,
    requirementId,
  };

  // Store metadata in Firestore
  const evidenceRef = doc(db, 'disputes', disputeId, 'evidence', evidenceFile.id);
  await setDoc(evidenceRef, {
    ...evidenceFile,
    uploadedAt: new Date(evidenceFile.uploadedAt),
  });

  // Also add to dispute's evidence array for quick access
  const disputeRef = doc(db, 'disputes', disputeId);
  await updateDoc(disputeRef, {
    evidenceFiles: arrayUnion(evidenceFile.id),
  });

  return evidenceFile;
}

/**
 * Upload multiple evidence files
 */
export async function uploadEvidenceFiles(
  disputeId: string,
  organizationId: string,
  files: File[],
  category: EvidenceFile['category'],
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<EvidenceFile[]> {
  const uploadedFiles: EvidenceFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      onProgress?.({
        fileName: file.name,
        progress: (i / files.length) * 100,
        status: 'uploading',
      });

      const evidenceFile = await uploadEvidenceFile(
        disputeId,
        organizationId,
        file,
        category,
        userId
      );

      uploadedFiles.push(evidenceFile);

      onProgress?.({
        fileName: file.name,
        progress: ((i + 1) / files.length) * 100,
        status: 'success',
      });
    } catch (error: any) {
      onProgress?.({
        fileName: file.name,
        progress: (i / files.length) * 100,
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  return uploadedFiles;
}

/**
 * Get all evidence files for a dispute
 */
export async function getEvidenceFiles(disputeId: string): Promise<EvidenceFile[]> {
  const evidenceRef = collection(db, 'disputes', disputeId, 'evidence');
  const evidenceSnapshot = await getDocs(evidenceRef);
  
  return evidenceSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      uploadedAt: data.uploadedAt?.toDate() || new Date(),
    } as EvidenceFile;
  });
}

/**
 * Delete an evidence file
 */
export async function deleteEvidenceFile(
  disputeId: string,
  evidenceFile: EvidenceFile
): Promise<void> {
  // Delete from Storage
  const storageRef = ref(storage, evidenceFile.storagePath);
  await deleteObject(storageRef);

  // Delete metadata from Firestore
  const evidenceRef = doc(db, 'disputes', disputeId, 'evidence', evidenceFile.id);
  await deleteDoc(evidenceRef);

  // Remove from dispute's evidence array
  const disputeRef = doc(db, 'disputes', disputeId);
  await updateDoc(disputeRef, {
    evidenceFiles: arrayRemove(evidenceFile.id),
  });
}

// =============================================================================
// AI Evidence Plan Integration
// =============================================================================

/**
 * Map legacy category names to new evidence categories
 */
function mapCategoryToEvidenceCategory(category: string): EvidenceCategory {
  const mapping: Record<string, EvidenceCategory> = {
    'pms': 'pms_data',
    'pms_data': 'pms_data',
    'policy': 'policy',
    'proofOfStay': 'proof_of_stay',
    'proof_of_stay': 'proof_of_stay',
    'comms': 'communications',
    'communications': 'communications',
    'incidentReports': 'incident_reports',
    'incident_reports': 'incident_reports',
    'payment_data': 'payment_data',
    'delivery': 'delivery',
    'other': 'other',
  };
  return mapping[category] || 'other';
}

/**
 * Upload evidence file and link to AI requirement if applicable
 * 
 * @param disputeId - The dispute ID
 * @param organizationId - The organization ID
 * @param file - The file to upload
 * @param category - The evidence category
 * @param userId - The user uploading
 * @param requirementId - Optional requirement ID to link to
 */
export async function uploadEvidenceFileWithTracking(
  disputeId: string,
  organizationId: string,
  file: File,
  category: string,
  userId: string,
  requirementId?: string
): Promise<EvidenceFile> {
  // Map category to standard format
  const mappedCategory = mapCategoryToEvidenceCategory(category);
  const legacyCategory = mappedCategory === 'pms_data' ? 'pms' :
    mappedCategory === 'proof_of_stay' ? 'proofOfStay' :
    mappedCategory === 'communications' ? 'comms' :
    mappedCategory === 'incident_reports' ? 'incidentReports' :
    mappedCategory as EvidenceFile['category'];
  
  // Upload the file using existing function
  const evidenceFile = await uploadEvidenceFile(
    disputeId,
    organizationId,
    file,
    legacyCategory,
    userId,
    requirementId
  );
  
  // If a requirement ID is provided, update the evidence items
  if (requirementId) {
    await updateEvidenceItemWithFile(disputeId, requirementId, evidenceFile.id, file.name, userId);
  }
  
  return evidenceFile;
}

/**
 * Update evidence item to mark it as uploaded with file reference
 */
export async function updateEvidenceItemWithFile(
  disputeId: string,
  requirementId: string,
  fileId: string,
  fileName: string,
  uploadedBy?: string
): Promise<boolean> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    const disputeSnap = await getDoc(disputeRef);
    
    if (!disputeSnap.exists()) {
      console.error('Dispute not found');
      return false;
    }
    
    const data = disputeSnap.data();
    const evidenceItems: EvidenceItem[] = data.evidenceItems || [];
    const plan: EvidencePlan | undefined = data.evidencePlan;
    
    // Update the evidence item
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
    let lifecycleStatus = data.lifecycleStatus;
    let internalStatus = data.internalStatus;
    const previousLifecycleStatus = data.lifecycleStatus;
    
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
      } else if (updatedItems.some(i => i.status === 'uploaded')) {
        lifecycleStatus = 'evidence_in_progress';
        internalStatus = 'awaiting_docs';
      }
    }
    
    // Prepare audit trail entry if status changed
    const auditTrailUpdates: any = {};
    if (lifecycleStatus !== previousLifecycleStatus) {
      const auditEntry = {
        timestamp: new Date(),
        title: lifecycleStatus === 'draft_ready' 
          ? 'All Evidence Collected'
          : 'Evidence Collection Started',
        description: lifecycleStatus === 'draft_ready'
          ? 'All required evidence items have been uploaded. Ready to generate draft response.'
          : `Evidence collection in progress. ${updatedItems.filter(i => i.status === 'uploaded').length} item(s) uploaded.`,
        status: lifecycleStatus === 'draft_ready' ? 'success' : 'in_progress' as const,
      };
      // Get current audit trail and add new entry
      const currentAuditTrail = data.auditTrail || [];
      auditTrailUpdates.auditTrail = [...currentAuditTrail, auditEntry];
    }
    
    // Update Firestore
    await updateDoc(disputeRef, {
      evidenceItems: updatedItems,
      lifecycleStatus,
      internalStatus,
      updatedAt: new Date(),
      ...auditTrailUpdates,
    });
    
    return true;
  } catch (error) {
    console.error('Error updating evidence item with file:', error);
    return false;
  }
}

/**
 * Get evidence completion progress
 */
export async function getEvidenceCompletionProgress(disputeId: string): Promise<{
  completed: number;
  total: number;
  requiredCompleted: number;
  requiredTotal: number;
  isComplete: boolean;
} | null> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    const disputeSnap = await getDoc(disputeRef);
    
    if (!disputeSnap.exists()) {
      return null;
    }
    
    const data = disputeSnap.data();
    const plan: EvidencePlan | undefined = data.evidencePlan;
    const items: EvidenceItem[] = data.evidenceItems || [];
    
    if (!plan) {
      return null;
    }
    
    const requiredReqs = plan.requirements.filter(r => r.required);
    const requiredIds = requiredReqs.map(r => r.id);
    
    const completed = items.filter(
      i => i.status === 'uploaded' || i.status === 'not_applicable'
    ).length;
    
    const requiredCompleted = items.filter(
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
  } catch (error) {
    console.error('Error getting evidence progress:', error);
    return null;
  }
}

