/**
 * Knowledge Base Query Service (functions copy)
 *
 * Minimal subset needed by the evidence auto-collector and PSP mappers.
 * The canonical service is in packages/core/src/services/knowledgeBaseService.ts.
 */

import * as admin from "firebase-admin";
import type {
  PSPFormatRule,
  PSPProvider,
  EvidenceOutputTemplate,
  WinPattern,
  CardNetwork,
} from "../types/knowledgeBase";
import {KB_COLLECTIONS, winPatternDocId} from "../types/knowledgeBase";

function getDb() {
  return admin.firestore();
}

export async function getOutputTemplate(
  evidenceType: string,
  verticalId: string,
  pspProvider: PSPProvider,
): Promise<EvidenceOutputTemplate | null> {
  const db = getDb();
  const docId = `${evidenceType}_${verticalId}_${pspProvider}`;
  const snap = await db.collection(KB_COLLECTIONS.EVIDENCE_OUTPUT_TEMPLATES).doc(docId).get();

  if (snap.exists) {
    return snap.data() as EvidenceOutputTemplate;
  }

  return null;
}

export async function getPSPFormats(
  pspProvider: PSPProvider,
): Promise<PSPFormatRule[]> {
  const db = getDb();
  const snap = await db
    .collection(KB_COLLECTIONS.PSP_FORMATS)
    .where("pspProvider", "==", pspProvider)
    .get();

  if (snap.empty) return [];
  return snap.docs.map((doc) => doc.data() as PSPFormatRule);
}

export async function getWinPatterns(
  network: CardNetwork,
  reasonCode: string,
  verticalId: string,
): Promise<WinPattern[]> {
  const db = getDb();
  const docId = winPatternDocId(network, reasonCode, verticalId);
  const snap = await db.collection(KB_COLLECTIONS.WIN_PATTERNS).doc(docId).get();

  if (snap.exists) {
    return [snap.data() as WinPattern];
  }
  return [];
}
