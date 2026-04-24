/**
 * Knowledge Base Seed Script (Scaffold)
 *
 * This script is intentionally empty of data. When a new client onboards,
 * populate the arrays below with rules specific to that client's PSP,
 * vertical, and card networks, then run:
 *
 *   npx ts-node --project tsconfig.json src/scripts/seedKnowledgeBase.ts
 *
 * Or add a package.json script that executes this file.
 *
 * The pipeline works without any KB data — it falls back to the static
 * disputeCodeMapping.ts. Seeded data enriches the LLM context with
 * merchant obligations, cardholder burdens, citations, PSP slot formats,
 * vertical-specific evidence requirements, and output templates.
 */

import * as admin from "firebase-admin";
import {
  importSchemeRules,
  importEvidenceRequirements,
  importPSPFormats,
  importOutputTemplates,
  importWinPatterns,
  clearCollection,
} from "../services/knowledgeBaseAdmin";
import type {
  SchemeRule,
  EvidenceRequirementRule,
  PSPFormatRule,
  EvidenceOutputTemplate,
  WinPattern,
} from "../types/knowledgeBase";

// Initialize Firebase Admin with Application Default Credentials
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

// ---------------------------------------------------------------------------
// Data arrays — populate these per-client before running the script
// ---------------------------------------------------------------------------

const schemeRules: SchemeRule[] = [
  // Example:
  // {
  //   code: "13.1",
  //   network: "visa",
  //   category: "Consumer Disputes",
  //   subcategory: "Merchandise/Services Not Received",
  //   description: "Cardholder claims they did not receive merchandise or services",
  //   merchantObligation: "Prove services were rendered or goods delivered",
  //   cardholderBurden: "Must have attempted to resolve with merchant",
  //   timeLimit: { days: 120, fromEvent: "transaction_date" },
  //   citations: [{ section: "Visa Core Rules 11.3", excerpt: "..." }],
  //   submissionConstraints: ["Must include proof of delivery or service"],
  //   hotelRelevance: "high",
  //   commonInHotels: true,
  //   defaultRecommendation: "fight",
  //   defaultWinnability: "high",
  //   requiredEvidence: ["pms_data", "proof_of_stay", "communications"],
  //   optionalEvidence: ["policy", "payment_data"],
  //   effectiveDate: "2024-01-01",
  // },
];

const evidenceRequirements: EvidenceRequirementRule[] = [
  // Example:
  // {
  //   reasonCode: "13.1",
  //   network: "visa",
  //   verticalId: "hospitality",
  //   requirements: [
  //     {
  //       evidenceType: "folio",
  //       category: "pms_data",
  //       priority: "critical",
  //       rationale: "Shows itemized charges proving services rendered",
  //       tips: ["Include all line items", "Show zero balance at checkout"],
  //       canAutoFulfill: true,
  //       sourceSystem: "pms",
  //     },
  //   ],
  //   updatedAt: new Date().toISOString(),
  // },
];

const pspFormats: PSPFormatRule[] = [
  // Example:
  // {
  //   pspProvider: "stripe",
  //   evidenceSlot: "service_documentation",
  //   apiFieldName: "evidence.service_documentation",
  //   acceptedFormats: ["text"],
  //   maxSizeBytes: null,
  //   isRequired: false,
  //   description: "Text description of the service provided",
  // },
];

const outputTemplates: EvidenceOutputTemplate[] = [
  // Example:
  // {
  //   evidenceType: "folio",
  //   verticalId: "hospitality",
  //   pspProvider: "stripe",
  //   outputFormat: "pdf",
  //   extractionMethod: "pms_folio",
  //   pspSlotMapping: "receipt",
  // },
];

const winPatterns: WinPattern[] = [
  // Win patterns are typically populated by the feedback loop (Phase 6).
  // Pre-seed here only if you have historical outcome data.
];

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

async function main() {
  const clearFirst = process.argv.includes("--clear");

  if (clearFirst) {
    console.log("Clearing existing KB data...");
    const tables = [
      "SCHEME_RULES",
      "EVIDENCE_REQUIREMENTS",
      "PSP_FORMATS",
      "EVIDENCE_OUTPUT_TEMPLATES",
      "WIN_PATTERNS",
    ] as const;
    for (const table of tables) {
      const count = await clearCollection(table);
      console.log(`  ${table}: deleted ${count} docs`);
    }
  }

  console.log("\nImporting knowledge base data...");

  if (schemeRules.length > 0) {
    const count = await importSchemeRules(schemeRules);
    console.log(`  Scheme rules: ${count} imported`);
  } else {
    console.log("  Scheme rules: (none to import)");
  }

  if (evidenceRequirements.length > 0) {
    const count = await importEvidenceRequirements(evidenceRequirements);
    console.log(`  Evidence requirements: ${count} imported`);
  } else {
    console.log("  Evidence requirements: (none to import)");
  }

  if (pspFormats.length > 0) {
    const count = await importPSPFormats(pspFormats);
    console.log(`  PSP formats: ${count} imported`);
  } else {
    console.log("  PSP formats: (none to import)");
  }

  if (outputTemplates.length > 0) {
    const count = await importOutputTemplates(outputTemplates);
    console.log(`  Output templates: ${count} imported`);
  } else {
    console.log("  Output templates: (none to import)");
  }

  if (winPatterns.length > 0) {
    const count = await importWinPatterns(winPatterns);
    console.log(`  Win patterns: ${count} imported`);
  } else {
    console.log("  Win patterns: (none to import)");
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
