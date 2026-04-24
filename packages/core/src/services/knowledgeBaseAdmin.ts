/**
 * Knowledge Base Admin Service
 *
 * CRUD operations for the 5 knowledge base collections. Used during
 * client onboarding to populate the KB from JSON/CSV data specific to
 * that client's PSP, vertical, and card networks.
 *
 * These are write-path operations — the read path lives in
 * knowledgeBaseService.ts.
 */

import * as admin from "firebase-admin";
import type {
  SchemeRule,
  EvidenceRequirementRule,
  PSPFormatRule,
  EvidenceOutputTemplate,
  WinPattern,
} from "../types/knowledgeBase";
import {
  KB_COLLECTIONS,
  schemeRuleDocId,
  evidenceRequirementDocId,
  pspFormatDocId,
  outputTemplateDocId,
  winPatternDocId,
} from "../types/knowledgeBase";

function getDb() {
  return admin.firestore();
}

const BATCH_LIMIT = 400;

async function batchWrite<T>(
  collectionName: string,
  items: T[],
  docIdFn: (item: T) => string,
): Promise<number> {
  const db = getDb();
  let written = 0;

  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = items.slice(i, i + BATCH_LIMIT);

    for (const item of chunk) {
      const docId = docIdFn(item);
      const ref = db.collection(collectionName).doc(docId);
      batch.set(ref, item as Record<string, unknown>, { merge: true });
    }

    await batch.commit();
    written += chunk.length;
  }

  return written;
}

// ---------------------------------------------------------------------------
// Scheme Rules
// ---------------------------------------------------------------------------

export async function importSchemeRules(rules: SchemeRule[]): Promise<number> {
  return batchWrite(
    KB_COLLECTIONS.SCHEME_RULES,
    rules,
    (r) => schemeRuleDocId(r.network, r.code),
  );
}

// ---------------------------------------------------------------------------
// Evidence Requirements
// ---------------------------------------------------------------------------

export async function importEvidenceRequirements(
  rules: EvidenceRequirementRule[],
): Promise<number> {
  return batchWrite(
    KB_COLLECTIONS.EVIDENCE_REQUIREMENTS,
    rules,
    (r) => evidenceRequirementDocId(r.network, r.reasonCode, r.verticalId),
  );
}

// ---------------------------------------------------------------------------
// PSP Format Rules
// ---------------------------------------------------------------------------

export async function importPSPFormats(rules: PSPFormatRule[]): Promise<number> {
  return batchWrite(
    KB_COLLECTIONS.PSP_FORMATS,
    rules,
    (r) => pspFormatDocId(r.pspProvider, r.evidenceSlot),
  );
}

// ---------------------------------------------------------------------------
// Evidence Output Templates
// ---------------------------------------------------------------------------

export async function importOutputTemplates(
  templates: EvidenceOutputTemplate[],
): Promise<number> {
  return batchWrite(
    KB_COLLECTIONS.EVIDENCE_OUTPUT_TEMPLATES,
    templates,
    (t) => outputTemplateDocId(t.evidenceType, t.verticalId, t.pspProvider),
  );
}

// ---------------------------------------------------------------------------
// Win Patterns (typically populated by the feedback loop, but can be
// pre-seeded from historical data)
// ---------------------------------------------------------------------------

export async function importWinPatterns(patterns: WinPattern[]): Promise<number> {
  return batchWrite(
    KB_COLLECTIONS.WIN_PATTERNS,
    patterns,
    (p) => winPatternDocId(p.network, p.reasonCode, p.verticalId),
  );
}

// ---------------------------------------------------------------------------
// Clear a KB collection (admin-only, for re-import)
// ---------------------------------------------------------------------------

export async function clearCollection(
  table: keyof typeof KB_COLLECTIONS,
): Promise<number> {
  const db = getDb();
  const collectionName = KB_COLLECTIONS[table];
  const snap = await db.collection(collectionName).get();

  if (snap.empty) return 0;

  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}
