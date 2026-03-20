/**
 * Authentication Middleware for Cloud Functions
 * 
 * Provides reusable authentication helpers for verifying Firebase Auth tokens
 * and checking user roles before allowing access to protected endpoints.
 */

import * as admin from "firebase-admin";
import { Request } from "express";

// =============================================================================
// Types
// =============================================================================

export interface AuthResult {
  success: boolean;
  error?: string;
  uid?: string;
  email?: string;
  role?: "admin" | "user";
  organizationId?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split("Bearer ")[1];
}

/**
 * Verify the ID token and return decoded token
 */
async function verifyToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error: any) {
    console.error("Token verification failed:", error.message);
    return null;
  }
}

/**
 * Get user data from Firestore
 */
async function getUserData(uid: string): Promise<FirebaseFirestore.DocumentData | null> {
  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    return userDoc.exists ? userDoc.data() || null : null;
  } catch (error: any) {
    console.error("Failed to fetch user data:", error.message);
    return null;
  }
}

// =============================================================================
// Public Auth Functions
// =============================================================================

/**
 * Verify that the request has a valid Firebase Auth token
 * Returns the user's UID if valid
 * 
 * Use this for endpoints that require any authenticated user
 */
export async function verifyUser(req: Request): Promise<AuthResult> {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    return { 
      success: false, 
      error: "Unauthorized: Missing or invalid authorization header" 
    };
  }

  const decodedToken = await verifyToken(idToken);
  if (!decodedToken) {
    return { 
      success: false, 
      error: "Unauthorized: Invalid or expired token" 
    };
  }

  // Optionally fetch user data for additional info
  const userData = await getUserData(decodedToken.uid);

  return {
    success: true,
    uid: decodedToken.uid,
    email: decodedToken.email,
    role: userData?.role as "admin" | "user" | undefined,
    organizationId: userData?.organizationId,
  };
}

/**
 * Verify that the request has a valid Firebase Auth token AND the user is an admin
 * 
 * Use this for sensitive operations like clearing data, user management, etc.
 */
export async function verifyAdmin(req: Request): Promise<AuthResult> {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    return { 
      success: false, 
      error: "Unauthorized: Missing or invalid authorization header" 
    };
  }

  const decodedToken = await verifyToken(idToken);
  if (!decodedToken) {
    return { 
      success: false, 
      error: "Unauthorized: Invalid or expired token" 
    };
  }

  // Check if user is admin in Firestore
  const userData = await getUserData(decodedToken.uid);
  if (!userData || userData.role !== "admin") {
    return { 
      success: false, 
      error: "Forbidden: Admin access required" 
    };
  }

  return {
    success: true,
    uid: decodedToken.uid,
    email: decodedToken.email,
    role: "admin",
    organizationId: userData.organizationId,
  };
}

/**
 * Verify that the request has a valid Firebase Auth token AND the user
 * belongs to the specified organization
 * 
 * Use this for endpoints that operate on organization-specific data
 */
export async function verifyUserInOrganization(
  req: Request, 
  organizationId: string
): Promise<AuthResult> {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    return { 
      success: false, 
      error: "Unauthorized: Missing or invalid authorization header" 
    };
  }

  const decodedToken = await verifyToken(idToken);
  if (!decodedToken) {
    return { 
      success: false, 
      error: "Unauthorized: Invalid or expired token" 
    };
  }

  // Check user's organization
  const userData = await getUserData(decodedToken.uid);
  if (!userData) {
    return { 
      success: false, 
      error: "Forbidden: User not found" 
    };
  }

  // Admins can access any organization
  if (userData.role === "admin") {
    return {
      success: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: "admin",
      organizationId: userData.organizationId,
    };
  }

  // Regular users must belong to the organization
  if (userData.organizationId !== organizationId) {
    return { 
      success: false, 
      error: "Forbidden: Access denied to this organization" 
    };
  }

  return {
    success: true,
    uid: decodedToken.uid,
    email: decodedToken.email,
    role: userData.role as "admin" | "user",
    organizationId: userData.organizationId,
  };
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Send an authentication error response
 * Returns the appropriate HTTP status code based on the error type
 */
export function sendAuthError(
  res: { status: (code: number) => { json: (body: any) => void } },
  authResult: AuthResult
): void {
  const statusCode = authResult.error?.startsWith("Forbidden") ? 403 : 401;
  res.status(statusCode).json({
    success: false,
    error: authResult.error,
  });
}
