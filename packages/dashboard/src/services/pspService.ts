/**
 * Frontend PSP Service
 * Handles connection testing for Stripe and Adyen
 */

import { FUNCTIONS_BASE_URL } from '../config/environment';

export interface StripeCredentials {
  secretKey: string;
  webhookSecret: string;
  merchantAccountId?: string;
}

export interface AdyenCredentials {
  apiKey: string;
  merchantAccount?: string; // Legacy - kept for backward compatibility
  merchantAccounts?: string[]; // New - array of merchant accounts
  webhookUsername: string;
  webhookPassword: string;
  liveEndpointPrefix?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Test Stripe connection
 */
export async function testStripeConnection(
  credentials: StripeCredentials
): Promise<ConnectionTestResult> {
  try {
    if (!credentials.secretKey || !credentials.webhookSecret) {
      return {
        success: false,
        message: "Please provide both Secret Key and Webhook Secret",
        error: "MISSING_CREDENTIALS",
      };
    }

    // Basic validation - Stripe keys start with sk_ (regular) or rk_ (restricted) and webhook secrets start with whsec_
    if (!credentials.secretKey.startsWith("sk_") && !credentials.secretKey.startsWith("rk_")) {
      return {
        success: false,
        message: "Invalid Secret Key format (should start with sk_ or rk_)",
        error: "INVALID_FORMAT",
      };
    }

    if (!credentials.webhookSecret.startsWith("whsec_")) {
      return {
        success: false,
        message: "Invalid Webhook Secret format (should start with whsec_)",
        error: "INVALID_FORMAT",
      };
    }

    // Call Cloud Function to actually test the connection
    const response = await fetch(`${FUNCTIONS_BASE_URL}/testStripeConnection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secretKey: credentials.secretKey,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Failed to test Stripe connection",
        error: data.error || "CONNECTION_ERROR",
      };
    }

    return {
      success: data.success,
      message: data.message || "Stripe connection successful",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to test Stripe connection",
      error: "NETWORK_ERROR",
    };
  }
}

/**
 * Test Adyen connection
 */
export async function testAdyenConnection(
  credentials: AdyenCredentials
): Promise<ConnectionTestResult> {
  try {
    // Get merchant account from array or legacy field
    const merchantAccount = credentials.merchantAccounts && credentials.merchantAccounts.length > 0
      ? credentials.merchantAccounts[0]
      : credentials.merchantAccount;

    if (
      !credentials.apiKey ||
      !merchantAccount ||
      !credentials.webhookUsername ||
      !credentials.webhookPassword
    ) {
      return {
        success: false,
        message: "Please provide all Adyen credentials",
        error: "MISSING_CREDENTIALS",
      };
    }

    // Basic validation
    if (credentials.apiKey.length < 10) {
      return {
        success: false,
        message: "API Key appears to be invalid",
        error: "INVALID_FORMAT",
      };
    }

    // Call Cloud Function to actually test the connection
    const response = await fetch(`${FUNCTIONS_BASE_URL}/testAdyenConnection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: credentials.apiKey,
        merchantAccount: merchantAccount,
        liveEndpointPrefix: credentials.liveEndpointPrefix,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Failed to test Adyen connection",
        error: data.error || "CONNECTION_ERROR",
      };
    }

    return {
      success: data.success,
      message: data.message || "Adyen connection successful",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to test Adyen connection",
      error: "NETWORK_ERROR",
    };
  }
}

