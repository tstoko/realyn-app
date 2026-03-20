import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
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
 * Update user preferences in Firestore
 * Merges with existing preferences (doesn't overwrite entire object)
 */
export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    throw new Error('User not found');
  }
  
  const currentData = userDoc.data();
  const currentPreferences = currentData.preferences || {};
  
  // Deep merge preferences
  const updatedPreferences: UserPreferences = {
    ...DEFAULT_PREFERENCES,
    ...currentPreferences,
    ...preferences,
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...(currentPreferences.notifications || {}),
      ...(preferences.notifications || {}),
    },
  };
  
  await setDoc(
    userRef,
    {
      preferences: updatedPreferences,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

