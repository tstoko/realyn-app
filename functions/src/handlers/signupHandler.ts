import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { applyRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import { ALLOWED_ORIGINS } from "../config/environment";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app",
  });
}

const db = admin.firestore();

interface SignupRequest {
  idToken: string;
  name: string;
  hotelName: string;
  industry?: string;
}

function generateOrgId(hotelName: string): string {
  const slug = hotelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${slug}-${suffix}`;
}

async function handleSignup(req: Request, res: Response): Promise<void> {
  const rateLimitOk = await applyRateLimit(
    req, res, getClientIP(req), RATE_LIMIT_CONFIGS.general
  );
  if (!rateLimitOk) return;

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  const { idToken, name, hotelName, industry } = req.body as SignupRequest;

  if (!idToken || !name || !hotelName) {
    res.status(400).json({
      success: false,
      error: "Missing required fields: idToken, name, hotelName",
    });
    return;
  }

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
    return;
  }

  const uid = decodedToken.uid;

  const existingUser = await db.collection("users").doc(uid).get();
  if (existingUser.exists) {
    res.status(409).json({
      success: false,
      error: "Account already exists. Please log in instead.",
    });
    return;
  }

  const organizationId = generateOrgId(hotelName);

  const batch = db.batch();

  batch.set(db.collection("organizations").doc(organizationId), {
    id: organizationId,
    name: hotelName,
    location: "",
    industry: industry || "hospitality",
    pspIntegrations: {},
    automationSettings: {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    subscription: {
      planId: "free",
      status: "trialing",
      currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000),
    },
    teams: [],
    documents: [],
    users: [],
    isDemo: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.collection("users").doc(uid), {
    id: uid,
    name,
    email: decodedToken.email || "",
    role: "user",
    organizationId,
    hotelName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error: any) {
    console.error("Signup batch write failed:", error);
    res.status(500).json({ success: false, error: "Failed to create account" });
    return;
  }

  await admin.auth().updateUser(uid, { displayName: name });

  res.status(201).json({
    success: true,
    organizationId,
  });
}

export const signup = onRequest({ cors: ALLOWED_ORIGINS }, handleSignup);
