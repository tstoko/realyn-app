/**
 * HTTP handler: seed Attraction World Group demo org, user, and disputes (with evidence plans where defined).
 *
 * Admin-only. By default removes existing disputes for `attractionworld_experiences` then inserts fresh rows
 * so re-running updates Firestore (avoids duplicate/stale rows without evidence plans).
 *
 * Body (JSON, optional): `{ "replaceDisputes": true }` (default true). Set `replaceDisputes: false`
 * to append new disputes without deleting existing ones for that org.
 *
 * Deploy: `firebase deploy --only functions:seedAttractionworldDemoData`
 *
 * Example (replace YOUR_PROJECT and ID token from an admin user):
 *   curl -sS -X POST "https://us-central1-YOUR_PROJECT.cloudfunctions.net/seedAttractionworldDemoData" \
 *     -H "Authorization: Bearer <ADMIN_ID_TOKEN>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"replaceDisputes":true}'
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import {
  DEMO_DISPUTES,
  buildAttractionworldDisputeFirestoreData,
} from "../lib/attractionworldDemoDisputePayload";
import { deleteDisputesForOrganization } from "../lib/diceDemoFirestoreUtils";
import {
  ATTRACTIONWORLD_DEMO_EMAIL,
  ATTRACTIONWORLD_DEMO_PASSWORD,
  ATTRACTIONWORLD_ORG_ID,
} from "../lib/attractionworldDemoConstants";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";
import { DEMO_SEEDED_POLICY_VERSION } from "../config/demoSeededPolicyVersion";
import { applyDemoUserClaims } from "../lib/demoSeedUserClaims";

const db = admin.firestore();

export const seedAttractionworldDemoData = onRequest(
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
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const replaceDisputes = body.replaceDisputes !== false;

      console.log("Starting Attraction World Group demo seed...", { replaceDisputes });
      const now = admin.firestore.Timestamp.now();

      const orgRef = db.collection("organizations").doc(ATTRACTIONWORLD_ORG_ID);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({
          name: "Attraction World Group",
          location: "United Kingdom",
          industry: "Travel & Experiences",
          isDemo: true,
          teams: [
            { name: "Partner Support", email: "partners@attractionworldgroup.com" },
            { name: "Finance", email: "finance@attractionworldgroup.com" },
            { name: "Integrations", email: "integrations@attractionworldgroup.com" },
          ],
          documents: [
            {
              id: "doc_awg_1",
              name: "Distribution & API Terms",
              category: "Terms of Service",
              fileName: "awg_distribution_terms.pdf",
              fileSize: 168000,
            },
            {
              id: "doc_awg_2",
              name: "Experience Booking & Refund Policy",
              category: "Cancellation Policy",
              fileName: "awg_experience_refund_policy.pdf",
              fileSize: 124000,
            },
          ],
          pspIntegrations: { stripe: { secretKey: "", webhookSecret: "", status: "connected" } },
          automationSettings: {
            autoSubmissionEnabled: false,
            autoSubmissionMinAmount: 0,
            autoMarkNotContested: false,
          },
          users: [],
          createdAt: now,
          updatedAt: now,
        });
        console.log("Created Attraction World Group organization");
      } else {
        await orgRef.set(
          {
            name: "Attraction World Group",
            location: "United Kingdom",
            industry: "Travel & Experiences",
            isDemo: true,
            updatedAt: now,
          },
          { merge: true },
        );
        console.log("Attraction World Group organization already exists (merged demo fields)");
      }

      let uid: string;
      try {
        const existing = await admin.auth().getUserByEmail(ATTRACTIONWORLD_DEMO_EMAIL);
        uid = existing.uid;
        console.log(`User ${ATTRACTIONWORLD_DEMO_EMAIL} already exists`);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          const created = await admin.auth().createUser({
            email: ATTRACTIONWORLD_DEMO_EMAIL,
            password: ATTRACTIONWORLD_DEMO_PASSWORD,
            displayName: "AWG Demo",
            emailVerified: true,
          });
          uid = created.uid;
          console.log(`Created user ${ATTRACTIONWORLD_DEMO_EMAIL}`);
        } else {
          throw err;
        }
      }
      await db.collection("users").doc(uid).set(
        {
          name: "AWG Demo",
          email: ATTRACTIONWORLD_DEMO_EMAIL,
          role: "user",
          organizationId: ATTRACTIONWORLD_ORG_ID,
          hotelName: "Attraction World Group",
          createdAt: now,
          updatedAt: now,
          tosAcceptedAt: now,
          tosVersion: DEMO_SEEDED_POLICY_VERSION,
          privacyAcceptedAt: now,
          privacyVersion: DEMO_SEEDED_POLICY_VERSION,
        },
        { merge: true },
      );
      await applyDemoUserClaims(uid, ATTRACTIONWORLD_ORG_ID, "user");

      let disputesDeleted = 0;
      if (replaceDisputes) {
        disputesDeleted = await deleteDisputesForOrganization(db, ATTRACTIONWORLD_ORG_ID);
        console.log(`Deleted ${disputesDeleted} existing dispute(s) for ${ATTRACTIONWORLD_ORG_ID}`);
      }

      const created: string[] = [];
      const respondBy = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < DEMO_DISPUTES.length; i++) {
        const d = DEMO_DISPUTES[i];
        const data = buildAttractionworldDisputeFirestoreData(d, i, ATTRACTIONWORLD_ORG_ID, now, respondBy);
        const ref = await db.collection("disputes").add(data);
        created.push(`${d.reason} (${d.state}): ${ref.id}`);
      }

      console.log(`Seeded ${created.length} Attraction World Group disputes`);

      res.status(200).json({
        success: true,
        message: `Attraction World Group demo seeded: org=${ATTRACTIONWORLD_ORG_ID}, user=${ATTRACTIONWORLD_DEMO_EMAIL}, disputes=${created.length}`,
        organizationId: ATTRACTIONWORLD_ORG_ID,
        credentials: { email: ATTRACTIONWORLD_DEMO_EMAIL, password: ATTRACTIONWORLD_DEMO_PASSWORD },
        replaceDisputes,
        disputesDeleted,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Attraction World Group seed failed:", error);
      res.status(500).json({ error: "Failed to seed Attraction World Group demo data", details: error.message });
    }
  },
);
