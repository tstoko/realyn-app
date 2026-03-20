/**
 * Migration script to convert single merchantAccount to merchantAccounts array
 * Run this once to migrate existing Adyen integrations to support multiple merchant accounts
 * 
 * Usage: ts-node functions/src/scripts/migrateAdyenMerchantAccounts.ts
 */

import * as admin from "firebase-admin";
import type {} from "../types/organization";

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

/**
 * Migrate all organizations with Adyen integration
 * Converts single merchantAccount to merchantAccounts array
 */
async function migrateAdyenMerchantAccounts(): Promise<void> {
  console.log("Starting Adyen merchant accounts migration...");
  const db = getDb();
  
  // Query all organizations
  const snapshot = await db.collection("organizations").get();
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const doc of snapshot.docs) {
    try {
      const data = doc.data();
      const adyenIntegration = data.pspIntegrations?.adyen;
      
      // Skip if no Adyen integration
      if (!adyenIntegration) {
        continue;
      }
      
      // Skip if already migrated (has merchantAccounts array)
      if (adyenIntegration.merchantAccounts && Array.isArray(adyenIntegration.merchantAccounts)) {
        console.log(`Organization ${doc.id}: Already has merchantAccounts array, skipping...`);
        skipped++;
        continue;
      }
      
      // Skip if no merchantAccount to migrate
      if (!adyenIntegration.merchantAccount) {
        console.log(`Organization ${doc.id}: No merchantAccount found, skipping...`);
        skipped++;
        continue;
      }
      
      // Convert single merchantAccount to array
      const merchantAccount = adyenIntegration.merchantAccount;
      const merchantAccounts = [merchantAccount];
      
      // Update document
      await doc.ref.update({
        "pspIntegrations.adyen.merchantAccounts": merchantAccounts,
        // Keep merchantAccount field for backward compatibility during transition
        // Can be removed later after all code is updated
      });
      
      console.log(`✓ Migrated ${doc.id}: ${merchantAccount} -> [${merchantAccounts.join(", ")}]`);
      migrated++;
    } catch (error: any) {
      console.error(`✗ Error migrating ${doc.id}:`, error.message);
      errors++;
    }
  }
  
  console.log("\nMigration complete!");
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

// Run if called directly
if (require.main === module) {
  migrateAdyenMerchantAccounts()
    .then(() => {
      console.log("\n✓ Migration script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("✗ Migration script failed:", error);
      process.exit(1);
    });
}

export { migrateAdyenMerchantAccounts };



