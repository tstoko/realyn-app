/**
 * Script to verify Stripe disputes in Firestore
 * Usage: npx ts-node scripts/verify-stripe-disputes.ts [organizationId]
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface DisputeData {
  id: string;
  organizationId?: string;
  pspProvider?: string;
  pspDisputeId?: string;
  pspPaymentId?: string;
  amount?: number;
  currency?: string;
  stripeStatus?: string;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  pspLast4Digits?: string;
  pspTransactionDate?: admin.firestore.Timestamp;
}

async function verifyStripeDisputes(organizationId: string = "test_stripe_org") {
  console.log(`\nVerifying Stripe disputes for organization: ${organizationId}\n`);

  try {
    // Query disputes for this organization
    const disputesSnapshot = await db
      .collection("disputes")
      .where("organizationId", "==", organizationId)
      .where("pspProvider", "==", "stripe")
      .get();

    if (disputesSnapshot.empty) {
      console.log("❌ No Stripe disputes found for this organization");
      console.log("\nPossible reasons:");
      console.log("  - No webhook events have been received");
      console.log("  - Organization ID is incorrect");
      console.log("  - Disputes were stored with different organizationId");
      return;
    }

    console.log(`✅ Found ${disputesSnapshot.size} dispute(s)\n`);

    // Verify each dispute
    const issues: string[] = [];
    const verified: string[] = [];

    disputesSnapshot.forEach((doc) => {
      const dispute = { id: doc.id, ...doc.data() } as DisputeData;
      const disputeIssues: string[] = [];

      console.log(`Dispute ID: ${dispute.id}`);
      console.log(`  PSP Dispute ID: ${dispute.pspDisputeId || "❌ MISSING"}`);
      
      // Check required fields
      if (!dispute.organizationId) {
        disputeIssues.push("Missing organizationId");
      } else if (dispute.organizationId !== organizationId) {
        disputeIssues.push(`Wrong organizationId: ${dispute.organizationId}`);
      }

      if (!dispute.pspProvider) {
        disputeIssues.push("Missing pspProvider");
      } else if (dispute.pspProvider !== "stripe") {
        disputeIssues.push(`Wrong pspProvider: ${dispute.pspProvider}`);
      }

      if (!dispute.pspDisputeId) {
        disputeIssues.push("Missing pspDisputeId");
      }

      if (!dispute.amount) {
        disputeIssues.push("Missing amount");
      } else {
        console.log(`  Amount: ${dispute.amount / 100} ${dispute.currency?.toUpperCase() || ""}`);
      }

      if (!dispute.currency) {
        disputeIssues.push("Missing currency");
      }

      if (!dispute.stripeStatus) {
        disputeIssues.push("Missing stripeStatus");
      } else {
        console.log(`  Status: ${dispute.stripeStatus}`);
      }

      if (!dispute.createdAt) {
        disputeIssues.push("Missing createdAt");
      } else {
        console.log(`  Created: ${dispute.createdAt.toDate().toISOString()}`);
      }

      if (!dispute.updatedAt) {
        disputeIssues.push("Missing updatedAt");
      }

      // Check optional but important fields
      if (dispute.pspLast4Digits) {
        console.log(`  Last 4 digits: ${dispute.pspLast4Digits}`);
      } else {
        console.log(`  Last 4 digits: Not available`);
      }

      if (dispute.pspTransactionDate) {
        console.log(`  Transaction Date: ${dispute.pspTransactionDate.toDate().toISOString()}`);
      }

      if (dispute.pspPaymentId) {
        console.log(`  Payment ID: ${dispute.pspPaymentId}`);
      }

      console.log("");

      if (disputeIssues.length > 0) {
        issues.push(`Dispute ${dispute.id}: ${disputeIssues.join(", ")}`);
      } else {
        verified.push(dispute.id);
      }
    });

    // Summary
    console.log("==========================================");
    console.log("Verification Summary");
    console.log("==========================================");
    console.log(`Total disputes: ${disputesSnapshot.size}`);
    console.log(`✅ Verified: ${verified.length}`);
    console.log(`❌ Issues: ${issues.length}`);
    console.log("");

    if (issues.length > 0) {
      console.log("Issues found:");
      issues.forEach((issue) => console.log(`  - ${issue}`));
      console.log("");
      process.exit(1);
    } else {
      console.log("✅ All disputes verified successfully!");
      console.log("");
      process.exit(0);
    }
  } catch (error: any) {
    console.error("❌ Error verifying disputes:", error.message);
    process.exit(1);
  }
}

// Run if called directly
const organizationId = process.argv[2] || "test_stripe_org";
verifyStripeDisputes(organizationId);



