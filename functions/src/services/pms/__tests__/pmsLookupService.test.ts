import type {PMSReservation, PMSFolio, PMSReservationDocument} from "../../../types/pmsData";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Firestore
const mockDocGet = jest.fn();
const mockDocUpdate = jest.fn();
const mockCollectionGet = jest.fn();

const mockDoc = jest.fn().mockReturnValue({
  get: mockDocGet,
  update: mockDocUpdate,
});

const mockCollection = jest.fn().mockReturnValue({
  doc: mockDoc,
  get: mockCollectionGet,
});

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

// Mock Opera Cloud
const mockFetchReservationEvidence = jest.fn();
const mockFetchFolioEvidence = jest.fn();

jest.mock("../../../integrations/operaCloud/operaClient", () => ({
  OperaCloudClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../../../integrations/operaCloud/operaEvidence", () => ({
  fetchReservationEvidence: (...args: any[]) => mockFetchReservationEvidence(...args),
  fetchFolioEvidence: (...args: any[]) => mockFetchFolioEvidence(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {findPMSMatchForDispute} from "../pmsLookupService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReservation(overrides: Partial<PMSReservation> = {}): PMSReservation {
  return {
    confirmationNumber: "100001",
    guestName: "Smith, John",
    checkIn: "2026-01-15",
    checkOut: "2026-01-18",
    roomNumber: "405",
    roomType: "DLX",
    ratePlan: "BAR",
    totalAmount: 45000,
    currency: "USD",
    status: "checked_out",
    paymentMethodLast4: "4242",
    ...overrides,
  };
}

function makeFolio(overrides: Partial<PMSFolio> = {}): PMSFolio {
  return {
    confirmationNumber: "100001",
    lines: [],
    totalCharges: 45000,
    totalPayments: 45000,
    balance: 0,
    currency: "USD",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pmsLookupService", () => {
  let orgData: Record<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    orgData = {};

    // Setup a more realistic chain where:
    // 1st call: disputes/{id}.get() → dispute doc
    // 2nd call: organizations/{id}.get() → org doc (for OHIP config check)
    // Then if needed: organizations/{id}/pmsReservations.get() → reservations snapshot
    mockCollection.mockImplementation((name: string) => {
      if (name === "disputes") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockImplementation(() => mockDocGet()),
            update: mockDocUpdate,
          }),
        };
      }
      if (name === "organizations") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockImplementation(() =>
              Promise.resolve({
                data: () => orgData,
              }),
            ),
            collection: jest.fn().mockReturnValue({
              get: mockCollectionGet,
            }),
          }),
        };
      }
      return {doc: mockDoc};
    });
  });

  // =========================================================================
  // Cache hit
  // =========================================================================

  describe("cache hit", () => {
    it("should return cached PMS match from dispute doc without further lookups", async () => {
      const cachedMatch = {
        reservation: makeReservation(),
        folio: makeFolio(),
        activityLogs: [],
        confidence: 85,
        confirmationNumber: "100001",
        source: "operaExport",
      };

      mockDocGet.mockResolvedValue({
        data: () => ({pmsMatch: cachedMatch}),
      });

      const result = await findPMSMatchForDispute("d1", "org1", {
        amount: 45000,
        currency: "USD",
      });

      expect(result).toEqual(cachedMatch);
      // Should NOT try Opera Cloud or Firestore
      expect(mockFetchReservationEvidence).not.toHaveBeenCalled();
      expect(mockCollectionGet).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // OHIP match
  // =========================================================================

  describe("OHIP match", () => {
    it("should return OPERA Cloud match when connected and confirmation number provided", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      // Org doc: OHIP connected
      orgData = {
        operaCloudIntegration: {
          status: "connected",
          hotelCodes: ["HOTEL01"],
        },
      };

      const reservation = makeReservation({confirmationNumber: "OHIP-001"});
      const folio = makeFolio({confirmationNumber: "OHIP-001"});
      mockFetchReservationEvidence.mockResolvedValue(reservation);
      mockFetchFolioEvidence.mockResolvedValue(folio);

      // Mock the cache update
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d2", "org1", {
        confirmationNumber: "OHIP-001",
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe("operaCloud");
      expect(result!.confidence).toBe(100);
      expect(result!.reservation.confirmationNumber).toBe("OHIP-001");
      expect(mockFetchReservationEvidence).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // OHIP failure → Firestore fallback
  // =========================================================================

  describe("OHIP failure with Firestore fallback", () => {
    it("should fall back to Firestore when OHIP call throws", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      // Org doc: OHIP connected
      orgData = {
        operaCloudIntegration: {
          status: "connected",
          hotelCodes: ["HOTEL01"],
        },
      };

      // OHIP fails
      mockFetchReservationEvidence.mockRejectedValue(new Error("OHIP timeout"));

      // Firestore has matching reservations
      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation({paymentMethodLast4: "4242"}),
        folio: makeFolio(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d3", "org1", {
        confirmationNumber: "100001",
        amount: 45000,
        currency: "USD",
        pspLast4Digits: "4242",
        customerName: "John Smith",
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe("operaExport");
    });
  });

  // =========================================================================
  // OHIP not configured
  // =========================================================================

  describe("OHIP not configured", () => {
    it("should skip OHIP and go to Firestore when no operaCloudIntegration", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      // Org doc: no OHIP config
      orgData = {};

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        folio: makeFolio(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d4", "org1", {
        amount: 45000,
        currency: "USD",
        pspLast4Digits: "4242",
        customerName: "John Smith",
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe("operaExport");
      expect(mockFetchReservationEvidence).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // No confirmation number for OHIP
  // =========================================================================

  describe("no confirmation number for OHIP", () => {
    it("should skip OHIP when confirmation number is missing", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      // Org doc: OHIP connected
      orgData = {
        operaCloudIntegration: {
          status: "connected",
          hotelCodes: ["HOTEL01"],
        },
      };

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        folio: makeFolio(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d5", "org1", {
        amount: 45000,
        currency: "USD",
        pspLast4Digits: "4242",
        // No confirmationNumber
      });

      expect(result).not.toBeNull();
      // Should NOT have called OHIP
      expect(mockFetchReservationEvidence).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // No Firestore match
  // =========================================================================

  describe("no Firestore match", () => {
    it("should return null when pmsReservations collection is empty", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      // No OHIP config
      orgData = {};

      // Empty reservations
      mockCollectionGet.mockResolvedValue({
        empty: true,
        docs: [],
      });

      const result = await findPMSMatchForDispute("d6", "org1", {
        amount: 45000,
        currency: "USD",
      });

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Ambiguous match
  // =========================================================================

  describe("ambiguous match", () => {
    it("should mark result as ambiguous when top 2 candidates have similar scores", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      orgData = {};

      // Two similar reservations (same amount, same card, etc.)
      const res1: Partial<PMSReservationDocument> = {
        reservation: makeReservation({
          confirmationNumber: "A",
          paymentMethodLast4: "4242",
          guestName: "Smith, John",
        }),
        folio: makeFolio({confirmationNumber: "A"}),
        activityLogs: [],
      };
      const res2: Partial<PMSReservationDocument> = {
        reservation: makeReservation({
          confirmationNumber: "B",
          paymentMethodLast4: "4242",
          guestName: "Smith, Jonathan",
        }),
        folio: makeFolio({confirmationNumber: "B"}),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => res1}, {data: () => res2}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d7", "org1", {
        amount: 45000,
        currency: "USD",
        pspLast4Digits: "4242",
        customerName: "John Smith",
        pspTransactionDate: "2026-01-18",
      });

      expect(result).not.toBeNull();
      expect(result!.ambiguous).toBe(true);
    });
  });

  // =========================================================================
  // Cache write failure
  // =========================================================================

  describe("cache write failure", () => {
    it("should still return result when Firestore update fails", async () => {
      // Dispute doc: no cached match
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });

      orgData = {};

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        folio: makeFolio(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });

      // Cache update throws
      mockDocUpdate.mockRejectedValue(new Error("Permission denied"));

      const result = await findPMSMatchForDispute("d8", "org1", {
        amount: 45000,
        currency: "USD",
        pspLast4Digits: "4242",
        customerName: "John Smith",
      });

      // Should still return the match despite cache failure
      expect(result).not.toBeNull();
      expect(result!.reservation.confirmationNumber).toBe("100001");
    });
  });

  // =========================================================================
  // Timestamp formatting (tested indirectly through dispute data)
  // =========================================================================

  describe("timestamp formatting", () => {
    it("should handle Date object as pspTransactionDate", async () => {
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });
      orgData = {};

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d9", "org1", {
        amount: 45000,
        currency: "USD",
        pspTransactionDate: new Date("2026-01-18"),
        pspLast4Digits: "4242",
      });

      expect(result).not.toBeNull();
    });

    it("should handle string as pspTransactionDate", async () => {
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });
      orgData = {};

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d10", "org1", {
        amount: 45000,
        currency: "USD",
        pspTransactionDate: "2026-01-18",
        pspLast4Digits: "4242",
      });

      expect(result).not.toBeNull();
    });

    it("should handle Firestore Timestamp as pspTransactionDate", async () => {
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });
      orgData = {};

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      // Firestore Timestamp-like object
      const firestoreTimestamp = {
        toDate: () => new Date("2026-01-18"),
      };

      const result = await findPMSMatchForDispute("d11", "org1", {
        amount: 45000,
        currency: "USD",
        pspTransactionDate: firestoreTimestamp,
        pspLast4Digits: "4242",
      });

      expect(result).not.toBeNull();
    });

    it("should handle null pspTransactionDate", async () => {
      mockDocGet.mockResolvedValue({
        data: () => ({}),
      });
      orgData = {};

      const reservationDoc: Partial<PMSReservationDocument> = {
        reservation: makeReservation(),
        activityLogs: [],
      };
      mockCollectionGet.mockResolvedValue({
        empty: false,
        docs: [{data: () => reservationDoc}],
      });
      mockDocUpdate.mockResolvedValue(undefined);

      const result = await findPMSMatchForDispute("d12", "org1", {
        amount: 45000,
        currency: "USD",
        pspTransactionDate: null,
        pspLast4Digits: "4242",
      });

      // Should still work — just won't match on date signal
      expect(result).not.toBeNull();
    });
  });
});
