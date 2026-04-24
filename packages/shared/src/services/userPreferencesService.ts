import { doc, getDoc } from 'firebase/firestore';
import { db, auth, getFunctionsBaseUrl } from './firebase';
import type { UserPreferences } from '../types';

/**
 * Default user preferences
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    email: true,
    sms: false,
    push: true,
    onActionRequired: true,
    onStatusChange: true,
    onPaymentAlert: true,
    weeklySummary: false,
  },
  theme: 'dark',
  timezone: 'UTC',
  language: 'en',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  twoFactorEnabled: false,
};

/**
 * Get user preferences from Firestore
 * Returns default preferences if none exist
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    // User doesn't exist, return defaults
    return DEFAULT_PREFERENCES;
  }
  
  const data = userDoc.data();
  const preferences = data.preferences;
  
  if (!preferences) {
    // No preferences exist, return defaults
    return DEFAULT_PREFERENCES;
  }
  
  // Merge with defaults to ensure all fields exist
  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...(preferences.notifications || {}),
    },
  };
}

/**
 * Update user preferences via Cloud Function
 */
export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not authenticated');
  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${getFunctionsBaseUrl()}/userWriteHandler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({
      action: 'updateUserPreferences',
      preferences,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
}

