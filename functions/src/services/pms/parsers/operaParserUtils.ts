/**
 * Shared Opera Parsing Utilities
 *
 * Date parsing, amount parsing, status mapping, and folio transaction type
 * mapping shared between OperaCSVParser and OperaXMLParser.
 */

import type {
  PMSReservationStatus,
  PMSFolioLineCategory,
} from "../../../types/pmsData";

// ============================================================
// Date Parsing
// ============================================================

const MONTH_MAP: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/**
 * Parse an Opera date string into ISO YYYY-MM-DD.
 * Supports: YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, DD-MMM-YY, DD-MMM-YYYY
 */
export function parseOperaDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;

  const slashEU = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashEU) {
    return `${slashEU[3]}-${slashEU[2].padStart(2, "0")}-${slashEU[1].padStart(2, "0")}`;
  }

  const dotEU = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotEU) {
    return `${dotEU[3]}-${dotEU[2].padStart(2, "0")}-${dotEU[1].padStart(2, "0")}`;
  }

  const oracle = trimmed.match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})$/i);
  if (oracle) {
    const day = oracle[1].padStart(2, "0");
    const month = MONTH_MAP[oracle[2].toUpperCase()];
    if (!month) return null;
    let year = oracle[3];
    if (year.length === 2) {
      const yy = parseInt(year, 10);
      year = yy >= 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  const isodt = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isodt) return isodt[1];

  return null;
}

// ============================================================
// Amount Parsing
// ============================================================

/**
 * Parse a monetary string to integer cents.
 * If the value has a decimal point, treat as major-unit and multiply by 100.
 * Otherwise treat as cents directly.
 */
export function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;

  let cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;

  const isNegative = cleaned.startsWith("-");
  if (isNegative) cleaned = cleaned.slice(1);

  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  let cents: number;
  if (raw.includes(".")) {
    cents = Math.round(num * 100);
  } else {
    cents = Math.round(num);
  }

  return isNegative ? -cents : cents;
}

// ============================================================
// Status Mapping
// ============================================================

const STATUS_MAP: Record<string, PMSReservationStatus> = {
  "CHECKED_OUT": "checked_out",
  "CHECKOUT": "checked_out",
  "CHECKED OUT": "checked_out",
  "CHECKED_IN": "checked_in",
  "CHECKIN": "checked_in",
  "CHECKED IN": "checked_in",
  "IN_HOUSE": "checked_in",
  "CONFIRMED": "confirmed",
  "RESERVED": "confirmed",
  "CANCELLED": "cancelled",
  "CANCELED": "cancelled",
  "NO_SHOW": "no_show",
  "NOSHOW": "no_show",
  "NO SHOW": "no_show",
};

export function mapStatus(raw: string | undefined): PMSReservationStatus {
  if (!raw) return "confirmed";
  return STATUS_MAP[raw.toUpperCase().trim()] || "confirmed";
}

// ============================================================
// Folio Transaction Type Mapping
// ============================================================

export function mapTrxType(trxType: string | undefined, description: string, amount: number): PMSFolioLineCategory {
  const upper = (trxType || "").toUpperCase().trim();

  if (upper === "PAYMENT" || upper === "PAY" || amount < 0) return "payment";
  if (upper === "TAX" || upper.includes("TAX")) return "tax";
  if (upper === "F&B" || upper === "FOOD" || upper === "BEVERAGE" ||
      description.toLowerCase().includes("restaurant") ||
      description.toLowerCase().includes("bar") ||
      description.toLowerCase().includes("dining") ||
      description.toLowerCase().includes("mini bar")) {
    return "food_beverage";
  }
  if (upper === "ADJUSTMENT" || upper === "ADJ") return "adjustment";
  if (upper === "CHARGE" || upper === "ROOM" ||
      description.toLowerCase().includes("room charge")) {
    return "room";
  }

  return "other_charge";
}
