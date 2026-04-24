/**
 * HTTP handler: seed Skiddle demo org, user, and disputes (with evidence plans where defined).
 *
 * Admin-only. By default removes existing disputes for `skiddle_ticketing` then inserts fresh rows
 * so re-running updates Firestore (avoids duplicate/stale rows without evidence plans).
 *
 * Body (JSON, optional): `{ "replaceDisputes": true }` (default true). Set `replaceDisputes: false`
 * to append new disputes without deleting existing ones for that org.
 *
 * Deploy: `firebase deploy --only functions:seedSkiddleDemoData`
 *
 * Example (replace YOUR_PROJECT and ID token from an admin user):
 *   curl -sS -X POST "https://us-central1-YOUR_PROJECT.cloudfunctions.net/seedSkiddleDemoData" \
 *     -H "Authorization: Bearer <ADMIN_ID_TOKEN>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"replaceDisputes":true}'
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { DEMO_DISPUTES, buildSkiddleDisputeFirestoreData } from "../lib/skiddleDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  SKIDDLE_DEMO_EMAIL,
  SKIDDLE_DEMO_PASSWORD,
  SKIDDLE_ORG_ID,
} from "../lib/skiddleDemoConstants";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";
import { DEMO_SEEDED_POLICY_VERSION } from "../config/demoSeededPolicyVersion";
import { applyDemoUserClaims } from "../lib/demoSeedUserClaims";

const db = admin.firestore();

export const seedSkiddleDemoData = onRequest(
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

      console.log("Starting Skiddle demo seed...", { replaceDisputes });
      const now = admin.firestore.Timestamp.now();

      // 1. Create organization
      const orgRef = db.collection("organizations").doc(SKIDDLE_ORG_ID);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({
          name: "Skiddle",
          location: "Manchester, UK",
          industry: "Event ticketing",
          isDemo: true,
          teams: [
            { name: "Customer Support", email: "support@skiddle.com" },
            { name: "Finance", email: "finance@skiddle.com" },
            { name: "Promoter Relations", email: "promoters@skiddle.com" },
          ],
          documents: [
            { id: "doc_skiddle_1", name: "Skiddle Terms & Conditions", category: "Terms of Service", fileName: "skiddle_terms.pdf", fileSize: 168000 },
            { id: "doc_skiddle_2", name: "Refunds, Cool:Off & Re:Sell Policy", category: "Cancellation Policy", fileName: "skiddle_refund_resell.pdf", fileSize: 124000 },
          ],
          pspIntegrations: { stripe: { secretKey: "", webhookSecret: "", status: "connected" } },
          automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
          users: [],
          createdAt: now,
          updatedAt: now,
        });
        console.log("Created Skiddle organization");
      } else {
        await orgRef.set(
          {
            name: "Skiddle",
            location: "Manchester, UK",
            industry: "Event ticketing",
            isDemo: true,
            updatedAt: now,
          },
          { merge: true },
        );
        console.log("Skiddle organization already exists (merged demo fields)");
      }

      // 2. Create demo user
      let uid: string;
      try {
        const existing = await admin.auth().getUserByEmail(SKIDDLE_DEMO_EMAIL);
        uid = existing.uid;
        console.log(`User ${SKIDDLE_DEMO_EMAIL} already exists`);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          const created = await admin.auth().createUser({
            email: SKIDDLE_DEMO_EMAIL,
            password: SKIDDLE_DEMO_PASSWORD,
            displayName: "Skiddle Demo",
            emailVerified: true,
          });
          uid = created.uid;
          console.log(`Created user ${SKIDDLE_DEMO_EMAIL}`);
        } else {
          throw err;
        }
      }
      await db.collection("users").doc(uid).set(
        {
          name: "Skiddle Demo",
          email: SKIDDLE_DEMO_EMAIL,
          role: "user",
          organizationId: SKIDDLE_ORG_ID,
          hotelName: "Skiddle Ticketing",
          createdAt: now,
          updatedAt: now,
          tosAcceptedAt: now,
          tosVersion: DEMO_SEEDED_POLICY_VERSION,
          privacyAcceptedAt: now,
          privacyVersion: DEMO_SEEDED_POLICY_VERSION,
        },
        { merge: true },
      );
      await applyDemoUserClaims(uid, SKIDDLE_ORG_ID, "user");

      // 3. Optionally remove existing Skiddle disputes, then seed
      let disputesDeleted = 0;
      if (replaceDisputes) {
        disputesDeleted = await deleteDisputesForOrganization(db, SKIDDLE_ORG_ID);
        console.log(`Deleted ${disputesDeleted} existing dispute(s) for ${SKIDDLE_ORG_ID}`);
      }

      const created: string[] = [];
      const respondBy = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < DEMO_DISPUTES.length; i++) {
        const d = DEMO_DISPUTES[i];
        const data = buildSkiddleDisputeFirestoreData(d, i, SKIDDLE_ORG_ID, now, respondBy);
        const ref = await db.collection("disputes").add(data);
        created.push(`${d.reason} (${d.state}): ${ref.id}`);
      }

      console.log(`Seeded ${created.length} Skiddle disputes`);

      res.status(200).json({
        success: true,
        message: `Skiddle demo seeded: org=${SKIDDLE_ORG_ID}, user=${SKIDDLE_DEMO_EMAIL}, disputes=${created.length}`,
        organizationId: SKIDDLE_ORG_ID,
        credentials: { email: SKIDDLE_DEMO_EMAIL, password: SKIDDLE_DEMO_PASSWORD },
        replaceDisputes,
        disputesDeleted,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Skiddle seed failed:", error);
      res.status(500).json({ error: "Failed to seed Skiddle demo data", details: error.message });
    }
  },
);
