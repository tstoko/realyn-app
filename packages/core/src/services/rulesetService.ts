import * as admin from "firebase-admin";
import type { CardNetwork, DisputeCodeInfo } from "../config/disputeCodeMapping";
import { ALL_DISPUTE_CODES, getDisputeCodeInfo } from "../config/disputeCodeMapping";

export interface Ruleset {
  id: string;
  network: CardNetwork;
  version: string;
  effectiveDate: string;
  supersededDate?: string;
  isActive: boolean;
  sourceDocumentRef?: string;
  importedAt: admin.firestore.Timestamp;
}

export interface DisputeRuleCitation {
  section: string;
  excerpt: string;
}

export interface DisputeRule {
  id: string;
  rulesetId: string;
  reasonCode: string;
  network: CardNetwork;
  category: string;
  subcategory?: string;
  description: string;
  requiredEvidence: string[];
  optionalEvidence: string[];
  deadlineRules?: string;
  submissionConstraints?: string[];
  citations: DisputeRuleCitation[];
  verticalRelevance: Record<string, "high" | "medium" | "low">;
}

export interface RulesetDiffEntry {
  reasonCode: string;
  field: string;
  oldValue: any;
  newValue: any;
}

export interface RulesetDiff {
  oldVersion: string;
  newVersion: string;
  added: string[];
  removed: string[];
  modified: RulesetDiffEntry[];
}

function getDb() {
  return admin.firestore();
}

const RULESETS_COLLECTION = "rulesets";

export async function getActiveRuleset(
  network: CardNetwork,
): Promise<Ruleset | null> {
  const db = getDb();
  const snap = await db
    .collection(RULESETS_COLLECTION)
    .where("network", "==", network)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Ruleset;
}

/**
 * Get applicable rules for a reason code. Falls back to the static
 * disputeCodeMapping if no Firestore ruleset is populated yet.
 */
export async function getApplicableRules(
  network: CardNetwork,
  reasonCode: string,
  effectiveDate?: string,
): Promise<DisputeRule | null> {
  const db = getDb();

  let rulesetQuery: admin.firestore.Query = db
    .collection(RULESETS_COLLECTION)
    .where("network", "==", network)
    .where("isActive", "==", true);

  const rulesetSnap = await rulesetQuery.limit(1).get();

  if (!rulesetSnap.empty) {
    const rulesetId = rulesetSnap.docs[0].id;
    const ruleSnap = await db
      .collection(RULESETS_COLLECTION)
      .doc(rulesetId)
      .collection("rules")
      .where("reasonCode", "==", reasonCode)
      .limit(1)
      .get();

    if (!ruleSnap.empty) {
      return { id: ruleSnap.docs[0].id, ...ruleSnap.docs[0].data() } as DisputeRule;
    }
  }

  // Fallback to static mapping
  const staticInfo = getDisputeCodeInfo(reasonCode);
  if (!staticInfo) return null;

  return {
    id: `static-${reasonCode}`,
    rulesetId: "static",
    reasonCode: staticInfo.code,
    network: staticInfo.network,
    category: staticInfo.category,
    subcategory: staticInfo.subcategory,
    description: staticInfo.description,
    requiredEvidence: staticInfo.requiredEvidence,
    optionalEvidence: staticInfo.optionalEvidence,
    citations: [],
    verticalRelevance: {
      hospitality: staticInfo.hotelRelevance,
    },
  };
}

export async function importRuleset(
  network: CardNetwork,
  version: string,
  rules: Omit<DisputeRule, "id" | "rulesetId">[],
): Promise<string> {
  const db = getDb();

  // Deactivate existing active rulesets for this network
  const existingSnap = await db
    .collection(RULESETS_COLLECTION)
    .where("network", "==", network)
    .where("isActive", "==", true)
    .get();

  const batch = db.batch();
  for (const doc of existingSnap.docs) {
    batch.update(doc.ref, {
      isActive: false,
      supersededDate: new Date().toISOString().split("T")[0],
    });
  }

  const rulesetRef = db.collection(RULESETS_COLLECTION).doc();
  const ruleset: Omit<Ruleset, "id"> = {
    network,
    version,
    effectiveDate: new Date().toISOString().split("T")[0],
    isActive: true,
    importedAt: admin.firestore.Timestamp.now(),
  };
  batch.set(rulesetRef, ruleset);

  await batch.commit();

  // Add rules in batches of 500 (Firestore batch limit)
  const rulesCollection = rulesetRef.collection("rules");
  for (let i = 0; i < rules.length; i += 400) {
    const ruleBatch = db.batch();
    const chunk = rules.slice(i, i + 400);
    for (const rule of chunk) {
      const ruleRef = rulesCollection.doc();
      ruleBatch.set(ruleRef, { ...rule, rulesetId: rulesetRef.id });
    }
    await ruleBatch.commit();
  }

  return rulesetRef.id;
}

export async function diffRulesets(
  oldVersion: string,
  newVersion: string,
): Promise<RulesetDiff> {
  const db = getDb();

  const [oldSnap, newSnap] = await Promise.all([
    db.collection(RULESETS_COLLECTION).where("version", "==", oldVersion).limit(1).get(),
    db.collection(RULESETS_COLLECTION).where("version", "==", newVersion).limit(1).get(),
  ]);

  if (oldSnap.empty || newSnap.empty) {
    throw new Error("One or both ruleset versions not found");
  }

  const [oldRulesSnap, newRulesSnap] = await Promise.all([
    oldSnap.docs[0].ref.collection("rules").get(),
    newSnap.docs[0].ref.collection("rules").get(),
  ]);

  const oldRules = new Map<string, any>();
  for (const doc of oldRulesSnap.docs) {
    const data = doc.data();
    oldRules.set(data.reasonCode, data);
  }

  const newRules = new Map<string, any>();
  for (const doc of newRulesSnap.docs) {
    const data = doc.data();
    newRules.set(data.reasonCode, data);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const modified: RulesetDiffEntry[] = [];

  for (const code of newRules.keys()) {
    if (!oldRules.has(code)) {
      added.push(code);
    }
  }

  for (const code of oldRules.keys()) {
    if (!newRules.has(code)) {
      removed.push(code);
    }
  }

  for (const [code, newRule] of newRules) {
    const oldRule = oldRules.get(code);
    if (!oldRule) continue;
    for (const field of ["description", "requiredEvidence", "optionalEvidence", "category"]) {
      const oldVal = JSON.stringify(oldRule[field]);
      const newVal = JSON.stringify(newRule[field]);
      if (oldVal !== newVal) {
        modified.push({
          reasonCode: code,
          field,
          oldValue: oldRule[field],
          newValue: newRule[field],
        });
      }
    }
  }

  return { oldVersion, newVersion, added, removed, modified };
}

/**
 * Seed initial rulesets from the static disputeCodeMapping.
 * Intended to be run once during setup.
 */
export async function seedFromStaticMapping(): Promise<Record<CardNetwork, string>> {
  const rulesByNetwork = new Map<CardNetwork, Omit<DisputeRule, "id" | "rulesetId">[]>();

  for (const [code, info] of Object.entries(ALL_DISPUTE_CODES)) {
    const network = info.network;
    if (!rulesByNetwork.has(network)) {
      rulesByNetwork.set(network, []);
    }
    rulesByNetwork.get(network)!.push({
      reasonCode: info.code,
      network: info.network,
      category: info.category,
      subcategory: info.subcategory,
      description: info.description,
      requiredEvidence: info.requiredEvidence,
      optionalEvidence: info.optionalEvidence,
      citations: [],
      verticalRelevance: {
        hospitality: info.hotelRelevance,
      },
    });
  }

  const result: Record<string, string> = {};
  for (const [network, rules] of rulesByNetwork) {
    result[network] = await importRuleset(network, "1.0.0-static", rules);
  }

  return result as Record<CardNetwork, string>;
}
