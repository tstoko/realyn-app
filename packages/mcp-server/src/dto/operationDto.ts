import type { Operation } from "@realyn/core";

export interface OperationDto {
  id: string;
  caseId: string;
  type: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  progress?: { current: number; total: number; message: string };
  error?: { code: string; message: string };
}

export function projectOperation(op: Operation): OperationDto {
  return {
    id: op.id,
    caseId: op.caseId,
    type: op.type,
    status: op.status,
    startedAt: op.startedAt?.toDate?.()?.toISOString() ?? "",
    finishedAt: op.finishedAt?.toDate?.()?.toISOString(),
    progress: op.progress,
    error: op.error,
  };
}
