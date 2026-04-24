/**
 * Seed script to create an Attraction World Group demo organization, user, and experience-distribution disputes.
 *
 * Usage (from functions/):
 *   npm run seed:attractionworld                   # cloud project (ADC / service account)
 *   npm run seed:attractionworld:emulator          # local emulators (requires emulator hosts in .env.emulator.seed)
 *
 * Prerequisites:
 *   - Cloud: GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default login
 *   - Emulators: `firebase emulators:start` running; uses FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 *
 * By default removes existing disputes for the AWG org before inserting (matches HTTP seed).
 * Set env ATTRACTIONWORLD_SEED_APPEND=1 to skip deletion and only add rows.
 */

import * as admin from "firebase-admin";
import {
  DEMO_DISPUTES,
  buildAttractionworldDisputeFirestoreData,
} from "../lib/attractionworldDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  ATTRACTIONWORLD_DEMO_EMAIL,
  ATTRACTIONWORLD_DEMO_PASSWORD,
  ATTRACTIONWORLD_ORG_ID,
} from "../lib/attractionworldDemoConstants";
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
  const docRef = db.collection("organizations").doc(ATTRACTIONWORLD_ORG_ID);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`Organization "${ATTRACTIONWORLD_ORG_ID}" already exists — skipping creation.`);
    return ATTRACTIONWORLD_ORG_ID;
  }

  const now = admin.firestore.Timestamp.now();

  await docRef.set({
    name: "Attraction World Group",
    location: "United Kingdom",
    industry: "Travel & Experiences",
    isDemo: true,
    teams: [
      { name: "Partner Support", email: "partners@attractionworldgroup.com" },
      { name: "Finance", email: "finance@attractionworldgroup.com" },
      { name: "Integrations", email: "integrations@attractionworldgroup.com" },
    ],
    documents: [
      {
        id: "doc_awg_1",
        name: "Distribution & API Terms",
        category: "Terms of Service",
        fileName: "awg_distribution_terms.pdf",
        fileSize: 168000,
      },
      {
        id: "doc_awg_2",
        name: "Experience Booking & Refund Policy",
        category: "Cancellation Policy",
        fileName: "awg_experience_refund_policy.pdf",
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

  console.log(`Created organization: Attraction World Group (${ATTRACTIONWORLD_ORG_ID})`);
  return ATTRACTIONWORLD_ORG_ID;
}

async function seedUser(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  let uid: string;

  try {
    const existing = await admin.auth().getUserByEmail(ATTRACTIONWORLD_DEMO_EMAIL);
    uid = existing.uid;
    console.log(`Auth user ${ATTRACTIONWORLD_DEMO_EMAIL} already exists (${uid}) — updating Firestore doc.`);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      const created = await admin.auth().createUser({
        email: ATTRACTIONWORLD_DEMO_EMAIL,
        password: ATTRACTIONWORLD_DEMO_PASSWORD,
        displayName: "AWG Demo",
        emailVerified: true,
      });
      uid = created.uid;
      console.log(`Created Auth user: ${ATTRACTIONWORLD_DEMO_EMAIL} (${uid})`);
    } else {
      throw err;
    }
  }

  const now = admin.firestore.Timestamp.now();
  await db.collection("users").doc(uid).set(
    {
      name: "AWG Demo",
      email: ATTRACTIONWORLD_DEMO_EMAIL,
      role: "user",
      organizationId,
      hotelName: "Attraction World Group",
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

  console.log(`Firestore user doc written for ${ATTRACTIONWORLD_DEMO_EMAIL}`);
}

async function seedDisputes(db: admin.firestore.Firestore, organizationId: string): Promise<void> {
  const dateNow = new Date();
  const respondBy = new Date(dateNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  const tsNow = admin.firestore.Timestamp.now();

  if (process.env.ATTRACTIONWORLD_SEED_APPEND !== "1") {
    const removed = await deleteDisputesForOrganization(db, organizationId);
    console.log(`Removed ${removed} existing dispute(s) for ${organizationId} before seeding.`);
  } else {
    console.log("ATTRACTIONWORLD_SEED_APPEND=1 — appending disputes without deleting existing rows.");
  }

  for (let i = 0; i < DEMO_DISPUTES.length; i++) {
    const d = DEMO_DISPUTES[i];
    const data = buildAttractionworldDisputeFirestoreData(d, i, organizationId, tsNow, respondBy);
    const ref = await db.collection("disputes").add(data);
    console.log(`  [${d.state}] ${d.reason}: ${ref.id}`);
  }

  console.log(`Seeded ${DEMO_DISPUTES.length} experience-distribution disputes.`);
}

async function main() {
  console.log("=== Attraction World Group Demo Seed ===\n");
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
  console.log(`  Email:    ${ATTRACTIONWORLD_DEMO_EMAIL}`);
  console.log(`  Password: ${ATTRACTIONWORLD_DEMO_PASSWORD}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

export { main as seedAttractionworldDemo };
