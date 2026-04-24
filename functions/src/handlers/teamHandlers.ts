import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";
import { applyRateLimit, RATE_LIMIT_CONFIGS } from "../utils/rateLimiter";
import { ALLOWED_ORIGINS } from "../config/environment";

const db = admin.firestore();

type OrgRole = "admin" | "Manager" | "Staff" | "user";

async function getUserOrgRole(uid: string): Promise<{
  organizationId: string | null;
  role: OrgRole | null;
}> {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return { organizationId: null, role: null };
  const data = userDoc.data()!;
  return {
    organizationId: (data.organizationId as string) || null,
    role: (data.role as OrgRole) || "user",
  };
}

function canManageTeam(userRole: OrgRole | null): boolean {
  return userRole === "admin" || userRole === "Manager";
}

async function listUsersInOrganization(organizationId: string) {
  const snap = await db
    .collection("users")
    .where("organizationId", "==", organizationId)
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: (d.name as string) || "",
      email: (d.email as string) || "",
      role: (d.role as string) || "user",
    };
  });
}

async function countAdmins(organizationId: string): Promise<number> {
  const members = await listUsersInOrganization(organizationId);
  return members.filter((m) => m.role === "admin").length;
}

async function handleListTeamMembers(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authResult = await verifyUser(req);
  if (!authResult.success) {
    sendAuthError(res, authResult);
    return;
  }

  const allowed = await applyRateLimit(
    req,
    res,
    authResult.uid,
    RATE_LIMIT_CONFIGS.invite,
  );
  if (!allowed) return;

  const actor = await getUserOrgRole(authResult.uid);
  if (!actor.organizationId) {
    res.status(403).json({ error: "You must belong to an organization" });
    return;
  }
  if (!canManageTeam(actor.role)) {
    res.status(403).json({ error: "Only admins and managers can view the team list" });
    return;
  }

  const members = await listUsersInOrganization(actor.organizationId);
  res.json({ members });
}

async function handleRemoveTeamMember(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authResult = await verifyUser(req);
  if (!authResult.success) {
    sendAuthError(res, authResult);
    return;
  }

  const allowed = await applyRateLimit(
    req,
    res,
    authResult.uid,
    RATE_LIMIT_CONFIGS.invite,
  );
  if (!allowed) return;

  const { userId } = req.body as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const actor = await getUserOrgRole(authResult.uid);
  if (!actor.organizationId) {
    res.status(403).json({ error: "You must belong to an organization" });
    return;
  }
  if (!canManageTeam(actor.role)) {
    res.status(403).json({ error: "Only admins and managers can remove team members" });
    return;
  }

  const targetSnap = await db.collection("users").doc(userId).get();
  if (!targetSnap.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const targetData = targetSnap.data()!;
  if (targetData.organizationId !== actor.organizationId) {
    res.status(404).json({ error: "User is not in your organization" });
    return;
  }

  const targetRole = (targetData.role as string) || "user";
  if (actor.role === "Manager" && targetRole === "admin") {
    res.status(403).json({ error: "Managers cannot remove organization admins" });
    return;
  }
  if (actor.role === "Manager" && targetRole === "Manager" && userId !== authResult.uid) {
    res.status(403).json({ error: "Managers cannot remove other managers" });
    return;
  }

  if (targetRole === "admin") {
    const admins = await countAdmins(actor.organizationId);
    if (admins <= 1) {
      res.status(400).json({ error: "Cannot remove the last admin for this organization" });
      return;
    }
  }

  await db.collection("users").doc(userId).update({
    organizationId: FieldValue.delete(),
    role: "user",
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.json({ success: true });
}

async function handleUpdateTeamMemberRole(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authResult = await verifyUser(req);
  if (!authResult.success) {
    sendAuthError(res, authResult);
    return;
  }

  const allowed = await applyRateLimit(
    req,
    res,
    authResult.uid,
    RATE_LIMIT_CONFIGS.invite,
  );
  if (!allowed) return;

  const { userId, role } = req.body as { userId?: string; role?: string };
  if (!userId || !role) {
    res.status(400).json({ error: "userId and role are required" });
    return;
  }
  if (role !== "Manager" && role !== "Staff") {
    res.status(400).json({ error: "role must be Manager or Staff" });
    return;
  }

  const actor = await getUserOrgRole(authResult.uid);
  if (!actor.organizationId) {
    res.status(403).json({ error: "You must belong to an organization" });
    return;
  }
  if (!canManageTeam(actor.role)) {
    res.status(403).json({ error: "Only admins and managers can change roles" });
    return;
  }

  if (actor.role === "Manager" && role === "Manager") {
    res.status(403).json({ error: "Managers cannot promote users to Manager" });
    return;
  }

  const targetSnap = await db.collection("users").doc(userId).get();
  if (!targetSnap.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const targetData = targetSnap.data()!;
  if (targetData.organizationId !== actor.organizationId) {
    res.status(404).json({ error: "User is not in your organization" });
    return;
  }

  const targetRole = (targetData.role as string) || "user";
  if (targetRole === "admin") {
    res.status(400).json({ error: "Use a different flow to change organization admins" });
    return;
  }
  if (actor.role === "Manager" && targetRole === "Manager") {
    res.status(403).json({ error: "Managers cannot change another manager's role" });
    return;
  }

  await db.collection("users").doc(userId).update({
    role,
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.json({ success: true });
}

export const listTeamMembers = onRequest({ cors: ALLOWED_ORIGINS }, handleListTeamMembers);
export const removeTeamMember = onRequest({ cors: ALLOWED_ORIGINS }, handleRemoveTeamMember);
export const updateTeamMemberRole = onRequest({ cors: ALLOWED_ORIGINS }, handleUpdateTeamMemberRole);
