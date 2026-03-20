/**
 * Seed script to create the Harborlight Hotel cancellation dispute
 * Uses the client-side Firebase SDK (no service account needed)
 * 
 * Usage: node scripts/seed-harborlight-client.mjs
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, Timestamp, getDocs, query, limit } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCbLbtinVrCMkrXtspOMJTo3lAH6vwXg38",
  authDomain: "realyn-app.firebaseapp.com",
  projectId: "realyn-app",
  storageBucket: "realyn-app.firebasestorage.app",
  messagingSenderId: "819510714783",
  appId: "1:819510714783:web:13cbe50945056346a09daa",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findOrganization() {
  // Find an organization - prefer test_stripe_org or first available
  const orgsSnapshot = await getDocs(query(collection(db, "organizations"), limit(10)));
  
  for (const doc of orgsSnapshot.docs) {
    if (doc.id === "test_stripe_org") {
      console.log(`Found test_stripe_org organization`);
      return doc.id;
    }
  }
  
  // Fall back to first organization
  if (!orgsSnapshot.empty) {
    const firstOrg = orgsSnapshot.docs[0];
    console.log(`Using organization: ${firstOrg.id} (${firstOrg.data().name || 'unnamed'})`);
    return firstOrg.id;
  }
  
  throw new Error("No organization found!");
}

async function seedHarborlightDispute() {
  const organizationId = await findOrganization();
  
  const now = new Date();
  const transactionDate = new Date("2026-03-11T14:07:00Z");
  const respondBy = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
  
  const timestamp = Date.now();
  
  const disputeData = {
    // Organization and PSP info
    organizationId: organizationId,
    pspProvider: "stripe",
    pspDisputeId: `du_harborlight_${timestamp}`,
    pspPaymentId: `pi_harborlight_${timestamp}`,
    pspTransactionDate: Timestamp.fromDate(transactionDate),
    pspLast4Digits: "1234",
    
    // Backward compatibility
    stripeDisputeId: `du_harborlight_${timestamp}`,
    stripePaymentIntentId: `pi_harborlight_${timestamp}`,
    
    // Dispute details - £412.80 = 41280 pence
    amount: 41280,
    currency: "gbp",
    reason: "subscription_canceled",
    stripeStatus: "needs_response",
    customerExplanation: `I cancelled a hotel reservation within the cancellation window shown at purchase, but the hotel still charged the full amount and refused to refund when I contacted them.

What happened (timeline):
10/03/2026 12:18 — I booked a 2-night stay at Harborlight Hotel for 14/03/2026–16/03/2026. The booking page presented the rate as "Flexible" with free cancellation until 48 hours before check-in. Total quoted: £412.80.

11/03/2026 ~14:05 — I cancelled the booking using the hotel's "Manage booking" link. The site displayed a confirmation message indicating the cancellation was submitted.

11/03/2026 14:07 — I received an email from the hotel acknowledging receipt of my cancellation request.

11/03/2026 — Despite the cancellation, the hotel charged and posted £412.80 to my card.

12/03/2026 — I contacted the hotel to request a refund and resolve this directly. The hotel refused, claiming the cancellation was late.

Why the charge is invalid:
Based on the terms shown at purchase, I was entitled to cancel free of charge up to 48 hours before check-in. Check-in was stated as 15:00 on 14/03/2026, so the deadline would be 15:00 on 12/03/2026. I cancelled on 11/03/2026, which is before the deadline. Charging the full stay after a timely cancellation is not consistent with the presented terms.

Booking Reference: HH-841266
Service Dates: 14/03/2026–16/03/2026
Merchant: HARBORLIGHT HOTEL`,
    
    // Dates
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    respondBy: Timestamp.fromDate(respondBy),
    
    // Internal status
    internalStatus: "needs_review",
    lifecycleStatus: "new",
    automationStatus: "auditing",
    
    // Audit trail
    auditTrail: [
      {
        timestamp: Timestamp.now(),
        title: "Dispute Received",
        description: "Chargeback received from cardholder claiming cancellation was made within policy window but charge was applied anyway.",
        status: "success",
        category: "dispute_received",
      },
    ],
    
    internalNotes: [],
    evidencePlan: null,
    evidenceItems: [],
    useAIPlan: true,
    aiSummary: "",
    aiDraftResponse: "",
    isDraftApproved: false,
  };
  
  try {
    const docRef = await addDoc(collection(db, "disputes"), disputeData);
    console.log(`\n✓ Created Harborlight Hotel dispute!`);
    console.log(`  Document ID: ${docRef.id}`);
    console.log(`  Amount: £412.80`);
    console.log(`  Reason: Cancelled services / charged despite cancellation`);
    console.log(`  Booking Ref: HH-841266`);
    console.log(`  Organization: ${organizationId}`);
    console.log(`\nYou can now view this dispute in your dashboard.\n`);
  } catch (error) {
    console.error("Failed to create dispute:", error);
    throw error;
  }
}

seedHarborlightDispute()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

