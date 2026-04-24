import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { verifyUser, verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";

export const userWriteHandler = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    const { action } = req.body;

    try {
      const db = admin.firestore();

      switch (action) {
        case "submitContactSalesForm": {
          const { formData } = req.body;
          if (!formData?.email || !formData?.firstName || !formData?.lastName) {
            res.status(400).json({ success: false, error: "Missing required fields: firstName, lastName, email" });
            return;
          }

          const docRef = await db.collection("contactSalesSubmissions").add({
            ...formData,
            submittedAt: FieldValue.serverTimestamp(),
            status: "new",
          });

          res.json({ success: true, id: docRef.id });
          return;
        }

        case "acceptPolicyConsent": {
          const authResult = await verifyUser(req);
          if (!authResult.success) {
            sendAuthError(res, authResult);
            return;
          }

          const { tosVersion, privacyVersion } = req.body;
          if (!tosVersion || !privacyVersion) {
            res.status(400).json({ success: false, error: "Missing required fields: tosVersion, privacyVersion" });
            return;
          }

          await db.collection("users").doc(authResult.uid!).set(
            {
              tosAcceptedAt: FieldValue.serverTimestamp(),
              tosVersion,
              privacyAcceptedAt: FieldValue.serverTimestamp(),
              privacyVersion,
            },
            { merge: true }
          );

          res.json({ success: true });
          return;
        }

        case "updateUserProfile": {
          const authResult = await verifyUser(req);
          if (!authResult.success) {
            sendAuthError(res, authResult);
            return;
          }

          const { name, email, phone } = req.body;
          if (name === undefined && email === undefined && phone === undefined) {
            res.status(400).json({ success: false, error: "No fields to update. Provide at least one of: name, email, phone" });
            return;
          }

          const profileUpdate: Record<string, any> = {
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (name !== undefined) profileUpdate.name = name;
          if (email !== undefined) profileUpdate.email = email;
          if (phone !== undefined) profileUpdate.phone = phone;

          await db.collection("users").doc(authResult.uid!).set(
            profileUpdate,
            { merge: true }
          );

          res.json({ success: true });
          return;
        }

        case "updateUserPreferences": {
          const authResult = await verifyUser(req);
          if (!authResult.success) {
            sendAuthError(res, authResult);
            return;
          }

          const { preferences } = req.body;
          if (!preferences) {
            res.status(400).json({ success: false, error: "Missing required field: preferences" });
            return;
          }

          const userDoc = await db.collection("users").doc(authResult.uid!).get();
          const currentPreferences = userDoc.exists ? (userDoc.data()?.preferences || {}) : {};

          const merged = { ...currentPreferences, ...preferences };

          await db.collection("users").doc(authResult.uid!).set(
            {
              preferences: merged,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          res.json({ success: true, preferences: merged });
          return;
        }

        case "deleteContactSalesSubmission": {
          const adminAuth = await verifyAdmin(req);
          if (!adminAuth.success) {
            sendAuthError(res, adminAuth);
            return;
          }

          const { submissionId } = req.body;
          if (!submissionId) {
            res.status(400).json({ success: false, error: "Missing required field: submissionId" });
            return;
          }

          await db.collection("contactSalesSubmissions").doc(submissionId).delete();

          res.json({ success: true });
          return;
        }

        default:
          res.status(400).json({ success: false, error: `Unknown action: ${action}` });
          return;
      }
    } catch (error: any) {
      console.error("userWriteHandler error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);
