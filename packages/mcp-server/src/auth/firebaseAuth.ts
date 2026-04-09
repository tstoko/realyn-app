import * as admin from "firebase-admin";
import type { Request } from "express";
import type { McpSession } from "../types/mcp.js";
import { getPermissionsForRole } from "../types/mcp.js";
import crypto from "node:crypto";

export async function authenticateRequest(
  req: Request,
): Promise<McpSession | null> {
  // Try Firebase token first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifyFirebaseToken(token);
  }

  // Try API key
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey) {
    return verifyApiKey(apiKey);
  }

  return null;
}

async function verifyFirebaseToken(token: string): Promise<McpSession | null> {
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .get();

    if (!userDoc.exists) return null;

    const userData = userDoc.data()!;
    const organizationId = userData.organizationId;
    const role = (userData.role as "admin" | "user") || "user";

    if (!organizationId && role !== "admin") return null;

    return {
      organizationId: organizationId || "",
      userId: uid,
      role,
      authMode: "firebase_token",
      permissions: getPermissionsForRole(role),
      sessionId: crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

async function verifyApiKey(apiKey: string): Promise<McpSession | null> {
  try {
    const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");
    const db = admin.firestore();

    const indexDoc = await db.collection("mcpApiKeyIndex").doc(hashedKey).get();
    if (!indexDoc.exists) return null;

    const indexData = indexDoc.data()!;
    const organizationId: string = indexData.organizationId;
    const keyDocPath: string = indexData.keyDocPath;

    const keyDoc = await db.doc(keyDocPath).get();
    if (!keyDoc.exists) return null;

    const keyData = keyDoc.data()!;
    if (keyData.revokedAt) return null;

    keyDoc.ref.update({
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    return {
      organizationId,
      userId: null,
      role: "user",
      authMode: "api_key",
      permissions: keyData.permissions || [],
      sessionId: crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}
