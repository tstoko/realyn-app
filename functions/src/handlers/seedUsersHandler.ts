import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

// Ensure admin is initialized with explicit project configuration
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app",
  });
}

/**
 * HTTP endpoint to seed users in Firebase Auth and Firestore
 * Call this once via the function URL
 */
export const seedUsersHandler = onRequest(
  {
    cors: true,
    invoker: "public", // Temporarily allow public access for seeding
  },
  async (req: Request, res: Response) => {
    try {
      console.log("Starting user seed via HTTP endpoint...");
      await seedUsersDirect();
      res.json({ 
        success: true, 
        message: "Users seeded successfully!" 
      });
    } catch (error: any) {
      console.error("Error seeding users:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// Enable Email/Password provider using Identity Toolkit API
async function enableEmailPasswordProvider() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "realyn-app";
  
  try {
    // Get access token for the service account
    const credential = admin.credential.applicationDefault();
    const client = await credential.getAccessToken();
    
    if (!client || !client.access_token) {
      console.log("Could not get access token, will try to create users anyway");
      return false;
    }
    
    const accessToken = client.access_token;
    
    // Try the correct Identity Toolkit API v2 endpoint
    // First, get current config
    const getResponse = await fetch(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (getResponse.ok) {
      const config = await getResponse.json();
      // Check if email is already enabled
      if (config.signIn?.email?.enabled) {
        console.log("Email/Password authentication is already enabled");
        return true;
      }
      
      // Enable Email/Password
      const patchResponse = await fetch(
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signIn: {
              email: {
                enabled: true,
                passwordRequired: true,
              },
            },
          }),
        }
      );
      
      if (patchResponse.ok) {
        console.log("Email/Password authentication enabled successfully");
        return true;
      } else {
        const errorText = await patchResponse.text();
        console.log(`Could not enable Auth via API: ${patchResponse.status} - ${errorText.substring(0, 200)}`);
        return false;
      }
    } else {
      // If GET fails, try PATCH anyway (might work)
      const patchResponse = await fetch(
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signIn: {
              email: {
                enabled: true,
                passwordRequired: true,
              },
            },
          }),
        }
      );
      
      if (patchResponse.ok) {
        console.log("Email/Password authentication enabled successfully");
        return true;
      }
      return false;
    }
  } catch (error: any) {
    console.log(`Note: Could not enable Auth programmatically: ${error.message}`);
    console.log("Auth must be enabled manually in Firebase Console");
    console.log("Go to: https://console.firebase.google.com/project/realyn-app/authentication/providers");
    console.log("Click 'Email/Password' and enable it, then re-run this function");
    return false;
  }
}

// Inline seed function to avoid module initialization issues
async function seedUsersDirect() {
  console.log("Starting user seed...");
  
  // Try to enable Email/Password provider first
  await enableEmailPasswordProvider();
  
  // Wait a moment for the change to propagate
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const db = admin.firestore();
  const auth = admin.auth();

  const users = [
    {
      email: "admin@realyn.com",
      password: "masterpass",
      name: "Alex Admin",
      role: "admin",
      organizationId: null,
      hotelName: null,
    },
    {
      email: "user1@gph.com",
      password: "password123",
      name: "Jamie Frontdesk",
      role: "user",
      organizationId: "grand_palace_hotel",
      hotelName: "Grand Palace Hotel",
    },
    {
      email: "user2@lakeside.com",
      password: "password123",
      name: "Casey Manager",
      role: "user",
      organizationId: "lakeside_resort_spa",
      hotelName: "Lakeside Resort & Spa",
    },
    {
      email: "user3@mbi.com",
      password: "password123",
      name: "Taylor Finance",
      role: "user",
      organizationId: "metropolis_business_inn",
      hotelName: "Metropolis Business Inn",
    },
  ];

  for (const userData of users) {
    try {
      // Check if user already exists in Auth
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(userData.email);
        console.log(`User ${userData.email} already exists in Auth, skipping creation...`);
      } catch (error: any) {
        if (error.code === "auth/user-not-found") {
          // User doesn't exist, create it
          userRecord = await auth.createUser({
            email: userData.email,
            password: userData.password,
            displayName: userData.name,
            emailVerified: true,
          });
          console.log(`Created Auth user: ${userData.email}`);
        } else {
          console.error(`Error checking/creating user ${userData.email}:`, error.code, error.message);
          throw error;
        }
      }

      // Create/update user document in Firestore
      const userDocRef = db.collection("users").doc(userRecord.uid);
      const userDoc = await userDocRef.get();

      if (userDoc.exists) {
        console.log(`User document for ${userData.email} already exists, updating...`);
      }

      await userDocRef.set(
        {
          name: userData.name,
          email: userData.email,
          role: userData.role,
          organizationId: userData.organizationId || null,
          hotelName: userData.hotelName || null,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

      console.log(`Created/updated user document: ${userData.email} (${userRecord.uid})`);
    } catch (error: any) {
      if (error.code === 'auth/configuration-not-found') {
        console.error(`\n❌ CRITICAL: Firebase Authentication is NOT enabled!`);
        console.error(`\n📋 TO FIX THIS:`);
        console.error(`1. Open: https://console.firebase.google.com/project/realyn-app/authentication/providers`);
        console.error(`2. Click on "Email/Password"`);
        console.error(`3. Toggle "Enable" to ON`);
        console.error(`4. Click "Save"`);
        console.error(`5. Wait 10 seconds, then re-run this function\n`);
        throw new Error(`Firebase Authentication must be enabled. Visit: https://console.firebase.google.com/project/realyn-app/authentication/providers`);
      }
      console.error(`Error processing user ${userData.email}:`, error.code || error.message, error.message);
      throw error; // Re-throw to stop execution
    }
  }

  console.log("✅ User seed completed successfully!");
}

