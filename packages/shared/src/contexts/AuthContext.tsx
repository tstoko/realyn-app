import React, { createContext, useContext, useMemo } from 'react';
import { useAuth as useAuthHook } from '../hooks/useAuth';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  needsPolicyConsent: boolean;
  markPolicyAccepted: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, error, login, logout, resetPassword, needsPolicyConsent, markPolicyAccepted } = useAuthHook();

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, login, logout, resetPassword, needsPolicyConsent, markPolicyAccepted }),
    [user, loading, error, login, logout, resetPassword, needsPolicyConsent, markPolicyAccepted]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return ctx;
};
