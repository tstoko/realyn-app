/**
 * Script to create a new Stripe dispute for a hotel
 * 
 * Usage:
 *   cd functions
 *   npx ts-node scripts/create-stripe-dispute.ts [organizationId]
 * 
 * Or after build:
 *   node lib/scripts/create-stripe-dispute.js [organizationId]
 */

import * as admin from "firebase-admin";

// Get Firestore instance with emulator support
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
      try {
        admin.initializeApp({
          projectId: projectId,
        });
      } catch (error) {
        console.error("Failed to initialize Firebase Admin. Please run:");
        console.error("  gcloud auth application-default login");
        console.error("Or use the Firebase emulator:");
        console.error("  firebase emulators:start --only firestore");
        process.exit(1);
      }
    }
  }
  return admin.firestore();
}

const db = getDb();

async function getStripeOrganizationId(providedOrgId?: string): Promise<string | null> {
  if (providedOrgId) {
    const orgDoc = await db.collection("organizations").doc(providedOrgId).get();
    if (orgDoc.exists) {
      const data = orgDoc.data();
      if (data?.pspIntegrations?.stripe?.status === "connected") {
        console.log(`Using provided organization: ${providedOrgId} (${data.name})`);
        return providedOrgId;
      } else {
        console.warn(`Organization ${providedOrgId} does not have Stripe connected.`);
      }
    } else {
      console.warn(`Organization ${providedOrgId} not found.`);
    }
  }
  
  // Find an organization with Stripe integration
  const orgsSnapshot = await db.collection("organizations").get();
  
  // Prefer test_stripe_org
  for (const doc of orgsSnapshot.docs) {
    if (doc.id === "test_stripe_org") {
      const data = doc.data();
      if (data?.pspIntegrations?.stripe?.status === "connected") {
        console.log(`Found test_stripe_org: ${doc.id} (${data.name})`);
        return doc.id;
      }
    }
  }
  
  // Find any organization with Stripe
  for (const doc of orgsSnapshot.docs) {
    const data = doc.data();
    if (data?.pspIntegrations?.stripe?.status === "connected") {
      console.log(`Found Stripe organization: ${doc.id} (${data.name})`);
      return doc.id;
    }
  }
  
  // If no Stripe org found, use first organization
  if (!orgsSnapshot.empty) {
    const firstOrg = orgsSnapshot.docs[0];
    console.log(`Using first organization: ${firstOrg.id}`);
    return firstOrg.id;
  }
  
  return null;
}

async function createStripeDispute(organizationId?: string) {
  console.log("Creating new Stripe dispute for hotel...\n");
  
  // Get organization ID
  const orgId = await getStripeOrganizationId(organizationId);
  
  if (!orgId) {
    console.error("No organization found! Please create an organization first.");
    process.exit(1);
  }
  
  const now = new Date();
  const txDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago
  const respondBy = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  const timestamp = Date.now();
  
  // Default dispute data - typical hotel chargeback
  const disputeData = {
    // Organization and PSP info
    organizationId: orgId,
    pspProvider: "stripe",
    pspDisputeId: `du_hotel_${timestamp}`,
    pspPaymentId: `pi_hotel_${timestamp}`,
    pspTransactionDate: admin.firestore.Timestamp.fromDate(txDate),
    pspLast4Digits: String(Math.floor(Math.random() * 9000) + 1000), // Random 4 digits
    
    // Backward compatibility
    stripeDisputeId: `du_hotel_${timestamp}`,
    stripePaymentIntentId: `pi_hotel_${timestamp}`,
    
    // Dispute details
    amount: 25000, // $250.00 in cents
    currency: "usd",
    reason: "product_not_received", // Common hotel dispute reason
    stripeStatus: "needs_response",
    customerExplanation: "Guest claims they did not receive the hotel room service",
    
    // Dates
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    respondBy: admin.firestore.Timestamp.fromDate(respondBy),
    
    // Internal status
    internalStatus: "needs_review",
    lifecycleStatus: "new",
    automationStatus: "auditing",
    
    // Audit trail
    auditTrail: [
      {
        timestamp: admin.firestore.Timestamp.now(),
        title: "Dispute Received",
        description: "New Stripe chargeback received for hotel booking",
        status: "success",
        category: "dispute_received",
      },
    ],
    
    // AI fields (empty - will be populated when plan is generated)
    internalNotes: [],
    evidencePlan: null,
    evidenceItems: [],
    useAIPlan: true,
    aiSummary: "",
    aiDraftResponse: "",
    isDraftApproved: false,
  };
  
  try {
    const docRef = await db.collection("disputes").add(disputeData);
    console.log(`\n✓ Successfully created Stripe dispute!`);
    console.log(`  Dispute ID: ${docRef.id}`);
    console.log(`  Organization: ${orgId}`);
    console.log(`  Amount: $${(disputeData.amount / 100).toFixed(2)} ${disputeData.currency.toUpperCase()}`);
    console.log(`  Reason: ${disputeData.reason}`);
    console.log(`  Status: ${disputeData.stripeStatus}`);
    console.log(`  Respond by: ${respondBy.toLocaleDateString()}`);
    console.log(`\nDispute is ready for AI evidence planning.\n`);
    
    return docRef.id;
  } catch (error) {
    console.error(`✗ Failed to create dispute:`, error);
    throw error;
  }
}

// Get organization ID from command line args if provided
const orgIdArg = process.argv[2];

// Run the script
createStripeDispute(orgIdArg)
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
