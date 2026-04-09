/**
 * Seed script to create a Skiddle demo organization, user, and ticketing disputes.
 *
 * Usage (from functions/):
 *   npm run seed:skiddle                   # cloud project (ADC / service account)
 *   npm run seed:skiddle:emulator          # local emulators (requires emulator hosts in .env.emulator.seed)
 *
 * Prerequisites:
 *   - Cloud: GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default login
 *   - Emulators: `firebase emulators:start` running; uses FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 *
 * By default removes existing disputes for the Skiddle org before inserting (matches HTTP seed).
 * Set env SKIDDLE_SEED_APPEND=1 to skip deletion and only add rows.
 */

import * as admin from "firebase-admin";
import {
  DEMO_DISPUTES,
  buildSkiddleDisputeFirestoreData,
} from "../lib/skiddleDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  SKIDDLE_DEMO_EMAIL,
  SKIDDLE_DEMO_PASSWORD,
  SKIDDLE_ORG_ID,
} from "../lib/skiddleDemoConstants";
import { DEMO_SEEDED_POLICY_VERSION } from "../config/demoSeededPolicyVersion";
import { applyDemoUserClaims } from "../lib/demoSeedUserClaims";

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
  const docRef = db.collection("organizations").doc(SKIDDLE_ORG_ID);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`Organization "${SKIDDLE_ORG_ID}" already exists — skipping creation.`);
    return SKIDDLE_ORG_ID;
  }

  const now = admin.firestore.Timestamp.now();

  await docRef.set({
    name: "Skiddle",
    location: "Manchester, UK",
    industry: "Event ticketing",
    isDemo: true,
    teams: [
      { name: "Customer Support", email: "support@skiddle.com" },
      { name: "Finance", email: "finance@skiddle.com" },
      { name: "Promoter Relations", email: "promoters@skiddle.com" },
    ],
    documents: [
      {
        id: "doc_skiddle_1",
        name: "Skiddle Terms & Conditions",
        category: "Terms of Service",
        fileName: "skiddle_terms.pdf",
        fileSize: 168000,
      },
      {
        id: "doc_skiddle_2",
        name: "Refunds, Cool:Off & Re:Sell Policy",
        category: "Cancellation Policy",
        fileName: "skiddle_refund_resell.pdf",
        fileSize: 124000,
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

  console.log(`Created organization: Skiddle (${SKIDDLE_ORG_ID})`);
  return SKIDDLE_ORG_ID;
}

// ---------------------------------------------------------------------------
// 2. Demo user (Firebase Auth + Firestore users doc)
// ---------------------------------------------------------------------------

async function seedUser(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  let uid: string;

  try {
    const existing = await admin.auth().getUserByEmail(SKIDDLE_DEMO_EMAIL);
    uid = existing.uid;
    console.log(`Auth user ${SKIDDLE_DEMO_EMAIL} already exists (${uid}) — updating Firestore doc.`);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      const created = await admin.auth().createUser({
        email: SKIDDLE_DEMO_EMAIL,
        password: SKIDDLE_DEMO_PASSWORD,
        displayName: "Skiddle Demo",
        emailVerified: true,
      });
      uid = created.uid;
      console.log(`Created Auth user: ${SKIDDLE_DEMO_EMAIL} (${uid})`);
    } else {
      throw err;
    }
  }

  const now = admin.firestore.Timestamp.now();
  await db.collection("users").doc(uid).set(
    {
      name: "Skiddle Demo",
      email: SKIDDLE_DEMO_EMAIL,
      role: "user",
      organizationId,
      hotelName: "Skiddle Ticketing",
      createdAt: now,
      updatedAt: now,
      tosAcceptedAt: now,
      tosVersion: DEMO_SEEDED_POLICY_VERSION,
      privacyAcceptedAt: now,
      privacyVersion: DEMO_SEEDED_POLICY_VERSION,
    },
    { merge: true },
  );
  await applyDemoUserClaims(uid, organizationId, "user");

  console.log(`Firestore user doc written for ${SKIDDLE_DEMO_EMAIL}`);
}

// ---------------------------------------------------------------------------
// 3. Ticketing-specific demo disputes
// ---------------------------------------------------------------------------

async function seedDisputes(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  const dateNow = new Date();
  const respondBy = new Date(dateNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  const tsNow = admin.firestore.Timestamp.now();

  if (process.env.SKIDDLE_SEED_APPEND !== "1") {
    const removed = await deleteDisputesForOrganization(db, organizationId);
    console.log(`Removed ${removed} existing dispute(s) for ${organizationId} before seeding.`);
  } else {
    console.log("SKIDDLE_SEED_APPEND=1 — appending disputes without deleting existing rows.");
  }

  for (let i = 0; i < DEMO_DISPUTES.length; i++) {
    const d = DEMO_DISPUTES[i];
    const data = buildSkiddleDisputeFirestoreData(d, i, organizationId, tsNow, respondBy);
    const ref = await db.collection("disputes").add(data);
    console.log(`  [${d.state}] ${d.reason}: ${ref.id}`);
  }

  console.log(`Seeded ${DEMO_DISPUTES.length} ticketing disputes.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Skiddle Demo Seed ===\n");
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log(`Auth emulator: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
  }
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("Targeting cloud Firestore (no FIRESTORE_EMULATOR_HOST).\n");
  } else {
    console.log("");
  }
  const db = getDb();

  const orgId = await seedOrganization(db);
  await seedUser(db, orgId);
  await seedDisputes(db, orgId);

  console.log("\n=== Done ===");
  console.log(`\nLogin credentials:`);
  console.log(`  Email:    ${SKIDDLE_DEMO_EMAIL}`);
  console.log(`  Password: ${SKIDDLE_DEMO_PASSWORD}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

export { main as seedSkiddleDemo };
