/**
 * PSP Adapter Factory
 *
 * Creates the appropriate PSP adapter based on the provider type and
 * organization credentials. This is the single point of entry for all
 * PSP operations — the caller never instantiates adapters directly.
 *
 * Adding a new PSP:
 * 1. Create an adapter in adapters/ implementing PSPAdapter
 * 2. Add a case to createPSPAdapter()
 * 3. Add credential types to types/organization.ts
 */

import type {PSPAdapter} from "./types";
import type {PSPProvider} from "../../types/dispute";
import type {PSPIntegrations} from "../../types/organization";
import {StripeAdapter} from "./adapters/stripeAdapter";
import {AdyenAdapter} from "./adapters/adyenAdapter";

/**
 * Create a PSP adapter for the given provider using the organization's credentials.
 *
 * @throws Error if the provider is unsupported or credentials are missing
 */
export function createPSPAdapter(
    provider: PSPProvider,
    integrations: PSPIntegrations,
): PSPAdapter {
  switch (provider) {
    case "stripe": {
      const stripe = integrations.stripe;
      if (!stripe) {
        throw new Error("Stripe integration not configured");
      }
      return new StripeAdapter(stripe);
    }
    case "adyen": {
      const adyen = integrations.adyen;
      if (!adyen) {
        throw new Error("Adyen integration not configured");
      }
      if (!adyen.apiKey) {
        throw new Error("Adyen API key not found");
      }
      const merchantAccount = (adyen.merchantAccounts && adyen.merchantAccounts.length > 0)
        ? adyen.merchantAccounts[0]
        : (adyen.merchantAccount || "");
      return new AdyenAdapter({
        apiKey: adyen.apiKey,
        merchantAccount,
        liveEndpointPrefix: adyen.liveEndpointPrefix,
      });
    }
    default:
      throw new Error(`Unsupported PSP provider: ${provider}`);
  }
}
