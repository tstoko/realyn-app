import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";
import { Request, Response } from "express";
import { assertTeamSeatQuota, PlanLimitError, sendPlanLimitError } from "../utils/planEnforcement";
import { ALLOWED_ORIGINS } from "../config/environment";

const db = admin.firestore();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function handleAcceptInvite(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { idToken, inviteToken } = req.body as {
    idToken?: string;
    inviteToken?: string;
  };

  if (!idToken || !inviteToken) {
    res.status(400).json({ error: "idToken and inviteToken are required" });
    return;
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "Invalid ID token" });
    return;
  }

  const tokenHash = hashToken(inviteToken);

  const orgsSnap = await db.collectionGroup("invites")
    .where("tokenHash", "==", tokenHash)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (orgsSnap.empty) {
    res.status(404).json({ error: "Invite not found or already used" });
    return;
  }

  const inviteDoc = orgsSnap.docs[0];
  const inviteData = inviteDoc.data();

  const expiresAt = inviteData.expiresAt?.toDate?.() ?? new Date(inviteData.expiresAt);
  if (expiresAt < new Date()) {
    await inviteDoc.ref.update({ status: "expired" });
    res.status(410).json({ error: "Invite has expired" });
    return;
  }

  const organizationId = inviteData.organizationId as string;
  const role = inviteData.role as string;

  try {
    await assertTeamSeatQuota(organizationId, { excludePendingCount: 1 });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      sendPlanLimitError(res, err);
      return;
    }
    throw err;
  }

  const existingUser = await db.collection("users").doc(decoded.uid).get();
  if (existingUser.exists) {
    const userData = existingUser.data();
    if (userData?.organizationId && userData.organizationId !== organizationId) {
      res.status(409).json({ error: "You already belong to a different organization" });
      return;
    }
    if (userData?.organizationId === organizationId) {
      await inviteDoc.ref.update({ status: "accepted" });
      res.json({ success: true, organizationId });
      return;
    }
    await db.collection("users").doc(decoded.uid).update({
      organizationId,
      role,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await db.collection("users").doc(decoded.uid).set({
      name: decoded.name || decoded.email?.split("@")[0] || "",
      email: decoded.email || "",
      role,
      organizationId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await inviteDoc.ref.update({ status: "accepted" });

  res.json({ success: true, organizationId });
}

export const acceptInvite = onRequest({ cors: ALLOWED_ORIGINS }, handleAcceptInvite);
