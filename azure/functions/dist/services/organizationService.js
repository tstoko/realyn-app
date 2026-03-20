"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrganization = getOrganization;
exports.getAllOrganizations = getAllOrganizations;
exports.createOrganization = createOrganization;
exports.updateOrganization = updateOrganization;
exports.getOrganizationByStripeWebhook = getOrganizationByStripeWebhook;
exports.getOrganizationByAdyenMerchant = getOrganizationByAdyenMerchant;
const cosmosClient_1 = require("./cosmosClient");
const keyVaultClient_1 = require("./keyVaultClient");
const crypto = __importStar(require("crypto"));
// Encryption constants
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
// Fields to encrypt
const PSP_ENCRYPTED_FIELDS = {
    stripe: ["secretKey", "accessToken", "webhookSecret"],
    adyen: ["apiKey", "webhookUsername", "webhookPassword"],
};
/**
 * Encrypt a string value
 */
async function encrypt(text) {
    if (!text)
        return "";
    const key = await (0, keyVaultClient_1.getEncryptionKey)();
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
async function decrypt(encryptedText) {
    if (!encryptedText)
        return "";
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
    }
    const key = await (0, keyVaultClient_1.getEncryptionKey)();
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
async function encryptOrgCredentials(org) {
    const encrypted = { ...org };
    if (encrypted.pspIntegrations?.stripe) {
        for (const field of PSP_ENCRYPTED_FIELDS.stripe) {
            const value = encrypted.pspIntegrations.stripe[field];
            if (value) {
                encrypted.pspIntegrations.stripe[field] = await encrypt(value);
            }
        }
    }
    if (encrypted.pspIntegrations?.adyen) {
        for (const field of PSP_ENCRYPTED_FIELDS.adyen) {
            const value = encrypted.pspIntegrations.adyen[field];
            if (value) {
                encrypted.pspIntegrations.adyen[field] = await encrypt(value);
            }
        }
    }
    return encrypted;
}
/**
 * Decrypt organization credentials
 */
async function decryptOrgCredentials(org) {
    const decrypted = { ...org };
    if (decrypted.pspIntegrations?.stripe) {
        for (const field of PSP_ENCRYPTED_FIELDS.stripe) {
            const value = decrypted.pspIntegrations.stripe[field];
            if (value) {
                try {
                    decrypted.pspIntegrations.stripe[field] = await decrypt(value);
                }
                catch {
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
                    decrypted.pspIntegrations.adyen[field] = await decrypt(value);
                }
                catch {
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
async function getOrganization(organizationId) {
    const container = (0, cosmosClient_1.getOrganizationsContainer)();
    try {
        const { resource } = await container.item(organizationId, organizationId).read();
        if (!resource)
            return null;
        return decryptOrgCredentials(resource);
    }
    catch (error) {
        if (error.code === 404)
            return null;
        throw error;
    }
}
/**
 * Get all organizations
 */
async function getAllOrganizations() {
    const container = (0, cosmosClient_1.getOrganizationsContainer)();
    const { resources } = await container.items.readAll().fetchAll();
    return Promise.all(resources.map(decryptOrgCredentials));
}
/**
 * Create organization
 */
async function createOrganization(org) {
    const container = (0, cosmosClient_1.getOrganizationsContainer)();
    const now = new Date().toISOString();
    const newOrg = {
        ...org,
        id: `org_${Date.now()}`,
        createdAt: now,
        updatedAt: now,
    };
    const encrypted = await encryptOrgCredentials(newOrg);
    const { resource } = await container.items.create(encrypted);
    return resource.id;
}
/**
 * Update organization
 */
async function updateOrganization(organizationId, updates) {
    const container = (0, cosmosClient_1.getOrganizationsContainer)();
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
async function getOrganizationByStripeWebhook(rawBody, signature) {
    const Stripe = require("stripe");
    const organizations = await getAllOrganizations();
    for (const org of organizations) {
        if (!org.pspIntegrations?.stripe?.webhookSecret || !org.pspIntegrations?.stripe?.secretKey) {
            continue;
        }
        try {
            const stripe = new Stripe(org.pspIntegrations.stripe.secretKey);
            const event = stripe.webhooks.constructEvent(rawBody, signature, org.pspIntegrations.stripe.webhookSecret);
            return { organization: org, stripe };
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * Get organization by Adyen merchant account
 */
async function getOrganizationByAdyenMerchant(merchantAccount) {
    const organizations = await getAllOrganizations();
    for (const org of organizations) {
        const adyen = org.pspIntegrations?.adyen;
        if (!adyen || adyen.status !== "connected")
            continue;
        if (adyen.merchantAccounts?.includes(merchantAccount)) {
            return org;
        }
    }
    return null;
}
//# sourceMappingURL=organizationService.js.map