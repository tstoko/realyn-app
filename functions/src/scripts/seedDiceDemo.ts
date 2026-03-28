/**
 * Seed script to create a DICE demo organization, user, and ticketing disputes.
 *
 * Usage (from functions/):
 *   npx tsx src/scripts/seedDiceDemo.ts
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS or default Firebase credentials configured
 *   - The Firebase project must already exist (realyn-app)
 *
 * By default removes existing disputes for the DICE org before inserting (matches HTTP seed).
 * Set env DICE_SEED_APPEND=1 to skip deletion and only add rows.
 */

import * as admin from "firebase-admin";
import {
  DEMO_DISPUTES,
  buildDiceDisputeFirestoreData,
} from "../lib/diceDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  DICE_DEMO_EMAIL,
  DICE_DEMO_PASSWORD,
  DICE_ORG_ID,
} from "../lib/diceDemoConstants";

if (!admin.apps.length) {
  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  admin.initializeApp({ projectId });
}

function getDb(): admin.firestore.Firestore {
  return admin.firestore();
}

// ---------------------------------------------------------------------------
// 1. Organization
// ---------------------------------------------------------------------------

async function seedOrganization(db: admin.firestore.Firestore): Promise<string> {
  const docRef = db.collection("organizations").doc(DICE_ORG_ID);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`Organization "${DICE_ORG_ID}" already exists — skipping creation.`);
    return DICE_ORG_ID;
  }

  const now = admin.firestore.Timestamp.now();

  await docRef.set({
    name: "DICE",
    location: "London, UK",
    industry: "Ticketing",
    isDemo: true,
    teams: [
      { name: "Finance", email: "finance@dice.fm" },
      { name: "Operations", email: "ops@dice.fm" },
      { name: "Customer Support", email: "support@dice.fm" },
    ],
    documents: [
      {
        id: "doc_dice_1",
        name: "Refund Policy",
        category: "Cancellation Policy",
        fileName: "dice_refund_policy.pdf",
        fileSize: 98000,
      },
      {
        id: "doc_dice_2",
        name: "Terms of Service",
        category: "Terms of Service",
        fileName: "dice_terms_of_service.pdf",
        fileSize: 145000,
      },
    ],
    pspIntegrations: {
      stripe: {
        secretKey: "",
        webhookSecret: "",
        status: "connected",
      },
    },
    automationSettings: {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    users: [],
    createdAt: now,
    updatedAt: now,
  });

  console.log(`Created organization: DICE (${DICE_ORG_ID})`);
  return DICE_ORG_ID;
}

// ---------------------------------------------------------------------------
// 2. Demo user (Firebase Auth + Firestore users doc)
// ---------------------------------------------------------------------------

async function seedUser(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  let uid: string;

  try {
    const existing = await admin.auth().getUserByEmail(DICE_DEMO_EMAIL);
    uid = existing.uid;
    console.log(`Auth user ${DICE_DEMO_EMAIL} already exists (${uid}) — updating Firestore doc.`);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      const created = await admin.auth().createUser({
        email: DICE_DEMO_EMAIL,
        password: DICE_DEMO_PASSWORD,
        displayName: "DICE Demo",
        emailVerified: true,
      });
      uid = created.uid;
      console.log(`Created Auth user: ${DICE_DEMO_EMAIL} (${uid})`);
    } else {
      throw err;
    }
  }

  const now = admin.firestore.Timestamp.now();
  await db.collection("users").doc(uid).set(
    {
      name: "DICE Demo",
      email: DICE_DEMO_EMAIL,
      role: "user",
      organizationId,
      hotelName: "DICE",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  console.log(`Firestore user doc written for ${DICE_DEMO_EMAIL}`);
}

// ---------------------------------------------------------------------------
// 3. Ticketing-specific demo disputes
// ---------------------------------------------------------------------------

async function seedDisputes(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  const dateNow = new Date();
  const respondBy = new Date(dateNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  const tsNow = admin.firestore.Timestamp.now();

  if (process.env.DICE_SEED_APPEND !== "1") {
    const removed = await deleteDisputesForOrganization(db, organizationId);
    console.log(`Removed ${removed} existing dispute(s) for ${organizationId} before seeding.`);
  } else {
    console.log("DICE_SEED_APPEND=1 — appending disputes without deleting existing rows.");
  }

  for (let i = 0; i < DEMO_DISPUTES.length; i++) {
    const d = DEMO_DISPUTES[i];
    const data = buildDiceDisputeFirestoreData(d, i, organizationId, tsNow, respondBy);
    const ref = await db.collection("disputes").add(data);
    console.log(`  [${d.state}] ${d.reason}: ${ref.id}`);
  }

  console.log(`Seeded ${DEMO_DISPUTES.length} ticketing disputes.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DICE Demo Seed ===\n");
  const db = getDb();

  const orgId = await seedOrganization(db);
  await seedUser(db, orgId);
  await seedDisputes(db, orgId);

  console.log("\n=== Done ===");
  console.log(`\nLogin credentials:`);
  console.log(`  Email:    ${DICE_DEMO_EMAIL}`);
  console.log(`  Password: ${DICE_DEMO_PASSWORD}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

export { main as seedDiceDemo };
