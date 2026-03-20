/**
 * Unit tests for Adyen Client
 */

import { AdyenClient } from "../adyenClient";
import { Client } from "@adyen/api-library";

// Mock Adyen API library
jest.mock("@adyen/api-library");

describe("AdyenClient", () => {
  const mockCredentials = {
    apiKey: "test_api_key_123",
    merchantAccount: ["TestMerchant"], // Support array format
  };

  let client: AdyenClient;
  let mockHttpRequest: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // The AdyenClient internally does: new Client({ config }) then uses client.httpClient.request()
    mockHttpRequest = jest.fn();

    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => {
      return {
        httpClient: {
          request: mockHttpRequest,
        },
      } as any;
    });

    client = new AdyenClient(mockCredentials);
  });

  describe("testConnection", () => {
    it("should return success when connection is valid", async () => {
      // httpClient.request returns a JSON string on success
      mockHttpRequest.mockResolvedValue(JSON.stringify({ disputes: [] }));

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("Adyen connection successful");
      expect(result.message).toContain("environment");
    });

    it("should return failure on 401 error", async () => {
      const error: any = new Error("Adyen API request failed: 401");
      error.statusCode = 401;
      error.message = JSON.stringify({ status: 401, errorCode: "010", message: "Not allowed" });
      mockHttpRequest.mockRejectedValue(error);

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid API key");
    });

    it("should return failure on 403 error", async () => {
      const error: any = new Error("Adyen API request failed: 403");
      error.statusCode = 403;
      error.message = JSON.stringify({ status: 403, errorCode: "010", message: "Forbidden" });
      mockHttpRequest.mockRejectedValue(error);

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("API key does not have required permissions");
    });
  });

  describe("getDisputes", () => {
    it("should fetch and transform disputes", async () => {
      const mockDisputes = [
        {
          disputeId: "DISP001",
          pspReference: "PSP001",
          originalReference: "ORIG001",
          amount: { value: 10000, currency: "USD" },
          status: "OPEN",
        },
      ];

      mockHttpRequest.mockResolvedValue(JSON.stringify({ disputes: mockDisputes }));

      const result = await client.getDisputes();

      expect(result).toHaveLength(1);
      expect(result[0].disputeId).toBe("DISP001");
      expect(result[0].amount.value).toBe(10000);
    });

    it("should limit results to specified limit", async () => {
      const mockDisputes = Array(150).fill({
        disputeId: "DISP",
        pspReference: "PSP",
        amount: { value: 1000, currency: "USD" },
        status: "OPEN",
      });

      mockHttpRequest.mockResolvedValue(JSON.stringify({ disputes: mockDisputes }));

      const result = await client.getDisputes(100);

      expect(result).toHaveLength(100);
    });

    it("should throw error on API failure", async () => {
      const error: any = new Error("API Error");
      mockHttpRequest.mockRejectedValue(error);

      await expect(client.getDisputes()).rejects.toThrow("Failed to fetch disputes");
    });
  });

  describe("getDispute", () => {
    it("should fetch a specific dispute", async () => {
      const mockDispute = {
        disputeId: "DISP001",
        pspReference: "PSP001",
        amount: { value: 10000, currency: "USD" },
        status: "OPEN",
      };

      mockHttpRequest.mockResolvedValue(JSON.stringify(mockDispute));

      const result = await client.getDispute("DISP001");

      expect(result.disputeId).toBe("DISP001");
    });
  });

  describe("defendDispute", () => {
    it("should submit defense with documents and comment", async () => {
      const defenseRequest = {
        documents: [
          {
            documentType: "CUSTOMER_COMMUNICATION",
            content: "base64content",
            filename: "evidence.pdf",
          },
        ],
        comment: "Test defense comment",
      };

      mockHttpRequest.mockResolvedValue(JSON.stringify({}));

      await client.defendDispute("DISP001", defenseRequest);

      expect(mockHttpRequest).toHaveBeenCalled();
    });
  });

  describe("acceptDispute", () => {
    it("should accept a dispute", async () => {
      mockHttpRequest.mockResolvedValue(JSON.stringify({}));

      await client.acceptDispute("DISP001");

      expect(mockHttpRequest).toHaveBeenCalled();
    });
  });
});
