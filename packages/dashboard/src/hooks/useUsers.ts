import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@realyn/shared';
import type { User } from '@realyn/shared';

export const useUsers = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const snapshot = await getDocs(collection(db, 'users'));
            const usersList: User[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    email: data.email || '',
                    role: data.role || 'user',
                    organizationId: data.organizationId || undefined,
                    hotelName: data.hotelName || undefined,
                };
            });
            setUsers(usersList);
        } catch (err: any) {
            console.error('Error fetching users:', {
                error: err,
                message: err.message,
                stack: err.stack,
                name: err.name,
            });
            setError(err.message || 'Failed to fetch users');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    return { users, loading, error, refresh: fetchUsers };
};
