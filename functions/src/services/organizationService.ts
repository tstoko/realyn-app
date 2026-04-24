import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Organization } from "../types/organization";
import { encryptCredentials, decryptCredentials } from "../utils/encryption";

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// Fields that should be encrypted in PSP integrations
const PSP_ENCRYPTED_FIELDS = {
  stripe: ["secretKey", "accessToken", "webhookSecret"] as const,
  adyen: ["apiKey", "webhookUsername", "webhookPassword"] as const,
} as const;

/**
 * Get organization by ID (with decrypted credentials)
 */
export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const db = getDb();
  const doc = await db.collection("organizations").doc(organizationId).get();
  if (!doc.exists) {
    return null;
  }
  
  const orgData = doc.data() as Organization;
  return decryptOrganizationCredentials({ id: doc.id, ...orgData });
}

/**
 * Get all organizations (with decrypted credentials)
 */
export async function getAllOrganizations(): Promise<Organization[]> {
  const db = getDb();
  const snapshot = await db.collection("organizations").get();
  return snapshot.docs.map((doc) => {
    const orgData = doc.data() as Organization;
    return decryptOrganizationCredentials({ id: doc.id, ...orgData });
  });
}

/**
 * Create a new organization (with encrypted credentials)
 */
export async function createOrganization(
  organization: Omit<Organization, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const now = admin.firestore.Timestamp.now();
  const encryptedOrg = encryptOrganizationCredentials(organization);
  const db = getDb();
  const docRef = await db.collection("organizations").add({
    ...encryptedOrg,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

/**
 * Update an organization (with encrypted credentials)
 */
export async function updateOrganization(
  organizationId: string,
  updates: Partial<Omit<Organization, "id" | "createdAt">>
): Promise<void> {
  const encryptedUpdates = encryptOrganizationCredentials(updates);
  const db = getDb();
  await db.collection("organizations").doc(organizationId).update({
    ...encryptedUpdates,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Delete an organization
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const db = getDb();
  await db.collection("organizations").doc(organizationId).delete();
}

/**
 * Get organization by Stripe merchant account
 */
export async function getOrganizationByStripeMerchant(
  merchantAccountId: string
): Promise<Organization | null> {
  const db = getDb();
  const snapshot = await db
    .collection("organizations")
    .where("pspIntegrations.stripe.merchantAccountId", "==", merchantAccountId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const orgData = snapshot.docs[0].data() as Organization;
  return decryptOrganizationCredentials({ id: snapshot.docs[0].id, ...orgData });
}

/**
 * Get organization by Adyen merchant account
 * Supports both old single merchantAccount and new merchantAccounts array
 */
export async function getOrganizationByAdyenMerchant(
  merchantAccount: string
): Promise<Organization | null> {
  const db = getDb();
  const snapshot = await db
    .collection("organizations")
    .where("pspIntegrations.adyen.status", "==", "connected")
    .get();

  // Find organization that has this merchant account in its array or legacy field
  for (const doc of snapshot.docs) {
    const orgData = doc.data() as Organization;
    const decryptedOrg = decryptOrganizationCredentials({ id: doc.id, ...orgData });
    
    const adyenIntegration = decryptedOrg.pspIntegrations?.adyen;
    if (!adyenIntegration) {
      continue;
    }

    // Check new merchantAccounts array
    if (adyenIntegration.merchantAccounts && Array.isArray(adyenIntegration.merchantAccounts)) {
      if (adyenIntegration.merchantAccounts.includes(merchantAccount)) {
        return decryptedOrg;
      }
    }
    
    // Check legacy merchantAccount field for backward compatibility
    if (adyenIntegration.merchantAccount === merchantAccount) {
      return decryptedOrg;
    }
  }

  return null;
}

/**
 * Encrypt sensitive credentials in an organization object
 */
function encryptOrganizationCredentials<T extends Partial<Organization>>(org: T): T {
  const encrypted = { ...org };

  // Encrypt PSP credentials
  if (encrypted.pspIntegrations) {
    if (encrypted.pspIntegrations.stripe) {
      encrypted.pspIntegrations.stripe = encryptCredentials(
        encrypted.pspIntegrations.stripe,
        [...PSP_ENCRYPTED_FIELDS.stripe]
      );
    }
    if (encrypted.pspIntegrations.adyen) {
      encrypted.pspIntegrations.adyen = encryptCredentials(
        encrypted.pspIntegrations.adyen,
        [...PSP_ENCRYPTED_FIELDS.adyen]
      );
    }
  }

  return encrypted;
}

/**
 * Decrypt sensitive credentials in an organization object
 */
function decryptOrganizationCredentials(org: Organization): Organization {
  const decrypted = { ...org };

  // Decrypt PSP credentials
  if (decrypted.pspIntegrations) {
    if (decrypted.pspIntegrations.stripe) {
      decrypted.pspIntegrations.stripe = decryptCredentials(
        decrypted.pspIntegrations.stripe,
        [...PSP_ENCRYPTED_FIELDS.stripe]
      );
    }
    if (decrypted.pspIntegrations.adyen) {
      decrypted.pspIntegrations.adyen = decryptCredentials(
        decrypted.pspIntegrations.adyen,
        [...PSP_ENCRYPTED_FIELDS.adyen]
      );
    }
  }

  return decrypted;
}

