import * as fs from "fs";
import * as path from "path";
import {RealynStandardParser, parseStandardAmount} from "../realynStandardParser";
import {parseCSVBuffer} from "../csvUtils";
import type {PMSReservation, PMSFolio, PMSActivityLog} from "../../../../types/pmsData";

const FIXTURES = path.join(__dirname, "fixtures");

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, name));
}

describe("RealynStandardParser", () => {
  const parser = new RealynStandardParser();

  // =========================================================================
  // canParse – header detection
  // =========================================================================

  describe("canParse", () => {
    it("should detect Realyn Standard reservation headers", () => {
      expect(
        parser.canParse([
          "CONFIRMATION_NO", "GUEST_NAME", "CHECK_IN", "CHECK_OUT",
          "ROOM_NUMBER", "TOTAL_AMOUNT", "STATUS",
        ]),
      ).toBe(true);
    });

    it("should detect Realyn Standard headers case-insensitively", () => {
      expect(
        parser.canParse([
          "confirmation_no", "guest_name", "check_in", "check_out",
          "room_number", "total_amount", "status",
        ]),
      ).toBe(true);
    });

    it("should detect Realyn Standard folio headers", () => {
      expect(
        parser.canParse([
          "CONFIRMATION_NO", "TRX_DATE", "TRX_DESCRIPTION", "TRX_AMOUNT", "TRX_CATEGORY",
          "CHECK_IN", "CHECK_OUT", "TOTAL_AMOUNT",
        ]),
      ).toBe(true);
    });

    it("should NOT detect Opera-native headers", () => {
      // Opera uses ARRIVAL, DEPARTURE, ROOM, RATE_CODE, TOTAL_REVENUE, RESV_STATUS
      expect(
        parser.canParse([
          "CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE",
          "ROOM", "RATE_CODE", "TOTAL_REVENUE", "RESV_STATUS",
        ]),
      ).toBe(false);
    });

    it("should reject junk headers", () => {
      expect(parser.canParse(["FOO", "BAR", "BAZ"])).toBe(false);
    });

    it("should reject empty headers", () => {
      expect(parser.canParse([])).toBe(false);
    });

    it("should require CONFIRMATION_NO to be present", () => {
      expect(
        parser.canParse([
          "GUEST_NAME", "CHECK_IN", "CHECK_OUT",
          "ROOM_NUMBER", "TOTAL_AMOUNT", "STATUS",
        ]),
      ).toBe(false);
    });

    it("should require at least 3 distinguishing columns", () => {
      // Only 2 distinguishing: CHECK_IN, CHECK_OUT
      expect(
        parser.canParse([
          "CONFIRMATION_NO", "GUEST_NAME", "CHECK_IN", "CHECK_OUT",
        ]),
      ).toBe(false);
    });
  });

  // =========================================================================
  // parseStandardAmount
  // =========================================================================

  describe("parseStandardAmount", () => {
    it('should convert "450" to 45000 cents', () => {
      expect(parseStandardAmount("450")).toBe(45000);
    });

    it('should convert "450.00" to 45000 cents', () => {
      expect(parseStandardAmount("450.00")).toBe(45000);
    });

    it('should convert "4.50" to 450 cents', () => {
      expect(parseStandardAmount("4.50")).toBe(450);
    });

    it('should convert "0" to 0', () => {
      expect(parseStandardAmount("0")).toBe(0);
    });

    it('should convert "" to 0', () => {
      expect(parseStandardAmount("")).toBe(0);
    });

    it('should convert "1,200.50" to 120050 cents', () => {
      expect(parseStandardAmount("1,200.50")).toBe(120050);
    });

    it('should handle negative amounts "-450.00"', () => {
      expect(parseStandardAmount("-450.00")).toBe(-45000);
    });

    it("should handle undefined", () => {
      expect(parseStandardAmount(undefined)).toBe(0);
    });

    it('should handle "$450.00" with currency symbol', () => {
      expect(parseStandardAmount("$450.00")).toBe(45000);
    });
  });

  // =========================================================================
  // parseReservations – standard format
  // =========================================================================

  describe("parseReservations – standard format", () => {
    let reservations: PMSReservation[];

    beforeAll(() => {
      const buf = loadFixture("realyn_standard_reservations.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      reservations = parser.parseReservations(headers, rows);
    });

    it("should parse all 5 reservation rows", () => {
      expect(reservations).toHaveLength(5);
    });

    it("should parse confirmation number", () => {
      expect(reservations[0].confirmationNumber).toBe("RS-001");
    });

    it("should parse guest name", () => {
      expect(reservations[0].guestName).toBe("Smith, John");
    });

    it("should parse ISO dates", () => {
      expect(reservations[0].checkIn).toBe("2026-01-15");
      expect(reservations[0].checkOut).toBe("2026-01-18");
    });

    it("should parse room number (ROOM_NUMBER column)", () => {
      expect(reservations[0].roomNumber).toBe("405");
    });

    it("should parse room type", () => {
      expect(reservations[0].roomType).toBe("Deluxe");
    });

    it("should parse rate plan (RATE_PLAN column)", () => {
      expect(reservations[0].ratePlan).toBe("Standard");
    });

    it("should convert amount from major units to cents", () => {
      // 450.00 → 45000 cents
      expect(reservations[0].totalAmount).toBe(45000);
    });

    it("should parse currency", () => {
      expect(reservations[0].currency).toBe("USD");
      expect(reservations[1].currency).toBe("EUR");
    });

    it("should parse status directly", () => {
      expect(reservations[0].status).toBe("checked_out");
      expect(reservations[2].status).toBe("checked_in");
      expect(reservations[3].status).toBe("cancelled");
      expect(reservations[4].status).toBe("no_show");
    });

    it("should parse card last4", () => {
      expect(reservations[0].paymentMethodLast4).toBe("4242");
    });

    it("should parse booking source", () => {
      expect(reservations[0].bookingSource).toBe("Booking.com");
    });

    it("should parse adults and children", () => {
      expect(reservations[0].adults).toBe(2);
      expect(reservations[0].children).toBe(0);
      expect(reservations[2].children).toBe(1);
    });

    it("should handle missing optional fields", () => {
      expect(reservations[3].bookingSource).toBeUndefined();
      expect(reservations[3].paymentMethodLast4).toBeUndefined();
    });

    it("should handle amounts with decimals > 2 places (1200.50)", () => {
      expect(reservations[2].totalAmount).toBe(120050);
    });

    it("should handle guest names with special characters", () => {
      expect(reservations[2].guestName).toBe("O'Brien, Mary-Jane");
    });
  });

  // =========================================================================
  // parseReservations – minimal fields
  // =========================================================================

  describe("parseReservations – minimal fields", () => {
    it("should parse with only required fields", () => {
      const headers = [
        "CONFIRMATION_NO", "GUEST_NAME", "CHECK_IN", "CHECK_OUT", "TOTAL_AMOUNT",
        "ROOM_NUMBER", "STATUS",
      ];
      const rows = [
        ["MIN-001", "Test Guest", "2026-06-01", "2026-06-03", "100.00", "101", "confirmed"],
      ];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(1);
      expect(result[0].confirmationNumber).toBe("MIN-001");
      expect(result[0].totalAmount).toBe(10000);
      expect(result[0].currency).toBe("USD");
      expect(result[0].roomNumber).toBe("101");
      expect(result[0].roomType).toBeUndefined();
      expect(result[0].ratePlan).toBeUndefined();
    });

    it("should skip rows without confirmation number", () => {
      const headers = [
        "CONFIRMATION_NO", "GUEST_NAME", "CHECK_IN", "CHECK_OUT", "TOTAL_AMOUNT",
        "ROOM_NUMBER", "STATUS",
      ];
      const rows = [["", "Nobody", "2026-01-01", "2026-01-02", "100", "101", "confirmed"]];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(0);
    });

    it("should skip rows without dates", () => {
      const headers = [
        "CONFIRMATION_NO", "GUEST_NAME", "CHECK_IN", "CHECK_OUT", "TOTAL_AMOUNT",
        "ROOM_NUMBER", "STATUS",
      ];
      const rows = [["X-001", "Guest", "", "", "100", "101", "confirmed"]];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(0);
    });

    it("should default unknown status to confirmed", () => {
      const headers = [
        "CONFIRMATION_NO", "GUEST_NAME", "CHECK_IN", "CHECK_OUT", "TOTAL_AMOUNT",
        "ROOM_NUMBER", "STATUS",
      ];
      const rows = [["X-001", "Guest", "2026-01-01", "2026-01-02", "100", "101", "WEIRD"]];
      const result = parser.parseReservations(headers, rows);
      expect(result[0].status).toBe("confirmed");
    });
  });

  // =========================================================================
  // parseFolios
  // =========================================================================

  describe("parseFolios", () => {
    let folios: PMSFolio[];

    beforeAll(() => {
      const buf = loadFixture("realyn_standard_folios.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      folios = parser.parseFolios(headers, rows);
    });

    it("should group lines by confirmation number", () => {
      expect(folios).toHaveLength(2);
    });

    it("should parse RS-001 folio with correct line count", () => {
      const f1 = folios.find((f) => f.confirmationNumber === "RS-001");
      expect(f1).toBeDefined();
      expect(f1!.lines).toHaveLength(8);
    });

    it("should calculate charges and payments for RS-001", () => {
      const f1 = folios.find((f) => f.confirmationNumber === "RS-001")!;
      // 3*15000 + 3*750 + 3500 = 45000 + 2250 + 3500 = 50750
      expect(f1.totalCharges).toBe(50750);
      // 50750
      expect(f1.totalPayments).toBe(50750);
      expect(f1.balance).toBe(0);
    });

    it("should track currency per confirmation number", () => {
      const f1 = folios.find((f) => f.confirmationNumber === "RS-001");
      const f2 = folios.find((f) => f.confirmationNumber === "RS-002");
      expect(f1!.currency).toBe("USD");
      expect(f2!.currency).toBe("EUR");
    });

    it("should categorize folio lines correctly", () => {
      const f1 = folios.find((f) => f.confirmationNumber === "RS-001")!;
      const roomCharges = f1.lines.filter((l) => l.category === "room");
      const taxes = f1.lines.filter((l) => l.category === "tax");
      const fbCharges = f1.lines.filter((l) => l.category === "food_beverage");
      const payments = f1.lines.filter((l) => l.category === "payment");
      expect(roomCharges).toHaveLength(3);
      expect(taxes).toHaveLength(3);
      expect(fbCharges).toHaveLength(1);
      expect(payments).toHaveLength(1);
    });

    it("should parse line references", () => {
      const f1 = folios.find((f) => f.confirmationNumber === "RS-001")!;
      expect(f1.lines[0].reference).toBe("RC-001");
    });
  });

  // =========================================================================
  // parseActivityLogs
  // =========================================================================

  describe("parseActivityLogs", () => {
    let logs: PMSActivityLog[];

    beforeAll(() => {
      const buf = loadFixture("realyn_standard_activity_logs.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      logs = parser.parseActivityLogs(headers, rows);
    });

    it("should parse all 5 log entries", () => {
      expect(logs).toHaveLength(5);
    });

    it("should parse timestamps", () => {
      expect(logs[0].timestamp).toBe("2026-01-15T14:30:00");
    });

    it("should parse action", () => {
      expect(logs[0].action).toBe("check_in");
    });

    it("should parse details", () => {
      expect(logs[0].details).toBe("Guest checked in to Room 405");
    });

    it("should parse performedBy", () => {
      expect(logs[0].performedBy).toBe("Jane Wilson");
    });

    it("should include confirmationNumber on each log", () => {
      expect(logs[0].confirmationNumber).toBe("RS-001");
      expect(logs[3].confirmationNumber).toBe("RS-002");
    });

    it("should have correct log counts per confirmation", () => {
      const rs001Logs = logs.filter((l) => l.confirmationNumber === "RS-001");
      const rs002Logs = logs.filter((l) => l.confirmationNumber === "RS-002");
      expect(rs001Logs).toHaveLength(3);
      expect(rs002Logs).toHaveLength(2);
    });
  });
});
