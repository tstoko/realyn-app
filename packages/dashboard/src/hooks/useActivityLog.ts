import { useState, useEffect } from 'react';
import type { ActivityLogItem } from '@realyn/shared';

const now = new Date();
const oneHour = 60 * 60 * 1000;

const mockActivityLog: ActivityLogItem[] = [
  {
    id: 'act_1',
    user: { name: 'Alex Admin', id: 'user_admin' },
    action: 'updated automation settings for',
    target: { type: 'Hotel', name: 'Grand Palace Hotel' },
    timestamp: new Date(now.getTime() - (0.5 * oneHour)),
  },
  {
    id: 'act_2',
    user: { name: 'Jamie Frontdesk', id: 'user_001' },
    action: 'approved the AI draft for',
    target: { type: 'Dispute', name: 'dp_dummy_4' },
    timestamp: new Date(now.getTime() - (1 * oneHour)),
  },
  {
    id: 'act_3',
    user: { name: 'Casey Manager', id: 'user_002' },
    action: 'submitted evidence for',
    target: { type: 'Dispute', name: 'dp_dummy_5' },
    timestamp: new Date(now.getTime() - (2.5 * oneHour)),
  },
  {
    id: 'act_4',
    user: { name: 'Alex Admin', id: 'user_admin' },
    action: 'removed the hotel',
    target: { type: 'Hotel', name: 'City Center Inn (Removed)' },
    timestamp: new Date(now.getTime() - (4 * oneHour)),
  },
    {
    id: 'act_5',
    user: { name: 'Taylor Finance', id: 'user_003' },
    action: 'added an internal note to',
    target: { type: 'Dispute', name: 'dp_dummy_7' },
    timestamp: new Date(now.getTime() - (6 * oneHour)),
  },
  {
    id: 'act_6',
    user: { name: 'Alex Admin', id: 'user_admin' },
    action: 'viewed the portfolio analytics',
    target: { type: 'Page', name: 'Portfolio Analytics' },
    timestamp: new Date(now.getTime() - (25 * oneHour)),
  },
];

export const useActivityLog = () => {
    const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setTimeout(() => {
            setActivityLog(mockActivityLog.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
            setLoading(false);
        }, 500);
    }, []);
    
    return { activityLog, loading };
};
