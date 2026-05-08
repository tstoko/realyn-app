/**
 * Integration tests for Stripe Webhook handler
 * Tests the fast-path approach with orgId query parameter
 */

import { stripeWebhook } from "../../index";
import { upsertUnifiedDispute } from "../../services/disputeService";
import { generateStripeWebhookEvent, generateStripeSignature } from "../../utils/webhookTestHelpers";
// @ts-ignore: import needed for jest module resolution
import * as admin from "firebase-admin"; void admin;
// Mock disputeService
jest.mock("../../services/disputeService", () => ({
  upsertUnifiedDispute: jest.fn().mockResolvedValue("mock_dispute_id"),
  updateDisputeStatus: jest.fn().mockResolvedValue(undefined),
}));

// Mock disputeNormalizer
jest.mock("../../utils/disputeNormalizer", () => ({
  normalizeStripeDispute: jest.fn((dispute: any, orgId: string, date: any, last4: string) => ({
    organizationId: orgId,
    pspProvider: "stripe",
    pspDisputeId: dispute.id,
    pspPaymentId: dispute.payment_intent || "",
    pspTransactionDate: date,
    pspLast4Digits: last4,
    amount: dispute.amount,
    currency: dispute.currency,
    status: dispute.status === "needs_response" ? "needs_response" : "won",
    reason: dispute.reason,
    respondBy: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000)
      : undefined,
    customerExplanation: "",
  })),
  mapStripeStatus: jest.fn((status: string) => status),
}));

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

// Mock AI evidence planning (non-blocking)
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
  return { __esModule: true, default: MockStripe, __instance: instance };
});

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

describe("Stripe Webhook Integration Tests", () => {
  let mockReq: any;
  let mockRes: any;
  const testOrganizationId = "test_org_123";
  const testWebhookSecret = "whsec_test_secret";

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Stripe mock instance methods
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

  describe("charge.dispute.created event", () => {
    it("should process dispute.created event and store in Firestore", async () => {
      const disputeId = `dp_test_${Date.now()}`;
      const event = generateStripeWebhookEvent(disputeId, testOrganizationId, {
        amount: 5000,
        currency: "usd",
        status: "needs_response",
      });

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

    it("should reject request without signature", async () => {
      mockReq = buildMockReq({ body: {} });
      delete mockReq.headers["stripe-signature"];

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Missing signature header" });
    });

    it("should reject request with invalid signature", async () => {
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

    it("should acknowledge without upsert when organization cannot be resolved", async () => {
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

  describe("charge.dispute.updated event", () => {
    it("should process dispute.updated event", async () => {
      const disputeId = `dp_test_${Date.now()}`;
      const event = generateStripeWebhookEvent(disputeId, testOrganizationId);
      event.type = "charge.dispute.updated";

      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, testWebhookSecret);

      mockReq = buildMockReq({
        headers: { "stripe-signature": signature },
        body: Buffer.from(payload),
        rawBody: Buffer.from(payload),
        query: { orgId: testOrganizationId },
      });

      const stripeInst2 = getStripeInstance();
      stripeInst2.webhooks.constructEvent = jest.fn().mockReturnValue(event);
      stripeInst2.paymentIntents.retrieve = jest.fn().mockResolvedValue({
        id: "pi_test",
        created: Math.floor(Date.now() / 1000),
        metadata: { organizationId: testOrganizationId },
      });
      stripeInst2.paymentMethods.retrieve = jest.fn().mockResolvedValue({
        card: { last4: "1234" },
      });

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe("charge.dispute.closed event", () => {
    it("should process dispute.closed event", async () => {
      const disputeId = `dp_test_${Date.now()}`;
      const event = generateStripeWebhookEvent(disputeId, testOrganizationId);
      event.type = "charge.dispute.closed";
      (event.data.object as any).status = "won";

      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, testWebhookSecret);

      mockReq = buildMockReq({
        headers: { "stripe-signature": signature },
        body: Buffer.from(payload),
        rawBody: Buffer.from(payload),
        query: { orgId: testOrganizationId },
      });

      getStripeInstance().webhooks.constructEvent = jest.fn().mockReturnValue(event);

      await stripeWebhook(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });
});
