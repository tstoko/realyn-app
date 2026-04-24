/**
 * Integration tests for Adyen Webhook handler
 */

import { adyenWebhook } from "../adyenWebhook";
import { generateAdyenNotification, generateAdyenHMAC } from "../../utils/webhookTestHelpers";
import { getOrganizationFromAdyenNotification, verifyAdyenSignature } from "../../utils/adyenHelpers";

// Mock dependencies
jest.mock("../../utils/adyenHelpers");
jest.mock("../../services/disputeService");
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    runTransaction: jest.fn(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        set: jest.fn(),
      }),
    ),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
      })),
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(),
        })),
      })),
      add: jest.fn(),
    })),
  })),
}));

/**
 * Build a mock request compatible with firebase-functions onRequest + CORS.
 * Ensures `headers.origin` exists and `get`/`header` helpers are present.
 */
function buildMockReq(overrides: Record<string, any> = {}): any {
  const headers: Record<string, string> = {
    origin: "http://localhost",
    "content-type": "application/json",
    ...(overrides.headers || {}),
  };
  return {
    method: "POST",
    ...overrides,
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    header: (name: string) => headers[name.toLowerCase()],
  };
}

describe("Adyen Webhook Integration Tests", () => {
  let mockReq: any;
  let mockRes: any;
  const testMerchantAccount = "TestMerchant";
  const testOrganizationId = "test_org_123";
  const testWebhookPassword = "test_webhook_password";

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: signature verification passes
    (verifyAdyenSignature as jest.MockedFunction<typeof verifyAdyenSignature>).mockReturnValue(true);

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      getHeader: jest.fn(),
    };
  });

  describe("CHARGEBACK event", () => {
    it("should process CHARGEBACK notification and store dispute", async () => {
      const notification = generateAdyenNotification(testMerchantAccount, {
        eventCode: "CHARGEBACK",
        amount: 10000,
        currency: "USD",
      });

      const hmacSignature = generateAdyenHMAC(notification, testWebhookPassword);

      mockReq = buildMockReq({
        body: notification,
        headers: {
          "x-adyen-signature": hmacSignature,
        },
      });

      // Mock organization lookup
      (getOrganizationFromAdyenNotification as jest.MockedFunction<
        typeof getOrganizationFromAdyenNotification
      >).mockResolvedValue({
        organizationId: testOrganizationId,
        webhookPassword: testWebhookPassword,
      });

      // Mock Firestore
      const { upsertUnifiedDispute } = require("../../services/disputeService");
      upsertUnifiedDispute.mockResolvedValue("mock_id");

      await adyenWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith("[accepted]");
      expect(upsertUnifiedDispute).toHaveBeenCalled();
    });

    it("should reject request without signature", async () => {
      const notification = generateAdyenNotification(testMerchantAccount);

      mockReq = buildMockReq({
        body: notification,
        headers: {}, // no signature
      });

      await adyenWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Missing HMAC signature" });
    });

    it("should reject request with invalid signature", async () => {
      const notification = generateAdyenNotification(testMerchantAccount);

      mockReq = buildMockReq({
        body: notification,
        headers: {
          "x-adyen-signature": "invalid_signature",
        },
      });

      (getOrganizationFromAdyenNotification as jest.MockedFunction<
        typeof getOrganizationFromAdyenNotification
      >).mockResolvedValue({
        organizationId: testOrganizationId,
        webhookPassword: testWebhookPassword,
      });

      // Override: signature verification fails
      (verifyAdyenSignature as jest.MockedFunction<typeof verifyAdyenSignature>).mockReturnValue(false);

      await adyenWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid signature" });
    });

    it("should reject request when organization not found", async () => {
      const notification = generateAdyenNotification(testMerchantAccount);
      const hmacSignature = generateAdyenHMAC(notification, testWebhookPassword);

      mockReq = buildMockReq({
        body: notification,
        headers: {
          "x-adyen-signature": hmacSignature,
        },
      });

      (getOrganizationFromAdyenNotification as jest.MockedFunction<
        typeof getOrganizationFromAdyenNotification
      >).mockResolvedValue(null);

      await adyenWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Organization not found" });
    });
  });

  describe("CHARGEBACK_REVERSED event", () => {
    it("should process CHARGEBACK_REVERSED notification", async () => {
      const notification = generateAdyenNotification(testMerchantAccount, {
        eventCode: "CHARGEBACK_REVERSED",
      });

      const hmacSignature = generateAdyenHMAC(notification, testWebhookPassword);

      mockReq = buildMockReq({
        body: notification,
        headers: {
          "x-adyen-signature": hmacSignature,
        },
      });

      (getOrganizationFromAdyenNotification as jest.MockedFunction<
        typeof getOrganizationFromAdyenNotification
      >).mockResolvedValue({
        organizationId: testOrganizationId,
        webhookPassword: testWebhookPassword,
      });

      const { upsertUnifiedDispute } = require("../../services/disputeService");
      upsertUnifiedDispute.mockResolvedValue("mock_id");

      await adyenWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(upsertUnifiedDispute).toHaveBeenCalled();
    });
  });

  describe("Non-dispute events", () => {
    it("should accept non-dispute events without processing", async () => {
      const notification = generateAdyenNotification(testMerchantAccount, {
        eventCode: "AUTHORISATION", // Not a dispute event
      });

      const hmacSignature = generateAdyenHMAC(notification, testWebhookPassword);

      mockReq = buildMockReq({
        body: notification,
        headers: {
          "x-adyen-signature": hmacSignature,
        },
      });

      (getOrganizationFromAdyenNotification as jest.MockedFunction<
        typeof getOrganizationFromAdyenNotification
      >).mockResolvedValue({
        organizationId: testOrganizationId,
        webhookPassword: testWebhookPassword,
      });

      const { upsertUnifiedDispute } = require("../../services/disputeService");

      await adyenWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith("[accepted]");
      expect(upsertUnifiedDispute).not.toHaveBeenCalled();
    });
  });
});
