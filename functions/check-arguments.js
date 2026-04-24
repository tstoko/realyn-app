const admin = require("firebase-admin");

// Initialize with default credentials (service account)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Prints a sample of disputes that have generated argument drafts.
 * @return {Promise<void>}
 */
async function checkArguments() {
  try {
    // Query all disputes
    const snapshot = await db.collection("disputes").limit(10).get();

    let withArguments = 0;
    const disputes = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.argumentDraft) {
        withArguments++;
        disputes.push({id: doc.id, data});
      }
    });

    console.log(`Found ${snapshot.size} disputes, ${withArguments} with arguments:\n`);

    disputes.forEach(({id, data}) => {
      console.log("=".repeat(70));
      console.log(`DISPUTE: ${id}`);
      console.log(`Reason: ${data.reason || "N/A"}`);
      console.log(`Amount: $${(data.amount / 100).toFixed(2)} ${data.currency?.toUpperCase()}`);
      console.log(`Status: ${data.lifecycleStatus || data.status}`);
      console.log("\n--- GENERATED ARGUMENT ---");
      const arg = data.argumentDraft;
      if (arg) {
        console.log(`\n📝 EXECUTIVE SUMMARY:`);
        console.log(arg.executiveSummary || "N/A");

        console.log(`\n📅 TIMELINE (${arg.timeline?.length || 0} events):`);
        arg.timeline?.forEach((e, i) => {
          console.log(`  ${i+1}. [${e.date}] ${e.description}`);
        });

        console.log(`\n📋 ARGUMENT SECTIONS (${arg.argumentSections?.length || arg.paragraphs?.length || 0}):`);
        (arg.argumentSections || arg.paragraphs)?.forEach((p, i) => {
          console.log(`  Section ${i+1}: ${p.heading || p.title}`);
          console.log(`  ${p.content?.substring(0, 150)}...`);
          console.log("");
        });

        if (arg.customerClaimRebuttal) {
          console.log(`\n⚖️ CUSTOMER CLAIM REBUTTAL:`);
          console.log(arg.customerClaimRebuttal);
        }

        console.log(`\n🎯 CONCLUSION:`);
        console.log(arg.conclusion || "N/A");
      }
      console.log("\n");
    });

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

checkArguments();
