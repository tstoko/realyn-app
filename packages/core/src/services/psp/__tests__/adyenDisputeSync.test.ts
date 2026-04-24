/**
 * Unit tests for Adyen Dispute Sync Service
 */

import { syncDisputesForOrganization } from "../adyenDisputeSync";
import { AdyenClient } from "../adyenClient";
import { getOrganization } from "../../organizationService";
import { upsertUnifiedDispute } from "../../disputeService";
import * as admin from "firebase-admin";

// Mock dependencies
jest.mock("../adyenClient");
jest.mock("../../organizationService");
jest.mock("../../disputeService");
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(),
            })),
          })),
        })),
      })),
    })),
  })),
}));

describe("syncDisputesForOrganization", () => {
  const mockOrganizationId = "org123";
  const mockOrganization = {
    id: mockOrganizationId,
    name: "Test Hotel",
    pspIntegrations: {
      adyen: {
        apiKey: "test_api_key",
        merchantAccounts: ["TestMerchant"],
        status: "connected",
      },
    },
  };

  let mockAdyenClient: jest.Mocked<AdyenClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAdyenClient = {
      getDisputes: jest.fn(),
    } as any;

    (AdyenClient as jest.MockedClass<typeof AdyenClient>).mockImplementation(() => {
      return mockAdyenClient;
    });

    (getOrganization as jest.MockedFunction<typeof getOrganization>).mockResolvedValue(
      mockOrganization as any
    );
  });

  it("should sync disputes successfully", async () => {
    const mockDisputes = [
      {
        disputeId: "DISP001",
        pspReference: "PSP001",
        originalReference: "ORIG001",
        merchantAccount: "TestMerchant",
        amount: { value: 10000, currency: "USD" },
        status: "OPEN",
        eventDate: "2025-01-15T10:00:00Z",
      },
    ];

    mockAdyenClient.getDisputes.mockResolvedValue(mockDisputes as any);

    // Mock Firestore query to return empty (new dispute)
    const mockGet = jest.fn().mockResolvedValue({ empty: true });
    const mockLimit = jest.fn().mockReturnValue({ get: mockGet });
    const mockWhere3 = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere2 = jest.fn().mockReturnValue({ where: mockWhere3 });
    const mockWhere1 = jest.fn().mockReturnValue({ where: mockWhere2 });
    const mockCollection = jest.fn().mockReturnValue({ where: mockWhere1 });

    (admin.firestore as any).mockReturnValue({
      collection: mockCollection,
    });

    (upsertUnifiedDispute as jest.MockedFunction<typeof upsertUnifiedDispute>).mockResolvedValue("mock_id");

    const result = await syncDisputesForOrganization(mockOrganizationId);

    expect(result.success).toBe(true);
    expect(result.disputesSynced).toBe(1);
    expect(result.disputesCreated).toBe(1);
    expect(result.disputesUpdated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(upsertUnifiedDispute).toHaveBeenCalledTimes(1);
  });

  it("should return error if organization not found", async () => {
    (getOrganization as jest.MockedFunction<typeof getOrganization>).mockResolvedValue(null);

    const result = await syncDisputesForOrganization(mockOrganizationId);

    expect(result.success).toBe(false);
    expect(result.disputesSynced).toBe(0);
    expect(result.errors).toContain(`Organization ${mockOrganizationId} not found`);
  });

  it("should return error if Adyen integration not connected", async () => {
    const orgWithoutAdyen = {
      ...mockOrganization,
      pspIntegrations: {},
    };

    (getOrganization as jest.MockedFunction<typeof getOrganization>).mockResolvedValue(
      orgWithoutAdyen as any
    );

    const result = await syncDisputesForOrganization(mockOrganizationId);

    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      `Adyen integration not connected for organization ${mockOrganizationId}`
    );
  });

  it("should handle API errors gracefully", async () => {
    const error = new Error("API Error");
    mockAdyenClient.getDisputes.mockRejectedValue(error);

    const mockGet = jest.fn().mockResolvedValue({ empty: true });
    const mockLimit = jest.fn().mockReturnValue({ get: mockGet });
    const mockWhere3 = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere2 = jest.fn().mockReturnValue({ where: mockWhere3 });
    const mockWhere1 = jest.fn().mockReturnValue({ where: mockWhere2 });
    const mockCollection = jest.fn().mockReturnValue({ where: mockWhere1 });

    (admin.firestore as any).mockReturnValue({
      collection: mockCollection,
    });

    const result = await syncDisputesForOrganization(mockOrganizationId);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should update existing disputes", async () => {
    const mockDisputes = [
      {
        disputeId: "DISP001",
        pspReference: "PSP001",
        originalReference: "ORIG001",
        merchantAccount: "TestMerchant",
        amount: { value: 10000, currency: "USD" },
        status: "OPEN",
        eventDate: "2025-01-15T10:00:00Z",
      },
    ];

    mockAdyenClient.getDisputes.mockResolvedValue(mockDisputes as any);

    // Mock Firestore query to return existing dispute
    const mockDoc = { id: "existing-dispute-id" };
    const mockGet = jest.fn().mockResolvedValue({
      empty: false,
      docs: [mockDoc],
    });
    const mockLimit = jest.fn().mockReturnValue({ get: mockGet });
    const mockWhere3 = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere2 = jest.fn().mockReturnValue({ where: mockWhere3 });
    const mockWhere1 = jest.fn().mockReturnValue({ where: mockWhere2 });
    const mockCollection = jest.fn().mockReturnValue({ where: mockWhere1 });

    (admin.firestore as any).mockReturnValue({
      collection: mockCollection,
    });

    (upsertUnifiedDispute as jest.MockedFunction<typeof upsertUnifiedDispute>).mockResolvedValue("mock_id");

    const result = await syncDisputesForOrganization(mockOrganizationId);

    expect(result.disputesUpdated).toBe(1);
    expect(result.disputesCreated).toBe(0);
  });
});

