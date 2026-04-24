/**
 * Adyen Dispute Sync Service
 * Syncs disputes from Adyen API to Firestore
 */

import * as admin from "firebase-admin";
import { AdyenClient } from "./adyenClient";
import { normalizeAdyenDispute } from "../../utils/disputeNormalizer";
import { upsertUnifiedDispute } from "../disputeService";
import { getOrganization } from "../organizationService";

function getDb() {
  return admin.firestore();
}

export interface AdyenSyncResult {
  success: boolean;
  disputesSynced: number;
  disputesCreated: number;
  disputesUpdated: number;
  errors: string[];
}

/**
 * Sync disputes for an organization from Adyen API
 */
export async function syncDisputesForOrganization(
  organizationId: string
): Promise<AdyenSyncResult> {
  const db = getDb();
  const errors: string[] = [];
  let disputesSynced = 0;
  let disputesCreated = 0;
  let disputesUpdated = 0;

  try {
    // Get organization with decrypted credentials
    const organization = await getOrganization(organizationId);
    
    if (!organization) {
      return {
        success: false,
        disputesSynced: 0,
        disputesCreated: 0,
        disputesUpdated: 0,
        errors: [`Organization ${organizationId} not found`],
      };
    }

    const adyenIntegration = organization.pspIntegrations?.adyen;

    if (!adyenIntegration || adyenIntegration.status !== "connected") {
      return {
        success: false,
        disputesSynced: 0,
        disputesCreated: 0,
        disputesUpdated: 0,
        errors: [`Adyen integration not connected for organization ${organizationId}`],
      };
    }

    // Get first merchant account from array or use legacy field
    const merchantAccount = (adyenIntegration.merchantAccounts && adyenIntegration.merchantAccounts.length > 0)
      ? adyenIntegration.merchantAccounts[0]
      : (adyenIntegration.merchantAccount || "");
    
    // Create Adyen client
    const client = new AdyenClient({
      apiKey: adyenIntegration.apiKey || "",
      merchantAccount: merchantAccount,
      liveEndpointPrefix: adyenIntegration.liveEndpointPrefix,
    });

    // Fetch disputes from Adyen
    const adyenDisputes = await client.getDisputes(100);

    // Process each dispute
    for (const adyenDispute of adyenDisputes) {
      try {
        // Convert Adyen dispute to notification format for normalization
        // This allows us to reuse the existing normalizeAdyenDispute function
        const notificationFormat = {
          notificationItems: [{
            NotificationRequestItem: {
              pspReference: adyenDispute.pspReference,
              originalReference: adyenDispute.originalReference,
              merchantAccountCode: adyenDispute.merchantAccount,
              amount: adyenDispute.amount,
              eventCode: adyenDispute.status === "OPEN" ? "CHARGEBACK" : 
                        adyenDispute.status === "WON" ? "CHARGEBACK_REVERSED" :
                        adyenDispute.status === "LOST" ? "DEFENSE_DEBIT" : "CHARGEBACK",
              eventDate: adyenDispute.eventDate || new Date().toISOString(),
              reason: adyenDispute.reason,
              success: true,
              additionalData: {
                cardSummary: "", // May need to fetch from payment if available
                chargebackReason: adyenDispute.reason || "",
              },
            },
          }],
        };

        // Normalize to unified format
        const normalized = normalizeAdyenDispute(notificationFormat, organizationId);

        // Check if dispute already exists
        const existingQuery = await db
          .collection("disputes")
          .where("organizationId", "==", organizationId)
          .where("pspProvider", "==", "adyen")
          .where("pspDisputeId", "==", normalized.pspDisputeId)
          .limit(1)
          .get();

        if (existingQuery.empty) {
          disputesCreated++;
        } else {
          disputesUpdated++;
        }

        // Upsert dispute
        await upsertUnifiedDispute(normalized);
        disputesSynced++;
      } catch (error: any) {
        const errorMsg = `Failed to sync dispute ${adyenDispute.disputeId}: ${error.message}`;
        errors.push(errorMsg);
        console.error(errorMsg, error);
      }
    }

    return {
      success: errors.length === 0,
      disputesSynced,
      disputesCreated,
      disputesUpdated,
      errors,
    };
  } catch (error: any) {
    const errorMsg = `Sync failed: ${error.message}`;
    errors.push(errorMsg);
    console.error(errorMsg, error);
    return {
      success: false,
      disputesSynced,
      disputesCreated,
      disputesUpdated,
      errors,
    };
  }
}

