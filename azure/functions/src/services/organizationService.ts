import { getOrganizationsContainer } from "./cosmosClient";
import { getEncryptionKey } from "./keyVaultClient";
import * as crypto from "crypto";

// Types
export interface StripeIntegration {
  secretKey?: string;
  accessToken?: string;
  webhookSecret?: string;
  merchantAccountId?: string;
  status: "connected" | "not_connected";
}

export interface AdyenIntegration {
  apiKey?: string;
  merchantAccounts?: string[];
  webhookUsername?: string;
  webhookPassword?: string;
  liveEndpointPrefix?: string;
  status: "connected" | "not_connected";
}

export interface PSPIntegrations {
  stripe?: StripeIntegration;
  adyen?: AdyenIntegration;
}

export interface Organization {
  id: string;
  name: string;
  location: string;
  pspIntegrations: PSPIntegrations;
  automationSettings: {
    autoSubmissionEnabled: boolean;
    autoSubmissionMinAmount: number;
    autoMarkNotContested: boolean;
  };
  teams: Array<{ name: string; email: string }>;
  documents: Array<{
    id: string;
    name: string;
    category: string;
    fileName: string;
    fileSize: number;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Encryption constants
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

// Fields to encrypt
const PSP_ENCRYPTED_FIELDS = {
  stripe: ["secretKey", "accessToken", "webhookSecret"] as const,
  adyen: ["apiKey", "webhookUsername", "webhookPassword"] as const,
};

/**
 * Encrypt a string value
 */
async function encrypt(text: string): Promise<string> {
  if (!text) return "";
  
  const key = await getEncryptionKey();
  const keyBuffer = Buffer.from(key, "base64");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer.slice(0, 32), iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt an encrypted string
 */
async function decrypt(encryptedText: string): Promise<string> {
  if (!encryptedText) return "";
  
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  
  const key = await getEncryptionKey();
  const keyBuffer = Buffer.from(key, "base64");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer.slice(0, 32), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

/**
 * Encrypt organization credentials
 */
async function encryptOrgCredentials(org: Partial<Organization>): Promise<Partial<Organization>> {
  const encrypted = { ...org };
  
  if (encrypted.pspIntegrations?.stripe) {
    for (const field of PSP_ENCRYPTED_FIELDS.stripe) {
      const value = encrypted.pspIntegrations.stripe[field];
      if (value) {
        (encrypted.pspIntegrations.stripe as any)[field] = await encrypt(value);
      }
    }
  }
  
  if (encrypted.pspIntegrations?.adyen) {
    for (const field of PSP_ENCRYPTED_FIELDS.adyen) {
      const value = encrypted.pspIntegrations.adyen[field];
      if (value) {
        (encrypted.pspIntegrations.adyen as any)[field] = await encrypt(value);
      }
    }
  }
  
  return encrypted;
}

/**
 * Decrypt organization credentials
 */
async function decryptOrgCredentials(org: Organization): Promise<Organization> {
  const decrypted = { ...org };
  
  if (decrypted.pspIntegrations?.stripe) {
    for (const field of PSP_ENCRYPTED_FIELDS.stripe) {
      const value = decrypted.pspIntegrations.stripe[field];
      if (value) {
        try {
          (decrypted.pspIntegrations.stripe as any)[field] = await decrypt(value);
        } catch {
          // Field may not be encrypted (backward compatibility)
        }
      }
    }
  }
  
  if (decrypted.pspIntegrations?.adyen) {
    for (const field of PSP_ENCRYPTED_FIELDS.adyen) {
      const value = decrypted.pspIntegrations.adyen[field];
      if (value) {
        try {
          (decrypted.pspIntegrations.adyen as any)[field] = await decrypt(value);
        } catch {
          // Field may not be encrypted (backward compatibility)
        }
      }
    }
  }
  
  return decrypted;
}

/**
 * Get organization by ID
 */
export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const container = getOrganizationsContainer();
  
  try {
    const { resource } = await container.item(organizationId, organizationId).read<Organization>();
    if (!resource) return null;
    return decryptOrgCredentials(resource);
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/**
 * Get all organizations
 */
export async function getAllOrganizations(): Promise<Organization[]> {
  const container = getOrganizationsContainer();
  const { resources } = await container.items.readAll<Organization>().fetchAll();
  
  return Promise.all(resources.map(decryptOrgCredentials));
}

/**
 * Create organization
 */
export async function createOrganization(org: Omit<Organization, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const container = getOrganizationsContainer();
  const now = new Date().toISOString();
  
  const newOrg: Organization = {
    ...org,
    id: `org_${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  
  const encrypted = await encryptOrgCredentials(newOrg);
  const { resource } = await container.items.create(encrypted);
  
  return resource!.id;
}

/**
 * Update organization
 */
export async function updateOrganization(
  organizationId: string,
  updates: Partial<Organization>
): Promise<void> {
  const container = getOrganizationsContainer();
  const existing = await getOrganization(organizationId);
  
  if (!existing) {
    throw new Error(`Organization not found: ${organizationId}`);
  }
  
  const updated = {
    ...existing,
    ...updates,
    id: organizationId,
    updatedAt: new Date().toISOString(),
  };
  
  const encrypted = await encryptOrgCredentials(updated);
  await container.item(organizationId, organizationId).replace(encrypted);
}

/**
 * Get organization by Stripe webhook signature
 */
export async function getOrganizationByStripeWebhook(
  rawBody: Buffer,
  signature: string
): Promise<{ organization: Organization; stripe: any } | null> {
  const Stripe = require("stripe");
  const organizations = await getAllOrganizations();
  
  for (const org of organizations) {
    if (!org.pspIntegrations?.stripe?.webhookSecret || !org.pspIntegrations?.stripe?.secretKey) {
      continue;
    }
    
    try {
      const stripe = new Stripe(org.pspIntegrations.stripe.secretKey);
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        org.pspIntegrations.stripe.webhookSecret
      );
      
      return { organization: org, stripe };
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Get organization by Adyen merchant account
 */
export async function getOrganizationByAdyenMerchant(merchantAccount: string): Promise<Organization | null> {
  const organizations = await getAllOrganizations();
  
  for (const org of organizations) {
    const adyen = org.pspIntegrations?.adyen;
    if (!adyen || adyen.status !== "connected") continue;
    
    if (adyen.merchantAccounts?.includes(merchantAccount)) {
      return org;
    }
  }
  
  return null;
}
