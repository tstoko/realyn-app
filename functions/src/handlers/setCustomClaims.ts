import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";

/**
 * Firestore trigger that syncs user document fields to Firebase Auth custom claims.
 * Runs on every write to users/{uid} so that Firestore security rules can use
 * request.auth.token.orgId and request.auth.token.role without a Firestore read.
 */
export const syncUserClaims = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after?.data();

    if (!after) {
      // Document deleted — clear custom claims
      await admin.auth().setCustomUserClaims(uid, {});
      console.log(`Cleared custom claims for deleted user ${uid}`);
      return;
    }

    const newClaims = {
      orgId: after.organizationId || null,
      role: after.role || "user",
    };

    // Only update if claims actually changed to avoid unnecessary writes
    try {
      const userRecord = await admin.auth().getUser(uid);
      const currentClaims = userRecord.customClaims || {};

      if (currentClaims.orgId === newClaims.orgId && currentClaims.role === newClaims.role) {
        return;
      }
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        console.warn(`Auth user ${uid} not found — Firestore doc exists without Auth record`);
        return;
      }
      throw error;
    }

    await admin.auth().setCustomUserClaims(uid, newClaims);
    console.log(`Synced custom claims for ${uid}: orgId=${newClaims.orgId}, role=${newClaims.role}`);
  }
);

/**
 * One-time migration endpoint: iterates all Firestore user docs and sets custom claims.
 * Run once after deploying syncUserClaims, then gate or remove.
 * Requires admin authentication.
 */
export const migrateCustomClaims = onRequest(
  { cors: true },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      const db = admin.firestore();
      const usersSnapshot = await db.collection("users").get();

      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        const uid = doc.id;

        try {
          await admin.auth().setCustomUserClaims(uid, {
            orgId: data.organizationId || null,
            role: data.role || "user",
          });
          updated++;
        } catch (error: any) {
          if (error.code === "auth/user-not-found") {
            skipped++;
          } else {
            errors++;
            console.error(`Failed to set claims for ${uid}:`, error.message);
          }
        }
      }

      res.json({
        success: true,
        message: `Migration complete: ${updated} updated, ${skipped} skipped (no Auth record), ${errors} errors`,
        updated,
        skipped,
        errors,
      });
    } catch (error: any) {
      console.error("Migration failed:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
