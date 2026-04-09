import { useState, useEffect } from 'react';
import { collection, query, orderBy, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '@realyn/shared';

export interface McpTask {
  id: string;
  caseId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt?: any;
  completedAt?: any;
}

export interface McpOperation {
  id: string;
  caseId: string;
  type: string;
  status: string;
  startedAt?: any;
  finishedAt?: any;
  error?: { code: string; message: string };
}

export function useDisputeTasks(disputeId: string | undefined) {
  const [tasks, setTasks] = useState<McpTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!disputeId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'disputes', disputeId, 'tasks'),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as McpTask)));
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return unsub;
  }, [disputeId]);

  return { tasks, loading };
}

export function useDisputeOperations(disputeId: string | undefined, organizationId: string | undefined) {
  const [operations, setOperations] = useState<McpOperation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!disputeId || !organizationId) {
      setOperations([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'operations'),
      where('caseId', '==', disputeId),
      where('organizationId', '==', organizationId),
      orderBy('startedAt', 'desc'),
      limit(20),
    );

    const unsub = onSnapshot(q, (snap) => {
      setOperations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as McpOperation)));
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return unsub;
  }, [disputeId, organizationId]);

  return { operations, loading };
}
