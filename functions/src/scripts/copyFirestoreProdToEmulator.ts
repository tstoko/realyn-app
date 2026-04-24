/**
 * Copy production Firestore data into the local emulator.
 *
 * Prerequisites:
 *   1. Firestore emulator running on 127.0.0.1:8080 (npm run dev:emulators from repo root)
 *   2. Authenticated with production read access:
 *        gcloud auth application-default login
 *      or GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key.
 *
 * Usage (from functions/):
 *   npm run build && CONFIRM_COPY=yes node lib/scripts/copyFirestoreProdToEmulator.js
 *
 * Environment variables:
 *   CONFIRM_COPY=yes              Required safety gate
 *   FIRESTORE_EMULATOR_HOST       Emulator address (default 127.0.0.1:8080)
 *   GCLOUD_PROJECT / GCP_PROJECT  Source project ID (default realyn-app)
 *
 * WARNING: This reads ALL data from production Firestore and writes it to the
 * emulator. Be mindful of PII / compliance requirements for your environment.
 */

import * as admin from "firebase-admin";

const BATCH_SIZE = 500;
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";

const TOP_LEVEL_COLLECTIONS = [
  "organizations",
  "users",
  "disputes",
  "disputes_history",
  "unmatchedWebhookEvents",
  "_rateLimits",
  "contactSalesSubmissions",
];

let totalDocsCopied = 0;

function initSourceDb(): admin.firestore.Firestore {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, "source");
  return app.firestore();
}

function initEmulatorDb(): admin.firestore.Firestore {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, "emulator");
  const db = app.firestore();
  db.settings({ host: EMULATOR_HOST, ssl: false });
  return db;
}

async function copyCollection(
  sourceDb: admin.firestore.Firestore,
  emulatorDb: admin.firestore.Firestore,
  sourcePath: string
): Promise<number> {
  const snapshot = await sourceDb.collection(sourcePath).get();
  if (snapshot.empty) return 0;

  let copied = 0;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = emulatorDb.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const doc of chunk) {
      batch.set(emulatorDb.doc(`${sourcePath}/${doc.id}`), doc.data());
    }

    await batch.commit();
    copied += chunk.length;
  }

  // Recursively copy subcollections for each document
  for (const doc of docs) {
    const subcollections = await doc.ref.listCollections();
    for (const sub of subcollections) {
      const subPath = `${sourcePath}/${doc.id}/${sub.id}`;
      const subCopied = await copyCollection(sourceDb, emulatorDb, subPath);
      if (subCopied > 0) {
        console.log(`  ${subPath}: ${subCopied} docs`);
      }
    }
  }

  return copied;
}

async function main(): Promise<void> {
  if (process.env.CONFIRM_COPY !== "yes") {
    console.error(
      "Safety gate: set CONFIRM_COPY=yes to run this script.\n" +
        "This will READ from production Firestore and WRITE to the local emulator."
    );
    process.exit(1);
  }

  console.log(`Source project:  ${PROJECT_ID}`);
  console.log(`Emulator host:   ${EMULATOR_HOST}`);
  console.log("==========================================\n");

  const sourceDb = initSourceDb();
  const emulatorDb = initEmulatorDb();

  for (const collection of TOP_LEVEL_COLLECTIONS) {
    process.stdout.write(`Copying ${collection}...`);
    try {
      const count = await copyCollection(sourceDb, emulatorDb, collection);
      totalDocsCopied += count;
      console.log(` ${count} docs`);
    } catch (err: any) {
      console.error(` FAILED: ${err.message}`);
    }
  }

  console.log(`\n==========================================`);
  console.log(`Done. ${totalDocsCopied} top-level documents copied.`);
  console.log(
    "Note: Auth users and Storage files are NOT copied.\n" +
      "Run seedUsersHandler against the emulator to create login-able users."
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}
