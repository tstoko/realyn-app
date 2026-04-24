/**
 * Firestore Migration Script: Rename Legacy Dispute Fields
 *
 * Migrates dispute documents from old Stripe-specific field names
 * to unified PSP-agnostic field names:
 *
 *   stripeStatus         -> status
 *   stripeDisputeId      -> pspDisputeId  (if not already set)
 *   stripePaymentIntentId -> pspPaymentId (if not already set)
 *   stripeChargeId       -> (removed, no replacement needed)
 *
 * Usage:
 *   npx ts-node src/scripts/migrateDisputeFields.ts              # dry-run (default)
 *   npx ts-node src/scripts/migrateDisputeFields.ts --execute     # actually write changes
 *
 * The script processes documents in batches of 500 to stay within
 * Firestore batch write limits.
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const BATCH_SIZE = 500;

interface MigrationStats {
  totalDocuments: number;
  documentsNeedingMigration: number;
  documentsAlreadyMigrated: number;
  batchesWritten: number;
  errors: string[];
}

async function migrateDisputeFields(dryRun: boolean): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalDocuments: 0,
    documentsNeedingMigration: 0,
    documentsAlreadyMigrated: 0,
    batchesWritten: 0,
    errors: [],
  };

  console.log(`\n=== Dispute Field Migration ${dryRun ? "(DRY RUN)" : "(EXECUTING)"} ===\n`);

  try {
    // Fetch all disputes
    const snapshot = await db.collection("disputes").get();
    stats.totalDocuments = snapshot.size;
    console.log(`Found ${stats.totalDocuments} dispute document(s).\n`);

    if (snapshot.empty) {
      console.log("No documents to migrate.");
      return stats;
    }

    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates: Record<string, any> = {};
      const deletes: string[] = [];
      let needsMigration = false;

      // 1) Rename stripeStatus -> status
      if (data.stripeStatus !== undefined && data.status === undefined) {
        updates.status = data.stripeStatus;
        deletes.push("stripeStatus");
        needsMigration = true;
      } else if (data.stripeStatus !== undefined && data.status !== undefined) {
        // Both exist — just remove the old one
        deletes.push("stripeStatus");
        needsMigration = true;
      }

      // 2) Copy stripeDisputeId -> pspDisputeId (if not already set)
      if (data.stripeDisputeId !== undefined && !data.pspDisputeId) {
        updates.pspDisputeId = data.stripeDisputeId;
        needsMigration = true;
      }
      // Always remove the old field if it exists
      if (data.stripeDisputeId !== undefined) {
        deletes.push("stripeDisputeId");
        needsMigration = true;
      }

      // 3) Copy stripePaymentIntentId -> pspPaymentId (if not already set)
      if (data.stripePaymentIntentId !== undefined && !data.pspPaymentId) {
        updates.pspPaymentId = data.stripePaymentIntentId;
        needsMigration = true;
      }
      // Always remove the old field if it exists
      if (data.stripePaymentIntentId !== undefined) {
        deletes.push("stripePaymentIntentId");
        needsMigration = true;
      }

      // 4) Remove stripeChargeId (no replacement)
      if (data.stripeChargeId !== undefined) {
        deletes.push("stripeChargeId");
        needsMigration = true;
      }

      if (!needsMigration) {
        stats.documentsAlreadyMigrated++;
        continue;
      }

      stats.documentsNeedingMigration++;

      if (dryRun) {
        console.log(`[DRY RUN] Would update ${doc.id}:`);
        if (Object.keys(updates).length > 0) {
          console.log(`  SET: ${JSON.stringify(updates)}`);
        }
        if (deletes.length > 0) {
          console.log(`  DELETE: ${deletes.join(", ")}`);
        }
        continue;
      }

      // Build the update object
      const updatePayload: Record<string, any> = { ...updates };
      for (const field of deletes) {
        updatePayload[field] = FieldValue.delete();
      }

      batch.update(doc.ref, updatePayload);
      batchCount++;

      // Commit batch when it reaches the limit
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        stats.batchesWritten++;
        console.log(`  Committed batch ${stats.batchesWritten} (${batchCount} documents)`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit any remaining documents in the last batch
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      stats.batchesWritten++;
      console.log(`  Committed final batch ${stats.batchesWritten} (${batchCount} documents)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stats.errors.push(message);
    console.error(`Migration error: ${message}`);
  }

  // Print summary
  console.log("\n=== Migration Summary ===");
  console.log(`Total documents:          ${stats.totalDocuments}`);
  console.log(`Needing migration:        ${stats.documentsNeedingMigration}`);
  console.log(`Already migrated:         ${stats.documentsAlreadyMigrated}`);
  if (!dryRun) {
    console.log(`Batches written:          ${stats.batchesWritten}`);
  }
  if (stats.errors.length > 0) {
    console.log(`Errors:                   ${stats.errors.length}`);
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("");

  return stats;
}

// CLI entry point
const args = process.argv.slice(2);
const execute = args.includes("--execute");

migrateDisputeFields(!execute)
  .then((stats) => {
    if (!execute && stats.documentsNeedingMigration > 0) {
      console.log("This was a dry run. To apply changes, run with --execute flag.\n");
    }
    process.exit(stats.errors.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
