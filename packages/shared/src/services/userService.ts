import { doc, getDoc } from 'firebase/firestore';
import { db, auth, getFunctionsBaseUrl } from './firebase';
import type { User } from '../types';
import { getUserPreferences, updateUserPreferences } from './userPreferencesService';
import type { UserPreferences } from '../types';

/**
 * Create or update a user document via Cloud Function
 */
export async function createOrUpdateUser(userId: string, userData: {
  name: string;
  email: string;
  role: 'admin' | 'user';
  organizationId?: string;
  hotelName?: string;
  phone?: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not authenticated');
  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${getFunctionsBaseUrl()}/userWriteHandler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({
      action: 'updateUserProfile',
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
}

/**
 * Get user data from Firestore
 */
export async function getUserData(userId: string): Promise<User | null> {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) {
    return null;
  }
  
  const data = userDoc.data();
  return {
    id: userId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    organizationId: data.organizationId,
    hotelName: data.hotelName,
    role: data.role || 'user',
    tosAcceptedAt: data.tosAcceptedAt?.toDate?.() ?? data.tosAcceptedAt,
    tosVersion: data.tosVersion,
    privacyAcceptedAt: data.privacyAcceptedAt?.toDate?.() ?? data.privacyAcceptedAt,
    privacyVersion: data.privacyVersion,
  } as User;
}

/**
 * Update user profile (name, email, phone) via Cloud Function
 */
export async function updateUserProfile(
  userId: string,
  updates: { name?: string; email?: string; phone?: string }
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not authenticated');
  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${getFunctionsBaseUrl()}/userWriteHandler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({
      action: 'updateUserProfile',
      ...updates,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
}

/**
 * Get user preferences (re-exported from userPreferencesService for convenience)
 */
export { getUserPreferences, updateUserPreferences };