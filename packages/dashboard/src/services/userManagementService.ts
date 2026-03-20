import { auth } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';

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

interface DeleteUserRequest {
  userId: string;
}

interface UserManagementResponse {
  success: boolean;
  userId?: string;
  message?: string;
  error?: string;
}

/**
 * Create a new user
 */
export async function createUser(userData: CreateUserRequest): Promise<UserManagementResponse> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch(`${FUNCTIONS_BASE_URL}/createUserHandler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(userData),
    });

    // Handle non-JSON responses (like 404 or network errors)
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // If response is not JSON, it's likely a network error or function doesn't exist
      if (!response.ok) {
        return { 
          success: false, 
          error: `Function not found or not deployed. Status: ${response.status}. Please deploy the Cloud Functions.` 
        };
      }
      throw jsonError;
    }
    
    if (!response.ok) {
      return { success: false, error: data.error || `Failed to create user (${response.status})` };
    }

    return { success: true, userId: data.userId, message: data.message };
  } catch (error: any) {
    console.error('Error creating user:', error);
    // Check if it's a network error
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      return { 
        success: false, 
        error: 'Cloud Function not found. Please deploy the functions using: firebase deploy --only functions' 
      };
    }
    return { success: false, error: error.message || 'Failed to create user' };
  }
}

/**
 * Update an existing user
 */
export async function updateUser(userData: UpdateUserRequest): Promise<UserManagementResponse> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch(`${FUNCTIONS_BASE_URL}/updateUserHandler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(userData),
    });

    // Handle non-JSON responses (like 404 or network errors)
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // If response is not JSON, it's likely a network error or function doesn't exist
      if (!response.ok) {
        return { 
          success: false, 
          error: `Function not found or not deployed. Status: ${response.status}. Please deploy the Cloud Functions.` 
        };
      }
      throw jsonError;
    }
    
    if (!response.ok) {
      return { success: false, error: data.error || `Failed to update user (${response.status})` };
    }

    return { success: true, message: data.message };
  } catch (error: any) {
    console.error('Error updating user:', error);
    // Check if it's a network error
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      return { 
        success: false, 
        error: 'Cloud Function not found. Please deploy the functions using: firebase deploy --only functions' 
      };
    }
    return { success: false, error: error.message || 'Failed to update user' };
  }
}

/**
 * Delete a user
 */
export async function deleteUser(userData: DeleteUserRequest): Promise<UserManagementResponse> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch(`${FUNCTIONS_BASE_URL}/deleteUserHandler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(userData),
    });

    // Handle non-JSON responses (like 404 or network errors)
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // If response is not JSON, it's likely a network error or function doesn't exist
      if (!response.ok) {
        return { 
          success: false, 
          error: `Function not found or not deployed. Status: ${response.status}. Please deploy the Cloud Functions.` 
        };
      }
      throw jsonError;
    }
    
    if (!response.ok) {
      return { success: false, error: data.error || `Failed to delete user (${response.status})` };
    }

    return { success: true, message: data.message };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    // Check if it's a network error
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      return { 
        success: false, 
        error: 'Cloud Function not found. Please deploy the functions using: firebase deploy --only functions' 
      };
    }
    return { success: false, error: error.message || 'Failed to delete user' };
  }
}

