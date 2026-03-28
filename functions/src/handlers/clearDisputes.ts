import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { shouldEnableTestHandlers } from "../config/environment";

export const clearDisputesHandler = onRequest(
  {
    cors: true,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (!shouldEnableTestHandlers()) {
      res.status(403).json({ error: "Test handlers disabled in production" });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      console.log(`Admin ${authResult.uid} initiated clearing all disputes...`);
      
      const db = admin.firestore();
      const disputesRef = db.collection("disputes");
      
      // Get all disputes
      const snapshot = await disputesRef.get();
      
      if (snapshot.empty) {
        res.status(200).json({
          success: true,
          message: "No disputes to delete",
          deletedCount: 0,
        });
        return;
      }

      // Delete in batches of 500 (Firestore limit)
      const batchSize = 500;
      const docs = snapshot.docs;
      let deletedCount = 0;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        deletedCount += batchDocs.length;
        console.log(`Deleted ${batchDocs.length} disputes (${deletedCount}/${docs.length})`);
      }

      res.status(200).json({
        success: true,
        message: "All disputes cleared",
        deletedCount: deletedCount,
      });
    } catch (error: any) {
      console.error("Error clearing disputes:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to clear disputes",
      });
    }
  }
);
