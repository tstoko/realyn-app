/**
 * Realyn Standard CSV Parser
 *
 * Parses the "Realyn Standard CSV" format — a simple, well-documented CSV
 * schema that any hotel with any PMS can map their export to. This is the
 * universal fallback integration that makes Realyn PMS-agnostic.
 *
 * Key differences from Opera format:
 *   - Column names: CHECK_IN (not ARRIVAL), CHECK_OUT (not DEPARTURE),
 *     ROOM_NUMBER (not ROOM), RATE_PLAN (not RATE_CODE),
 *     TOTAL_AMOUNT (not TOTAL_REVENUE), STATUS (not RESV_STATUS),
 *     TRX_CATEGORY (not TRX_TYPE)
 *   - Amounts are ALWAYS in major currency units (e.g. 450.00 = $450),
 *     never in cents.
 *   - Dates are always ISO YYYY-MM-DD.
 *   - Status values map directly to the PMSReservationStatus enum.
 */

import type {PMSParser} from "./types";
import type {
  PMSReservation,
  PMSReservationStatus,
  PMSFolio,
  PMSFolioLine,
  PMSFolioLineCategory,
  PMSActivityLog,
} from "../../../types/pmsData";
import {buildColumnMap, getCell, normalizeHeader} from "./csvUtils";
import {sanitizePAN} from "../sanitizer";

// ============================================================
// Realyn Standard column names (normalised to uppercase)
// ============================================================

/** Columns that are unique to the Realyn Standard format (not shared with Opera). */
const REALYN_DISTINGUISHING_COLUMNS = [
  "CHECK_IN",
  "CHECK_OUT",
  "ROOM_NUMBER",
  "RATE_PLAN",
  "TOTAL_AMOUNT",
  "STATUS",
  "TRX_CATEGORY",
];

const MIN_MATCH_THRESHOLD = 3;

// ============================================================
// Valid status values
// ============================================================

const VALID_STATUSES: Set<string> = new Set([
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);

// ============================================================
// Valid folio categories
// ============================================================

const VALID_CATEGORIES: Set<string> = new Set([
  "room",
  "tax",
  "food_beverage",
  "payment",
  "adjustment",
  "other_charge",
]);

// ============================================================
// Amount Parsing
// ============================================================

/**
 * Parse a monetary string that is ALWAYS in major currency units.
 * "450" = 45000 cents, "450.00" = 45000 cents, "4.50" = 450 cents.
 *
 * Strips commas (thousand separators) and currency symbols before parsing.
 */
export function parseStandardAmount(raw: string | undefined): number {
  if (!raw) return 0;

  let cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;

  const isNegative = cleaned.startsWith("-");
  if (isNegative) cleaned = cleaned.slice(1);

  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  const cents = Math.round(num * 100);
  return isNegative ? -cents : cents;
}

// ============================================================
// Parser Implementation
// ============================================================

export class RealynStandardParser implements PMSParser {
  readonly pmsType = "realyn_standard";

  /**
   * Match if CONFIRMATION_NO is present AND at least 3 Realyn-specific
   * distinguishing columns are found (columns that differ from Opera).
   */
  canParse(headers: string[]): boolean {
    if (!headers || headers.length === 0) return false;

    const normalised = headers.map((h) => normalizeHeader(h));

    if (!normalised.includes("CONFIRMATION_NO")) return false;

    const distinguishingCount = REALYN_DISTINGUISHING_COLUMNS.filter(
      (col) => normalised.includes(col),
    ).length;

    return distinguishingCount >= MIN_MATCH_THRESHOLD;
  }

  parseReservations(headers: string[], rows: string[][]): PMSReservation[] {
    const colMap = buildColumnMap(headers.map(normalizeHeader));
    const results: PMSReservation[] = [];

    for (const row of rows) {
      try {
        const confirmationNumber = getCell(row, colMap, "CONFIRMATION_NO");
        if (!confirmationNumber) continue;

        const checkIn = getCell(row, colMap, "CHECK_IN");
        const checkOut = getCell(row, colMap, "CHECK_OUT");
        if (!checkIn || !checkOut) continue;

        const guestName = getCell(row, colMap, "GUEST_NAME") || "Unknown";
        const amountRaw = getCell(row, colMap, "TOTAL_AMOUNT");

        let paymentLast4 = getCell(row, colMap, "CARD_LAST4");
        if (paymentLast4) {
          paymentLast4 = sanitizePAN(paymentLast4);
        }

        const adultsRaw = getCell(row, colMap, "ADULTS");
        const childrenRaw = getCell(row, colMap, "CHILDREN");
        const adultsParsed = adultsRaw ? parseInt(adultsRaw, 10) : undefined;
        const childrenParsed = childrenRaw ? parseInt(childrenRaw, 10) : undefined;

        const statusRaw = getCell(row, colMap, "STATUS");
        const status: PMSReservationStatus = (statusRaw && VALID_STATUSES.has(statusRaw.toLowerCase()))
          ? statusRaw.toLowerCase() as PMSReservationStatus
          : "confirmed";

        results.push({
          confirmationNumber,
          guestName,
          checkIn,
          checkOut,
          roomNumber: getCell(row, colMap, "ROOM_NUMBER"),
          roomType: getCell(row, colMap, "ROOM_TYPE"),
          ratePlan: getCell(row, colMap, "RATE_PLAN"),
          totalAmount: parseStandardAmount(amountRaw),
          currency: getCell(row, colMap, "CURRENCY") || "USD",
          status,
          bookingSource: getCell(row, colMap, "BOOKING_SOURCE"),
          paymentMethodLast4: paymentLast4,
          adults: adultsParsed !== undefined && !isNaN(adultsParsed) ? adultsParsed : undefined,
          children: childrenParsed !== undefined && !isNaN(childrenParsed) ? childrenParsed : undefined,
        });
      } catch (err) {
        console.warn(`[RealynStandardParser] Skipping reservation row: ${(err as Error).message}`);
      }
    }

    return results;
  }

  parseFolios(headers: string[], rows: string[][]): PMSFolio[] {
    const colMap = buildColumnMap(headers.map(normalizeHeader));
    const folioMap = new Map<string, PMSFolioLine[]>();
    const currencyMap = new Map<string, string>();

    for (const row of rows) {
      try {
        const confirmationNumber = getCell(row, colMap, "CONFIRMATION_NO");
        if (!confirmationNumber) continue;

        const date = getCell(row, colMap, "TRX_DATE") || "";
        const description = getCell(row, colMap, "TRX_DESCRIPTION") || "";
        const amountRaw = getCell(row, colMap, "TRX_AMOUNT");
        if (!amountRaw && !description) continue; // Skip empty folio rows

        const amount = parseStandardAmount(amountRaw);
        const reference = getCell(row, colMap, "REFERENCE");
        const rowCurrency = getCell(row, colMap, "CURRENCY");
        if (rowCurrency) {
          currencyMap.set(confirmationNumber, rowCurrency);
        }

        const categoryRaw = getCell(row, colMap, "TRX_CATEGORY");
        const category: PMSFolioLineCategory =
          (categoryRaw && VALID_CATEGORIES.has(categoryRaw.toLowerCase()))
            ? categoryRaw.toLowerCase() as PMSFolioLineCategory
            : (amount < 0 ? "payment" : "other_charge");

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
        console.warn(`[RealynStandardParser] Skipping folio row: ${(err as Error).message}`);
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
        currency: currencyMap.get(confirmationNumber) || "USD",
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

        // Keep ISO timestamps as-is
        const timestamp = timestampRaw;

        const action = getCell(row, colMap, "ACTION") || "unknown";

        results.push({
          timestamp,
          action,
          details: getCell(row, colMap, "DETAILS"),
          performedBy: getCell(row, colMap, "PERFORMED_BY"),
          confirmationNumber: getCell(row, colMap, "CONFIRMATION_NO"),
        });
      } catch (err) {
        console.warn(`[RealynStandardParser] Skipping activity row: ${(err as Error).message}`);
      }
    }

    return results;
  }
}
