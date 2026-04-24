/**
 * HTTP handler: seed Zip World demo org, user, and disputes (with evidence plans where defined).
 *
 * Admin-only. By default removes existing disputes for `zipworld_adventures` then inserts fresh rows
 * so re-running updates Firestore (avoids duplicate/stale rows without evidence plans).
 *
 * Body (JSON, optional): `{ "replaceDisputes": true }` (default true). Set `replaceDisputes: false`
 * to append new disputes without deleting existing ones for that org.
 *
 * Deploy: `firebase deploy --only functions:seedZipworldDemoData`
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { DEMO_DISPUTES, buildZipworldDisputeFirestoreData } from "../lib/zipworldDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  ZIPWORLD_DEMO_EMAIL,
  ZIPWORLD_DEMO_PASSWORD,
  ZIPWORLD_ORG_ID,
} from "../lib/zipworldDemoConstants";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";
import { DEMO_SEEDED_POLICY_VERSION } from "../config/demoSeededPolicyVersion";
import { applyDemoUserClaims } from "../lib/demoSeedUserClaims";

const db = admin.firestore();

export const seedZipworldDemoData = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    if (!shouldEnableTestHandlers()) {
      res.status(403).json({ error: "Seed handlers are disabled in production." });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const replaceDisputes = body.replaceDisputes !== false;

      console.log("Starting Zip World demo seed...", { replaceDisputes });
      const now = admin.firestore.Timestamp.now();

      const orgRef = db.collection("organizations").doc(ZIPWORLD_ORG_ID);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({
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
            { id: "doc_zw_1", name: "Terms & Conditions", category: "Terms of Service", fileName: "zipworld_terms_conditions.pdf", fileSize: 178000 },
            { id: "doc_zw_2", name: "Cancellation & Weather Policy", category: "Cancellation Policy", fileName: "zipworld_cancellation_weather_policy.pdf", fileSize: 134000 },
            { id: "doc_zw_3", name: "Acknowledgement of Risk Form", category: "Other", fileName: "zipworld_risk_acknowledgement.pdf", fileSize: 89000 },
          ],
          pspIntegrations: { adyen: { apiKey: "", merchantAccount: "ZipWorldLTD", webhookUsername: "", webhookPassword: "", status: "connected" } },
          automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
          users: [],
          createdAt: now,
          updatedAt: now,
        });
        console.log("Created Zip World organization");
      } else {
        await orgRef.set(
          {
            name: "Zip World",
            location: "Bethesda, North Wales",
            industry: "Adventure & Experiences",
            isDemo: true,
            updatedAt: now,
          },
          { merge: true },
        );
        console.log("Zip World organization already exists (merged demo fields)");
      }

      let uid: string;
      try {
        const existing = await admin.auth().getUserByEmail(ZIPWORLD_DEMO_EMAIL);
        uid = existing.uid;
        console.log(`User ${ZIPWORLD_DEMO_EMAIL} already exists`);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          const created = await admin.auth().createUser({
            email: ZIPWORLD_DEMO_EMAIL,
            password: ZIPWORLD_DEMO_PASSWORD,
            displayName: "Zip World Demo",
            emailVerified: true,
          });
          uid = created.uid;
          console.log(`Created user ${ZIPWORLD_DEMO_EMAIL}`);
        } else {
          throw err;
        }
      }
      await db.collection("users").doc(uid).set(
        {
          name: "Zip World Demo",
          email: ZIPWORLD_DEMO_EMAIL,
          role: "user",
          organizationId: ZIPWORLD_ORG_ID,
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
      await applyDemoUserClaims(uid, ZIPWORLD_ORG_ID, "user");

      let disputesDeleted = 0;
      if (replaceDisputes) {
        disputesDeleted = await deleteDisputesForOrganization(db, ZIPWORLD_ORG_ID);
        console.log(`Deleted ${disputesDeleted} existing dispute(s) for ${ZIPWORLD_ORG_ID}`);
      }

      const created: string[] = [];
      const respondBy = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < DEMO_DISPUTES.length; i++) {
        const d = DEMO_DISPUTES[i];
        const data = buildZipworldDisputeFirestoreData(d, i, ZIPWORLD_ORG_ID, now, respondBy);
        const ref = await db.collection("disputes").add(data);
        created.push(`${d.reason} (${d.state}): ${ref.id}`);
      }

      console.log(`Seeded ${created.length} Zip World disputes`);

      res.status(200).json({
        success: true,
        message: `Zip World demo seeded: org=${ZIPWORLD_ORG_ID}, user=${ZIPWORLD_DEMO_EMAIL}, disputes=${created.length}`,
        organizationId: ZIPWORLD_ORG_ID,
        credentials: { email: ZIPWORLD_DEMO_EMAIL, password: ZIPWORLD_DEMO_PASSWORD },
        replaceDisputes,
        disputesDeleted,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Zip World seed failed:", error);
      res.status(500).json({ error: "Failed to seed Zip World demo data", details: error.message });
    }
  },
);
