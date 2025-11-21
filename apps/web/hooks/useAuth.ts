
import { useState } from 'react';
import type { User } from '../types';

// Mock user data - in a real app, this would be a backend API call.
const mockUsers: Record<string, { password: string; user: User }> = {
    'admin@realyn.com': { 
        password: 'masterpass', 
        user: { id: 'user_admin', name: 'Alex Admin', role: 'admin' }
    },
    'user1@gph.com': { 
        password: 'password123', 
        user: { id: 'user_001', name: 'Jamie Frontdesk', organizationId: 'org_1', hotelName: 'Grand Palace Hotel', role: 'user' }
    },
    'user2@lakeside.com': { 
        password: 'password123', 
        user: { id: 'user_002', name: 'Casey Manager', organizationId: 'org_2', hotelName: 'Lakeside Resort & Spa', role: 'user' }
    },
    'user3@mbi.com': { 
        password: 'password123', 
        user: { id: 'user_003', name: 'Taylor Finance', organizationId: 'org_3', hotelName: 'Metropolis Business Inn', role: 'user' }
    },
};


export const useAuth = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const login = (email: string, password: string): Promise<User | null> => {
        setLoading(true);
        setError(null);

        return new Promise((resolve) => {
            // Simulate network delay
            setTimeout(() => {
                const account = mockUsers[email.toLowerCase()];
                if (account && account.password === password) {
                    resolve(account.user);
                } else {
                    setError('Invalid email or password.');
                    resolve(null);
                }
                setLoading(false);
            }, 1000);
        });
    };

    return { login, loading, error };
};
