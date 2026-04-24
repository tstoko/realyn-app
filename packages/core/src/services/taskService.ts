import * as admin from "firebase-admin";
import type { AuditTrailActor } from "../utils/auditTrailHelper";

export type TaskType =
  | "evidence_request"
  | "review_request"
  | "approval_request"
  | "general";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface TaskMetadata {
  requirementIds?: string[];
  evidenceCategories?: string[];
  draftVersion?: number;
}

export interface Task {
  id: string;
  caseId: string;
  organizationId: string;
  type: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId?: string;
  createdBy: AuditTrailActor;
  createdAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  metadata?: TaskMetadata;
}

function getDb() {
  return admin.firestore();
}

export async function createTask(params: {
  caseId: string;
  organizationId: string;
  type: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  createdBy: AuditTrailActor;
  assigneeId?: string;
  metadata?: TaskMetadata;
}): Promise<string> {
  const db = getDb();
  const doc: Omit<Task, "id"> = {
    caseId: params.caseId,
    organizationId: params.organizationId,
    type: params.type,
    title: params.title,
    description: params.description,
    priority: params.priority,
    status: "open",
    createdBy: params.createdBy,
    createdAt: admin.firestore.Timestamp.now(),
    assigneeId: params.assigneeId,
    metadata: params.metadata,
  };
  const ref = await db
    .collection("disputes")
    .doc(params.caseId)
    .collection("tasks")
    .add(doc);
  return ref.id;
}

export async function updateTaskStatus(
  caseId: string,
  taskId: string,
  status: TaskStatus,
  completedBy?: AuditTrailActor,
): Promise<void> {
  const db = getDb();
  const update: Record<string, any> = { status };
  if (status === "completed" || status === "cancelled") {
    update.completedAt = admin.firestore.Timestamp.now();
  }
  await db
    .collection("disputes")
    .doc(caseId)
    .collection("tasks")
    .doc(taskId)
    .update(update);
}

export async function getOpenTasks(caseId: string): Promise<Task[]> {
  const db = getDb();
  const snapshot = await db
    .collection("disputes")
    .doc(caseId)
    .collection("tasks")
    .where("status", "in", ["open", "in_progress"])
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Task));
}

export async function getTasksByOrg(
  orgId: string,
  status?: TaskStatus,
): Promise<Task[]> {
  const db = getDb();

  const disputesSnap = await db
    .collection("disputes")
    .where("organizationId", "==", orgId)
    .select()
    .get();

  const tasks: Task[] = [];
  for (const disputeDoc of disputesSnap.docs) {
    let query: admin.firestore.Query = disputeDoc.ref.collection("tasks");
    if (status) {
      query = query.where("status", "==", status);
    }
    const taskSnap = await query.orderBy("createdAt", "desc").get();
    for (const taskDoc of taskSnap.docs) {
      tasks.push({ id: taskDoc.id, ...taskDoc.data() } as Task);
    }
  }

  return tasks;
}
