import {OperaCSVParser} from "../parsers/operaCsvParser";

const parser = new OperaCSVParser();

function makeHeaders(extra: string[] = []): string[] {
  return [
    "CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE",
    "ROOM", "ROOM_TYPE", "RATE_CODE", "TOTAL_REVENUE",
    "CURRENCY", "RESV_STATUS", "BOOKING_SOURCE", "CARD_LAST4",
    "ADULTS", "CHILDREN",
    ...extra,
  ];
}

function makeRow(overrides: Partial<Record<string, string>> = {}): string[] {
  const defaults: Record<string, string> = {
    CONFIRMATION_NO: "100001",
    GUEST_NAME: "Smith, John",
    ARRIVAL: "2026-01-15",
    DEPARTURE: "2026-01-18",
    ROOM: "405",
    ROOM_TYPE: "DLX",
    RATE_CODE: "BAR",
    TOTAL_REVENUE: "45000",
    CURRENCY: "USD",
    RESV_STATUS: "CHECKED_OUT",
    BOOKING_SOURCE: "WEB",
    CARD_LAST4: "4242",
    ADULTS: "2",
    CHILDREN: "1",
  };
  const merged = {...defaults, ...overrides};
  return makeHeaders().map((h) => merged[h] ?? "");
}

describe("OperaCSVParser", () => {
  describe("canParse", () => {
    it("should recognise Opera headers", () => {
      expect(parser.canParse(makeHeaders())).toBe(true);
    });

    it("should reject unrelated headers", () => {
      expect(parser.canParse(["FOO", "BAR", "BAZ"])).toBe(false);
    });

    it("should handle empty header list", () => {
      expect(parser.canParse([])).toBe(false);
    });
  });

  describe("parseReservations", () => {
    it("should parse a standard comma-delimited Opera row", () => {
      const headers = makeHeaders();
      const rows = [makeRow()];
      const result = parser.parseReservations(headers, rows);

      expect(result).toHaveLength(1);
      expect(result[0].confirmationNumber).toBe("100001");
      expect(result[0].guestName).toBe("Smith, John");
      expect(result[0].checkIn).toBe("2026-01-15");
      expect(result[0].checkOut).toBe("2026-01-18");
      expect(result[0].totalAmount).toBe(45000);
      expect(result[0].currency).toBe("USD");
      expect(result[0].status).toBe("checked_out");
      expect(result[0].paymentMethodLast4).toBe("4242");
      expect(result[0].adults).toBe(2);
      expect(result[0].children).toBe(1);
    });

    it("should parse DD-MMM-YY date format", () => {
      const rows = [makeRow({ARRIVAL: "15-JAN-26", DEPARTURE: "18-JAN-26"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].checkIn).toBe("2026-01-15");
      expect(result[0].checkOut).toBe("2026-01-18");
    });

    it("should parse DD/MM/YYYY date format", () => {
      const rows = [makeRow({ARRIVAL: "15/01/2026", DEPARTURE: "18/01/2026"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].checkIn).toBe("2026-01-15");
      expect(result[0].checkOut).toBe("2026-01-18");
    });

    it("should parse YYYY-MM-DD date format", () => {
      const rows = [makeRow({ARRIVAL: "2026-01-15", DEPARTURE: "2026-01-18"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].checkIn).toBe("2026-01-15");
      expect(result[0].checkOut).toBe("2026-01-18");
    });

    it("should parse decimal dollar amounts", () => {
      const rows = [makeRow({TOTAL_REVENUE: "$450.00"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].totalAmount).toBe(45000);
    });

    it("should parse integer cent amounts", () => {
      const rows = [makeRow({TOTAL_REVENUE: "45000"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].totalAmount).toBe(45000);
    });

    it("should parse negative amounts", () => {
      const rows = [makeRow({TOTAL_REVENUE: "-519.50"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].totalAmount).toBe(-51950);
    });

    it("should map CHECKED_OUT status", () => {
      const rows = [makeRow({RESV_STATUS: "CHECKED_OUT"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].status).toBe("checked_out");
    });

    it("should map NO_SHOW status", () => {
      const rows = [makeRow({RESV_STATUS: "NO_SHOW"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].status).toBe("no_show");
    });

    it("should map CANCELLED status", () => {
      const rows = [makeRow({RESV_STATUS: "CANCELLED"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].status).toBe("cancelled");
    });

    it("should map IN_HOUSE status to checked_in", () => {
      const rows = [makeRow({RESV_STATUS: "IN_HOUSE"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].status).toBe("checked_in");
    });

    it("should default status to confirmed for unknown values", () => {
      const rows = [makeRow({RESV_STATUS: "WEIRD_STATUS"})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result[0].status).toBe("confirmed");
    });

    it("should skip rows without confirmation number", () => {
      const rows = [makeRow({CONFIRMATION_NO: ""})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result).toHaveLength(0);
    });

    it("should skip rows with missing dates", () => {
      const rows = [makeRow({ARRIVAL: "", DEPARTURE: ""})];
      const result = parser.parseReservations(makeHeaders(), rows);
      expect(result).toHaveLength(0);
    });

    it("should handle missing optional columns gracefully", () => {
      const headers = ["CONFIRMATION_NO", "GUEST_NAME", "ARRIVAL", "DEPARTURE"];
      const rows = [["200001", "Test Guest", "2026-06-01", "2026-06-03"]];
      const result = parser.parseReservations(headers, rows);
      expect(result).toHaveLength(1);
      expect(result[0].totalAmount).toBe(0);
      expect(result[0].currency).toBe("USD");
      expect(result[0].roomNumber).toBeUndefined();
    });
  });

  describe("parseFolios", () => {
    const folioHeaders = [
      "CONFIRMATION_NO", "TRX_DATE", "TRX_DESCRIPTION", "TRX_AMOUNT",
      "TRX_TYPE", "CURRENCY", "REFERENCE",
    ];

    it("should group folio lines by confirmation number", () => {
      const rows = [
        ["100001", "2026-01-15", "Room Charge", "15000", "CHARGE", "USD", "RC01"],
        ["100001", "2026-01-16", "Room Charge", "15000", "CHARGE", "USD", "RC02"],
        ["100001", "2026-01-17", "Payment", "-30000", "PAYMENT", "USD", "PAY01"],
      ];
      const result = parser.parseFolios(folioHeaders, rows);
      expect(result).toHaveLength(1);
      expect(result[0].lines).toHaveLength(3);
      expect(result[0].totalCharges).toBe(30000);
      expect(result[0].totalPayments).toBe(30000);
      expect(result[0].balance).toBe(0);
    });
  });

  describe("parseActivityLogs", () => {
    const actHeaders = ["TIMESTAMP", "ACTION", "DETAILS", "PERFORMED_BY", "CONFIRMATION_NO"];

    it("should parse activity log rows", () => {
      const rows = [
        ["2026-01-15T14:30:00", "Check In", "Guest arrived", "staff01", "100001"],
      ];
      const result = parser.parseActivityLogs(actHeaders, rows);
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe("check_in");
      expect(result[0].timestamp).toBe("2026-01-15T14:30:00");
    });

    it("should skip rows without timestamp", () => {
      const rows = [["", "Check In", "Guest arrived", "staff01", "100001"]];
      const result = parser.parseActivityLogs(actHeaders, rows);
      expect(result).toHaveLength(0);
    });
  });
});
