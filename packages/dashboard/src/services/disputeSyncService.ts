import { auth } from '@realyn/shared';
import { getFunctionsBaseUrl } from '../config/environment';

interface SyncResult {
  success: boolean;
  message?: string;
  disputesSynced: number;
  disputesCreated: number;
  disputesUpdated: number;
  error?: string;
}

class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number, message: string) {
    super(message);
    this.retryAfter = retryAfter;
    this.name = 'RateLimitError';
  }
}

export async function syncDisputes(organizationId: string): Promise<SyncResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const idToken = await currentUser.getIdToken();

  const baseUrl = getFunctionsBaseUrl();
  const response = await fetch(`${baseUrl}/disputeManualSync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ organizationId }),
  });

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw new RateLimitError(
      data.retryAfter || 3600,
      data.message || 'Rate limit exceeded'
    );
  }

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      disputesSynced: 0,
      disputesCreated: 0,
      disputesUpdated: 0,
      error: data.message || data.error || `HTTP error ${response.status}`,
    };
  }

  return {
    success: data.success ?? true,
    message: data.message,
    disputesSynced: data.disputesSynced ?? 0,
    disputesCreated: data.disputesCreated ?? 0,
    disputesUpdated: data.disputesUpdated ?? 0,
    error: data.errors?.length > 0 ? data.errors.join('; ') : undefined,
  };
}
