import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { Request, Response } from "express";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";
import { sendRawEmail } from "../services/emailService";
import { inviteTemplate } from "../templates/inviteTemplate";
import { assertTeamSeatQuota, PlanLimitError, sendPlanLimitError } from "../utils/planEnforcement";
import { ALLOWED_ORIGINS } from "../config/environment";
import { applyRateLimit, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import {
  resendApiKeySecret,
  getDashboardBaseUrl,
} from "../config/emailAndDashboardParams";

const db = admin.firestore();
const INVITE_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getUserOrgRole(uid: string): Promise<{
  organizationId: string | null;
  role: string | null;
  name: string;
}> {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return { organizationId: null, role: null, name: "" };
  const data = userDoc.data()!;
  return {
    organizationId: data.organizationId || null,
    role: data.role || null,
    name: data.name || "",
  };
}

async function getOrgName(organizationId: string): Promise<string> {
  const orgDoc = await db.collection("organizations").doc(organizationId).get();
  return orgDoc.exists ? (orgDoc.data()?.name || organizationId) : organizationId;
}

function canManageTeam(userRole: string | null): boolean {
  return userRole === "admin" || userRole === "Manager";
}

async function handleCreateInvite(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authResult = await verifyUser(req);
  if (!authResult.success) {
    sendAuthError(res, authResult);
    return;
  }

  const rateOk = await applyRateLimit(
    req,
    res,
    authResult.uid,
    RATE_LIMIT_CONFIGS.invite,
  );
  if (!rateOk) return;

  const { email, role } = req.body as { email?: string; role?: string };
  if (!email || !role) {
    res.status(400).json({ error: "email and role are required" });
    return;
  }
  if (role !== "Manager" && role !== "Staff") {
    res.status(400).json({ error: "role must be Manager or Staff" });
    return;
  }

  const user = await getUserOrgRole(authResult.uid);
  if (!user.organizationId) {
    res.status(403).json({ error: "You must belong to an organization" });
    return;
  }
  if (!canManageTeam(user.role)) {
    res.status(403).json({ error: "Only admins and managers can invite team members" });
    return;
  }

  try {
    await assertTeamSeatQuota(user.organizationId);
  } catch (err) {
    if (err instanceof PlanLimitError) { sendPlanLimitError(res, err); return; }
    throw err;
  }

  const existingInvite = await db
    .collection("organizations").doc(user.organizationId)
    .collection("invites")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existingInvite.empty) {
    res.status(409).json({ error: "A pending invite already exists for this email" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 86_400_000);

  const inviteRef = db
    .collection("organizations").doc(user.organizationId)
    .collection("invites")
    .doc();

  await inviteRef.set({
    organizationId: user.organizationId,
    email,
    role,
    invitedBy: authResult.uid,
    status: "pending",
    tokenHash,
    createdAt: admin.firestore.Timestamp.fromDate(now),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
  });

  const orgName = await getOrgName(user.organizationId);
  const acceptUrl = `${getDashboardBaseUrl()}/accept-invite?token=${token}`;
  const { subject, html } = inviteTemplate({
    inviterName: user.name,
    organizationName: orgName,
    role,
    acceptUrl,
    expiresInDays: INVITE_EXPIRY_DAYS,
  });

  try {
    await sendRawEmail(email, subject, html);
  } catch (err) {
    console.error("Failed to send invite email:", err);
    await inviteRef.delete();
    res.status(503).json({
      error: "Could not send invitation email. The invite was not saved. Try again or contact support.",
    });
    return;
  }

  res.status(201).json({ id: inviteRef.id });
}

async function handleListInvites(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authResult = await verifyUser(req);
  if (!authResult.success) {
    sendAuthError(res, authResult);
    return;
  }

  const rateOk = await applyRateLimit(
    req,
    res,
    authResult.uid,
    RATE_LIMIT_CONFIGS.invite,
  );
  if (!rateOk) return;

  const user = await getUserOrgRole(authResult.uid);
  if (!user.organizationId) {
    res.status(403).json({ error: "You must belong to an organization" });
    return;
  }

  const invitesSnap = await db
    .collection("organizations").doc(user.organizationId)
    .collection("invites")
    .orderBy("createdAt", "desc")
    .get();

  const invites = invitesSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      email: d.email,
      role: d.role,
      status: d.status,
      invitedBy: d.invitedBy,
      createdAt: d.createdAt?.toDate?.() ?? d.createdAt,
      expiresAt: d.expiresAt?.toDate?.() ?? d.expiresAt,
    };
  });

  res.json({ invites });
}

async function handleRevokeInvite(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authResult = await verifyUser(req);
  if (!authResult.success) {
    sendAuthError(res, authResult);
    return;
  }

  const rateOk = await applyRateLimit(
    req,
    res,
    authResult.uid,
    RATE_LIMIT_CONFIGS.invite,
  );
  if (!rateOk) return;

  const { inviteId } = req.body as { inviteId?: string };
  if (!inviteId) {
    res.status(400).json({ error: "inviteId is required" });
    return;
  }

  const user = await getUserOrgRole(authResult.uid);
  if (!user.organizationId) {
    res.status(403).json({ error: "You must belong to an organization" });
    return;
  }
  if (!canManageTeam(user.role)) {
    res.status(403).json({ error: "Only admins and managers can revoke invites" });
    return;
  }

  const inviteRef = db
    .collection("organizations").doc(user.organizationId)
    .collection("invites")
    .doc(inviteId);

  const inviteDoc = await inviteRef.get();
  if (!inviteDoc.exists) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  if (inviteDoc.data()?.status !== "pending") {
    res.status(400).json({ error: "Only pending invites can be revoked" });
    return;
  }

  await inviteRef.update({ status: "revoked" });
  res.json({ success: true });
}

export const createInvite = onRequest(
  { cors: ALLOWED_ORIGINS, secrets: [resendApiKeySecret] },
  handleCreateInvite,
);
export const listInvites = onRequest({ cors: ALLOWED_ORIGINS }, handleListInvites);
export const revokeInvite = onRequest({ cors: ALLOWED_ORIGINS }, handleRevokeInvite);
