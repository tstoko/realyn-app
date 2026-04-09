/**
 * Script to seed organizations in Firestore
 * Run with: node scripts/seed.js
 */

const {seedOrganizations} = require("../lib/scripts/seedOrganizations");

seedOrganizations()
    .then(() => {
      console.log("Seed completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error seeding organizations:", error);
      process.exit(1);
    });

