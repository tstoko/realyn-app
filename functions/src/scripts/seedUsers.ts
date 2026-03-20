/**
 * Script to seed user accounts in Firebase Auth and Firestore
 * This creates the demo accounts that match the organizations
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
// In Cloud Functions, this should use default credentials automatically
if (!admin.apps.length) {
  admin.initializeApp();
}

// Get Firestore instance
function getDb() {
  return admin.firestore();
}

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
    organizationId: "grand_palace_hotel", // Matches the org ID from seedOrganizations
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

async function seedUsers() {
  console.log("Starting user seed...");
  const db = getDb();

  for (const userData of users) {
    try {
      // Check if user already exists in Auth
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(userData.email);
        console.log(`User ${userData.email} already exists in Auth, skipping creation...`);
      } catch (error: any) {
        if (error.code === "auth/user-not-found") {
          // User doesn't exist, create it
          userRecord = await admin.auth().createUser({
            email: userData.email,
            password: userData.password,
            displayName: userData.name,
            emailVerified: true as boolean, // Auto-verify for demo accounts
          });
          console.log(`Created Auth user: ${userData.email}`);
        } else {
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
      console.error(`Error processing user ${userData.email}:`, error.message);
    }
  }

  console.log("User seed completed!");
}

// Run if called directly
if (require.main === module) {
  seedUsers()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error seeding users:", error);
      process.exit(1);
    });
}

export { seedUsers };

