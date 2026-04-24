import * as admin from "firebase-admin";

/**
 * Dispute History Service
 * Handles archiving of disputes to the disputes_history collection
 */

/**
 * Archive a dispute to the history collection
 * This stores a complete snapshot of the dispute at the time of archiving
 */
export async function archiveDispute(disputeId: string): Promise<boolean> {
  const db = admin.firestore();

  try {
    // Get the dispute document
    const disputeDoc = await db.collection("disputes").doc(disputeId).get();
    
    if (!disputeDoc.exists) {
      console.error(`Dispute ${disputeId} not found for archiving`);
      return false;
    }

    const disputeData = disputeDoc.data();
    if (!disputeData) {
      console.error(`Dispute ${disputeId} has no data`);
      return false;
    }

    // Create archive document with all dispute data
    const archiveData = {
      ...disputeData,
      originalDisputeId: disputeId,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedDate: new Date().toISOString(),
    };

    // Save to disputes_history collection (use same document ID for easy lookup)
    await db.collection("disputes_history").doc(disputeId).set(archiveData, { merge: true });

    console.log(`Archived dispute ${disputeId} to history`);
    return true;
  } catch (error) {
    console.error(`Error archiving dispute ${disputeId}:`, error);
    return false;
  }
}

/**
 * Get all archived disputes for an organization
 */
export async function getArchivedDisputes(
  organizationId: string,
  limit: number = 100
): Promise<any[]> {
  const db = admin.firestore();

  try {
    const snapshot = await db
      .collection("disputes_history")
      .where("organizationId", "==", organizationId)
      .orderBy("archivedAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error fetching archived disputes:", error);
    return [];
  }
}

/**
 * Auto-archive disputes
 * Archives all disputes (or for a specific organization)
 * This can be called periodically or when dispute status changes
 */
export async function autoArchiveDisputes(
  organizationId?: string
): Promise<number> {
  const db = admin.firestore();
  let archivedCount = 0;

  try {
    // Build query - get all disputes or filter by organization
    let query: admin.firestore.Query = db.collection("disputes");

    if (organizationId) {
      query = query.where("organizationId", "==", organizationId);
    }

    const snapshot = await query.get();

    for (const doc of snapshot.docs) {
      // Archive each dispute (will update if already exists)
      const success = await archiveDispute(doc.id);
      if (success) {
        archivedCount++;
      }
    }

    console.log(`Auto-archived ${archivedCount} disputes${organizationId ? ` for organization ${organizationId}` : ""}`);
    return archivedCount;
  } catch (error) {
    console.error("Error in auto-archive:", error);
    return archivedCount;
  }
}

