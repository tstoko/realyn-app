/**
 * Script to reset test environment
 * Deletes all data except admin account and creates a clean test Stripe organization
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

// Get Auth instance
function getAuth(): admin.auth.Auth {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: projectId,
    });
  }
  return admin.auth();
}

const ADMIN_EMAIL = "admin@realyn.com";

interface ResetSummary {
  disputesDeleted: number;
  guestsDeleted: number;
  bookingsDeleted: number;
  organizationsDeleted: number;
  firestoreUsersDeleted: number;
  authUsersDeleted: number;
  testOrgCreated: boolean;
  adminPreserved: boolean;
  errors: string[];
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
 * Delete all Firestore users except admin
 */
async function deleteFirestoreUsersExceptAdmin(adminUid: string): Promise<number> {
  const db = getDb();
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  
  if (snapshot.empty) {
    console.log("No users to delete");
    return 0;
  }

  let deletedCount = 0;
  const batch = db.batch();

  snapshot.docs.forEach((doc) => {
    if (doc.id !== adminUid) {
      batch.delete(doc.ref);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    await batch.commit();
    console.log(`Deleted ${deletedCount} Firestore user documents (preserved admin)`);
  } else {
    console.log("No non-admin users to delete");
  }

  return deletedCount;
}

/**
 * Delete all Firebase Auth users except admin
 */
async function deleteAuthUsersExceptAdmin(adminUid: string): Promise<number> {
  const auth = getAuth();
  let deletedCount = 0;
  let nextPageToken: string | undefined;

  do {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    
    for (const userRecord of listUsersResult.users) {
      if (userRecord.uid !== adminUid) {
        try {
          await auth.deleteUser(userRecord.uid);
          deletedCount++;
          console.log(`Deleted Auth user: ${userRecord.email} (${userRecord.uid})`);
        } catch (error: any) {
          console.error(`Error deleting user ${userRecord.uid}:`, error.message);
        }
      }
    }

    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);

  console.log(`Total deleted Auth users: ${deletedCount} (preserved admin)`);
  return deletedCount;
}

/**
 * Create test Stripe organization
 */
async function createTestStripeOrganization(): Promise<void> {
  const db = getDb();
  const orgId = "test_stripe_org";

  const testOrg: Omit<Organization, "id" | "createdAt" | "updatedAt"> = {
    name: "Test Stripe Hotel",
    location: "San Francisco, CA",
    teams: [
      { name: "Finance", email: "finance@teststripe.com" },
    ],
    documents: [],
    pspIntegrations: {
      stripe: {
        secretKey: "", // Empty - will be set via UI
        webhookSecret: "", // Empty - will be set via UI
        status: "not_connected",
      },
    },
    automationSettings: {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    users: [],
  };

  // Encrypt credentials (even if empty)
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
    createdAt: now,
    updatedAt: now,
  });

  console.log(`Created test Stripe organization: ${testOrg.name} (${orgId})`);
}

/**
 * Verify admin user exists
 */
async function verifyAdminExists(): Promise<{ uid: string; exists: boolean }> {
  const auth = getAuth();
  const db = getDb();

  try {
    const adminUser = await auth.getUserByEmail(ADMIN_EMAIL);
    const adminDoc = await db.collection("users").doc(adminUser.uid).get();

    if (!adminDoc.exists) {
      console.warn("Admin user exists in Auth but not in Firestore. This is okay, will be recreated if needed.");
    }

    return { uid: adminUser.uid, exists: true };
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      return { uid: "", exists: false };
    }
    throw error;
  }
}

/**
 * Main reset function
 */
export async function resetTestEnvironment(): Promise<ResetSummary> {
  console.log("==========================================");
  console.log("Starting Test Environment Reset");
  console.log("==========================================");

  const summary: ResetSummary = {
    disputesDeleted: 0,
    guestsDeleted: 0,
    bookingsDeleted: 0,
    organizationsDeleted: 0,
    firestoreUsersDeleted: 0,
    authUsersDeleted: 0,
    testOrgCreated: false,
    adminPreserved: false,
    errors: [],
  };

  try {
    // Step 1: Verify admin exists
    console.log("\nStep 1: Verifying admin user exists...");
    const adminCheck = await verifyAdminExists();
    
    if (!adminCheck.exists) {
      throw new Error(`Admin user (${ADMIN_EMAIL}) not found. Cannot proceed with reset.`);
    }

    console.log(`✓ Admin user verified: ${ADMIN_EMAIL} (${adminCheck.uid})`);

    // Step 2: Delete all disputes
    console.log("\nStep 2: Deleting all disputes...");
    try {
      summary.disputesDeleted = await deleteCollection("disputes");
    } catch (error: any) {
      summary.errors.push(`Error deleting disputes: ${error.message}`);
      console.error("Error deleting disputes:", error);
    }

    // Step 3: Delete all guests
    console.log("\nStep 3: Deleting all guests...");
    try {
      summary.guestsDeleted = await deleteCollection("guests");
    } catch (error: any) {
      summary.errors.push(`Error deleting guests: ${error.message}`);
      console.error("Error deleting guests:", error);
    }

    // Step 4: Delete all bookings
    console.log("\nStep 4: Deleting all bookings...");
    try {
      summary.bookingsDeleted = await deleteCollection("bookings");
    } catch (error: any) {
      summary.errors.push(`Error deleting bookings: ${error.message}`);
      console.error("Error deleting bookings:", error);
    }

    // Step 5: Delete all organizations
    console.log("\nStep 5: Deleting all organizations...");
    try {
      summary.organizationsDeleted = await deleteCollection("organizations");
    } catch (error: any) {
      summary.errors.push(`Error deleting organizations: ${error.message}`);
      console.error("Error deleting organizations:", error);
    }

    // Step 6: Delete Firestore users (except admin)
    console.log("\nStep 6: Deleting Firestore users (except admin)...");
    try {
      summary.firestoreUsersDeleted = await deleteFirestoreUsersExceptAdmin(adminCheck.uid);
    } catch (error: any) {
      summary.errors.push(`Error deleting Firestore users: ${error.message}`);
      console.error("Error deleting Firestore users:", error);
    }

    // Step 7: Delete Auth users (except admin)
    console.log("\nStep 7: Deleting Firebase Auth users (except admin)...");
    try {
      summary.authUsersDeleted = await deleteAuthUsersExceptAdmin(adminCheck.uid);
    } catch (error: any) {
      summary.errors.push(`Error deleting Auth users: ${error.message}`);
      console.error("Error deleting Auth users:", error);
    }

    // Step 8: Create test Stripe organization
    console.log("\nStep 8: Creating test Stripe organization...");
    try {
      await createTestStripeOrganization();
      summary.testOrgCreated = true;
    } catch (error: any) {
      summary.errors.push(`Error creating test organization: ${error.message}`);
      console.error("Error creating test organization:", error);
    }

    // Step 9: Verify admin still exists
    console.log("\nStep 9: Verifying admin user still exists...");
    const finalAdminCheck = await verifyAdminExists();
    summary.adminPreserved = finalAdminCheck.exists;

    if (!summary.adminPreserved) {
      throw new Error("CRITICAL: Admin user was deleted! This should never happen.");
    }

    console.log(`✓ Admin user preserved: ${ADMIN_EMAIL}`);

    // Summary
    console.log("\n==========================================");
    console.log("Reset Complete - Summary");
    console.log("==========================================");
    console.log(`Disputes deleted: ${summary.disputesDeleted}`);
    console.log(`Guests deleted: ${summary.guestsDeleted}`);
    console.log(`Bookings deleted: ${summary.bookingsDeleted}`);
    console.log(`Organizations deleted: ${summary.organizationsDeleted}`);
    console.log(`Firestore users deleted: ${summary.firestoreUsersDeleted}`);
    console.log(`Auth users deleted: ${summary.authUsersDeleted}`);
    console.log(`Test org created: ${summary.testOrgCreated ? "Yes" : "No"}`);
    console.log(`Admin preserved: ${summary.adminPreserved ? "Yes" : "No"}`);
    
    if (summary.errors.length > 0) {
      console.log(`\nErrors encountered: ${summary.errors.length}`);
      summary.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    return summary;
  } catch (error: any) {
    console.error("Fatal error during reset:", error);
    summary.errors.push(`Fatal error: ${error.message}`);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  resetTestEnvironment()
    .then((summary) => {
      console.log("\nReset completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Reset failed:", error);
      process.exit(1);
    });
}

