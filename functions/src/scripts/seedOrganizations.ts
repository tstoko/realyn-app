/**
 * Migration script to seed initial organizations in Firestore
 * Run this once to migrate from frontend mock data to Firestore
 */

import * as admin from "firebase-admin";
import type { Organization } from "../types/organization";

// Get Firestore instance - will use existing app if already initialized
// (Cloud Functions runtime initializes it automatically)
function getDb(): admin.firestore.Firestore {
  try {
    return admin.firestore();
  } catch (error) {
    // If not initialized, initialize it (for local runs)
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: projectId,
      });
    }
    return admin.firestore();
  }
}

const initialOrganizations: Omit<Organization, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Grand Palace Hotel",
    location: "San Francisco, CA",
    teams: [
      { name: "Finance", email: "finance.gph@example.com" },
      { name: "Front Desk", email: "frontdesk.gph@example.com" },
    ],
    documents: [
      {
        id: "doc_1_1",
        name: "Standard Cancellation Policy",
        category: "Cancellation Policy",
        fileName: "gph_cancel_policy_2023.pdf",
        fileSize: 128000,
      },
      {
        id: "doc_1_2",
        name: "General Terms of Service",
        category: "Terms of Service",
        fileName: "gph_tos_v2.pdf",
        fileSize: 256000,
      },
    ],
    pspIntegrations: {
      stripe: {
        secretKey: "", // Will be set via UI
        webhookSecret: "", // Will be set via UI
        status: "connected",
      },
    },
    automationSettings: {
      autoSubmissionEnabled: true,
      autoSubmissionMinAmount: 50,
      autoMarkNotContested: true,
    },
    users: [
      {
        id: "user_001",
        name: "Jamie Frontdesk",
        email: "user1@gph.com",
        role: "Staff",
      },
    ],
  },
  {
    name: "Lakeside Resort & Spa",
    location: "Lake Tahoe, NV",
    teams: [{ name: "Reservations", email: "res@lakeside.com" }],
    documents: [],
    pspIntegrations: {
      adyen: {
        apiKey: "", // Will be set via UI
        merchantAccounts: [], // Will be set via UI
        webhookUsername: "", // Will be set via UI
        webhookPassword: "", // Will be set via UI
        status: "connected",
      },
    },
    automationSettings: {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 100,
      autoMarkNotContested: false,
    },
    users: [
      {
        id: "user_002",
        name: "Casey Manager",
        email: "user2@lakeside.com",
        role: "Manager",
      },
    ],
  },
  {
    name: "Metropolis Business Inn",
    location: "New York, NY",
    teams: [
      { name: "Front Desk", email: "frontdesk.mbi@example.com" },
      { name: "Reservations", email: "res.mbi@example.com" },
    ],
    documents: [],
    pspIntegrations: {
      stripe: {
        secretKey: "", // Will be set via UI
        webhookSecret: "", // Will be set via UI
        status: "connected",
      },
    },
    automationSettings: {
      autoSubmissionEnabled: true,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: true,
    },
    users: [
      {
        id: "user_003",
        name: "Taylor Finance",
        email: "user3@mbi.com",
        role: "Staff",
      },
    ],
  },
];

async function seedOrganizations() {
  console.log("Starting organization seed...");
  const db = getDb();

  for (const org of initialOrganizations) {
    const orgId = org.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const docRef = db.collection("organizations").doc(orgId);

    // Check if organization already exists
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`Organization ${org.name} already exists, skipping...`);
      continue;
    }

    const now = admin.firestore.Timestamp.now();
    await docRef.set({
      ...org,
      createdAt: now,
      updatedAt: now,
    });

    console.log(`Created organization: ${org.name} (${orgId})`);
  }

  console.log("Organization seed completed!");
  // Don't call process.exit() when called from HTTP handler
}

// Run if called directly
if (require.main === module) {
  seedOrganizations().catch((error) => {
    console.error("Error seeding organizations:", error);
    process.exit(1);
  });
}

export { seedOrganizations };

