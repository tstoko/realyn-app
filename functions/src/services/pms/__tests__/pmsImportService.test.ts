import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockBatchSet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = jest.fn().mockReturnValue({
  set: mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
});

const mockCollectionDocId = "test-import-id";
const mockWhereGet = jest.fn();
const mockDocGet = jest.fn();
jest.mock("firebase-admin", () => {
  const mockDoc = jest.fn().mockImplementation(() => ({
    id: mockCollectionDocId,
    get: mockDocGet,
  }));

  const mockWhere = jest.fn().mockReturnValue({
    limit: jest.fn().mockReturnValue({
      get: mockWhereGet,
    }),
  });

  const mockSubCollection = jest.fn().mockImplementation(() => ({
    doc: mockDoc,
    where: mockWhere,
  }));

  const mockOrgDoc = jest.fn().mockImplementation(() => ({
    collection: mockSubCollection,
  }));

  const mockCollection = jest.fn().mockImplementation(() => ({
    doc: mockOrgDoc,
  }));

  return {
    firestore: jest.fn(() => ({
      collection: mockCollection,
      batch: mockBatch,
    })),
  };
});

const mockLogOrgAuditEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../utils/orgAuditLogger", () => ({
  logOrgAuditEvent: (...args: any[]) => mockLogOrgAuditEvent(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {processFileImport} from "../pmsImportService";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PARSERS_FIXTURES = path.join(__dirname, "../parsers/__tests__/fixtures");
const PMS_FIXTURES = path.join(__dirname, "fixtures");

function loadFixture(dir: string, name: string): Buffer {
  return fs.readFileSync(path.join(dir, name));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pmsImportService – processFileImport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no duplicate imports
    mockWhereGet.mockResolvedValue({empty: true});
    // Default: doc get for standalone folio merge
    mockDocGet.mockResolvedValue({exists: false});
  });

  // =========================================================================
  // Opera CSV import
  // =========================================================================

  describe("Opera CSV reservation import", () => {
    it("should detect format as opera_csv and parse correct reservation count", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_reservations_standard.csv");
      const result = await processFileImport("org1", buf, "reservations.csv", "user1");

      expect(result.source.type).toBe("opera_csv");
      expect(result.reservationCount).toBe(5);
      expect(result.warnings).toHaveLength(0);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it("should call batch.set for import doc and each reservation", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_reservations_standard.csv");
      await processFileImport("org1", buf, "reservations.csv", "user1");

      // 1 import doc + 5 reservation docs = 6 set calls
      expect(mockBatchSet).toHaveBeenCalledTimes(6);
    });

    it("should update org pmsIntegration metadata", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_reservations_standard.csv");
      await processFileImport("org1", buf, "reservations.csv", "user1");

      // batch.update for org metadata
      expect(mockBatchUpdate).toHaveBeenCalled();
      const updateCall = mockBatchUpdate.mock.calls[0];
      expect(updateCall[1]["pmsIntegration.type"]).toBe("opera_csv");
    });

    it("should log audit event on success", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_reservations_standard.csv");
      await processFileImport("org1", buf, "reservations.csv", "user1");

      expect(mockLogOrgAuditEvent).toHaveBeenCalledWith(
        "org1",
        expect.objectContaining({
          action: "pms_file_import",
          status: "success",
          details: expect.objectContaining({
            source: "opera_csv",
            reservationCount: 5,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Opera XML import
  // =========================================================================

  describe("Opera XML import", () => {
    it("should detect format as opera_xml and parse correct counts", async () => {
      const buf = loadFixture(PMS_FIXTURES, "sample-reservations.xml");
      const result = await processFileImport("org1", buf, "reservations.xml", "user1");

      expect(result.source.type).toBe("opera_xml");
      expect(result.reservationCount).toBe(3);
      expect(result.folioCount).toBe(1);
      expect(result.activityLogCount).toBe(2);
    });
  });

  // =========================================================================
  // Pipe-delimited import
  // =========================================================================

  describe("Pipe-delimited import", () => {
    it("should detect and parse pipe-delimited file", async () => {
      const buf = loadFixture(PMS_FIXTURES, "sample-pipe-delimited.txt");
      const result = await processFileImport("org1", buf, "reservations.txt", "user1");

      expect(result.source.type).toBe("opera_csv");
      expect(result.reservationCount).toBe(3);
    });
  });

  // =========================================================================
  // Realyn Standard CSV import
  // =========================================================================

  describe("Realyn Standard CSV import", () => {
    it("should detect format as realyn_standard and parse correct count", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "realyn_standard_reservations.csv");
      const result = await processFileImport("org1", buf, "standard.csv", "user1");

      expect(result.source.type).toBe("realyn_standard");
      expect(result.reservationCount).toBe(5);
    });
  });

  // =========================================================================
  // Duplicate file detection
  // =========================================================================

  describe("Duplicate file detection", () => {
    it("should return early with warning for already-imported file", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_reservations_standard.csv");

      // First import succeeds
      mockWhereGet.mockResolvedValueOnce({empty: true});
      await processFileImport("org1", buf, "reservations.csv", "user1");

      // Second import: simulate duplicate found
      mockWhereGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          data: () => ({
            id: "existing-import",
            source: {type: "opera_csv", fileName: "reservations.csv"},
            fileHash: "abc",
            reservationCount: 5,
            folioCount: 0,
            activityLogCount: 0,
            warnings: [],
            rowsParsed: 5,
            rowsSkipped: 0,
          }),
        }],
      });

      const result2 = await processFileImport("org1", buf, "reservations.csv", "user1");
      expect(result2.warnings).toContain("This file has already been imported.");
      expect(result2.importId).toBe("existing-import");
    });
  });

  // =========================================================================
  // Empty file
  // =========================================================================

  describe("Empty file", () => {
    it('should throw "File is empty or has no data rows" for empty CSV', async () => {
      const buf = Buffer.from("A,B,C\n"); // Header only, no data rows
      await expect(
        processFileImport("org1", buf, "empty.csv", "user1"),
      ).rejects.toThrow("File is empty or has no data rows");
    });

    it("should throw for completely empty file", async () => {
      const buf = Buffer.from("");
      await expect(
        processFileImport("org1", buf, "empty.csv", "user1"),
      ).rejects.toThrow("File is empty or has no data rows");
    });
  });

  // =========================================================================
  // Unrecognized format
  // =========================================================================

  describe("Unrecognized format", () => {
    it("should throw for file with random headers", async () => {
      const buf = Buffer.from("FOO,BAR,BAZ,QUX\n1,2,3,4");
      await expect(
        processFileImport("org1", buf, "random.csv", "user1"),
      ).rejects.toThrow("Unrecognised file format");
    });
  });

  // =========================================================================
  // PAN sanitization
  // =========================================================================

  describe("PAN sanitization", () => {
    it("should sanitize full credit card numbers in CSV data", async () => {
      const csv = [
        "CONFIRMATION_NO,GUEST_NAME,ARRIVAL,DEPARTURE,TOTAL_REVENUE,CURRENCY,RESV_STATUS,CARD_LAST4",
        '500001,"Test, Guest",2026-01-01,2026-01-02,10000,USD,CHECKED_OUT,4111111111111111',
      ].join("\n");

      const buf = Buffer.from(csv);
      const result = await processFileImport("org1", buf, "cards.csv", "user1");

      expect(result.reservationCount).toBe(1);

      // Verify batch.set was called with sanitized data
      const resCalls = mockBatchSet.mock.calls.filter(
        (call) => call[1]?.reservation?.paymentMethodLast4,
      );
      expect(resCalls.length).toBeGreaterThan(0);
      const last4 = resCalls[0][1].reservation.paymentMethodLast4;
      expect(last4).toBe("1111");
      expect(last4).not.toBe("4111111111111111");
    });
  });

  // =========================================================================
  // Activity log storage (Task 2 fix)
  // =========================================================================

  describe("Activity log storage", () => {
    it("should group activity logs by confirmation number on reservation docs", async () => {
      const buf = loadFixture(PMS_FIXTURES, "sample-reservations.xml");
      await processFileImport("org1", buf, "data.xml", "user1");

      // Find the batch.set calls that write reservation documents
      const resCalls = mockBatchSet.mock.calls.filter(
        (call) => call[1]?.reservation && call[1]?.activityLogs,
      );

      // The XML has reservations 500001, 500002, 500003
      // Activity logs are for 500001
      const res500001 = resCalls.find(
        (call) => call[1].reservation.confirmationNumber === "500001",
      );
      const res500002 = resCalls.find(
        (call) => call[1].reservation.confirmationNumber === "500002",
      );

      expect(res500001).toBeDefined();
      expect(res500001![1].activityLogs.length).toBe(2);
      expect(res500001![1].activityLogs[0].action).toBe("check_in");

      expect(res500002).toBeDefined();
      expect(res500002![1].activityLogs.length).toBe(0);
    });
  });

  // =========================================================================
  // Standalone folio merge
  // =========================================================================

  describe("Standalone folio merge", () => {
    it("should merge folio onto existing reservation when no reservation in current file", async () => {
      // Import a folio-only file for a confirmation that already exists
      const csv = [
        "CONFIRMATION_NO,TRX_DATE,TRX_DESCRIPTION,TRX_AMOUNT,TRX_TYPE,CURRENCY,REFERENCE",
        "EXIST-001,2026-01-15,Room Charge,15000,CHARGE,USD,RC01",
        "EXIST-001,2026-01-16,Payment,-15000,PAYMENT,USD,PAY01",
      ].join("\n");

      const buf = Buffer.from(csv);

      // Simulate existing doc in Firestore for this confirmation
      mockDocGet.mockResolvedValue({exists: true});

      const result = await processFileImport("org1", buf, "folios.csv", "user1");

      expect(result.folioCount).toBe(1);
      expect(result.reservationCount).toBe(0);

      // Should have called batch.update to merge folio onto existing doc
      const updateCalls = mockBatchUpdate.mock.calls.filter(
        (call) => call[1]?.folio,
      );
      expect(updateCalls.length).toBeGreaterThan(0);
      expect(updateCalls[0][1].folio.confirmationNumber).toBe("EXIST-001");
    });
  });

  // =========================================================================
  // File hash consistency
  // =========================================================================

  describe("File hash", () => {
    it("should produce consistent hash for same file content", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_reservations_standard.csv");

      const result1 = await processFileImport("org1", buf, "file1.csv", "user1");

      // Reset for second call
      jest.clearAllMocks();
      mockWhereGet.mockResolvedValue({empty: true});
      mockDocGet.mockResolvedValue({exists: false});

      const result2 = await processFileImport("org1", buf, "file2.csv", "user1");

      expect(result1.fileHash).toBe(result2.fileHash);
    });
  });

  // =========================================================================
  // Opera folio import
  // =========================================================================

  describe("Opera folio import", () => {
    it("should parse Opera folio CSV and store folio data", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_folio_standard.csv");
      const result = await processFileImport("org1", buf, "folio.csv", "user1");

      expect(result.source.type).toBe("opera_csv");
      expect(result.folioCount).toBe(1);
    });
  });

  // =========================================================================
  // Opera activity log import
  // =========================================================================

  describe("Opera activity log import", () => {
    it("should parse Opera activity log CSV", async () => {
      const buf = loadFixture(PARSERS_FIXTURES, "opera_activity_log.csv");
      const result = await processFileImport("org1", buf, "activity.csv", "user1");

      expect(result.source.type).toBe("opera_csv");
      expect(result.activityLogCount).toBe(5);
    });
  });
});
