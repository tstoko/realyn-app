import * as admin from "firebase-admin";

/**
 * Deletes all disputes for an organization (batch commits, max 500 ops per batch).
 * Used before re-seeding DICE demo data so evidence plans are not stale.
 */
export async function deleteDisputesForOrganization(
  db: admin.firestore.Firestore,
  organizationId: string,
): Promise<number> {
  const snap = await db.collection("disputes").where("organizationId", "==", organizationId).get();
  if (snap.empty) return 0;

  let batch = db.batch();
  let total = 0;
  let inBatch = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    total++;
    inBatch++;
    if (inBatch >= 500) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batch.commit();
  }
  return total;
}
