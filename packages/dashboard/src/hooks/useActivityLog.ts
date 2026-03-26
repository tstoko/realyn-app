import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@realyn/shared';
import type { ActivityLogItem } from '@realyn/shared';

/**
 * Hook to fetch real-time activity log from the organization's auditLog
 * subcollection in Firestore.
 *
 * @param organizationId - The organization ID to fetch logs for.
 *   When undefined/null, returns an empty list (e.g. before org is selected).
 * @param maxItems - Maximum number of log entries to fetch (default 50).
 */
export const useActivityLog = (organizationId?: string | null, maxItems = 50) => {
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setActivityLog([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const auditLogRef = collection(
      db,
      'organizations',
      organizationId,
      'auditLog',
    );

    const q = query(
      auditLogRef,
      orderBy('timestamp', 'desc'),
      limit(maxItems),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: ActivityLogItem[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          const ts = data.timestamp as Timestamp | undefined;

          // Map the org audit event shape to ActivityLogItem
          return {
            id: doc.id,
            user: {
              name: data.actor?.email || data.actor?.userId || 'System',
              id: data.actor?.userId || 'system',
            },
            action: data.action || 'unknown action',
            target: {
              type: data.details?.targetType || inferTargetType(data.action),
              name: data.details?.targetName || data.details?.fileName || data.details?.importId || '',
            },
            timestamp: ts?.toDate() || new Date(),
          };
        });

        setActivityLog(items);
        setLoading(false);
      },
      (error) => {
        console.error('[useActivityLog] Error listening to audit log:', error);
        setActivityLog([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [organizationId, maxItems]);

  return { activityLog, loading };
};

/**
 * Infer a human-readable target type from the audit action string.
 */
function inferTargetType(action?: string): string {
  if (!action) return 'Unknown';
  if (action.includes('pms')) return 'PMS Import';
  if (action.includes('dispute')) return 'Dispute';
  if (action.includes('evidence')) return 'Evidence';
  if (action.includes('integration')) return 'Integration';
  if (action.includes('user')) return 'User';
  if (action.includes('organization') || action.includes('hotel')) return 'Hotel';
  return 'System';
}
