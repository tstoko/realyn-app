import * as fs from "fs";
import * as path from "path";
import {XMLParser} from "fast-xml-parser";
import {OperaXMLParser} from "../parsers/operaXmlParser";

const parser = new OperaXMLParser();
const xmlParser = new XMLParser({ignoreAttributes: false, trimValues: true, parseTagValue: false});

function loadFixture(name: string): Record<string, unknown> {
  const filePath = path.join(__dirname, "fixtures", name);
  const text = fs.readFileSync(filePath, "utf-8");
  return xmlParser.parse(text);
}

function setAndParse(data: Record<string, unknown>) {
  parser.setParsedXML(data);
}

describe("OperaXMLParser", () => {
  describe("canParse", () => {
    it("should return true for __XML__ sentinel header", () => {
      expect(parser.canParse(["__XML__"])).toBe(true);
    });

    it("should return false for regular CSV headers", () => {
      expect(parser.canParse(["CONFIRMATION_NO", "GUEST_NAME"])).toBe(false);
    });

    it("should return false for empty headers", () => {
      expect(parser.canParse([])).toBe(false);
    });
  });

  describe("parseReservations", () => {
    it("should parse valid XML export into PMSReservation[]", () => {
      const data = loadFixture("sample-reservations.xml");
      setAndParse(data);

      const result = parser.parseReservations(["__XML__"], []);
      expect(result).toHaveLength(3);

      expect(result[0].confirmationNumber).toBe("500001");
      expect(result[0].guestName).toBe("Smith, John");
      expect(result[0].checkIn).toBe("2026-01-15");
      expect(result[0].checkOut).toBe("2026-01-18");
      expect(result[0].totalAmount).toBe(45000);
      expect(result[0].currency).toBe("USD");
      expect(result[0].status).toBe("checked_out");
      expect(result[0].roomNumber).toBe("405");
      expect(result[0].adults).toBe(2);
      expect(result[0].children).toBe(1);
    });

    it("should build guest name from FirstName/LastName elements", () => {
      const data = loadFixture("sample-reservations.xml");
      setAndParse(data);

      const result = parser.parseReservations(["__XML__"], []);
      const james = result.find((r) => r.confirmationNumber === "500003");
      expect(james).toBeDefined();
      expect(james!.guestName).toBe("Brown, James");
    });

    it("should parse DD-MMM-YY dates from XML", () => {
      const data = loadFixture("sample-reservations.xml");
      setAndParse(data);

      const result = parser.parseReservations(["__XML__"], []);
      const brown = result.find((r) => r.confirmationNumber === "500003");
      expect(brown!.checkIn).toBe("2026-01-15");
      expect(brown!.checkOut).toBe("2026-01-20");
    });

    it("should handle malformed/empty XML without crashing", () => {
      setAndParse({});
      const result = parser.parseReservations(["__XML__"], []);
      expect(result).toHaveLength(0);
    });

    it("should handle null XML data without crashing", () => {
      parser.setParsedXML(null as unknown as Record<string, unknown>);
      const result = parser.parseReservations(["__XML__"], []);
      expect(result).toHaveLength(0);
    });

    it("should handle missing optional elements", () => {
      const data = {
        Reservations: {
          Reservation: {
            ConfirmationNumber: "999",
            ArrivalDate: "2026-05-01",
            DepartureDate: "2026-05-03",
          },
        },
      };
      setAndParse(data);

      const result = parser.parseReservations(["__XML__"], []);
      expect(result).toHaveLength(1);
      expect(result[0].guestName).toBe("Unknown");
      expect(result[0].totalAmount).toBe(0);
      expect(result[0].currency).toBe("USD");
      expect(result[0].roomNumber).toBeUndefined();
    });

    it("should handle single reservation (not wrapped in array)", () => {
      const data = {
        Reservations: {
          Reservation: {
            ConfirmationNumber: "SINGLE01",
            GuestName: "Solo, Han",
            ArrivalDate: "2026-04-01",
            DepartureDate: "2026-04-03",
            TotalRevenue: "200.00",
            Currency: "USD",
            ReservationStatus: "CONFIRMED",
          },
        },
      };
      setAndParse(data);

      const result = parser.parseReservations(["__XML__"], []);
      expect(result).toHaveLength(1);
      expect(result[0].confirmationNumber).toBe("SINGLE01");
      expect(result[0].totalAmount).toBe(20000);
    });
  });

  describe("parseFolios", () => {
    it("should parse XML folio transactions into PMSFolio[]", () => {
      const data = loadFixture("sample-reservations.xml");
      setAndParse(data);

      const result = parser.parseFolios(["__XML__"], []);
      expect(result).toHaveLength(1);
      expect(result[0].confirmationNumber).toBe("500001");
      expect(result[0].lines).toHaveLength(4);
      expect(result[0].totalCharges).toBe(45000);
      expect(result[0].totalPayments).toBe(45000);
      expect(result[0].balance).toBe(0);
    });

    it("should return empty array when no folio data", () => {
      setAndParse({});
      const result = parser.parseFolios(["__XML__"], []);
      expect(result).toHaveLength(0);
    });
  });

  describe("parseActivityLogs", () => {
    it("should parse XML activity logs", () => {
      const data = loadFixture("sample-reservations.xml");
      setAndParse(data);

      const result = parser.parseActivityLogs(["__XML__"], []);
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe("check_in");
      expect(result[0].timestamp).toBe("2026-01-15T14:30:00");
      expect(result[0].performedBy).toBe("front_desk_01");
    });

    it("should return empty array when no activity data", () => {
      setAndParse({});
      const result = parser.parseActivityLogs(["__XML__"], []);
      expect(result).toHaveLength(0);
    });
  });
});
