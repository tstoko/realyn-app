/**
 * Unit Tests for Encryption Utility
 */

import * as crypto from "crypto";

// Mock the encryption key before importing the module
const TEST_KEY = crypto.randomBytes(32).toString("base64");
process.env.ENCRYPTION_KEY = TEST_KEY;

// Import after setting the env var
import {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  isEncryptionAvailable,
} from "../encryption";

describe("Encryption Utility", () => {
  describe("isEncryptionAvailable", () => {
    it("should return true when ENCRYPTION_KEY is set", () => {
      expect(isEncryptionAvailable()).toBe(true);
    });
  });

  describe("encrypt and decrypt", () => {
    it("should encrypt and decrypt a simple string", () => {
      const original = "Hello, World!";
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(decrypted).toBe(original);
    });

    it("should produce different ciphertext for same input (random IV)", () => {
      const original = "Same input";
      const encrypted1 = encrypt(original);
      const encrypted2 = encrypt(original);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(original);
      expect(decrypt(encrypted2)).toBe(original);
    });

    it("should handle empty string", () => {
      expect(encrypt("")).toBe("");
      expect(decrypt("")).toBe("");
    });

    it("should handle special characters", () => {
      const original = "Special: @#$%^&*()_+-={}[]|:\";<>?,./~`";
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it("should handle Unicode characters", () => {
      const original = "Unicode: 你好世界 🌍 émoji ñ";
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it("should handle long strings", () => {
      const original = "A".repeat(10000);
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it("should handle JSON strings", () => {
      const obj = { apiKey: "sk_test_123", secret: "abc123" };
      const original = JSON.stringify(obj);
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(JSON.parse(decrypted)).toEqual(obj);
    });

    it("should produce encrypted string in correct format (iv:authTag:ciphertext)", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(":");

      expect(parts.length).toBe(3);
      expect(parts[0].length).toBe(32); // IV is 16 bytes = 32 hex chars
      expect(parts[1].length).toBe(32); // Auth tag is 16 bytes = 32 hex chars
      expect(parts[2].length).toBeGreaterThan(0); // Ciphertext
    });

    it("should throw on invalid encrypted format", () => {
      expect(() => decrypt("invalid")).toThrow();
      expect(() => decrypt("only:two")).toThrow();
    });

    it("should throw on tampered ciphertext", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(":");
      // Tamper with the ciphertext
      parts[2] = parts[2].replace(/[0-9a-f]/i, (c) =>
        c === "0" ? "1" : "0"
      );
      const tampered = parts.join(":");

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("encryptCredentials", () => {
    it("should encrypt specified fields", () => {
      const obj = {
        publicKey: "pk_123",
        secretKey: "sk_456",
        webhookSecret: "whsec_789",
        status: "connected",
      };

      const encrypted = encryptCredentials(obj, ["secretKey", "webhookSecret"]);

      expect(encrypted.publicKey).toBe("pk_123"); // Not encrypted
      expect(encrypted.status).toBe("connected"); // Not encrypted
      expect(encrypted.secretKey).not.toBe("sk_456"); // Encrypted
      expect(encrypted.webhookSecret).not.toBe("whsec_789"); // Encrypted
    });

    it("should handle missing fields gracefully", () => {
      const obj = {
        publicKey: "pk_123",
        secretKey: undefined,
        webhookSecret: undefined,
      };

      const encrypted = encryptCredentials(obj, ["secretKey", "webhookSecret"]);

      expect(encrypted.publicKey).toBe("pk_123");
      expect(encrypted.secretKey).toBeUndefined();
    });

    it("should not encrypt non-string fields", () => {
      const obj = {
        name: "test",
        count: 42,
        active: true,
      };

      const encrypted = encryptCredentials(obj, ["count" as any, "active" as any, "name"]);

      expect(encrypted.name).not.toBe("test"); // String - encrypted
      expect(encrypted.count).toBe(42); // Number - not encrypted
      expect(encrypted.active).toBe(true); // Boolean - not encrypted
    });
  });

  describe("decryptCredentials", () => {
    it("should decrypt specified fields", () => {
      const obj = {
        publicKey: "pk_123",
        secretKey: "sk_456",
        webhookSecret: "whsec_789",
      };

      const encrypted = encryptCredentials(obj, ["secretKey", "webhookSecret"]);
      const decrypted = decryptCredentials(encrypted, ["secretKey", "webhookSecret"]);

      expect(decrypted.publicKey).toBe("pk_123");
      expect(decrypted.secretKey).toBe("sk_456");
      expect(decrypted.webhookSecret).toBe("whsec_789");
    });

    it("should handle fields that were never encrypted (backward compatibility)", () => {
      const obj = {
        publicKey: "pk_123",
        secretKey: "sk_456_plain", // Not encrypted
      };

      // Should not throw, should return original value
      const decrypted = decryptCredentials(obj, ["secretKey"]);
      expect(decrypted.secretKey).toBe("sk_456_plain");
    });

    it("should handle undefined fields", () => {
      const obj = {
        publicKey: "pk_123",
        secretKey: undefined,
      };

      const decrypted = decryptCredentials(obj, ["secretKey"]);
      expect(decrypted.secretKey).toBeUndefined();
    });
  });

  describe("Integration: encrypt -> store -> retrieve -> decrypt", () => {
    it("should handle full credential lifecycle", () => {
      // Simulate PSP credentials
      const credentials = {
        provider: "stripe",
        status: "connected",
        secretKey: "sk_live_12345678901234567890",
        webhookSecret: "whsec_abcdefghij1234567890",
        merchantId: "acct_12345",
      };

      // Encrypt before storing
      const encrypted = encryptCredentials(credentials, ["secretKey", "webhookSecret"]);

      // Simulate storage (JSON serialize/deserialize)
      const stored = JSON.parse(JSON.stringify(encrypted));

      // Decrypt after retrieval
      const decrypted = decryptCredentials(stored, ["secretKey", "webhookSecret"]);

      // Verify
      expect(decrypted.provider).toBe("stripe");
      expect(decrypted.status).toBe("connected");
      expect(decrypted.merchantId).toBe("acct_12345");
      expect(decrypted.secretKey).toBe("sk_live_12345678901234567890");
      expect(decrypted.webhookSecret).toBe("whsec_abcdefghij1234567890");
    });
  });
});
