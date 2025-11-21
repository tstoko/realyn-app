import { useState, useEffect } from 'react';
import type { User } from '../types';

const mockUsers: User[] = [
    { id: 'user_admin', name: 'Alex Admin', role: 'admin' },
    { id: 'user_001', name: 'Jamie Frontdesk', organizationId: 'org_1', hotelName: 'Grand Palace Hotel', role: 'user' },
    { id: 'user_002', name: 'Casey Manager', organizationId: 'org_2', hotelName: 'Lakeside Resort & Spa', role: 'user' },
    { id: 'user_003', name: 'Taylor Finance', organizationId: 'org_3', hotelName: 'Metropolis Business Inn', role: 'user' },
];

export const useUsers = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate async fetch
        setTimeout(() => {
            setUsers(mockUsers);
            setLoading(false);
        }, 300);
    }, []);

    return { users, loading };
};
