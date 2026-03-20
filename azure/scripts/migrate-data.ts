/**
 * Data Migration Script: Firebase to Azure Cosmos DB
 * 
 * This script exports data from Firebase Firestore and imports it to Azure Cosmos DB.
 * 
 * Prerequisites:
 * 1. Firebase Admin SDK service account key
 * 2. Azure Cosmos DB connection string
 * 
 * Usage:
 * npx ts-node migrate-data.ts
 */

import * as admin from "firebase-admin";
import { CosmosClient, Container } from "@azure/cosmos";
import * as fs from "fs";
import * as path from "path";

// Configuration
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT || "./firebase-service-account.json";
const COSMOS_CONNECTION = process.env.COSMOS_CONNECTION || "";
const COSMOS_DATABASE = process.env.COSMOS_DATABASE || "realyn";

// Collections to migrate
const COLLECTIONS_TO_MIGRATE = ["organizations", "disputes", "users"];

// Collections to skip (PMS-related)
const COLLECTIONS_TO_SKIP = ["guests", "bookings"];

interface MigrationStats {
  collection: string;
  exported: number;
  imported: number;
  errors: number;
}

/**
 * Initialize Firebase Admin SDK
 */
function initFirebase(): void {
  if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Firebase service account file not found: ${FIREBASE_SERVICE_ACCOUNT_PATH}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✓ Firebase initialized");
}

/**
 * Initialize Cosmos DB client
 */
function initCosmos(): CosmosClient {
  if (!COSMOS_CONNECTION) {
    throw new Error("COSMOS_CONNECTION environment variable is required");
  }

  const client = new CosmosClient(COSMOS_CONNECTION);
  console.log("✓ Cosmos DB initialized");
  return client;
}

/**
 * Export documents from a Firestore collection
 */
async function exportCollection(collectionName: string): Promise<any[]> {
  const db = admin.firestore();
  const snapshot = await db.collection(collectionName).get();
  
  const documents = snapshot.docs.map(doc => {
    const data = doc.data();
    
    // Convert Firestore Timestamps to ISO strings
    const converted = convertTimestamps(data);
    
    // Remove PMS-related fields from disputes
    if (collectionName === "disputes") {
      delete converted.pmsProvider;
      delete converted.pmsGuestId;
      delete converted.pmsBookingId;
      delete converted.pmsMatchConfidence;
      delete converted.pmsMatchMethod;
    }
    
    // Remove pmsIntegrations from organizations
    if (collectionName === "organizations") {
      delete converted.pmsIntegrations;
    }
    
    return {
      id: doc.id,
      ...converted,
    };
  });

  console.log(`  Exported ${documents.length} documents from ${collectionName}`);
  return documents;
}

/**
 * Convert Firestore Timestamps to ISO strings recursively
 */
function convertTimestamps(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (obj instanceof admin.firestore.Timestamp) {
    return obj.toDate().toISOString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertTimestamps);
  }
  
  if (typeof obj === "object") {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertTimestamps(value);
    }
    return converted;
  }
  
  return obj;
}

/**
 * Import documents to Cosmos DB container
 */
async function importToContainer(
  container: Container,
  documents: any[],
  partitionKeyPath: string
): Promise<{ imported: number; errors: number }> {
  let imported = 0;
  let errors = 0;
  
  for (const doc of documents) {
    try {
      // Extract partition key value
      const partitionKeyField = partitionKeyPath.replace("/", "");
      const partitionKey = doc[partitionKeyField] || doc.id;
      
      await container.items.upsert(doc);
      imported++;
    } catch (error: any) {
      console.error(`  Error importing document ${doc.id}: ${error.message}`);
      errors++;
    }
  }
  
  console.log(`  Imported ${imported} documents (${errors} errors)`);
  return { imported, errors };
}

/**
 * Get partition key path for a collection
 */
function getPartitionKeyPath(collectionName: string): string {
  switch (collectionName) {
    case "disputes":
      return "/organizationId";
    case "users":
      return "/organizationId";
    case "organizations":
    default:
      return "/id";
  }
}

/**
 * Main migration function
 */
async function migrate(): Promise<void> {
  console.log("========================================");
  console.log("  Firebase to Azure Migration");
  console.log("========================================\n");
  
  const stats: MigrationStats[] = [];
  
  // Initialize clients
  initFirebase();
  const cosmosClient = initCosmos();
  const database = cosmosClient.database(COSMOS_DATABASE);
  
  console.log(`\nMigrating to database: ${COSMOS_DATABASE}\n`);
  
  // Migrate each collection
  for (const collectionName of COLLECTIONS_TO_MIGRATE) {
    console.log(`\n[${collectionName}]`);
    
    // Export from Firebase
    const documents = await exportCollection(collectionName);
    
    if (documents.length === 0) {
      console.log("  No documents to migrate");
      stats.push({ collection: collectionName, exported: 0, imported: 0, errors: 0 });
      continue;
    }
    
    // Save backup to file
    const backupPath = path.join(__dirname, `../backups/${collectionName}.json`);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify(documents, null, 2));
    console.log(`  Backup saved to ${backupPath}`);
    
    // Import to Cosmos DB
    const container = database.container(collectionName);
    const partitionKeyPath = getPartitionKeyPath(collectionName);
    const { imported, errors } = await importToContainer(container, documents, partitionKeyPath);
    
    stats.push({
      collection: collectionName,
      exported: documents.length,
      imported,
      errors,
    });
  }
  
  // Print summary
  console.log("\n========================================");
  console.log("  Migration Summary");
  console.log("========================================\n");
  
  console.log("Collection          | Exported | Imported | Errors");
  console.log("--------------------|----------|----------|-------");
  
  for (const stat of stats) {
    const col = stat.collection.padEnd(19);
    const exp = stat.exported.toString().padStart(8);
    const imp = stat.imported.toString().padStart(8);
    const err = stat.errors.toString().padStart(6);
    console.log(`${col} | ${exp} | ${imp} | ${err}`);
  }
  
  const totalExported = stats.reduce((sum, s) => sum + s.exported, 0);
  const totalImported = stats.reduce((sum, s) => sum + s.imported, 0);
  const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);
  
  console.log("--------------------|----------|----------|-------");
  console.log(`${"Total".padEnd(19)} | ${totalExported.toString().padStart(8)} | ${totalImported.toString().padStart(8)} | ${totalErrors.toString().padStart(6)}`);
  
  console.log("\n✓ Migration complete!");
  
  if (totalErrors > 0) {
    console.log(`\n⚠️  ${totalErrors} errors occurred. Check the logs above.`);
    process.exit(1);
  }
}

// Run migration
migrate().catch(error => {
  console.error("Migration failed:", error);
  process.exit(1);
});
