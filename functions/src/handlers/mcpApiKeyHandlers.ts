import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Request, Response } from "express";
import * as crypto from "crypto";
import { verifyAdmin } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

export const mcpApiKeyGenerate = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendError(res, 401, authResult.error || "Unauthorized");
      return;
    }

    const { organizationId, name, permissions } = req.body;
    if (!organizationId || !name) {
      sendError(res, 400, "organizationId and name are required");
      return;
    }

    const orgDoc = await admin.firestore().collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) {
      sendError(res, 404, "Organization not found");
      return;
    }

    const rawKey = crypto.randomBytes(32).toString("hex");
    const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");
    const prefix = rawKey.slice(0, 8);

    const db = admin.firestore();
    const keyRef = db.collection("organizations").doc(organizationId).collection("mcpApiKeys").doc();

    const keyDoc = {
      name,
      hashedKey,
      prefix,
      permissions: permissions || [],
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
      revokedAt: null,
      createdBy: authResult.uid,
    };

    const indexDoc = {
      organizationId,
      keyDocPath: keyRef.path,
      createdAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(keyRef, keyDoc);
    batch.set(db.collection("mcpApiKeyIndex").doc(hashedKey), indexDoc);
    await batch.commit();

    res.json({
      keyId: keyRef.id,
      apiKey: rawKey,
      prefix,
      name,
      message: "Store this API key securely. It will not be shown again.",
    });
  }
);

export const mcpApiKeyList = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendError(res, 401, authResult.error || "Unauthorized");
      return;
    }

    const organizationId = req.query.organizationId as string || req.body?.organizationId;
    if (!organizationId) {
      sendError(res, 400, "organizationId is required");
      return;
    }

    const keysSnap = await admin
      .firestore()
      .collection("organizations")
      .doc(organizationId)
      .collection("mcpApiKeys")
      .orderBy("createdAt", "desc")
      .get();

    const keys = keysSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        prefix: data.prefix,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        lastUsedAt: data.lastUsedAt?.toDate?.()?.toISOString() ?? null,
        revokedAt: data.revokedAt?.toDate?.()?.toISOString() ?? null,
        createdBy: data.createdBy,
      };
    });

    res.json({ keys });
  }
);

export const mcpApiKeyRevoke = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendError(res, 401, authResult.error || "Unauthorized");
      return;
    }

    const { organizationId, keyId } = req.body;
    if (!organizationId || !keyId) {
      sendError(res, 400, "organizationId and keyId are required");
      return;
    }

    const db = admin.firestore();
    const keyRef = db
      .collection("organizations")
      .doc(organizationId)
      .collection("mcpApiKeys")
      .doc(keyId);

    const keyDoc = await keyRef.get();
    if (!keyDoc.exists) {
      sendError(res, 404, "API key not found");
      return;
    }

    const keyData = keyDoc.data()!;
    if (keyData.revokedAt) {
      sendError(res, 400, "API key already revoked");
      return;
    }

    const batch = db.batch();
    batch.update(keyRef, {
      revokedAt: FieldValue.serverTimestamp(),
    });

    const indexSnap = await db
      .collection("mcpApiKeyIndex")
      .where("keyDocPath", "==", keyRef.path)
      .limit(1)
      .get();

    for (const indexDoc of indexSnap.docs) {
      batch.delete(indexDoc.ref);
    }

    await batch.commit();

    res.json({ success: true, message: "API key revoked" });
  }
);
