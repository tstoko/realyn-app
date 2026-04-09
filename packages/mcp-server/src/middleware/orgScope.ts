import * as admin from "firebase-admin";
import type { McpSession } from "../types/mcp.js";

/**
 * Load a dispute and verify the session has access to it.
 */
export async function loadAndVerifyCase(
  caseId: string,
  session: McpSession,
): Promise<admin.firestore.DocumentData> {
  const doc = await admin
    .firestore()
    .collection("disputes")
    .doc(caseId)
    .get();

  if (!doc.exists) {
    throw new Error(`Case ${caseId} not found`);
  }

  const data = doc.data()!;

  if (
    session.role !== "admin" &&
    data.organizationId !== session.organizationId
  ) {
    throw new Error(`Access denied: case ${caseId} belongs to another organization`);
  }

  return { id: doc.id, ...data };
}

/**
 * Load an organization and verify the session has access to it.
 */
export async function loadAndVerifyOrg(
  orgId: string,
  session: McpSession,
): Promise<admin.firestore.DocumentData> {
  if (session.role !== "admin" && orgId !== session.organizationId) {
    throw new Error(`Access denied: organization ${orgId} not accessible`);
  }

  const doc = await admin
    .firestore()
    .collection("organizations")
    .doc(orgId)
    .get();

  if (!doc.exists) {
    throw new Error(`Organization ${orgId} not found`);
  }

  return { id: doc.id, ...doc.data() };
}
