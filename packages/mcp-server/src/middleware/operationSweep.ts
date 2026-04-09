import * as admin from "firebase-admin";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function sweepStaleOperations(): Promise<number> {
  const db = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - STALE_THRESHOLD_MS);

  const staleOps = await db
    .collection("operations")
    .where("status", "in", ["queued", "running"])
    .where("startedAt", "<", cutoff)
    .limit(50)
    .get();

  if (staleOps.empty) return 0;

  const batch = db.batch();
  for (const doc of staleOps.docs) {
    batch.update(doc.ref, {
      status: "failed",
      finishedAt: admin.firestore.Timestamp.now(),
      error: { code: "TIMEOUT", message: "Operation timed out after 5 minutes" },
    });
  }
  await batch.commit();

  console.log(`Swept ${staleOps.size} stale operations`);
  return staleOps.size;
}
