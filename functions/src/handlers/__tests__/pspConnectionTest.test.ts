/**
 * Integration tests for PSP Connection Test handlers
 */

import { testAdyenConnection } from "../pspConnectionTest";
import { AdyenClient } from "../../services/psp/adyenClient";

// Mock Adyen client
jest.mock("../../services/psp/adyenClient");

// Mock auth middleware - allow all requests by default
jest.mock("../../utils/authMiddleware", () => ({
  verifyUser: jest.fn().mockResolvedValue({ success: true, uid: "test_user" }),
  sendAuthError: jest.fn((res: any, result: any) => {
    res.status(401).json({ error: "Unauthorized" });
  }),
}));

describe("testAdyenConnection", () => {
  let mockAdyenClient: jest.Mocked<AdyenClient>;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAdyenClient = {
      testConnection: jest.fn(),
    } as any;

    (AdyenClient as jest.MockedClass<typeof AdyenClient>).mockImplementation(() => {
      return mockAdyenClient;
    });

    const headers: Record<string, string> = {
      origin: "http://localhost",
      "content-type": "application/json",
    };

    mockRequest = {
      method: "POST",
      headers,
      get: jest.fn((name: string) => headers[name.toLowerCase()]),
      header: jest.fn((name: string) => headers[name.toLowerCase()]),
      body: {
        apiKey: "test_api_key",
        merchantAccount: "TestMerchant",
      },
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
  });

  it("should return success on valid connection", async () => {
    mockAdyenClient.testConnection.mockResolvedValue({
      success: true,
      message: "Adyen connection successful",
    });

    await testAdyenConnection(mockRequest, mockResponse);

    expect(mockAdyenClient.testConnection).toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: true,
      message: "Adyen connection successful",
    });
  });

  it("should return error on failed connection", async () => {
    mockAdyenClient.testConnection.mockResolvedValue({
      success: false,
      message: "Invalid API key or merchant account",
    });

    await testAdyenConnection(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid API key or merchant account",
      error: "CONNECTION_ERROR",
    });
  });

  it("should return 405 for non-POST requests", async () => {
    mockRequest.method = "GET";

    await testAdyenConnection(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(405);
    expect(mockResponse.send).toHaveBeenCalledWith("Method Not Allowed");
  });

  it("should return 400 for missing credentials", async () => {
    mockRequest.body = {};

    await testAdyenConnection(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      message: "Missing API key or merchant account",
      error: "MISSING_CREDENTIALS",
    });
  });

  it("should handle exceptions", async () => {
    const error = new Error("Unexpected error");
    mockAdyenClient.testConnection.mockRejectedValue(error);

    await testAdyenConnection(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "CONNECTION_ERROR",
      })
    );
  });
});



