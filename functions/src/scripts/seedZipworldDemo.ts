/**
 * Seed script to create a Zip World demo organization, user, and adventure disputes.
 *
 * Usage (from functions/):
 *   npm run seed:zipworld                # cloud project (ADC / service account)
 *   npm run seed:zipworld:emulator       # local emulators (requires emulator hosts in .env.emulator.seed)
 *
 * Prerequisites:
 *   - Cloud: GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default login
 *   - Emulators: `firebase emulators:start` running; uses FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 *
 * By default removes existing disputes for the Zip World org before inserting (matches HTTP seed).
 * Set env ZIPWORLD_SEED_APPEND=1 to skip deletion and only add rows.
 */

import * as admin from "firebase-admin";
import {
  DEMO_DISPUTES,
  buildZipworldDisputeFirestoreData,
} from "../lib/zipworldDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  ZIPWORLD_DEMO_EMAIL,
  ZIPWORLD_DEMO_PASSWORD,
  ZIPWORLD_ORG_ID,
} from "../lib/zipworldDemoConstants";
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

async function seedOrganization(db: admin.firestore.Firestore): Promise<string> {
  const docRef = db.collection("organizations").doc(ZIPWORLD_ORG_ID);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`Organization "${ZIPWORLD_ORG_ID}" already exists — skipping creation.`);
    return ZIPWORLD_ORG_ID;
  }

  const now = admin.firestore.Timestamp.now();

  await docRef.set({
    name: "Zip World",
    location: "Bethesda, North Wales",
    industry: "Adventure & Experiences",
    isDemo: true,
    teams: [
      { name: "Guest Experience", email: "guest.experience@zipworld.co.uk" },
      { name: "Finance", email: "finance@zipworld.co.uk" },
      { name: "Bookings", email: "bookings@zipworld.co.uk" },
    ],
    documents: [
      {
        id: "doc_zw_1",
        name: "Terms & Conditions",
        category: "Terms of Service",
        fileName: "zipworld_terms_conditions.pdf",
        fileSize: 178000,
      },
      {
        id: "doc_zw_2",
        name: "Cancellation & Weather Policy",
        category: "Cancellation Policy",
        fileName: "zipworld_cancellation_weather_policy.pdf",
        fileSize: 134000,
      },
      {
        id: "doc_zw_3",
        name: "Acknowledgement of Risk Form",
        category: "Other",
        fileName: "zipworld_risk_acknowledgement.pdf",
        fileSize: 89000,
      },
    ],
    pspIntegrations: {
      adyen: {
        apiKey: "",
        merchantAccount: "ZipWorldLTD",
        webhookUsername: "",
        webhookPassword: "",
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

  console.log(`Created organization: Zip World (${ZIPWORLD_ORG_ID})`);
  return ZIPWORLD_ORG_ID;
}

async function seedUser(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  let uid: string;

  try {
    const existing = await admin.auth().getUserByEmail(ZIPWORLD_DEMO_EMAIL);
    uid = existing.uid;
    console.log(`Auth user ${ZIPWORLD_DEMO_EMAIL} already exists (${uid}) — updating Firestore doc.`);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      const created = await admin.auth().createUser({
        email: ZIPWORLD_DEMO_EMAIL,
        password: ZIPWORLD_DEMO_PASSWORD,
        displayName: "Zip World Demo",
        emailVerified: true,
      });
      uid = created.uid;
      console.log(`Created Auth user: ${ZIPWORLD_DEMO_EMAIL} (${uid})`);
    } else {
      throw err;
    }
  }

  const now = admin.firestore.Timestamp.now();
  await db.collection("users").doc(uid).set(
    {
      name: "Zip World Demo",
      email: ZIPWORLD_DEMO_EMAIL,
      role: "user",
      organizationId,
      hotelName: "Zip World",
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

  console.log(`Firestore user doc written for ${ZIPWORLD_DEMO_EMAIL}`);
}

async function seedDisputes(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  const dateNow = new Date();
  const respondBy = new Date(dateNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  const tsNow = admin.firestore.Timestamp.now();

  if (process.env.ZIPWORLD_SEED_APPEND !== "1") {
    const removed = await deleteDisputesForOrganization(db, organizationId);
    console.log(`Removed ${removed} existing dispute(s) for ${organizationId} before seeding.`);
  } else {
    console.log("ZIPWORLD_SEED_APPEND=1 — appending disputes without deleting existing rows.");
  }

  for (let i = 0; i < DEMO_DISPUTES.length; i++) {
    const d = DEMO_DISPUTES[i];
    const data = buildZipworldDisputeFirestoreData(d, i, organizationId, tsNow, respondBy);
    const ref = await db.collection("disputes").add(data);
    console.log(`  [${d.state}] ${d.reason}: ${ref.id}`);
  }

  console.log(`Seeded ${DEMO_DISPUTES.length} adventure disputes.`);
}

async function main() {
  console.log("=== Zip World Demo Seed ===\n");
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
  console.log(`  Email:    ${ZIPWORLD_DEMO_EMAIL}`);
  console.log(`  Password: ${ZIPWORLD_DEMO_PASSWORD}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

export { main as seedZipworldDemo };
