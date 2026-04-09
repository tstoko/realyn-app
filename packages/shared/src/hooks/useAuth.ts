import { useState, useEffect, useCallback } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { getUserData } from '../services/userService';
import { CURRENT_POLICY_VERSION } from '../config/legal';
import type { User } from '../types';

export const useAuth = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
    const [userData, setUserData] = useState<User | null>(null);
    const [needsPolicyConsent, setNeedsPolicyConsent] = useState(false);

    const checkPolicyConsent = useCallback((user: User) => {
        setNeedsPolicyConsent(user.tosVersion !== CURRENT_POLICY_VERSION);
    }, []);

    const markPolicyAccepted = useCallback(() => {
        setNeedsPolicyConsent(false);
        if (userData) {
            setUserData({ ...userData, tosVersion: CURRENT_POLICY_VERSION, privacyVersion: CURRENT_POLICY_VERSION });
        }
    }, [userData]);

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setCurrentUser(firebaseUser);
            if (firebaseUser) {
                try {
                    // Refresh token to pick up any custom claims changes
                    await firebaseUser.getIdToken(true);
                    const user = await getUserData(firebaseUser.uid);
                    if (user) {
                        setUserData(user);
                        checkPolicyConsent(user);
                    } else {
                        // User document doesn't exist, create a basic one
                        setUserData({
                            id: firebaseUser.uid,
                            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                            email: firebaseUser.email || '',
                            role: 'user',
                        } as User);
                    }
                } catch (err: any) {
                    console.error('Error fetching user data:', err);
                    setError(err.message);
                }
            } else {
                setUserData(null);
            }
            setLoading(false); // Set loading to false after auth state is determined
        });

        return () => unsubscribe();
    }, []);

    const login = async (email: string, password: string): Promise<User | null> => {
        setLoading(true);
        setError(null);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Force token refresh so custom claims (orgId, role) are available
            await userCredential.user.getIdToken(true);
            const user = await getUserData(userCredential.user.uid);
            if (user) {
                setUserData(user);
                checkPolicyConsent(user);
                setLoading(false);
                return user;
            } else {
                // User document doesn't exist, return basic user info
                const basicUser: User = {
                    id: userCredential.user.uid,
                    name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
                    email: userCredential.user.email || '',
                    role: 'user',
                };
                setUserData(basicUser);
                setLoading(false);
                return basicUser;
            }
        } catch (err: any) {
            setLoading(false);
            let errorMessage = 'Invalid email or password.';
            if (err.code === 'auth/user-not-found') {
                errorMessage = 'No account found with this email.';
            } else if (err.code === 'auth/wrong-password') {
                errorMessage = 'Incorrect password.';
            } else if (err.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address.';
            } else if (err.code === 'auth/too-many-requests') {
                errorMessage = 'Too many failed attempts. Please try again later.';
            }
            setError(errorMessage);
            return null;
        }
    };

    const logout = async (): Promise<void> => {
        try {
            await firebaseSignOut(auth);
            setUserData(null);
        } catch (err: any) {
            console.error('Error signing out:', err);
            setError(err.message);
        }
    };

    const resetPassword = async (email: string): Promise<void> => {
        await sendPasswordResetEmail(auth, email);
    };

    return { 
        login, 
        logout,
        resetPassword,
        loading, 
        error,
        currentUser,
        user: userData,
        needsPolicyConsent,
        markPolicyAccepted,
    };
};
