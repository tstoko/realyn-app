import * as crypto from "crypto";

/**
 * Encryption utility for sensitive credentials
 * Uses AES-256-GCM for authenticated encryption
 * 
 * SECURITY: The ENCRYPTION_KEY environment variable is REQUIRED.
 * Generate a key using: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * 
 * Store the key in:
 * - Firebase: firebase functions:config:set encryption.key="YOUR_KEY"
 * - Or set ENCRYPTION_KEY environment variable directly
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits

// Encryption key - REQUIRED, no fallback for security
let ENCRYPTION_KEY: Buffer | null = null;
let encryptionKeyError: string | null = null;

/**
 * Initialize and validate the encryption key
 * Must be called before any encryption/decryption operations
 */
function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY) {
    return ENCRYPTION_KEY;
  }

  const keyEnv = process.env.ENCRYPTION_KEY;
  
  if (!keyEnv) {
    encryptionKeyError = "ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"";
    console.error(`[SECURITY] ${encryptionKeyError}`);
    throw new Error(encryptionKeyError);
  }

  try {
    // Try to decode as base64 first (recommended format)
    const decoded = Buffer.from(keyEnv, "base64");
    if (decoded.length >= 32) {
      ENCRYPTION_KEY = decoded.slice(0, 32);
    } else {
      // Fall back to using the string directly with scrypt
      ENCRYPTION_KEY = crypto.scryptSync(keyEnv, "realyn-salt-v1", 32);
    }
    console.log("[SECURITY] Encryption key initialized successfully");
    return ENCRYPTION_KEY;
  } catch (error) {
    encryptionKeyError = `Failed to initialize encryption key: ${error}`;
    console.error(`[SECURITY] ${encryptionKeyError}`);
    throw new Error(encryptionKeyError);
  }
}

/**
 * Check if encryption is available (key is configured)
 */
export function isEncryptionAvailable(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the encryption initialization error if any
 */
export function getEncryptionError(): string | null {
  return encryptionKeyError;
}

/**
 * Encrypt a string value
 * @throws Error if ENCRYPTION_KEY is not configured
 */
export function encrypt(text: string): string {
  if (!text) {
    return "";
  }

  const key = getEncryptionKey();

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and encrypted data
    return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt an encrypted string
 * @throws Error if ENCRYPTION_KEY is not configured
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    return "";
  }

  const key = getEncryptionKey();

  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Encrypt an object's sensitive fields
 */
export function encryptCredentials<T extends Record<string, any>>(
  obj: T,
  fieldsToEncrypt: (keyof T)[]
): T {
  const encrypted = { ...obj };
  
  for (const field of fieldsToEncrypt) {
    if (encrypted[field] && typeof encrypted[field] === "string") {
      (encrypted as any)[field] = encrypt(encrypted[field] as string);
    }
  }
  
  return encrypted;
}

/**
 * Decrypt an object's sensitive fields
 */
export function decryptCredentials<T extends Record<string, any>>(
  obj: T,
  fieldsToDecrypt: (keyof T)[]
): T {
  const decrypted = { ...obj };
  
  for (const field of fieldsToDecrypt) {
    if (decrypted[field] && typeof decrypted[field] === "string") {
      try {
        (decrypted as any)[field] = decrypt(decrypted[field] as string);
      } catch (error) {
        // If decryption fails, the field might not be encrypted (backward compatibility)
        console.warn(`Failed to decrypt field ${String(field)}, assuming unencrypted`);
      }
    }
  }
  
  return decrypted;
}


