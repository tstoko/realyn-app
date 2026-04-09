/**
 * HTTP handler: seed Sadler's Wells demo org, user, and disputes (with evidence plans where defined).
 *
 * Admin-only. By default removes existing disputes for `sadlerswells_ticketing` then inserts fresh rows
 * so re-running updates Firestore (avoids duplicate/stale rows without evidence plans).
 *
 * Body (JSON, optional): `{ "replaceDisputes": true }` (default true). Set `replaceDisputes: false`
 * to append new disputes without deleting existing ones for that org.
 *
 * Deploy: `firebase deploy --only functions:seedSadlersWellsDemoData`
 *
 * Example (replace YOUR_PROJECT and ID token from an admin user):
 *   curl -sS -X POST "https://us-central1-YOUR_PROJECT.cloudfunctions.net/seedSadlersWellsDemoData" \
 *     -H "Authorization: Bearer <ADMIN_ID_TOKEN>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"replaceDisputes":true}'
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { DEMO_DISPUTES, buildSadlersWellsDisputeFirestoreData } from "../lib/sadlerswellsDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  SADLERS_WELLS_DEMO_EMAIL,
  SADLERS_WELLS_DEMO_PASSWORD,
  SADLERS_WELLS_ORG_ID,
} from "../lib/sadlerswellsDemoConstants";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";
import { DEMO_SEEDED_POLICY_VERSION } from "../config/demoSeededPolicyVersion";
import { applyDemoUserClaims } from "../lib/demoSeedUserClaims";

const db = admin.firestore();

export const seedSadlersWellsDemoData = onRequest(
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

      console.log("Starting Sadler's Wells demo seed...", { replaceDisputes });
      const now = admin.firestore.Timestamp.now();

      // 1. Create organization
      const orgRef = db.collection("organizations").doc(SADLERS_WELLS_ORG_ID);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({
          name: "Sadler's Wells",
          location: "London, UK",
          industry: "Ticketing",
          isDemo: true,
          teams: [
            { name: "Box Office", email: "boxoffice@sadlerswells.com" },
            { name: "Finance", email: "finance@sadlerswells.com" },
            { name: "Customer Support", email: "support@sadlerswells.com" },
          ],
          documents: [
            { id: "doc_sw_1", name: "Ticketing Terms & Conditions", category: "Terms of Service", fileName: "sw_ticketing_terms.pdf", fileSize: 148000 },
            { id: "doc_sw_2", name: "Refund & Exchange Policy", category: "Cancellation Policy", fileName: "sw_refund_policy.pdf", fileSize: 105000 },
          ],
          pspIntegrations: { stripe: { secretKey: "", webhookSecret: "", status: "connected" } },
          automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
          users: [],
          createdAt: now,
          updatedAt: now,
        });
        console.log("Created Sadler's Wells organization");
      } else {
        await orgRef.set(
          {
            name: "Sadler's Wells",
            location: "London, UK",
            industry: "Ticketing",
            isDemo: true,
            updatedAt: now,
          },
          { merge: true },
        );
        console.log("Sadler's Wells organization already exists (merged demo fields)");
      }

      // 2. Create demo user
      let uid: string;
      try {
        const existing = await admin.auth().getUserByEmail(SADLERS_WELLS_DEMO_EMAIL);
        uid = existing.uid;
        console.log(`User ${SADLERS_WELLS_DEMO_EMAIL} already exists`);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          const created = await admin.auth().createUser({
            email: SADLERS_WELLS_DEMO_EMAIL,
            password: SADLERS_WELLS_DEMO_PASSWORD,
            displayName: "Sadler's Wells Demo",
            emailVerified: true,
          });
          uid = created.uid;
          console.log(`Created user ${SADLERS_WELLS_DEMO_EMAIL}`);
        } else {
          throw err;
        }
      }
      await db.collection("users").doc(uid).set(
        {
          name: "Sadler's Wells Demo",
          email: SADLERS_WELLS_DEMO_EMAIL,
          role: "user",
          organizationId: SADLERS_WELLS_ORG_ID,
          hotelName: "Sadler's Wells",
          createdAt: now,
          updatedAt: now,
          tosAcceptedAt: now,
          tosVersion: DEMO_SEEDED_POLICY_VERSION,
          privacyAcceptedAt: now,
          privacyVersion: DEMO_SEEDED_POLICY_VERSION,
        },
        { merge: true },
      );
      await applyDemoUserClaims(uid, SADLERS_WELLS_ORG_ID, "user");

      // 3. Optionally remove existing disputes, then seed
      let disputesDeleted = 0;
      if (replaceDisputes) {
        disputesDeleted = await deleteDisputesForOrganization(db, SADLERS_WELLS_ORG_ID);
        console.log(`Deleted ${disputesDeleted} existing dispute(s) for ${SADLERS_WELLS_ORG_ID}`);
      }

      const created: string[] = [];
      const respondBy = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < DEMO_DISPUTES.length; i++) {
        const d = DEMO_DISPUTES[i];
        const data = buildSadlersWellsDisputeFirestoreData(d, i, SADLERS_WELLS_ORG_ID, now, respondBy);
        const ref = await db.collection("disputes").add(data);
        created.push(`${d.reason} (${d.state}): ${ref.id}`);
      }

      console.log(`Seeded ${created.length} Sadler's Wells disputes`);

      res.status(200).json({
        success: true,
        message: `Sadler's Wells demo seeded: org=${SADLERS_WELLS_ORG_ID}, user=${SADLERS_WELLS_DEMO_EMAIL}, disputes=${created.length}`,
        organizationId: SADLERS_WELLS_ORG_ID,
        credentials: { email: SADLERS_WELLS_DEMO_EMAIL, password: SADLERS_WELLS_DEMO_PASSWORD },
        replaceDisputes,
        disputesDeleted,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Sadler's Wells seed failed:", error);
      res.status(500).json({ error: "Failed to seed Sadler's Wells demo data", details: error.message });
    }
  },
);
