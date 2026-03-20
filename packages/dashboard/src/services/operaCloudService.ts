import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';
import type { OperaCloudIntegration } from '@realyn/shared';

export interface OperaCloudConnectionTestInput {
  gatewayUrl: string;
  authMode: 'ocim' | 'ssd';
  oauthClientId: string;
  oauthClientSecret: string;
  appKey: string;
  enterpriseId?: string;
  hotelCodes: string[];
  integrationUsername?: string;
  integrationPassword?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Test OPERA Cloud connection via the backend Cloud Function.
 * The backend encrypts secrets, obtains an OAuth token, and hits OHIP to verify.
 */
export async function testOperaCloudConnection(
  config: OperaCloudConnectionTestInput
): Promise<ConnectionTestResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, message: 'Not authenticated', error: 'AUTH_ERROR' };
  }

  try {
    if (!config.gatewayUrl || !config.oauthClientId || !config.oauthClientSecret || !config.appKey) {
      return {
        success: false,
        message: 'Please provide Gateway URL, OAuth Client ID, Client Secret, and App Key',
        error: 'MISSING_CREDENTIALS',
      };
    }

    if (!config.hotelCodes || config.hotelCodes.length === 0) {
      return {
        success: false,
        message: 'At least one hotel/resort code is required',
        error: 'MISSING_CREDENTIALS',
      };
    }

    const idToken = await currentUser.getIdToken();

    const response = await fetch(`${FUNCTIONS_BASE_URL}/testOperaCloudConnection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        gatewayUrl: config.gatewayUrl,
        authMode: config.authMode,
        oauthClientId: config.oauthClientId,
        oauthClientSecret: config.oauthClientSecret,
        appKey: config.appKey,
        enterpriseId: config.enterpriseId,
        hotelCodes: config.hotelCodes,
        integrationUsername: config.integrationUsername,
        integrationPassword: config.integrationPassword,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to test OPERA Cloud connection',
        error: data.error || 'CONNECTION_ERROR',
      };
    }

    return {
      success: data.success,
      message: data.message || 'OPERA Cloud connection successful',
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to test OPERA Cloud connection',
      error: 'NETWORK_ERROR',
    };
  }
}

/**
 * Persist OPERA Cloud configuration to the organization document.
 * Sensitive fields (oauthClientSecret, appKey, integrationPassword) are
 * stripped — they only transit through the test-connection Cloud Function
 * which encrypts them server-side.
 */
export async function saveOperaCloudConfig(
  orgId: string,
  config: OperaCloudIntegration
): Promise<void> {
  const safeConfig: OperaCloudIntegration = {
    gatewayUrl: config.gatewayUrl,
    authMode: config.authMode,
    oauthClientId: config.oauthClientId,
    enterpriseId: config.enterpriseId,
    hotelCodes: config.hotelCodes,
    integrationUsername: config.integrationUsername,
    status: config.status,
    lastTestedAt: config.lastTestedAt,
  };

  const orgRef = doc(db, 'organizations', orgId);
  await updateDoc(orgRef, {
    operaCloudIntegration: safeConfig,
    updatedAt: Timestamp.now(),
  });
}
