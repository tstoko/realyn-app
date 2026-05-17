/**
 * triggerRagSmoke.ts — post-C7 smoke test.
 *
 * Triggers re-planning on a chosen demo dispute by flipping its
 * `evidencePlanStatus` to "queued" (and setting `evidencePlanRegenerate: true`),
 * which the deployed `onEvidencePlanQueued` Firestore trigger picks up. The
 * trigger now has `PINECONE_API_KEY` bound, so any `[rag] ... chunksReturned=N`
 * log lines with N>0 prove retrieval is live in prod.
 *
 * After dispatch, polls the dispute every 5s for terminal status (`complete`,
 * `error`), reports the result, and (on complete) prints a quick fingerprint
 * of the new plan vs the previous one — section count, length, rough citation
 * marker count — so we can eyeball whether RAG materially changed the output.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/triggerRagSmoke.js <disputeId> [<disputeId>...]
 *
 * Example:
 *   node lib/scripts/triggerRagSmoke.js SJlJAYLlpv7cd8pLxSSs OKvtUnGQdIVg35hNFrUg
 *
 * Required env: ADC for firebase-admin to talk to prod Firestore.
 */

import * as admin from "firebase-admin";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "realyn-app";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000; // 8 min — generous for cold start + opus latency

function initApp(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  }
  return admin.firestore();
}

interface PlanFingerprint {
  status: string;
  hasPlan: boolean;
  planSections: number;
  planChars: number;
  citationMarkerCount: number;
  argumentChars: number;
  evidencePlanGeneratedAt?: string;
  argumentGeneratedAt?: string;
  evidencePlanError?: string;
}

// Counts rough rule-citation markers in the plan + argument text.
// Looks for patterns like [Visa Rule 1.2.3], [Mastercard CB 4853], (Visa Rule X.Y),
// (Mastercard ...), "Per Visa rule", etc. These are the strings the RAG-bound
// argument generator is supposed to emit when it grounds claims in retrieved
// chunks. Pre-RAG outputs almost never have them; post-RAG outputs should.
function countCitationMarkers(text: string): number {
  if (!text) return 0;
  const patterns: RegExp[] = [
    /\[(Visa|Mastercard|MasterCard)\s+(Rule|CB|Chargeback|Reason|Code)[^\]]*\]/gi,
    /\((Visa|Mastercard|MasterCard)\s+(Rule|CB|Chargeback|Reason|Code)[^)]*\)/gi,
    /\bPer\s+(Visa|Mastercard)\s+(rule|chargeback\s+guide|reason\s+code)/gi,
    /\bin\s+accordance\s+with\s+(Visa|Mastercard)\s+(rule|chargeback)/gi,
    /\bsection\s+\d+\.\d+/gi,
    /\bArticle\s+\d+\.\d+/gi,
  ];
  return patterns.reduce((sum, p) => sum + (text.match(p)?.length ?? 0), 0);
}

function flattenStrings(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenStrings).join("\n");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(flattenStrings)
      .join("\n");
  }
  return String(value);
}

function fingerprint(data: admin.firestore.DocumentData | undefined): PlanFingerprint {
  if (!data) {
    return {
      status: "missing",
      hasPlan: false,
      planSections: 0,
      planChars: 0,
      citationMarkerCount: 0,
      argumentChars: 0,
    };
  }
  const plan = data.evidencePlan ?? {};
  const planText = flattenStrings(plan);
  const planSections = Array.isArray(plan.sections) ? plan.sections.length : 0;
  const argumentText = flattenStrings(data.argumentDraft ?? "");
  const tsToIso = (v: unknown): string | undefined => {
    if (!v) return undefined;
    if (typeof v === "string") return v;
    if (v instanceof admin.firestore.Timestamp) return v.toDate().toISOString();
    if (typeof (v as { toDate?: () => Date }).toDate === "function") {
      try {
        return (v as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return undefined;
      }
    }
    return undefined;
  };
  return {
    status: data.evidencePlanStatus ?? "unknown",
    hasPlan: !!data.evidencePlan,
    planSections,
    planChars: planText.length,
    citationMarkerCount:
      countCitationMarkers(planText) + countCitationMarkers(argumentText),
    argumentChars: argumentText.length,
    evidencePlanGeneratedAt: tsToIso(data.evidencePlanGeneratedAt),
    argumentGeneratedAt: tsToIso(data.argumentGeneratedAt),
    evidencePlanError: data.evidencePlanError ?? undefined,
  };
}

async function triggerOne(db: admin.firestore.Firestore, disputeId: string) {
  const ref = db.collection("disputes").doc(disputeId);
  const before = (await ref.get()).data();
  if (!before) {
    console.error(`[smoke] ${disputeId}: NOT FOUND`);
    return { disputeId, ok: false, reason: "not_found" as const };
  }
  const beforeFp = fingerprint(before);
  console.log(`[smoke] ${disputeId} BEFORE:`, JSON.stringify(beforeFp, null, 2));

  const FieldValue = admin.firestore.FieldValue;
  await ref.update({
    evidencePlanStatus: "queued",
    evidencePlanRegenerate: true,
    evidencePlanError: null,
    evidencePlanQueuedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`[smoke] ${disputeId}: queued at ${new Date().toISOString()}`);

  const startMs = Date.now();
  let lastStatus = "queued";
  while (Date.now() - startMs < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const snap = await ref.get();
    const data = snap.data();
    const status = data?.evidencePlanStatus ?? "unknown";
    if (status !== lastStatus) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(`[smoke] ${disputeId}: ${lastStatus} -> ${status} (+${elapsed}s)`);
      lastStatus = status;
    }
    if (status === "complete" || status === "error") {
      const afterFp = fingerprint(data);
      const elapsedS = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(`[smoke] ${disputeId} AFTER (${elapsedS}s):`, JSON.stringify(afterFp, null, 2));
      const delta = {
        disputeId,
        ok: status === "complete",
        elapsedS,
        before: beforeFp,
        after: afterFp,
        delta: {
          planSections: afterFp.planSections - beforeFp.planSections,
          planChars: afterFp.planChars - beforeFp.planChars,
          citationMarkerCount:
            afterFp.citationMarkerCount - beforeFp.citationMarkerCount,
          argumentChars: afterFp.argumentChars - beforeFp.argumentChars,
        },
      };
      console.log(
        `[smoke] ${disputeId} DELTA: ${JSON.stringify(delta.delta)} -- ` +
          `citations_now=${afterFp.citationMarkerCount}, was=${beforeFp.citationMarkerCount}`,
      );
      return delta;
    }
  }
  console.error(`[smoke] ${disputeId}: TIMEOUT after ${POLL_TIMEOUT_MS / 1000}s, last_status=${lastStatus}`);
  return { disputeId, ok: false, reason: "timeout" as const };
}

async function main() {
  const disputeIds = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (disputeIds.length === 0) {
    console.error("usage: node triggerRagSmoke.js <disputeId> [<disputeId>...]");
    process.exit(2);
  }
  console.log(`[smoke] project=${PROJECT_ID} ids=${disputeIds.join(",")}`);
  const db = initApp();

  // Trigger sequentially to keep log timelines clean. The pipeline takes ~30-90s
  // per dispute on opus, so total wall time is bounded.
  const results: unknown[] = [];
  for (const id of disputeIds) {
    try {
      const r = await triggerOne(db, id);
      results.push(r);
    } catch (err) {
      console.error(`[smoke] ${id}: ERROR`, err);
      results.push({ disputeId: id, ok: false, reason: "exception", error: String(err) });
    }
  }
  console.log("[smoke] SUMMARY:", JSON.stringify(results, null, 2));
  const anyFail = results.some((r) => !(r as { ok?: boolean }).ok);
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
