/**
 * Seed script to create an example unstarted dispute.
 * Uses the Firestore REST API with an OAuth token from the Firebase CLI's stored credentials.
 * No additional npm dependencies required.
 *
 * Usage: node scripts/seed-example-dispute.mjs
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PROJECT_ID = "realyn-app";

const configPath = join(homedir(), ".config", "configstore", "firebase-tools.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const tokens = config.tokens;

if (!tokens?.refresh_token) {
  console.error("No refresh token found in Firebase CLI config. Run `firebase login` first.");
  process.exit(1);
}

const clientId = tokens.client_id || "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const clientSecret = tokens.client_secret || "j9iVZfS8kkCEFUPaAeJV0sAi";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function seedExampleDispute() {
  const accessToken = await getAccessToken();

  const now = new Date();
  const transactionDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const respondBy = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const ts = Date.now();

  const firestoreDoc = {
    fields: {
      organizationId: { stringValue: "org_1765135288163" },
      pspProvider: { stringValue: "stripe" },
      pspDisputeId: { stringValue: `du_example_${ts}` },
      pspPaymentId: { stringValue: `pi_example_${ts}` },
      pspTransactionDate: { timestampValue: transactionDate.toISOString() },
      pspLast4Digits: { stringValue: "4242" },
      stripeDisputeId: { stringValue: `du_example_${ts}` },
      stripePaymentIntentId: { stringValue: `pi_example_${ts}` },
      amount: { integerValue: "18500" },
      currency: { stringValue: "usd" },
      reason: { stringValue: "product_not_received" },
      status: { stringValue: "needs_response" },
      stripeStatus: { stringValue: "needs_response" },
      customerExplanation: {
        stringValue:
          'I booked a 1-night stay at the hotel for February 20, 2026 but never checked in. When I arrived at the property, the front desk had no record of my reservation and the room was not available. I was turned away and had to book alternative accommodation elsewhere. Despite never receiving the room or any services, I was still charged the full $185.00. I contacted the hotel the next day to request a refund and was told they would "look into it" but never followed up.\n\nBooking Reference: EX-550123\nStay Date: 20/02/2026\nMerchant: SEASIDE INN',
      },
      createdAt: { timestampValue: now.toISOString() },
      updatedAt: { timestampValue: now.toISOString() },
      respondBy: { timestampValue: respondBy.toISOString() },
      internalStatus: { stringValue: "needs_review" },
      lifecycleStatus: { stringValue: "new" },
      automationStatus: { stringValue: "auditing" },
      auditTrail: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  timestamp: { timestampValue: now.toISOString() },
                  title: { stringValue: "Dispute Received" },
                  description: {
                    stringValue:
                      "Chargeback received from cardholder claiming they never checked in and were charged for services not rendered.",
                  },
                  status: { stringValue: "success" },
                  category: { stringValue: "dispute_received" },
                },
              },
            },
          ],
        },
      },
      internalNotes: { arrayValue: { values: [] } },
      evidencePlan: { nullValue: null },
      evidenceItems: { arrayValue: { values: [] } },
      useAIPlan: { booleanValue: true },
      aiSummary: { stringValue: "" },
      aiDraftResponse: { stringValue: "" },
      isDraftApproved: { booleanValue: false },
    },
  };

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/disputes`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(firestoreDoc),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore REST API error ${response.status}: ${text}`);
  }

  const result = await response.json();
  const docId = result.name.split("/").pop();

  console.log(`\n✓ Created example dispute!`);
  console.log(`  Document ID: ${docId}`);
  console.log(`  Amount: $185.00`);
  console.log(`  Reason: product_not_received`);
  console.log(`  Status: needs_review (not started)`);
  console.log(`  Organization: org_1765135288163`);
  console.log(`\nYou can now view this dispute in your dashboard.\n`);
}

seedExampleDispute()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
