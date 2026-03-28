/**
 * Evidence Upload Service
 * Handles uploading evidence files to Firebase Storage and storing metadata in Firestore
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { storage, db, auth } from '@realyn/shared';
import type { EvidenceItem, EvidencePlan, EvidenceCategory } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const idToken = await currentUser.getIdToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` };
}

async function callEvidenceFunction(body: Record<string, any>): Promise<any> {
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

  // Register metadata via Cloud Function
  await callEvidenceFunction({
    action: 'registerEvidenceFile',
    disputeId,
    organizationId,
    evidenceFile: {
      ...evidenceFile,
      uploadedAt: evidenceFile.uploadedAt.toISOString(),
    },
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
  evidenceFile: EvidenceFile,
  organizationId: string
): Promise<void> {
  // Delete from Storage
  const storageRef = ref(storage, evidenceFile.storagePath);
  await deleteObject(storageRef);

  // Remove metadata via Cloud Function
  await callEvidenceFunction({
    action: 'removeEvidenceFile',
    disputeId,
    organizationId,
    evidenceFileId: evidenceFile.id,
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
 * Update evidence item to mark it as uploaded with file reference via Cloud Function
 */
export async function updateEvidenceItemWithFile(
  disputeId: string,
  requirementId: string,
  fileId: string,
  fileName: string,
  uploadedBy?: string,
  organizationId?: string
): Promise<boolean> {
  try {
    await callEvidenceFunction({
      action: 'updateEvidenceItemWithFile',
      disputeId,
      organizationId: organizationId || '',
      requirementId,
      fileId,
      fileName,
      uploadedBy,
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

