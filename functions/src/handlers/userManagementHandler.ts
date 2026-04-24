import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { ALLOWED_ORIGINS } from "../config/environment";

// Ensure admin is initialized
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app",
  });
}

interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
  organizationId?: string;
  hotelName?: string;
}

interface UpdateUserRequest {
  userId: string;
  name?: string;
  role?: 'admin' | 'user';
  organizationId?: string;
  hotelName?: string;
}

/**
 * Helper function to verify admin authentication
 */
async function verifyAdmin(req: Request): Promise<{ success: boolean; error?: string; uid?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'Unauthorized: Missing authorization header' };
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error: any) {
    return { success: false, error: 'Invalid token' };
  }

  // Check if user is admin
  const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();
  if (!userData || userData.role !== 'admin') {
    return { success: false, error: 'Forbidden: Admin access required' };
  }

  return { success: true, uid: decodedToken.uid };
}

/**
 * Helper function to verify user authentication (any authenticated user)
 */
async function verifyUser(req: Request): Promise<{ success: boolean; error?: string; uid?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'Unauthorized: Missing authorization header' };
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error: any) {
    return { success: false, error: 'Invalid token' };
  }

  return { success: true, uid: decodedToken.uid };
}

/**
 * Create a new user in Firebase Auth and Firestore
 */
export const createUserHandler = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    try {
      // Verify admin authentication
      const authCheck = await verifyAdmin(req);
      if (!authCheck.success) {
        res.status(authCheck.error === 'Forbidden: Admin access required' ? 403 : 401)
          .json({ success: false, error: authCheck.error });
        return;
      }

      const { email, password, name, role, organizationId, hotelName }: CreateUserRequest = req.body;

      if (!email || !password || !name || !role) {
        res.status(400).json({ success: false, error: 'Missing required fields: email, password, name, role' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        return;
      }

      // Create user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        emailVerified: false,
      });

      // Create user document in Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        name,
        email,
        role,
        organizationId: organizationId || null,
        hotelName: hotelName || null,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      res.json({
        success: true,
        userId: userRecord.uid,
        message: 'User created successfully',
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/email-already-exists') {
        res.status(400).json({ success: false, error: 'Email already exists' });
      } else if (error.code === 'auth/invalid-email') {
        res.status(400).json({ success: false, error: 'Invalid email address' });
      } else {
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to create user',
        });
      }
    }
  }
);

/**
 * Update an existing user
 */
export const updateUserHandler = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    try {
      // Verify admin authentication
      const authCheck = await verifyAdmin(req);
      if (!authCheck.success) {
        res.status(authCheck.error === 'Forbidden: Admin access required' ? 403 : 401)
          .json({ success: false, error: authCheck.error });
        return;
      }

      const { userId, name, role, organizationId, hotelName }: UpdateUserRequest = req.body;

      if (!userId) {
        res.status(400).json({ success: false, error: 'Missing required field: userId' });
        return;
      }

      // Check if user exists
      try {
        await admin.auth().getUser(userId);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          res.status(404).json({ success: false, error: 'User not found' });
          return;
        }
        throw error;
      }

      // Update Firebase Auth user if name changed
      const updateData: any = {};
      if (name !== undefined) {
        updateData.displayName = name;
      }

      if (Object.keys(updateData).length > 0) {
        await admin.auth().updateUser(userId, updateData);
      }

      // Update Firestore user document
      const firestoreUpdate: any = {
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (name !== undefined) {
        firestoreUpdate.name = name;
      }
      if (role !== undefined) {
        firestoreUpdate.role = role;
      }
      if (organizationId !== undefined) {
        firestoreUpdate.organizationId = organizationId || null;
      }
      if (hotelName !== undefined) {
        firestoreUpdate.hotelName = hotelName || null;
      }

      await admin.firestore().collection('users').doc(userId).update(firestoreUpdate);

      res.json({
        success: true,
        message: 'User updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update user',
      });
    }
  }
);

/**
 * Delete a user from Firebase Auth and Firestore
 */
export const deleteUserHandler = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    try {
      // Verify admin authentication
      const authCheck = await verifyAdmin(req);
      if (!authCheck.success) {
        res.status(authCheck.error === 'Forbidden: Admin access required' ? 403 : 401)
          .json({ success: false, error: authCheck.error });
        return;
      }

      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ success: false, error: 'Missing required field: userId' });
        return;
      }

      // Prevent deleting yourself
      if (userId === authCheck.uid) {
        res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        return;
      }

      // Check if user exists
      try {
        await admin.auth().getUser(userId);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          res.status(404).json({ success: false, error: 'User not found' });
          return;
        }
        throw error;
      }

      // Delete from Firebase Auth
      await admin.auth().deleteUser(userId);

      // Delete from Firestore
      await admin.firestore().collection('users').doc(userId).delete();

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete user',
      });
    }
  }
);

/**
 * Update user's own profile (self-service)
 * Users can only update their own name and phone, not role or organization
 */
export const updateSelfProfileHandler = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response) => {
    try {
      // Verify user authentication
      const authCheck = await verifyUser(req);
      if (!authCheck.success) {
        res.status(401).json({ success: false, error: authCheck.error });
        return;
      }

      const userId = authCheck.uid!;
      const { name, phone } = req.body;

      // Only allow updating name and phone
      if (name === undefined && phone === undefined) {
        res.status(400).json({ success: false, error: 'No fields to update' });
        return;
      }

      // Check if user exists
      try {
        await admin.auth().getUser(userId);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          res.status(404).json({ success: false, error: 'User not found' });
          return;
        }
        throw error;
      }

      // Update Firebase Auth user if name changed
      const updateData: any = {};
      if (name !== undefined) {
        updateData.displayName = name;
      }

      if (Object.keys(updateData).length > 0) {
        await admin.auth().updateUser(userId, updateData);
      }

      // Update Firestore user document
      const firestoreUpdate: any = {
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (name !== undefined) {
        firestoreUpdate.name = name;
      }
      if (phone !== undefined) {
        firestoreUpdate.phone = phone || null;
      }

      await admin.firestore().collection('users').doc(userId).update(firestoreUpdate);

      res.json({
        success: true,
        message: 'Profile updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating self profile:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update profile',
      });
    }
  }
);

