import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { User } from '../types';
import { getUserPreferences, updateUserPreferences } from './userPreferencesService';
import type { UserPreferences } from '../types';

/**
 * Create or update a user document in Firestore
 */
export async function createOrUpdateUser(userId: string, userData: {
  name: string;
  email: string;
  role: 'admin' | 'user';
  organizationId?: string;
  hotelName?: string;
  phone?: string;
}): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    ...userData,
    updatedAt: Timestamp.now(),
  }, { merge: true });
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
 * Update user profile (name, email, phone)
 * Note: Email updates may require re-authentication
 */
export async function updateUserProfile(
  userId: string,
  updates: { name?: string; email?: string; phone?: string }
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const updateData: any = {
    updatedAt: Timestamp.now(),
  };
  
  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.email !== undefined) {
    updateData.email = updates.email;
  }
  if (updates.phone !== undefined) {
    updateData.phone = updates.phone;
  }
  
  await setDoc(userRef, updateData, { merge: true });
}

/**
 * Get user preferences (re-exported from userPreferencesService for convenience)
 */
export { getUserPreferences, updateUserPreferences };