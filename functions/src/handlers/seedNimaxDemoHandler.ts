/**
 * HTTP handler: seed Nimax Theatres demo org, user, and disputes (with evidence plans where defined).
 *
 * Admin-only. By default removes existing disputes for `nimax_ticketing` then inserts fresh rows
 * so re-running updates Firestore (avoids duplicate/stale rows without evidence plans).
 *
 * Body (JSON, optional): `{ "replaceDisputes": true }` (default true). Set `replaceDisputes: false`
 * to append new disputes without deleting existing ones for that org.
 *
 * Deploy: `firebase deploy --only functions:seedNimaxDemoData`
 *
 * Example (replace YOUR_PROJECT and ID token from an admin user):
 *   curl -sS -X POST "https://us-central1-YOUR_PROJECT.cloudfunctions.net/seedNimaxDemoData" \
 *     -H "Authorization: Bearer <ADMIN_ID_TOKEN>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"replaceDisputes":true}'
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { DEMO_DISPUTES, buildNimaxDisputeFirestoreData } from "../lib/nimaxDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  NIMAX_DEMO_EMAIL,
  NIMAX_DEMO_PASSWORD,
  NIMAX_ORG_ID,
} from "../lib/nimaxDemoConstants";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";
import { DEMO_SEEDED_POLICY_VERSION } from "../config/demoSeededPolicyVersion";
import { applyDemoUserClaims } from "../lib/demoSeedUserClaims";

const db = admin.firestore();

export const seedNimaxDemoData = onRequest(
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

      console.log("Starting Nimax Theatres demo seed...", { replaceDisputes });
      const now = admin.firestore.Timestamp.now();

      // 1. Create organization
      const orgRef = db.collection("organizations").doc(NIMAX_ORG_ID);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({
          name: "Nimax Theatres",
          location: "London, UK",
          industry: "Ticketing",
          isDemo: true,
          teams: [
            { name: "Box Office", email: "boxoffice@nimaxtheatres.com" },
            { name: "Finance", email: "finance@nimaxtheatres.com" },
            { name: "Customer Support", email: "support@nimaxtheatres.com" },
          ],
          documents: [
            { id: "doc_nimax_1", name: "Ticketing Terms & Conditions", category: "Terms of Service", fileName: "nimax_ticketing_terms.pdf", fileSize: 156000 },
            { id: "doc_nimax_2", name: "Refund & Exchange Policy", category: "Cancellation Policy", fileName: "nimax_refund_policy.pdf", fileSize: 112000 },
          ],
          pspIntegrations: { stripe: { secretKey: "", webhookSecret: "", status: "connected" } },
          automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
          users: [],
          createdAt: now,
          updatedAt: now,
        });
        console.log("Created Nimax Theatres organization");
      } else {
        await orgRef.set(
          {
            name: "Nimax Theatres",
            location: "London, UK",
            industry: "Ticketing",
            isDemo: true,
            updatedAt: now,
          },
          { merge: true },
        );
        console.log("Nimax Theatres organization already exists (merged demo fields)");
      }

      // 2. Create demo user
      let uid: string;
      try {
        const existing = await admin.auth().getUserByEmail(NIMAX_DEMO_EMAIL);
        uid = existing.uid;
        console.log(`User ${NIMAX_DEMO_EMAIL} already exists`);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          const created = await admin.auth().createUser({
            email: NIMAX_DEMO_EMAIL,
            password: NIMAX_DEMO_PASSWORD,
            displayName: "Nimax Demo",
            emailVerified: true,
          });
          uid = created.uid;
          console.log(`Created user ${NIMAX_DEMO_EMAIL}`);
        } else {
          throw err;
        }
      }
      await db.collection("users").doc(uid).set(
        {
          name: "Nimax Demo",
          email: NIMAX_DEMO_EMAIL,
          role: "user",
          organizationId: NIMAX_ORG_ID,
          hotelName: "Nimax Theatres",
          createdAt: now,
          updatedAt: now,
          tosAcceptedAt: now,
          tosVersion: DEMO_SEEDED_POLICY_VERSION,
          privacyAcceptedAt: now,
          privacyVersion: DEMO_SEEDED_POLICY_VERSION,
        },
        { merge: true },
      );
      await applyDemoUserClaims(uid, NIMAX_ORG_ID, "user");

      // 3. Optionally remove existing Nimax disputes, then seed
      let disputesDeleted = 0;
      if (replaceDisputes) {
        disputesDeleted = await deleteDisputesForOrganization(db, NIMAX_ORG_ID);
        console.log(`Deleted ${disputesDeleted} existing dispute(s) for ${NIMAX_ORG_ID}`);
      }

      const created: string[] = [];
      const respondBy = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < DEMO_DISPUTES.length; i++) {
        const d = DEMO_DISPUTES[i];
        const data = buildNimaxDisputeFirestoreData(d, i, NIMAX_ORG_ID, now, respondBy);
        const ref = await db.collection("disputes").add(data);
        created.push(`${d.reason} (${d.state}): ${ref.id}`);
      }

      console.log(`Seeded ${created.length} Nimax disputes`);

      res.status(200).json({
        success: true,
        message: `Nimax demo seeded: org=${NIMAX_ORG_ID}, user=${NIMAX_DEMO_EMAIL}, disputes=${created.length}`,
        organizationId: NIMAX_ORG_ID,
        credentials: { email: NIMAX_DEMO_EMAIL, password: NIMAX_DEMO_PASSWORD },
        replaceDisputes,
        disputesDeleted,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Nimax seed failed:", error);
      res.status(500).json({ error: "Failed to seed Nimax demo data", details: error.message });
    }
  },
);
