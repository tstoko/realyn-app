/**
 * Script to update Stripe webhook secret for an organization
 * Usage: ts-node functions/src/scripts/updateWebhookSecret.ts <organizationId> <webhookSecret>
 */

import * as admin from "firebase-admin";
import { updateOrganization } from "../services/organizationService";

// Get Firestore instance with proper project initialization
function getDb(): admin.firestore.Firestore {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: projectId,
    });
  }
  return admin.firestore();
}

// Initialize Firebase
getDb();

async function updateWebhookSecret(organizationId: string, webhookSecret: string) {
  try {
    // Update only the webhook secret, preserving other fields
    await updateOrganization(organizationId, {
      pspIntegrations: {
        stripe: {
          webhookSecret: webhookSecret,
        },
      },
    } as any);

    console.log(`✓ Successfully updated webhook secret for organization: ${organizationId}`);
  } catch (error: any) {
    console.error(`✗ Error updating webhook secret:`, error.message);
    throw error;
  }
}

// Get arguments from command line
const orgId = process.argv[2];
const secret = process.argv[3];

if (!orgId || !secret) {
  console.error("Usage: ts-node updateWebhookSecret.ts <organizationId> <webhookSecret>");
  console.error("Example: ts-node updateWebhookSecret.ts test_stripe_org whsec_...");
  process.exit(1);
}

updateWebhookSecret(orgId, secret)
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });

