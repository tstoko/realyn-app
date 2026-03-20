/**
 * Script to clear all disputes from Firestore
 * Usage: npx ts-node functions/src/scripts/clearDisputes.ts
 */

import * as admin from "firebase-admin";

// Get Firestore instance
function getDb(): admin.firestore.Firestore {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  if (!admin.apps.length) {
    // Check if we're using the emulator
    const useEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HUB;
    
    if (useEmulator) {
      // Use emulator
      admin.initializeApp({
        projectId: projectId,
      });
      const db = admin.firestore();
      db.settings({
        host: process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080",
        ssl: false,
      });
      return db;
    } else {
      // Use production (requires credentials)
      admin.initializeApp({
        projectId: projectId,
      });
    }
  }
  return admin.firestore();
}

/**
 * Delete all documents in a collection using batch operations
 */
async function deleteCollection(collectionName: string): Promise<number> {
  const db = getDb();
  const collectionRef = db.collection(collectionName);
  let deletedCount = 0;

  // Get all documents
  const snapshot = await collectionRef.get();
  
  if (snapshot.empty) {
    console.log(`Collection ${collectionName} is already empty`);
    return 0;
  }

  // Delete in batches of 500 (Firestore limit)
  const batchSize = 500;
  const docs = snapshot.docs;
  
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const batchDocs = docs.slice(i, i + batchSize);
    
    batchDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    deletedCount += batchDocs.length;
    console.log(`Deleted ${batchDocs.length} documents from ${collectionName} (${deletedCount}/${docs.length})`);
  }

  console.log(`Total deleted from ${collectionName}: ${deletedCount}`);
  return deletedCount;
}

/**
 * Main function to clear all disputes
 */
async function clearDisputes(): Promise<void> {
  console.log("==========================================");
  console.log("Clearing all disputes...");
  console.log("==========================================");
  
  try {
    const deletedCount = await deleteCollection("disputes");
    console.log("\n==========================================");
    console.log(`Successfully deleted ${deletedCount} dispute(s)`);
    console.log("==========================================");
    process.exit(0);
  } catch (error: any) {
    console.error("Error clearing disputes:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  clearDisputes();
}
