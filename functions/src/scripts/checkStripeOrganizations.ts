/**
 * Script to check which organizations have Stripe integration
 */

import * as admin from "firebase-admin";
import { getAllOrganizations } from "../services/organizationService";

function getDb(): admin.firestore.Firestore {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: projectId,
    });
  }
  return admin.firestore();
}

async function checkOrganizations() {
  getDb();
  
  console.log("Checking organizations with Stripe integration...\n");
  
  // Get all organizations
  const orgs = await getAllOrganizations();
  
  const stripeOrgs = orgs.filter(org => org.pspIntegrations?.stripe);
  
  if (stripeOrgs.length === 0) {
    console.log("❌ No organizations with Stripe integration found");
    return;
  }
  
  console.log(`Found ${stripeOrgs.length} organization(s) with Stripe integration:\n`);
  
  for (const org of stripeOrgs) {
    const stripe = org.pspIntegrations?.stripe;
    console.log(`Organization: ${org.name} (ID: ${org.id})`);
    console.log(`  Status: ${stripe?.status || "not_connected"}`);
    console.log(`  Has secretKey: ${stripe?.secretKey ? "✅ Yes" : "❌ No"}`);
    console.log(`  Has accessToken: ${stripe?.accessToken ? "✅ Yes" : "❌ No"}`);
    console.log(`  Has webhookSecret: ${stripe?.webhookSecret ? "✅ Yes" : "❌ No"}`);
    console.log(`  Has stripeUserId: ${stripe?.stripeUserId ? "✅ Yes" : "❌ No"}`);
    console.log(`  Has webhookEndpointId: ${stripe?.webhookEndpointId ? "✅ Yes" : "❌ No"}`);
    console.log("");
  }
}

if (require.main === module) {
  checkOrganizations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}



