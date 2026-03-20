import type { Hotel, PSPIntegrationsConfig } from '@realyn/shared';
import type { PspCredentials } from '../features/hotels/IntegrationsTab';

/**
 * Merges new PSP credentials into the existing PSPIntegrationsConfig,
 * preserving existing encrypted values when new values are empty.
 */
export function mergePspCredentials(
  hotelToSave: Hotel,
  existingIntegrations: PSPIntegrationsConfig,
  pspCredentials?: PspCredentials | null,
): PSPIntegrationsConfig {
  const result: PSPIntegrationsConfig = {};

  if (hotelToSave.integrations.psp.type === 'stripe') {
    const pspStatus = hotelToSave.integrations.psp.status || 'not_connected';

    if (pspCredentials?.stripe) {
      const existing = existingIntegrations.stripe || {};
      result.stripe = {
        secretKey: nonEmpty(pspCredentials.stripe.secretKey) ?? (existing.secretKey || ''),
        webhookSecret: nonEmpty(pspCredentials.stripe.webhookSecret) ?? (existing.webhookSecret || ''),
        merchantAccountId: pspCredentials.stripe.merchantAccountId || existing.merchantAccountId || '',
        status: pspStatus,
      };
    } else if (existingIntegrations.stripe) {
      result.stripe = { ...existingIntegrations.stripe, status: pspStatus };
    } else if (hotelToSave.stripeSecretKey || hotelToSave.stripeWebhookSecret) {
      result.stripe = {
        secretKey: hotelToSave.stripeSecretKey || '',
        webhookSecret: hotelToSave.stripeWebhookSecret || '',
        merchantAccountId: hotelToSave.stripeMerchantAccountId || '',
        status: pspStatus,
      };
    } else {
      result.stripe = { secretKey: '', webhookSecret: '', merchantAccountId: '', status: pspStatus };
    }
  } else if (hotelToSave.integrations.psp.type === 'adyen') {
    const pspStatus = hotelToSave.integrations.psp.status || 'not_connected';

    if (pspCredentials?.adyen) {
      const existing = existingIntegrations.adyen || {};
      result.adyen = {
        apiKey: nonEmpty(pspCredentials.adyen.apiKey) ?? (existing.apiKey || ''),
        merchantAccounts:
          Array.isArray(pspCredentials.adyen.merchantAccounts) && pspCredentials.adyen.merchantAccounts.length > 0
            ? pspCredentials.adyen.merchantAccounts
            : (existing.merchantAccounts && Array.isArray(existing.merchantAccounts) && existing.merchantAccounts.length > 0
                ? existing.merchantAccounts
                : []),
        webhookUsername: nonEmpty(pspCredentials.adyen.webhookUsername) ?? (existing.webhookUsername || ''),
        webhookPassword: nonEmpty(pspCredentials.adyen.webhookPassword) ?? (existing.webhookPassword || ''),
        liveEndpointPrefix: nonEmpty(pspCredentials.adyen.liveEndpointPrefix) ?? (existing.liveEndpointPrefix || undefined),
        status: pspStatus,
      };
    } else if (existingIntegrations.adyen) {
      const existingAdyen = existingIntegrations.adyen;
      result.adyen = {
        ...existingAdyen,
        merchantAccounts: existingAdyen.merchantAccounts ||
          (existingAdyen.merchantAccount ? [existingAdyen.merchantAccount] : []),
        status: pspStatus,
      };
    } else if (hotelToSave.adyenApiKey || hotelToSave.adyenMerchantAccount || (hotelToSave.adyenMerchantAccounts && hotelToSave.adyenMerchantAccounts.length > 0)) {
      const merchantAccounts = hotelToSave.adyenMerchantAccounts && hotelToSave.adyenMerchantAccounts.length > 0
        ? hotelToSave.adyenMerchantAccounts
        : (hotelToSave.adyenMerchantAccount ? [hotelToSave.adyenMerchantAccount] : []);
      result.adyen = {
        apiKey: hotelToSave.adyenApiKey || '',
        merchantAccounts,
        webhookUsername: hotelToSave.adyenWebhookUsername || '',
        webhookPassword: hotelToSave.adyenWebhookPassword || '',
        liveEndpointPrefix: hotelToSave.adyenLiveEndpointPrefix || undefined,
        status: pspStatus,
      };
    } else {
      result.adyen = { apiKey: '', merchantAccounts: [], webhookUsername: '', webhookPassword: '', status: pspStatus };
    }
  }

  return result;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value !== undefined && value !== null && value.trim() !== '') return value;
  return undefined;
}
