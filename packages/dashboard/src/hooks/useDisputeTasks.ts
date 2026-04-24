import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@realyn/shared';

export interface DisputeTask {
  id: string;
  caseId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt?: unknown;
  completedAt?: unknown;
}

/** Live subscription to `disputes/{disputeId}/tasks` (Firestore). */
export function useDisputeTasks(disputeId: string | undefined) {
  const [tasks, setTasks] = useState<DisputeTask[]>([]);
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

    const unsub = onSnapshot(
      q,
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DisputeTask)));
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return unsub;
  }, [disputeId]);

  return { tasks, loading };
}
