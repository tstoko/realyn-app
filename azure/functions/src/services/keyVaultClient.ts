import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

let secretClient: SecretClient | null = null;

// Cache for secrets to avoid repeated Key Vault calls
const secretCache: Map<string, { value: string; expiresAt: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize Key Vault client (singleton)
 */
function getSecretClient(): SecretClient {
  if (!secretClient) {
    const vaultUrl = process.env.KEY_VAULT_URL;
    if (!vaultUrl) {
      throw new Error("KEY_VAULT_URL environment variable is required");
    }
    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(vaultUrl, credential);
  }
  return secretClient;
}

/**
 * Get a secret from Key Vault (with caching)
 */
export async function getSecret(secretName: string): Promise<string> {
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
export async function getEncryptionKey(): Promise<string> {
  return getSecret("ENCRYPTION-KEY");
}

/**
 * Get the OpenAI API key from Key Vault
 */
export async function getOpenAIApiKey(): Promise<string> {
  return getSecret("OPENAI-API-KEY");
}

/**
 * Clear the secret cache (useful for testing)
 */
export function clearSecretCache(): void {
  secretCache.clear();
}
