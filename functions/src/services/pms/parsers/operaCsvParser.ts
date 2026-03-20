/**
 * Opera 5 PMS CSV Parser
 *
 * Parses reservation, folio, and activity-log CSV exports produced by
 * Oracle Opera 5 (on-premise). Handles regional date formats, optional
 * columns, and messy real-world data.
 */

import type {PMSParser} from "./types";
import type {
  PMSReservation,
  PMSFolio,
  PMSFolioLine,
  PMSActivityLog,
} from "../../../types/pmsData";
import {buildColumnMap, getCell, normalizeHeader} from "./csvUtils";
import {sanitizePAN} from "../sanitizer";
import {parseOperaDate, parseAmount, mapStatus, mapTrxType} from "./operaParserUtils";

// ============================================================
// Known Opera column names (normalised to uppercase)
// ============================================================

const RESERVATION_COLUMNS = [
  "CONFIRMATION_NO",
  "RESV_NAME_ID",
  "GUEST_NAME",
  "ARRIVAL",
  "DEPARTURE",
  "ROOM",
  "ROOM_TYPE",
  "RATE_CODE",
  "TOTAL_REVENUE",
  "CURRENCY",
  "RESV_STATUS",
  "BOOKING_SOURCE",
  "ADULTS",
  "CHILDREN",
  "PAYMENT_METHOD",
  "CARD_LAST4",
];

const FOLIO_COLUMNS = [
  "CONFIRMATION_NO",
  "TRX_DATE",
  "TRX_DESCRIPTION",
  "TRX_AMOUNT",
  "TRX_TYPE",
  "CURRENCY",
  "REFERENCE",
];

const ACTIVITY_COLUMNS = [
  "TIMESTAMP",
  "ACTION",
  "DETAILS",
  "PERFORMED_BY",
  "CONFIRMATION_NO",
];

const ALL_KNOWN_COLUMNS = [
  ...new Set([...RESERVATION_COLUMNS, ...FOLIO_COLUMNS, ...ACTIVITY_COLUMNS]),
];

const MIN_MATCH_THRESHOLD = 3;

// ============================================================
// Parser Implementation
// ============================================================

export class OperaCSVParser implements PMSParser {
  readonly pmsType = "opera_csv";

  canParse(headers: string[]): boolean {
    if (!headers || headers.length === 0) return false;

    const normalised = headers.map((h) => normalizeHeader(h));
    const matchCount = ALL_KNOWN_COLUMNS.filter((col) => normalised.includes(col)).length;
    return matchCount >= MIN_MATCH_THRESHOLD;
  }

  parseReservations(headers: string[], rows: string[][]): PMSReservation[] {
    const colMap = buildColumnMap(headers.map(normalizeHeader));
    const results: PMSReservation[] = [];

    for (const row of rows) {
      try {
        const confirmationNumber = getCell(row, colMap, "CONFIRMATION_NO");
        if (!confirmationNumber) continue;

        const arrivalRaw = getCell(row, colMap, "ARRIVAL");
        const departureRaw = getCell(row, colMap, "DEPARTURE");
        const checkIn = parseOperaDate(arrivalRaw || "");
        const checkOut = parseOperaDate(departureRaw || "");
        if (!checkIn || !checkOut) continue;

        const guestName = getCell(row, colMap, "GUEST_NAME") || "Unknown";
        const amountRaw = getCell(row, colMap, "TOTAL_REVENUE");

        let paymentLast4 = getCell(row, colMap, "CARD_LAST4") ||
                           getCell(row, colMap, "PAYMENT_METHOD");
        if (paymentLast4) {
          paymentLast4 = sanitizePAN(paymentLast4);
        }

        const adultsRaw = getCell(row, colMap, "ADULTS");
        const childrenRaw = getCell(row, colMap, "CHILDREN");

        results.push({
          confirmationNumber,
          guestName,
          checkIn,
          checkOut,
          roomNumber: getCell(row, colMap, "ROOM"),
          roomType: getCell(row, colMap, "ROOM_TYPE"),
          ratePlan: getCell(row, colMap, "RATE_CODE"),
          totalAmount: parseAmount(amountRaw),
          currency: getCell(row, colMap, "CURRENCY") || "USD",
          status: mapStatus(getCell(row, colMap, "RESV_STATUS")),
          bookingSource: getCell(row, colMap, "BOOKING_SOURCE"),
          paymentMethodLast4: paymentLast4,
          adults: adultsRaw ? parseInt(adultsRaw, 10) || undefined : undefined,
          children: childrenRaw ? parseInt(childrenRaw, 10) ?? undefined : undefined,
        });
      } catch (err) {
        // Row-level isolation: log and skip
        console.warn(`[OperaCSVParser] Skipping reservation row: ${(err as Error).message}`);
      }
    }

    return results;
  }

  parseFolios(headers: string[], rows: string[][]): PMSFolio[] {
    const colMap = buildColumnMap(headers.map(normalizeHeader));
    const folioMap = new Map<string, PMSFolioLine[]>();
    let currency = "USD";

    for (const row of rows) {
      try {
        const confirmationNumber = getCell(row, colMap, "CONFIRMATION_NO");
        if (!confirmationNumber) continue;

        const dateRaw = getCell(row, colMap, "TRX_DATE");
        const date = parseOperaDate(dateRaw || "") || dateRaw || "";
        const description = getCell(row, colMap, "TRX_DESCRIPTION") || "";
        const amountRaw = getCell(row, colMap, "TRX_AMOUNT");
        const amount = parseAmount(amountRaw);
        const trxType = getCell(row, colMap, "TRX_TYPE");
        const reference = getCell(row, colMap, "REFERENCE");
        const rowCurrency = getCell(row, colMap, "CURRENCY");
        if (rowCurrency) currency = rowCurrency;

        const category = mapTrxType(trxType, description, amount);

        const line: PMSFolioLine = {
          date,
          description,
          amount,
          category,
          reference,
        };

        if (!folioMap.has(confirmationNumber)) {
          folioMap.set(confirmationNumber, []);
        }
        folioMap.get(confirmationNumber)!.push(line);
      } catch (err) {
        console.warn(`[OperaCSVParser] Skipping folio row: ${(err as Error).message}`);
      }
    }

    const folios: PMSFolio[] = [];
    for (const [confirmationNumber, lines] of folioMap) {
      const charges = lines.filter((l) => l.amount > 0).reduce((sum, l) => sum + l.amount, 0);
      const payments = lines.filter((l) => l.amount < 0).reduce((sum, l) => sum + Math.abs(l.amount), 0);

      folios.push({
        confirmationNumber,
        lines,
        totalCharges: charges,
        totalPayments: payments,
        balance: charges - payments,
        currency,
      });
    }

    return folios;
  }

  parseActivityLogs(headers: string[], rows: string[][]): PMSActivityLog[] {
    const colMap = buildColumnMap(headers.map(normalizeHeader));
    const results: PMSActivityLog[] = [];

    for (const row of rows) {
      try {
        const timestampRaw = getCell(row, colMap, "TIMESTAMP");
        if (!timestampRaw) continue;

        // Normalise: keep as-is if it already looks like ISO datetime
        const timestamp = timestampRaw.includes("T") ?
          timestampRaw :
          `${parseOperaDate(timestampRaw) || timestampRaw}T00:00:00`;

        const actionRaw = getCell(row, colMap, "ACTION") || "unknown";
        const action = actionRaw.toLowerCase().replace(/\s+/g, "_");

        results.push({
          timestamp,
          action,
          details: getCell(row, colMap, "DETAILS"),
          performedBy: getCell(row, colMap, "PERFORMED_BY"),
        });
      } catch (err) {
        console.warn(`[OperaCSVParser] Skipping activity row: ${(err as Error).message}`);
      }
    }

    return results;
  }
}
