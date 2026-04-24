/**
 * Script to seed organizations in Firestore using Firebase Admin SDK
 * Run with: firebase functions:shell and then require('./scripts/seedWithFirebase')
 * Or: node -e "require('./lib/scripts/seedOrganizations').seedOrganizations()"
 */

// Set the project ID
process.env.GCLOUD_PROJECT = "realyn-app";
process.env.GCP_PROJECT = "realyn-app";

const {seedOrganizations} = require("../lib/scripts/seedOrganizations");

seedOrganizations()
    .then(() => {
      console.log("✅ Seed completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error seeding organizations:", error);
      process.exit(1);
    });

