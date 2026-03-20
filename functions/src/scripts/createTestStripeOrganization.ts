/**
 * Script to create a test organization with Stripe integration credentials
 * Usage: ts-node functions/src/scripts/createTestStripeOrganization.ts
 * 
 * This script creates an organization with Stripe credentials for testing.
 * The credentials should be provided via environment variables or command line args.
 */

import * as admin from "firebase-admin";
import type { Organization } from "../types/organization";
import { encryptCredentials } from "../utils/encryption";

// Get Firestore instance
function getDb(): admin.firestore.Firestore {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: projectId,
    });
  }
  return admin.firestore();
}

interface CreateTestOrgOptions {
  organizationId?: string;
  name?: string;
  secretKey?: string;
  webhookSecret?: string;
  merchantAccountId?: string;
  status?: "connected" | "not_connected";
}

/**
 * Create a test organization with Stripe integration
 */
export async function createTestStripeOrganization(
  options: CreateTestOrgOptions = {}
): Promise<string> {
  const db = getDb();
  
  const orgId = options.organizationId || `test_stripe_org_${Date.now()}`;
  const orgName = options.name || "Test Stripe Hotel";
  const secretKey = options.secretKey || process.env.STRIPE_SECRET_KEY || "";
  const webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || "";
  const merchantAccountId = options.merchantAccountId || "";
  const status = options.status || (secretKey && webhookSecret ? "connected" : "not_connected");

  // Check if organization already exists
  const existingDoc = await db.collection("organizations").doc(orgId).get();
  if (existingDoc.exists) {
    console.log(`Organization ${orgId} already exists. Updating...`);
  }

  const testOrg: Omit<Organization, "id" | "createdAt" | "updatedAt"> = {
    name: orgName,
    location: "San Francisco, CA",
    teams: [
      { name: "Finance", email: "finance@teststripe.com" },
    ],
    documents: [],
    pspIntegrations: {
      stripe: {
        secretKey: secretKey,
        webhookSecret: webhookSecret,
        merchantAccountId: merchantAccountId || undefined,
        status: status,
      },
    },
    automationSettings: {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    users: [],
  };

  // Encrypt credentials
  const encryptedOrg = { ...testOrg };
  if (encryptedOrg.pspIntegrations?.stripe) {
    encryptedOrg.pspIntegrations.stripe = encryptCredentials(
      encryptedOrg.pspIntegrations.stripe,
      ["secretKey", "webhookSecret"]
    ) as any;
  }

  const now = admin.firestore.Timestamp.now();
  await db.collection("organizations").doc(orgId).set({
    ...encryptedOrg,
    createdAt: existingDoc.exists ? existingDoc.data()?.createdAt : now,
    updatedAt: now,
  }, { merge: true });

  console.log(`✓ ${existingDoc.exists ? "Updated" : "Created"} test Stripe organization:`);
  console.log(`  ID: ${orgId}`);
  console.log(`  Name: ${orgName}`);
  console.log(`  Status: ${status}`);
  console.log(`  Secret Key: ${secretKey ? "***" + secretKey.slice(-4) : "Not set"}`);
  console.log(`  Webhook Secret: ${webhookSecret ? "***" + webhookSecret.slice(-4) : "Not set"}`);
  if (merchantAccountId) {
    console.log(`  Merchant Account ID: ${merchantAccountId}`);
  }

  return orgId;
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: CreateTestOrgOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace("--", "");
    const value = args[i + 1];
    
    if (key && value) {
      switch (key) {
        case "id":
          options.organizationId = value;
          break;
        case "name":
          options.name = value;
          break;
        case "secretKey":
          options.secretKey = value;
          break;
        case "webhookSecret":
          options.webhookSecret = value;
          break;
        case "merchantAccountId":
          options.merchantAccountId = value;
          break;
        case "status":
          options.status = value as "connected" | "not_connected";
          break;
      }
    }
  }

  createTestStripeOrganization(options)
    .then((orgId) => {
      console.log(`\n✓ Successfully created/updated organization: ${orgId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error creating test organization:", error);
      process.exit(1);
    });
}



