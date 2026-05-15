/**
 * Integration tests for Stripe manual integration
 * Tests the complete flow of webhook processing with organization-specific credentials
 */

import { stripeWebhook } from "../../index";
import { generateStripeWebhookEvent, generateStripeSignature } from "../../utils/webhookTestHelpers";
import { upsertUnifiedDispute } from "../../services/disputeService";
// @ts-ignore: import needed for jest module resolution
import * as admin from "firebase-admin"; void admin;
// Mock disputeService
jest.mock("../../services/disputeService", () => ({
  upsertUnifiedDispute: jest.fn().mockResolvedValue("mock_dispute_id"),
  updateDisputeStatus: jest.fn().mockResolvedValue(undefined),
}));

// Mock disputeNormalizer
jest.mock("../../utils/disputeNormalizer", () => ({
  normalizeStripeDispute: jest.fn((dispute: any, orgId: string) => ({
    organizationId: orgId,
    pspProvider: "stripe",
    pspDisputeId: dispute.id,
    pspPaymentId: dispute.payment_intent || "",
    amount: dispute.amount,
    currency: dispute.currency,
    status: "needs_response",
    reason: dispute.reason,
  })),
  mapStripeStatus: jest.fn((status: string) => status),
}));

// Mock stripeHelpers — keep real getOrganizationIdFromStripeEvent; stub getPaymentMetadata for tests
jest.mock("../../utils/stripeHelpers", () => {
  const actual = jest.requireActual("../../utils/stripeHelpers") as typeof import("../../utils/stripeHelpers");
  return {
    ...actual,
    getPaymentMetadata: jest.fn().mockResolvedValue({
      last4: "1234",
      transactionDate: new Date(),
    }),
  };
});

// Mock AI evidence planning (non-blocking, don't let it interfere)
jest.mock("../../services/ai/evidencePlanningService", () => ({
  triggerEvidencePlanning: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock Firebase Admin
jest.mock("firebase-admin", () => {
  const mockFirestore = {
    settings: jest.fn(),
    runTransaction: jest.fn(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        set: jest.fn(),
      }),
    ),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn(),
      })),
      where: jest.fn(() => ({
        get: jest.fn(),
      })),
      add: jest.fn(),
      limit: jest.fn(() => ({
        get: jest.fn(),
      })),
    })),
  };

  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => mockFirestore),
    apps: [],
    Timestamp: {
      now: jest.fn(() => ({
        toDate: () => new Date(),
      })),
    },
  };
});

// Mock Stripe - shared instance defined inside factory to avoid hoisting issues
jest.mock("stripe", () => {
  const instance = {
    webhooks: { constructEvent: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
    paymentMethods: { retrieve: jest.fn() },
  };
  const MockStripe = jest.fn().mockImplementation(() => instance);
  (MockStripe as any).__instance = instance;
  // Support both `new Stripe()` and `new Stripe.default()` (ESM/CJS interop)
  return { __esModule: true, default: MockStripe, __instance: instance };
});

// Access the shared mock instance (available after jest.mock runs)
function getStripeInstance(): any {
  return require("stripe").__instance;
}

function buildMockReq(overrides: Record<string, any> = {}): any {
  const headers: Record<string, string> = {
    origin: "http://localhost",
    "content-type": "application/json",
    ...(overrides.headers || {}),
  };
  return {
    method: "POST",
    query: {},
    ...overrides,
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    header: (name: string) => headers[name.toLowerCase()],
  };
}

describe("Stripe Manual Integration Tests", () => {
  let mockReq: any;
  let mockRes: any;
  const testOrganizationId = "test_org_123";
  const testWebhookSecret = "whsec_test_secret";

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Stripe mock instance
    const s = getStripeInstance();
    s.webhooks.constructEvent = jest.fn();
    s.paymentIntents.retrieve = jest.fn();
    s.paymentMethods.retrieve = jest.fn();

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

  describe("Organization resolution via Stripe metadata / PaymentIntent", () => {
    it("should upsert dispute when organizationId is resolved from the event", async () => {
      const event = generateStripeWebhookEvent("dp_test", testOrganizationId);
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, testWebhookSecret);

      mockReq = buildMockReq({
        headers: { "stripe-signature": signature },
        body: Buffer.from(payload),
        rawBody: Buffer.from(payload),
        query: { orgId: testOrganizationId },
      });

      const stripeInst = getStripeInstance();
      stripeInst.webhooks.constructEvent = jest.fn().mockReturnValue(event);
      stripeInst.paymentIntents.retrieve = jest.fn().mockResolvedValue({
        id: "pi_test",
        created: Math.floor(Date.now() / 1000),
        metadata: { organizationId: testOrganizationId },
      });
      stripeInst.paymentMethods.retrieve = jest.fn().mockResolvedValue({
        card: { last4: "1234" },
      });

      await stripeWebhook(mockReq, mockRes);

      expect(upsertUnifiedDispute).toHaveBeenCalled();
      expect(stripeInst.webhooks.constructEvent).toHaveBeenCalledWith(
        expect.any(Buffer),
        signature,
        testWebhookSecret
      );
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it("should acknowledge webhook without upsert when organization cannot be resolved", async () => {
      const event = generateStripeWebhookEvent("dp_unmatched", testOrganizationId);
      (event.data.object as any).metadata = {};
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, testWebhookSecret);

      mockReq = buildMockReq({
        headers: { "stripe-signature": signature },
        body: Buffer.from(payload),
        rawBody: Buffer.from(payload),
      });

      const stripeInst = getStripeInstance();
      stripeInst.webhooks.constructEvent = jest.fn().mockReturnValue(event);
      stripeInst.paymentIntents.retrieve = jest.fn().mockResolvedValue({
        id: "pi_test",
        metadata: {},
      });

      await stripeWebhook(mockReq, mockRes);

      expect(upsertUnifiedDispute).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe("Error Handling", () => {
    it("should handle missing raw body", async () => {
      mockReq = buildMockReq({
        headers: { "stripe-signature": "t=123,v1=test" },
        body: {},
        // No rawBody
      });

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Unable to verify webhook signature",
      });
    });

    it("should handle missing signature header", async () => {
      mockReq = buildMockReq({ body: {} });
      delete mockReq.headers["stripe-signature"];

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Missing signature header" });
    });

    it("should handle invalid signature", async () => {
      const event = generateStripeWebhookEvent("dp_test", testOrganizationId);
      const payload = JSON.stringify(event);

      mockReq = buildMockReq({
        headers: { "stripe-signature": "t=123,v1=invalid" },
        body: Buffer.from(payload),
        rawBody: Buffer.from(payload),
        query: { orgId: testOrganizationId },
      });

      getStripeInstance().webhooks.constructEvent = jest.fn().mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it("should handle processing errors gracefully", async () => {
      const event = generateStripeWebhookEvent("dp_test", testOrganizationId);
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, testWebhookSecret);

      mockReq = buildMockReq({
        headers: { "stripe-signature": signature },
        body: Buffer.from(payload),
        rawBody: Buffer.from(payload),
        query: { orgId: testOrganizationId },
      });

      const stripeInst = getStripeInstance();
      stripeInst.webhooks.constructEvent = jest.fn().mockReturnValue(event);

      // Mock getPaymentMetadata to throw (overrides the module-level mock)
      const stripeHelpers = require("../../utils/stripeHelpers");
      stripeHelpers.getPaymentMetadata.mockRejectedValueOnce(
        new Error("Payment intent not found")
      );

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
