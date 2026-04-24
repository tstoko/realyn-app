import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { encrypt } from "../utils/encryption";
import type { PSPIntegrations, StripeIntegration, AdyenIntegration } from "../types/organization";
import { OPERA_CLOUD_ENCRYPTED_FIELDS } from "./pms/providers/operaCloud/types";
import type { OperaCloudConfig } from "./pms/providers/operaCloud/types";

const STRIPE_ENCRYPTED_FIELDS: (keyof StripeIntegration)[] = [
  "secretKey",
  "accessToken",
  "webhookSecret",
];

const ADYEN_ENCRYPTED_FIELDS: (keyof AdyenIntegration)[] = [
  "apiKey",
  "webhookUsername",
  "webhookPassword",
];

function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: readonly (keyof T)[],
): T {
  const result = { ...obj };
  for (const field of fields) {
    const value = result[field];
    if (value !== undefined && typeof value === "string" && value !== "") {
      (result as any)[field] = encrypt(value);
    }
  }
  return result;
}

/**
 * Encrypt PSP integration credentials before writing to Firestore.
 * Handles both Stripe and Adyen integrations.
 */
export function encryptPspIntegrations(integrations: PSPIntegrations): PSPIntegrations {
  const encrypted: PSPIntegrations = {};

  if (integrations.stripe) {
    encrypted.stripe = encryptFields(integrations.stripe, STRIPE_ENCRYPTED_FIELDS);
  }
  if (integrations.adyen) {
    encrypted.adyen = encryptFields(integrations.adyen, ADYEN_ENCRYPTED_FIELDS);
  }

  return encrypted;
}

/**
 * Encrypt Opera Cloud config credentials before writing to Firestore.
 */
export function encryptOperaCloudConfig(config: Partial<OperaCloudConfig>): Record<string, any> {
  const safeConfig: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    if (OPERA_CLOUD_ENCRYPTED_FIELDS.includes(key as keyof OperaCloudConfig) && typeof value === "string" && value !== "") {
      safeConfig[key] = encrypt(value);
    } else {
      safeConfig[key] = value;
    }
  }
  return safeConfig;
}

/**
 * Save PSP integration config with encrypted credentials.
 */
export async function savePspIntegrations(
  organizationId: string,
  integrations: PSPIntegrations,
): Promise<void> {
  const db = admin.firestore();
  const encrypted = encryptPspIntegrations(integrations);
  await db.collection("organizations").doc(organizationId).update({
    pspIntegrations: encrypted,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Save Opera Cloud integration config with encrypted credentials.
 */
export async function saveOperaCloudIntegration(
  organizationId: string,
  config: Partial<OperaCloudConfig>,
): Promise<void> {
  const db = admin.firestore();
  const encrypted = encryptOperaCloudConfig(config);
  await db.collection("organizations").doc(organizationId).update({
    operaCloudIntegration: encrypted,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
