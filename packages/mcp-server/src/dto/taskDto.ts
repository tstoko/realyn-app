import type { Task } from "@realyn/core";

export interface TaskDto {
  id: string;
  caseId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigneeId?: string;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export function projectTask(task: Task): TaskDto {
  return {
    id: task.id,
    caseId: task.caseId,
    type: task.type,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    assigneeId: task.assigneeId,
    createdAt: task.createdAt?.toDate?.()?.toISOString() ?? "",
    completedAt: task.completedAt?.toDate?.()?.toISOString(),
    metadata: task.metadata as Record<string, unknown> | undefined,
  };
}
