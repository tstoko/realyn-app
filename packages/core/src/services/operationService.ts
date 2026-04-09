import * as admin from "firebase-admin";
import type { AuditTrailActor } from "../utils/auditTrailHelper";

export interface OperationProgress {
  current: number;
  total: number;
  message: string;
}

export interface OperationError {
  code: string;
  message: string;
}

export type OperationType =
  | "plan_evidence"
  | "draft_argument"
  | "retrieve_evidence"
  | "validate_draft";

export type OperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Operation {
  id: string;
  organizationId: string;
  caseId: string;
  type: OperationType;
  status: OperationStatus;
  initiatedBy: AuditTrailActor;
  startedAt: admin.firestore.Timestamp;
  finishedAt?: admin.firestore.Timestamp;
  progress?: OperationProgress;
  result?: Record<string, unknown>;
  error?: OperationError;
}

function getDb() {
  return admin.firestore();
}

const COLLECTION = "operations";

export async function createOperation(params: {
  organizationId: string;
  caseId: string;
  type: OperationType;
  initiatedBy: AuditTrailActor;
}): Promise<string> {
  const db = getDb();
  const doc: Omit<Operation, "id"> = {
    organizationId: params.organizationId,
    caseId: params.caseId,
    type: params.type,
    status: "queued",
    initiatedBy: params.initiatedBy,
    startedAt: admin.firestore.Timestamp.now(),
  };
  const ref = await db.collection(COLLECTION).add(doc);
  return ref.id;
}

export async function updateOperationProgress(
  operationId: string,
  progress: OperationProgress,
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION).doc(operationId).update({
    status: "running",
    progress,
  });
}

export async function completeOperation(
  operationId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION).doc(operationId).update({
    status: "succeeded",
    finishedAt: admin.firestore.Timestamp.now(),
    result: result ?? {},
  });
}

export async function failOperation(
  operationId: string,
  error: OperationError,
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION).doc(operationId).update({
    status: "failed",
    finishedAt: admin.firestore.Timestamp.now(),
    error,
  });
}

export async function getOperation(
  operationId: string,
): Promise<Operation | null> {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(operationId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Operation;
}

export async function listOperations(
  orgId: string,
  caseId?: string,
  status?: OperationStatus,
): Promise<Operation[]> {
  const db = getDb();
  let query: admin.firestore.Query = db
    .collection(COLLECTION)
    .where("organizationId", "==", orgId);

  if (caseId) {
    query = query.where("caseId", "==", caseId);
  }
  if (status) {
    query = query.where("status", "==", status);
  }

  query = query.orderBy("startedAt", "desc").limit(50);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Operation));
}
