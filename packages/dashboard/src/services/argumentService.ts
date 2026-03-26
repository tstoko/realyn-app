import { doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@realyn/shared';
import type { DisputeArgument, ArgumentVersion } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';

/**
 * Get authenticated headers for Cloud Function calls.
 * Includes the Firebase Auth ID token as a Bearer token.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }
  const idToken = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };
}

// ============================================================
// Argument Service
// Frontend service for AI argument generation
// ============================================================

interface GenerateArgumentResponse {
  success: boolean;
  argument?: DisputeArgument;
  cached?: boolean;
  error?: string;
}

interface SaveArgumentResponse {
  success: boolean;
  error?: string;
}

/**
 * Generate a dispute argument using AI
 */
export async function generateArgument(
  disputeId: string,
  organizationId: string,
  regenerate: boolean = false
): Promise<GenerateArgumentResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${FUNCTIONS_BASE_URL}/draftArgument?disputeId=${encodeURIComponent(disputeId)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          organizationId,
          regenerate,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || `HTTP error ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      argument: data.argument,
      cached: data.cached,
    };
  } catch (error) {
    console.error('Error generating argument:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save an edited argument draft to Firestore
 * Creates a new version entry when argument is manually edited
 */
export async function saveArgumentDraft(
  disputeId: string,
  argument: DisputeArgument
): Promise<SaveArgumentResponse> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    
    // Get current dispute to access existing versions
    const disputeDoc = await getDoc(disputeRef);
    if (!disputeDoc.exists()) {
      return {
        success: false,
        error: 'Dispute not found',
      };
    }

    const dispute = disputeDoc.data();
    
    // Get existing argument versions or initialize
    const existingVersions: ArgumentVersion[] = 
      (dispute?.argumentVersions as ArgumentVersion[]) || [];
    
    // Determine next version number
    const nextVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map(v => v.version || 0)) + 1
      : 1;

    // Mark all previous versions as not current
    const updatedVersions = existingVersions.map(v => ({
      ...v,
      isCurrent: false,
    }));

    // Create new version entry for the edited argument
    const newVersion: ArgumentVersion = {
      argument,
      generatedAt: new Date(),
      version: nextVersion,
      isCurrent: true,
      isSubmitted: false,
    };

    // Add to versions array
    updatedVersions.push(newVersion);

    // Update both current draft and versions array
    await updateDoc(disputeRef, {
      argumentDraft: argument, // Keep current draft for backward compatibility
      argumentVersions: updatedVersions, // Store all versions
      updatedAt: Timestamp.now(),
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error saving argument draft:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear the argument draft (e.g., user wants to start over)
 */
export async function clearArgumentDraft(
  disputeId: string
): Promise<SaveArgumentResponse> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    await updateDoc(disputeRef, {
      argumentDraft: null,
      argumentDraftGeneratedAt: null,
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error('Error clearing argument draft:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Mark argument as submitted
 */
export async function markArgumentSubmitted(
  disputeId: string
): Promise<SaveArgumentResponse> {
  try {
    const disputeRef = doc(db, 'disputes', disputeId);
    await updateDoc(disputeRef, {
      argumentSubmittedAt: Timestamp.now(),
      lifecycleStatus: 'submitted',
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error('Error marking argument as submitted:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================
// PSP Submission
// ============================================================

export interface SubmitToPspResponse {
  success: boolean;
  message?: string;
  disputeStatus?: string;
  evidenceFilesSubmitted?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Map backend error codes to user-friendly messages
 */
function mapErrorToUserMessage(error: string, errorCode?: string): string {
  // Handle Stripe-specific errors
  if (errorCode === 'dispute_already_submitted') {
    return 'This dispute has already been submitted.';
  }
  if (errorCode === 'dispute_not_found') {
    return 'Dispute not found. Please verify the dispute ID.';
  }
  if (errorCode === 'invalid_evidence') {
    return 'Invalid evidence format. Please check your evidence files.';
  }
  
  // Handle error type patterns
  if (error.includes('Rate limit')) {
    return 'Rate limit exceeded. Please try again in a few moments.';
  }
  if (error.includes('Connection error') || error.includes('ECONNREFUSED')) {
    return 'Connection error. Please check your internet connection and try again.';
  }
  if (error.includes('credentials') || error.includes('API key')) {
    return 'PSP credentials are invalid or missing. Please check your integration settings.';
  }
  
  // Default to the original error
  return error;
}

/**
 * Submit dispute argument and evidence to PSP (Stripe or Adyen)
 * 
 * This calls the Cloud Function which:
 * 1. Retrieves the dispute and argument draft from Firestore
 * 2. Retrieves all uploaded evidence files
 * 3. Submits everything to the PSP (Stripe or Adyen)
 * 4. Updates the dispute status in Firestore
 */
export async function submitArgumentToPsp(
  disputeId: string,
  organizationId: string,
  pspProvider: 'stripe' | 'adyen'
): Promise<SubmitToPspResponse> {
  try {
    // Choose endpoint based on PSP
    const endpoint = pspProvider === 'stripe' 
      ? 'submitStripeDisputeResponse'
      : 'submitAdyenDisputeResponse';
    
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${FUNCTIONS_BASE_URL}/${endpoint}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          disputeId,
          organizationId,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const userMessage = mapErrorToUserMessage(
        data.message || `HTTP error ${response.status}`,
        data.errorCode
      );
      return {
        success: false,
        error: userMessage,
        errorCode: data.errorCode,
      };
    }

    return {
      success: true,
      message: data.message,
      disputeStatus: data.disputeStatus,
      evidenceFilesSubmitted: data.evidenceFilesSubmitted,
    };
  } catch (error) {
    console.error('Error submitting to PSP:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: mapErrorToUserMessage(errorMessage),
    };
  }
}

