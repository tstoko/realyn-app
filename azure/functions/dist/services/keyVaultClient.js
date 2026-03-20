"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecret = getSecret;
exports.getEncryptionKey = getEncryptionKey;
exports.getOpenAIApiKey = getOpenAIApiKey;
exports.clearSecretCache = clearSecretCache;
const keyvault_secrets_1 = require("@azure/keyvault-secrets");
const identity_1 = require("@azure/identity");
let secretClient = null;
// Cache for secrets to avoid repeated Key Vault calls
const secretCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/**
 * Initialize Key Vault client (singleton)
 */
function getSecretClient() {
    if (!secretClient) {
        const vaultUrl = process.env.KEY_VAULT_URL;
        if (!vaultUrl) {
            throw new Error("KEY_VAULT_URL environment variable is required");
        }
        const credential = new identity_1.DefaultAzureCredential();
        secretClient = new keyvault_secrets_1.SecretClient(vaultUrl, credential);
    }
    return secretClient;
}
/**
 * Get a secret from Key Vault (with caching)
 */
async function getSecret(secretName) {
    // Check cache first
    const cached = secretCache.get(secretName);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }
    // Fetch from Key Vault
    const client = getSecretClient();
    const secret = await client.getSecret(secretName);
    if (!secret.value) {
        throw new Error(`Secret '${secretName}' not found or has no value`);
    }
    // Cache the secret
    secretCache.set(secretName, {
        value: secret.value,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return secret.value;
}
/**
 * Get the encryption key from Key Vault
 */
async function getEncryptionKey() {
    return getSecret("ENCRYPTION-KEY");
}
/**
 * Get the OpenAI API key from Key Vault
 */
async function getOpenAIApiKey() {
    return getSecret("OPENAI-API-KEY");
}
/**
 * Clear the secret cache (useful for testing)
 */
function clearSecretCache() {
    secretCache.clear();
}
//# sourceMappingURL=keyVaultClient.js.map