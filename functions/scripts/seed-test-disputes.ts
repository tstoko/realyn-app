/**
 * Seed script to create diverse test disputes with different reason codes
 * 
 * Usage:
 *   cd functions
 *   npx ts-node scripts/seed-test-disputes.ts
 * 
 * Or after build:
 *   node lib/scripts/seed-test-disputes.js
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin with project ID
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "realyn-app",
  });
}

const db = admin.firestore();

// Test disputes with different reason codes
const testDisputes = [
  {
    reason: "product_not_received",
    description: "Guest claims they never received the service/room",
    amount: 15000, // $150.00
  },
  {
    reason: "credit_not_processed",
    description: "Guest claims refund was promised but not received",
    amount: 8500, // $85.00
  },
  {
    reason: "general",
    description: "General dispute - unspecified reason",
    amount: 12000, // $120.00
  },
  {
    reason: "duplicate",
    description: "Guest claims they were charged twice",
    amount: 20000, // $200.00
  },
  {
    reason: "subscription_canceled",
    description: "Guest canceled but was still charged",
    amount: 9900, // $99.00
  },
];

async function getStripeOrganizationId(): Promise<string | null> {
  // Find an organization with Stripe integration
  const orgsSnapshot = await db.collection("organizations").get();
  
  for (const doc of orgsSnapshot.docs) {
    const data = doc.data();
    if (data.pspIntegrations?.stripe?.connected) {
      console.log(`Found Stripe organization: ${doc.id} (${data.name})`);
      return doc.id;
    }
  }
  
  // If no Stripe org found, try to find any organization
  if (!orgsSnapshot.empty) {
    const firstOrg = orgsSnapshot.docs[0];
    console.log(`Using first organization: ${firstOrg.id}`);
    return firstOrg.id;
  }
  
  return null;
}

async function seedTestDisputes() {
  console.log("Starting test dispute seeding...\n");
  
  // Get organization ID
  const organizationId = await getStripeOrganizationId();
  
  if (!organizationId) {
    console.error("No organization found! Please create an organization first.");
    process.exit(1);
  }
  
  console.log(`Using organization: ${organizationId}\n`);
  
  const now = new Date();
  const respondBy = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  
  let created = 0;
  
  for (const testDispute of testDisputes) {
    // Generate unique IDs
    const timestamp = Date.now() + created;
    const pspDisputeId = `du_test_${testDispute.reason}_${timestamp}`;
    const pspPaymentId = `pi_test_${timestamp}`;
    
    const disputeData = {
      // Organization and PSP info
      organizationId: organizationId,
      pspProvider: "stripe",
      pspDisputeId: pspDisputeId,
      pspPaymentId: pspPaymentId,
      pspTransactionDate: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
      ),
      pspLast4Digits: String(1000 + created).slice(-4),
      
      // Dispute details
      amount: testDispute.amount,
      currency: "usd",
      reason: testDispute.reason,
      stripeStatus: "needs_response",
      customerExplanation: testDispute.description,
      
      // Dates
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      respondBy: admin.firestore.Timestamp.fromDate(respondBy),
      
      // Internal status
      internalStatus: "needs_review",
      lifecycleStatus: "new",
      automationStatus: "manual_review",
      
      // Audit trail
      auditTrail: [
        {
          timestamp: admin.firestore.Timestamp.now(),
          title: "Test Dispute Created",
          description: `Test ${testDispute.reason} dispute. ${testDispute.description}`,
          status: "success",
        },
      ],
      
      // AI fields (empty - will be populated when plan is generated)
      evidencePlan: null,
      evidenceItems: [],
      useAIPlan: true,
    };
    
    try {
      const docRef = await db.collection("disputes").add(disputeData);
      console.log(`✓ Created ${testDispute.reason} dispute: ${docRef.id}`);
      console.log(`  Amount: $${(testDispute.amount / 100).toFixed(2)}`);
      console.log(`  Description: ${testDispute.description}\n`);
      created++;
    } catch (error) {
      console.error(`✗ Failed to create ${testDispute.reason} dispute:`, error);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Created ${created}/${testDisputes.length} test disputes`);
  console.log(`========================================\n`);
}

// Run the seeding
seedTestDisputes()
  .then(() => {
    console.log("Seeding complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });

