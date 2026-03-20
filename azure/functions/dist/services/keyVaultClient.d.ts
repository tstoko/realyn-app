/**
 * Get a secret from Key Vault (with caching)
 */
export declare function getSecret(secretName: string): Promise<string>;
/**
 * Get the encryption key from Key Vault
 */
export declare function getEncryptionKey(): Promise<string>;
/**
 * Get the OpenAI API key from Key Vault
 */
export declare function getOpenAIApiKey(): Promise<string>;
/**
 * Clear the secret cache (useful for testing)
 */
export declare function clearSecretCache(): void;
//# sourceMappingURL=keyVaultClient.d.ts.map