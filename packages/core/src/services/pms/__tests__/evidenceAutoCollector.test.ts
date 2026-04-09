import {autoCollectFromPMS} from "../evidenceAutoCollector";
import type {PMSMatchResult} from "../pmsLookupService";
import type {EvidencePlan, EvidenceItem, EvidenceRequirement} from "../../../types/aiDispute";
import type {PMSReservation, PMSFolio} from "../../../types/pmsData";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockSave = jest.fn();
const mockGetSignedUrl = jest.fn().mockResolvedValue(["https://example.com/file.pdf"]);
const mockFile = jest.fn().mockReturnValue({save: mockSave, getSignedUrl: mockGetSignedUrl});

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
        update: mockUpdate,
      })),
    })),
  })),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: mockFile,
    })),
  })),
}));

const mockFindPMSMatch = jest.fn();
jest.mock("../pmsLookupService", () => ({
  findPMSMatchForDispute: (...args: any[]) => mockFindPMSMatch(...args),
}));

const mockGenerateFolioPDF = jest.fn().mockResolvedValue(Buffer.from("folio-pdf"));
const mockGenerateCheckInOutPDF = jest.fn().mockResolvedValue(Buffer.from("checkin-pdf"));
const mockGenerateActivityLogPDF = jest.fn().mockResolvedValue(Buffer.from("activity-pdf"));
const mockGenerateEvidencePacketPDF = jest.fn().mockResolvedValue(Buffer.from("packet-pdf"));
jest.mock("../pdfGenerator", () => ({
  generateFolioPDF: (...args: any[]) => mockGenerateFolioPDF(...args),
  generateCheckInOutPDF: (...args: any[]) => mockGenerateCheckInOutPDF(...args),
  generateActivityLogPDF: (...args: any[]) => mockGenerateActivityLogPDF(...args),
  generateEvidencePacketPDF: (...args: any[]) => mockGenerateEvidencePacketPDF(...args),
}));

const mockUpdateEvidenceItemStatus = jest.fn().mockResolvedValue(true);
jest.mock("../../ai/evidencePlanningService", () => ({
  updateEvidenceItemStatus: (...args: any[]) => mockUpdateEvidenceItemStatus(...args),
}));

const mockCreateSystemAuditEntry = jest.fn().mockResolvedValue(undefined);
const mockCreateErrorAuditEntry = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../utils/auditTrailHelper", () => ({
  createSystemAuditEntry: (...args: any[]) => mockCreateSystemAuditEntry(...args),
  createErrorAuditEntry: (...args: any[]) => mockCreateErrorAuditEntry(...args),
}));

jest.mock("../../knowledgeBaseService", () => ({
  getOutputTemplate: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../evidenceService", () => ({
  registerEvidenceFile: jest.fn().mockResolvedValue("mock-evidence-doc-id"),
}));

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
    lines: [{date: "2026-01-15", description: "Room Charge", amount: 15000, category: "room"}],
    totalCharges: 45000,
    totalPayments: 45000,
    balance: 0,
    currency: "USD",
    ...overrides,
  };
}

function makeMatch(overrides: Partial<PMSMatchResult> = {}): PMSMatchResult {
  return {
    reservation: makeReservation(),
    folio: makeFolio(),
    activityLogs: [],
    confidence: 85,
    confirmationNumber: "100001",
    source: "operaExport",
    ...overrides,
  };
}

function makePlan(requirements: Partial<EvidenceRequirement>[] = []): EvidencePlan {
  return {
    disputeCategory: "fraud",
    disputeSubtype: "card_not_present",
    reasonCode: "10.4",
    network: "visa",
    recommendation: "fight",
    winnability: "high",
    winnabilityReason: "Strong evidence",
    requirements: requirements.map((r, i) => ({
      id: r.id || `req-${i}`,
      category: r.category || "pms_data",
      label: r.label || "Folio",
      tag: r.tag || "folio",
      description: r.description || "Guest folio",
      required: r.required ?? true,
      priority: r.priority || "high",
      ...r,
    })) as EvidenceRequirement[],
    summary: "Test plan",
    generatedAt: new Date().toISOString(),
    model: "test",
  };
}

function makeEvidenceItems(ids: string[]): EvidenceItem[] {
  return ids.map((id) => ({
    requirementId: id,
    status: "pending",
  })) as EvidenceItem[];
}

function setupDisputeDoc(overrides: Record<string, any> = {}) {
  mockGet.mockResolvedValue({
    data: () => ({
      amount: 45000,
      currency: "USD",
      pspTransactionDate: "2026-01-18",
      pspLast4Digits: "4242",
      customerName: "John Smith",
      ...overrides,
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evidenceAutoCollector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
  });

  describe("OHIP match triggers evidence collection", () => {
    it("should collect evidence from operaCloud source with correct provenance", async () => {
      setupDisputeDoc();
      const match = makeMatch({source: "operaCloud", confidence: 100});
      mockFindPMSMatch.mockResolvedValue(match);

      const plan = makePlan([{id: "req-folio", tag: "folio", label: "Guest Folio"}]);
      const items = makeEvidenceItems(["req-folio"]);

      const result = await autoCollectFromPMS("d1", "org1", plan, items);

      expect(result.itemsFulfilled).toContain("req-folio");
      expect(mockGenerateFolioPDF).toHaveBeenCalled();

      const saveCall = mockSave.mock.calls[0];
      expect(saveCall[1].metadata.metadata.source).toBe("operaCloud");

      const updateCall = mockUpdateEvidenceItemStatus.mock.calls[0];
      expect(updateCall[6]).toContain("source: operaCloud");
    });
  });

  describe("CSV fallback", () => {
    it("should work with operaExport source when OHIP is not configured", async () => {
      setupDisputeDoc();
      const match = makeMatch({source: "operaExport", confidence: 85});
      mockFindPMSMatch.mockResolvedValue(match);

      const plan = makePlan([{id: "req-checkin", tag: "checkin_checkout_records", label: "Check-in records"}]);
      const items = makeEvidenceItems(["req-checkin"]);

      const result = await autoCollectFromPMS("d2", "org1", plan, items);

      expect(result.itemsFulfilled).toContain("req-checkin");
      expect(mockGenerateCheckInOutPDF).toHaveBeenCalled();

      const saveCall = mockSave.mock.calls[0];
      expect(saveCall[1].metadata.metadata.source).toBe("operaExport");
    });
  });

  describe("ambiguous match handling", () => {
    it("should skip auto-collection and log audit entry when match is ambiguous", async () => {
      setupDisputeDoc();
      const match = makeMatch({ambiguous: true, confidence: 60});
      mockFindPMSMatch.mockResolvedValue(match);

      const plan = makePlan([{id: "req-folio", tag: "folio", label: "Guest Folio"}]);
      const items = makeEvidenceItems(["req-folio"]);

      const result = await autoCollectFromPMS("d3", "org1", plan, items);

      expect(result.itemsFulfilled).toHaveLength(0);
      expect(mockGenerateFolioPDF).not.toHaveBeenCalled();

      expect(mockCreateSystemAuditEntry).toHaveBeenCalledWith(
          "d3",
          "PMS Match Ambiguous",
          expect.stringContaining("Manual review needed"),
          "pms_matching",
          expect.objectContaining({pmsMatchConfidence: "low"}),
      );
    });
  });

  describe("provenance tracking", () => {
    it("should set correct source in Storage metadata and evidence notes", async () => {
      setupDisputeDoc();
      const match = makeMatch({source: "operaCloud"});
      mockFindPMSMatch.mockResolvedValue(match);

      const plan = makePlan([{id: "req-folio", tag: "folio", label: "Guest Folio"}]);
      const items = makeEvidenceItems(["req-folio"]);

      await autoCollectFromPMS("d4", "org1", plan, items);

      // Individual evidence upload
      const individualSaveCall = mockSave.mock.calls[0];
      expect(individualSaveCall[1].metadata.metadata.source).toBe("operaCloud");

      const statusCall = mockUpdateEvidenceItemStatus.mock.calls[0];
      expect(statusCall[6]).toContain("source: operaCloud");
    });
  });

  describe("combined evidence packet", () => {
    it("should generate and upload evidence packet after individual items", async () => {
      setupDisputeDoc();
      const match = makeMatch({source: "operaCloud"});
      mockFindPMSMatch.mockResolvedValue(match);

      const plan = makePlan([{id: "req-folio", tag: "folio", label: "Guest Folio"}]);
      const items = makeEvidenceItems(["req-folio"]);

      await autoCollectFromPMS("d5", "org1", plan, items);

      expect(mockGenerateEvidencePacketPDF).toHaveBeenCalledWith(
          match.reservation,
          match.folio,
          match.activityLogs,
          expect.objectContaining({source: "operaCloud"}),
      );

      const packetFilePath = mockFile.mock.calls.find(
          (call: any[]) => typeof call[0] === "string" && call[0].includes("EvidencePacket"),
      );
      expect(packetFilePath).toBeDefined();
    });
  });

  describe("no match", () => {
    it("should return early with no errors when no PMS match found", async () => {
      setupDisputeDoc();
      mockFindPMSMatch.mockResolvedValue(null);

      const plan = makePlan([{id: "req-folio", tag: "folio", label: "Guest Folio"}]);
      const items = makeEvidenceItems(["req-folio"]);

      const result = await autoCollectFromPMS("d6", "org1", plan, items);

      expect(result.itemsFulfilled).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(mockGenerateFolioPDF).not.toHaveBeenCalled();
    });
  });
});
