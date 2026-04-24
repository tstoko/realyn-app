import * as fs from "fs";
import * as path from "path";
import {OperaCSVParser} from "../operaCsvParser";
import {parseCSVBuffer} from "../csvUtils";
import type {PMSReservation, PMSFolio, PMSActivityLog} from "../../../../types/pmsData";

const FIXTURES = path.join(__dirname, "fixtures");

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, name));
}

describe("OperaCSVParser", () => {
  const parser = new OperaCSVParser();

  // =========================================================================
  // canParse – header detection
  // =========================================================================

  describe("canParse", () => {
    it("should detect standard Opera reservation headers", () => {
      expect(
          parser.canParse(["CONFIRMATION_NO", "RESV_NAME_ID", "GUEST_NAME", "ARRIVAL", "DEPARTURE"]),
      ).toBe(true);
    });

    it("should detect Opera headers case-insensitively", () => {
      expect(
          parser.canParse(["confirmation_no", "guest_name", "arrival", "departure"]),
      ).toBe(true);
    });

    it("should detect Opera folio headers", () => {
      expect(
          parser.canParse(["CONFIRMATION_NO", "TRX_DATE", "TRX_DESCRIPTION", "TRX_AMOUNT"]),
      ).toBe(true);
    });

    it("should detect Opera activity log headers", () => {
      expect(
          parser.canParse(["TIMESTAMP", "ACTION", "DETAILS", "CONFIRMATION_NO"]),
      ).toBe(true);
    });

    it("should reject unrelated headers", () => {
      expect(parser.canParse(["id", "email", "created_at", "amount"])).toBe(false);
    });

    it("should reject empty headers", () => {
      expect(parser.canParse([])).toBe(false);
    });

    it("should accept headers with extra whitespace", () => {
      expect(
          parser.canParse(["  CONFIRMATION_NO  ", "GUEST_NAME", "ARRIVAL", "DEPARTURE"]),
      ).toBe(true);
    });
  });

  // =========================================================================
  // parseReservations – standard format
  // =========================================================================

  describe("parseReservations – standard format", () => {
    let reservations: PMSReservation[];

    beforeAll(() => {
      const buf = loadFixture("opera_reservations_standard.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      reservations = parser.parseReservations(headers, rows);
    });

    it("should parse all 5 reservation rows", () => {
      expect(reservations).toHaveLength(5);
    });

    it("should parse confirmation number", () => {
      expect(reservations[0].confirmationNumber).toBe("100001");
    });

    it("should parse guest name", () => {
      expect(reservations[0].guestName).toBe("Smith, John");
    });

    it("should parse ISO dates correctly", () => {
      expect(reservations[0].checkIn).toBe("2026-01-15");
      expect(reservations[0].checkOut).toBe("2026-01-18");
    });

    it("should parse room number and type", () => {
      expect(reservations[0].roomNumber).toBe("405");
      expect(reservations[0].roomType).toBe("DLX");
    });

    it("should parse rate plan", () => {
      expect(reservations[0].ratePlan).toBe("BAR");
    });

    it("should parse amount as cents", () => {
      expect(reservations[0].totalAmount).toBe(45000);
    });

    it("should parse currency", () => {
      expect(reservations[0].currency).toBe("USD");
    });

    it("should parse booking source", () => {
      expect(reservations[0].bookingSource).toBe("BOOKING.COM");
    });

    it("should map CHECKED_OUT status", () => {
      expect(reservations[0].status).toBe("checked_out");
    });

    it("should map CANCELLED status", () => {
      expect(reservations[3].status).toBe("cancelled");
    });

    it("should map NO_SHOW status", () => {
      expect(reservations[4].status).toBe("no_show");
    });

    it("should parse adults and children", () => {
      expect(reservations[0].adults).toBe(2);
      expect(reservations[0].children).toBe(0);
      expect(reservations[2].children).toBe(1);
    });

    it("should handle guest names with special characters", () => {
      expect(reservations[2].guestName).toBe("O'Brien, Mary-Jane");
    });

    it("should handle missing optional fields", () => {
      expect(reservations[3].bookingSource).toBeUndefined();
    });
  });

  // =========================================================================
  // parseReservations – European date formats
  // =========================================================================

  describe("parseReservations – European date formats", () => {
    let reservations: PMSReservation[];

    beforeAll(() => {
      const buf = loadFixture("opera_reservations_euro_dates.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      reservations = parser.parseReservations(headers, rows);
    });

    it("should parse all 3 rows", () => {
      expect(reservations).toHaveLength(3);
    });

    it("should handle DD/MM/YYYY format", () => {
      expect(reservations[0].checkIn).toBe("2026-01-15");
      expect(reservations[0].checkOut).toBe("2026-01-18");
    });

    it("should handle DD.MM.YYYY format", () => {
      expect(reservations[1].checkIn).toBe("2026-01-20");
      expect(reservations[1].checkOut).toBe("2026-01-22");
    });

    it("should handle DD-MMM-YY Oracle format", () => {
      expect(reservations[2].checkIn).toBe("2026-01-15");
      expect(reservations[2].checkOut).toBe("2026-01-18");
    });
  });

  // =========================================================================
  // parseReservations – missing columns
  // =========================================================================

  describe("parseReservations – missing columns", () => {
    let reservations: PMSReservation[];

    beforeAll(() => {
      const buf = loadFixture("opera_reservations_missing_cols.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      reservations = parser.parseReservations(headers, rows);
    });

    it("should parse rows despite missing columns", () => {
      expect(reservations).toHaveLength(2);
    });

    it("should have undefined for missing optional fields", () => {
      expect(reservations[0].roomNumber).toBeUndefined();
      expect(reservations[0].roomType).toBeUndefined();
      expect(reservations[0].ratePlan).toBeUndefined();
    });

    it("should still parse required fields", () => {
      expect(reservations[0].confirmationNumber).toBe("300001");
      expect(reservations[0].guestName).toBe("Brown, Alice");
      expect(reservations[0].checkIn).toBe("2026-03-01");
    });
  });

  // =========================================================================
  // parseReservations – edge cases
  // =========================================================================

  describe("parseReservations – edge cases", () => {
    it("should skip rows with missing confirmation number", () => {
      const headers = ["CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE", "TOTAL_REVENUE", "CURRENCY", "RESV_STATUS"];
      const rows = [
        ["", "Nobody", "2026-01-01", "2026-01-02", "10000", "USD", "CHECKED_OUT"],
        ["400001", "Valid Guest", "2026-01-01", "2026-01-02", "10000", "USD", "CHECKED_OUT"],
      ];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(1);
      expect(result[0].confirmationNumber).toBe("400001");
    });

    it("should skip rows with missing dates", () => {
      const headers = ["CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE", "TOTAL_REVENUE", "CURRENCY", "RESV_STATUS"];
      const rows = [
        ["400002", "No Dates", "", "", "10000", "USD", "CHECKED_OUT"],
      ];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(0);
    });

    it("should handle BOM in first header", () => {
      const headers = ["\uFEFFCONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE", "TOTAL_REVENUE", "CURRENCY", "RESV_STATUS"];
      expect(parser.canParse(headers)).toBe(true);
    });

    it("should default amount to 0 when not parseable", () => {
      const headers = ["CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE", "TOTAL_REVENUE", "CURRENCY", "RESV_STATUS"];
      const rows = [
        ["400003", "Guest", "2026-01-01", "2026-01-02", "N/A", "USD", "CHECKED_OUT"],
      ];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(0);
    });

    it("should handle amounts with currency symbols", () => {
      const headers = ["CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE", "TOTAL_REVENUE", "CURRENCY", "RESV_STATUS"];
      const rows = [
        ["400004", "Guest", "2026-01-01", "2026-01-02", "$450.00", "USD", "CHECKED_OUT"],
      ];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(45000);
    });

    it("should handle amounts with comma thousands separators", () => {
      const headers = ["CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE", "TOTAL_REVENUE", "CURRENCY", "RESV_STATUS"];
      const rows = [
        ["400005", "Guest", "2026-01-01", "2026-01-02", "1,200.50", "USD", "CHECKED_OUT"],
      ];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(120050);
    });
  });

  // =========================================================================
  // parseFolios
  // =========================================================================

  describe("parseFolios", () => {
    let folios: PMSFolio[];

    beforeAll(() => {
      const buf = loadFixture("opera_folio_standard.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      folios = parser.parseFolios(headers, rows);
    });

    it("should group lines into a single folio by confirmation number", () => {
      expect(folios).toHaveLength(1);
      expect(folios[0].confirmationNumber).toBe("100001");
    });

    it("should parse all line items", () => {
      expect(folios[0].lines).toHaveLength(9);
    });

    it("should categorize room charges", () => {
      const roomCharges = folios[0].lines.filter((l) => l.category === "room");
      expect(roomCharges).toHaveLength(3);
    });

    it("should categorize tax lines", () => {
      const taxes = folios[0].lines.filter((l) => l.category === "tax");
      expect(taxes).toHaveLength(3);
    });

    it("should categorize food & beverage charges", () => {
      const fb = folios[0].lines.filter((l) => l.category === "food_beverage");
      expect(fb).toHaveLength(2);
      expect(fb[0].amount).toBe(3500); // Restaurant
      expect(fb[1].amount).toBe(1200); // Mini Bar
    });

    it("should categorize payments with negative amounts", () => {
      const payments = folios[0].lines.filter((l) => l.category === "payment");
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(-51950);
    });

    it("should calculate total charges correctly", () => {
      // 3 * 15000 (room) + 3 * 750 (tax) + 3500 (F&B) + 1200 (minibar) = 51950
      expect(folios[0].totalCharges).toBe(51950);
    });

    it("should calculate total payments correctly", () => {
      expect(folios[0].totalPayments).toBe(51950);
    });

    it("should calculate balance as zero when fully paid", () => {
      expect(folios[0].balance).toBe(0);
    });

    it("should parse line references", () => {
      expect(folios[0].lines[0].reference).toBe("RC-001");
    });
  });

  // =========================================================================
  // parseActivityLogs
  // =========================================================================

  describe("parseActivityLogs", () => {
    let logs: PMSActivityLog[];

    beforeAll(() => {
      const buf = loadFixture("opera_activity_log.csv");
      const {headers, rows} = parseCSVBuffer(buf);
      logs = parser.parseActivityLogs(headers, rows);
    });

    it("should parse all 5 log entries", () => {
      expect(logs).toHaveLength(5);
    });

    it("should parse timestamps", () => {
      expect(logs[0].timestamp).toBe("2026-01-15T14:32:00");
    });

    it("should normalize action names to lowercase", () => {
      expect(logs[0].action).toBe("check_in");
      expect(logs[1].action).toBe("key_encoded");
      expect(logs[2].action).toBe("housekeeping");
    });

    it("should parse details", () => {
      expect(logs[0].details).toBe("Guest checked in to Room 405");
    });

    it("should parse performedBy", () => {
      expect(logs[0].performedBy).toBe("Front Desk Agent J. Wilson");
    });
  });
});
