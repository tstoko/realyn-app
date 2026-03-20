/**
 * Integration tests for Adyen Webhook handler
 */

import { adyenWebhook } from "../adyenWebhook";
import { verifyAdyenSignature, getOrganizationFromAdyenNotification } from "../../utils/adyenHelpers";
import { normalizeAdyenDispute } from "../../utils/disputeNormalizer";
import { upsertUnifiedDispute } from "../../services/disputeService";

// Mock dependencies
jest.mock("../../utils/adyenHelpers");
jest.mock("../../utils/disputeNormalizer");
jest.mock("../../services/disputeService");

describe("adyenWebhook", () => {
  let mockRequest: any;
  let mockResponse: any;

  const mockNotification = {
    notificationItems: [
      {
        NotificationRequestItem: {
          pspReference: "TEST_REF_123",
          originalReference: "ORIG_REF_456",
          merchantAccountCode: "BevvyclubLimited",
          amount: { value: 10000, currency: "USD" },
          eventCode: "CHARGEBACK",
          eventDate: "2025-01-15T10:00:00Z",
          success: true,
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const headers: Record<string, string> = {
      "x-adyen-signature": "VALID_SIGNATURE",
      "content-type": "application/json",
      origin: "http://localhost",
    };

    mockRequest = {
      method: "POST",
      body: mockNotification,
      headers,
      get: (name: string) => headers[name.toLowerCase()],
      header: (name: string) => headers[name.toLowerCase()],
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      getHeader: jest.fn(),
    };

    (getOrganizationFromAdyenNotification as jest.MockedFunction<
      typeof getOrganizationFromAdyenNotification
    >).mockResolvedValue({
      organizationId: "org123",
      webhookPassword: "webhook_password",
    });

    (verifyAdyenSignature as jest.MockedFunction<typeof verifyAdyenSignature>).mockReturnValue(
      true
    );

    (normalizeAdyenDispute as jest.MockedFunction<typeof normalizeAdyenDispute>).mockReturnValue(
      {
        organizationId: "org123",
        pspProvider: "adyen",
        pspDisputeId: "TEST_REF_123",
        pspPaymentId: "ORIG_REF_456",
        amount: 10000,
        currency: "usd",
        status: "needs_response",
      } as any
    );

    (upsertUnifiedDispute as jest.MockedFunction<typeof upsertUnifiedDispute>).mockResolvedValue("mock_id");
  });

  it("should process CHARGEBACK event successfully", async () => {
    await adyenWebhook(mockRequest, mockResponse);

    expect(verifyAdyenSignature).toHaveBeenCalled();
    expect(normalizeAdyenDispute).toHaveBeenCalled();
    expect(upsertUnifiedDispute).toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith("[accepted]");
  });

  it("should return 400 for missing signature", async () => {
    const emptyHeaders: Record<string, string> = { origin: "http://localhost" };
    mockRequest.headers = emptyHeaders;
    mockRequest.get = (name: string) => emptyHeaders[name.toLowerCase()];
    mockRequest.header = (name: string) => emptyHeaders[name.toLowerCase()];

    await adyenWebhook(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: "Missing HMAC signature" });
  });

  it("should return 404 if organization not found", async () => {
    (getOrganizationFromAdyenNotification as jest.MockedFunction<
      typeof getOrganizationFromAdyenNotification
    >).mockResolvedValue(null);

    await adyenWebhook(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: "Organization not found" });
  });

  it("should return 401 for invalid signature", async () => {
    (verifyAdyenSignature as jest.MockedFunction<typeof verifyAdyenSignature>).mockReturnValue(
      false
    );

    await adyenWebhook(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: "Invalid signature" });
  });

  it("should return 400 for invalid notification format", async () => {
    mockRequest.body = {};

    await adyenWebhook(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: "Invalid notification format" });
  });

  it("should process SECOND_CHARGEBACK event", async () => {
    mockRequest.body.notificationItems[0].NotificationRequestItem.eventCode = "SECOND_CHARGEBACK";

    await adyenWebhook(mockRequest, mockResponse);

    expect(upsertUnifiedDispute).toHaveBeenCalled();
    expect(mockResponse.send).toHaveBeenCalledWith("[accepted]");
  });

  it("should handle errors gracefully", async () => {
    const error = new Error("Processing error");
    (normalizeAdyenDispute as jest.MockedFunction<typeof normalizeAdyenDispute>).mockImplementation(
      () => {
        throw error;
      }
    );

    await adyenWebhook(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: error.message });
  });
});



