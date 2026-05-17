/**
 * debugRagQuery.ts — reproduce the planner's exact RAG call for a dispute.
 *
 * Reads a dispute from prod Firestore, builds a `DisputeCase` the same way
 * `evidencePlanner.ts` does, then invokes `retrieveRulebookForPrompt` with
 * identical args and prints:
 *   - the inferred network filter,
 *   - the auto-built query string,
 *   - the count + top score of returned chunks,
 *   - the first chunk's source/excerpt.
 *
 * Why: the deployed function reports `chunksReturned=0` on dice (SJlJAYLlpv7cd8pLxSSs),
 * but `npm run rag:test` against the same Pinecone index returns scores ~13.
 * The difference must be in how the planner builds the query / filter from the
 * dispute case. This script narrows that down without redeploying.
 *
 * Usage (from `functions/`):
 *   PINECONE_API_KEY=$(gcloud secrets versions access latest --secret=PINECONE_API_KEY --project=realyn-app) \
 *   PINECONE_INDEX_NAME=realyn-rag-dev \
 *     node lib/scripts/debugRagQuery.js <disputeId>
 */

// Importing the shim registers the Pinecone-backed vector store (matches functions/src/index.ts).
import "../services/ai/ragService";

import * as admin from "firebase-admin";
import {
  buildRulebookRetrievalQuery,
  retrieveRulebookForPrompt,
  lookupReasonCodeDescription,
} from "@realyn/ai-core";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "realyn-app";

async function main() {
  const disputeId = process.argv[2];
  if (!disputeId) {
    console.error("usage: node debugRagQuery.js <disputeId>");
    process.exit(2);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
  const db = admin.firestore();

  const snap = await db.collection("disputes").doc(disputeId).get();
  if (!snap.exists) {
    console.error(`Dispute not found: ${disputeId}`);
    process.exit(1);
  }
  const dispute = { id: snap.id, ...snap.data() } as Record<string, unknown> & { id: string };
  const organizationId = dispute.organizationId as string | undefined;
  if (!organizationId) {
    console.error("Dispute is missing organizationId");
    process.exit(1);
  }

  // buildDisputeCase needs orgSnap + evidenceFiles + KB stuff; for the *retrieval*
  // we only need a minimal subset of fields. The retrieval code reads:
  //   pspReasonCode, reason, pspProvider, amount, currency, merchantVertical
  // so we synthesise a thin DisputeCase from the dispute doc directly.
  const disputeCase = {
    disputeId,
    organizationId,
    pspProvider: (dispute.pspProvider as string | undefined) ?? "stripe",
    pspReasonCode: (dispute.pspReasonCode as string | undefined) ?? undefined,
    reason: (dispute.reason as string | undefined) ?? undefined,
    reasonCode: (dispute.reasonCode as string | undefined) ?? undefined,
    network: (dispute.network as string | undefined) ?? undefined,
    amount: (dispute.amount as number | undefined) ?? 0,
    currency: (dispute.currency as string | undefined) ?? "usd",
    merchantVertical: (dispute.merchantVertical as string | undefined) ?? undefined,
    transactionDate: (dispute.transactionDate as string | undefined) ?? "",
    chargebackDate: (dispute.chargebackDate as string | undefined) ?? "",
  };
  console.log("--- DisputeCase (relevant fields for retrieval) ---");
  console.log(JSON.stringify(disputeCase, null, 2));

  const desc = lookupReasonCodeDescription(disputeCase as unknown as Parameters<typeof lookupReasonCodeDescription>[0]);
  console.log("--- lookupReasonCodeDescription ---");
  console.log(JSON.stringify(desc));

  const query = buildRulebookRetrievalQuery(
    disputeCase as unknown as Parameters<typeof buildRulebookRetrievalQuery>[0],
    desc,
  );
  console.log("--- buildRulebookRetrievalQuery ---");
  console.log(JSON.stringify(query));

  console.log("--- calling retrieveRulebookForPrompt (planner path) ---");
  const result = await retrieveRulebookForPrompt({
    disputeCase: disputeCase as unknown as Parameters<typeof retrieveRulebookForPrompt>[0]["disputeCase"],
    stage: "evidence_planning",
    reasonCodeDescription: desc,
  });

  console.log("--- result ---");
  console.log(`chunks: ${result.chunks.length}`);
  console.log(`topScore: ${result.topScore}`);
  console.log(`disabled: ${result.disabled}`);
  if (result.chunks[0]) {
    console.log(`--- first chunk ---`);
    console.log(`score: ${result.chunks[0].score}`);
    console.log(`source: ${(result.chunks[0] as { metadata?: { source?: string } }).metadata?.source}`);
    const txt = (result.chunks[0] as { text?: string }).text ?? "";
    console.log(`text: ${txt.slice(0, 300)}...`);
  }

  // also try calling with an explicit, hand-written query and no filter, to compare:
  console.log("");
  console.log("--- comparison: call with hand-written query, no filter ---");
  const handCrafted = await retrieveRulebookForPrompt({
    disputeCase: disputeCase as unknown as Parameters<typeof retrieveRulebookForPrompt>[0]["disputeCase"],
    stage: "evidence_planning",
    queryText:
      "Visa reason code 12.6 duplicate processing - merchant needs evidence to defend a duplicate charge dispute",
  });
  console.log(`chunks: ${handCrafted.chunks.length}, topScore: ${handCrafted.topScore}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
