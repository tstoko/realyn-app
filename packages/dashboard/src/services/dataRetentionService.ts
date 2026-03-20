/**
 * Data Retention Service (Frontend)
 * 
 * Provides functions for GDPR data subject rights:
 * - Data export (Article 20 - Portability)
 * - Data deletion (Article 17 - Right to Erasure)
 */

import { auth } from '@realyn/shared';
import { getFunctionsBaseUrl } from '../config/environment';

const FUNCTIONS_BASE_URL = getFunctionsBaseUrl();

/**
 * Get the current user's auth token
 */
async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.getIdToken();
}

/**
 * Make an authenticated request to a Firebase Function
 */
async function authenticatedFetch(
  endpoint: string, 
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  
  return response;
}

// ============================================================
// User Data Operations
// ============================================================

/**
 * Export the current user's data as a JSON file
 * Downloads the file to the user's device
 */
export async function exportUserData(): Promise<void> {
  const response = await authenticatedFetch('exportUser', {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(error.error || 'Failed to export user data');
  }

  // Get the JSON data
  const data = await response.json();
  
  // Create a download
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `user-data-export-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Delete the current user's account
 * This will:
 * - Delete user document from Firestore
 * - Delete user from Firebase Auth
 * 
 * @param confirmDeletion - Must be true to proceed
 */
export async function deleteUserAccount(confirmDeletion: boolean): Promise<void> {
  if (!confirmDeletion) {
    throw new Error('Deletion requires explicit confirmation');
  }

  const response = await authenticatedFetch('deleteUser', {
    method: 'POST',
    body: JSON.stringify({ confirmDeletion: true }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Deletion failed' }));
    throw new Error(error.error || 'Failed to delete user account');
  }

  // Sign out the user after successful deletion
  await auth.signOut();
}

// ============================================================
// Organization Data Operations
// ============================================================

/**
 * Export organization data as a JSON file
 * 
 * @param organizationId - The organization to export
 */
export async function exportOrganizationData(organizationId: string): Promise<void> {
  const response = await authenticatedFetch('exportOrganization', {
    method: 'POST',
    body: JSON.stringify({ organizationId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(error.error || 'Failed to export organization data');
  }

  // Get the JSON data
  const data = await response.json();
  
  // Create a download
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `organization-data-export-${organizationId}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Delete all organization data
 * This will delete:
 * - Organization document
 * - All disputes
 * - All evidence files
 * - All dispute history
 * 
 * @param organizationId - The organization to delete
 * @param confirmDeletion - Must be true to proceed
 */
export async function deleteOrganizationData(
  organizationId: string, 
  confirmDeletion: boolean
): Promise<void> {
  if (!confirmDeletion) {
    throw new Error('Deletion requires explicit confirmation');
  }

  const response = await authenticatedFetch('deleteOrganization', {
    method: 'POST',
    body: JSON.stringify({ organizationId, confirmDeletion: true }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Deletion failed' }));
    throw new Error(error.error || 'Failed to delete organization data');
  }
}

// ============================================================
// Dispute Data Operations
// ============================================================

/**
 * Delete a single dispute and its evidence
 * 
 * @param disputeId - The dispute to delete
 * @param organizationId - The organization the dispute belongs to
 */
export async function deleteDispute(
  disputeId: string,
  organizationId: string
): Promise<void> {
  const response = await authenticatedFetch('deleteDispute', {
    method: 'POST',
    body: JSON.stringify({ disputeId, organizationId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Deletion failed' }));
    throw new Error(error.error || 'Failed to delete dispute');
  }
}

/**
 * Anonymize a dispute (keep record, remove PII)
 * 
 * @param disputeId - The dispute to anonymize
 * @param organizationId - The organization the dispute belongs to
 */
export async function anonymizeDispute(
  disputeId: string,
  organizationId: string
): Promise<void> {
  const response = await authenticatedFetch('anonymizeDisputeHandler', {
    method: 'POST',
    body: JSON.stringify({ disputeId, organizationId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Anonymization failed' }));
    throw new Error(error.error || 'Failed to anonymize dispute');
  }
}
