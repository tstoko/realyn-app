/**
 * Opera Cloud XML Parser
 *
 * Parses OPERA Cloud XML exports into PMSReservation, PMSFolio, and
 * PMSActivityLog types. The parsed XML object is injected via setParsedXML()
 * before the parse methods are called.
 */

import type {PMSParser} from "./types";
import type {
  PMSReservation,
  PMSFolio,
  PMSFolioLine,
  PMSActivityLog,
} from "../../../types/pmsData";
import {parseOperaDate, parseAmount, mapStatus, mapTrxType} from "./operaParserUtils";

/**
 * Ensure a value is always an array. XML parsers collapse single-element
 * arrays into a plain object, so we normalise here.
 */
function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/** Safely read a string-ish value from a parsed XML node. */
function str(val: unknown): string | undefined {
  if (val == null) return undefined;
  const s = String(val).trim();
  return s === "" ? undefined : s;
}

export class OperaXMLParser implements PMSParser {
  readonly pmsType = "opera_xml";

  private xmlData: Record<string, unknown> = {};

  setParsedXML(data: Record<string, unknown>): void {
    this.xmlData = data ?? {};
  }

  canParse(headers: string[]): boolean {
    return Array.isArray(headers) && headers.includes("__XML__");
  }

  // ------------------------------------------------------------------
  // Reservations
  // ------------------------------------------------------------------

  parseReservations(_headers: string[], _rows: string[][]): PMSReservation[] {
    const root = this.xmlData;
    const results: PMSReservation[] = [];

    const reservationNodes = this.findNodes(root, [
      "Reservations.Reservation",
      "ReservationList.Reservation",
      "OXI_Reservations.Reservation",
    ]);

    for (const node of reservationNodes) {
      try {
        const r = node as Record<string, unknown>;

        const confirmationNumber =
          str(r.ConfirmationNumber) ??
          str(r.confirmationNumber) ??
          str(r.ResvNameId) ??
          str(r.resvNameId);
        if (!confirmationNumber) continue;

        const checkIn = parseOperaDate(
            str(r.ArrivalDate) ?? str(r.arrivalDate) ?? str(r.Arrival) ?? str(r.arrival) ?? "",
        );
        const checkOut = parseOperaDate(
            str(r.DepartureDate) ?? str(r.departureDate) ?? str(r.Departure) ?? str(r.departure) ?? "",
        );
        if (!checkIn || !checkOut) continue;

        const guestName =
          str(r.GuestName) ?? str(r.guestName) ?? this.buildGuestName(r) ?? "Unknown";

        const totalAmountRaw =
          str(r.TotalRevenue) ?? str(r.totalRevenue) ?? str(r.TotalAmount) ?? str(r.totalAmount);

        const adultsRaw = str(r.Adults) ?? str(r.adults);
        const childrenRaw = str(r.Children) ?? str(r.children);
        const adultsParsed = adultsRaw ? parseInt(adultsRaw, 10) : undefined;
        const childrenParsed = childrenRaw ? parseInt(childrenRaw, 10) : undefined;

        results.push({
          confirmationNumber,
          guestName,
          checkIn,
          checkOut,
          roomNumber: str(r.RoomNumber) ?? str(r.roomNumber) ?? str(r.Room) ?? str(r.room),
          roomType: str(r.RoomType) ?? str(r.roomType),
          ratePlan: str(r.RateCode) ?? str(r.rateCode) ?? str(r.RatePlan) ?? str(r.ratePlan),
          totalAmount: parseAmount(totalAmountRaw),
          currency: str(r.Currency) ?? str(r.currency) ?? "USD",
          status: mapStatus(str(r.ReservationStatus) ?? str(r.reservationStatus) ?? str(r.Status) ?? str(r.status)),
          bookingSource: str(r.BookingSource) ?? str(r.bookingSource),
          paymentMethodLast4: str(r.CardLast4) ?? str(r.cardLast4) ?? str(r.PaymentMethodLast4),
          adults: adultsParsed !== undefined && !isNaN(adultsParsed) ? adultsParsed : undefined,
          children: childrenParsed !== undefined && !isNaN(childrenParsed) ? childrenParsed : undefined,
        });
      } catch (err) {
        console.warn(`[OperaXMLParser] Skipping reservation: ${(err as Error).message}`);
      }
    }

    return results;
  }

  // ------------------------------------------------------------------
  // Folios
  // ------------------------------------------------------------------

  parseFolios(_headers: string[], _rows: string[][]): PMSFolio[] {
    const root = this.xmlData;
    const folioMap = new Map<string, PMSFolioLine[]>();
    let currency = "USD";

    const txnNodes = this.findNodes(root, [
      "FolioTransactions.Transaction",
      "Folios.Folio",
      "FolioTransactions.FolioTransaction",
    ]);

    for (const node of txnNodes) {
      try {
        const t = node as Record<string, unknown>;

        const confirmationNumber =
          str(t.ConfirmationNumber) ?? str(t.confirmationNumber);
        if (!confirmationNumber) continue;

        const dateRaw = str(t.TransactionDate) ?? str(t.transactionDate) ?? str(t.TrxDate) ?? str(t.trxDate);
        const date = parseOperaDate(dateRaw ?? "") ?? dateRaw ?? "";
        const description = str(t.Description) ?? str(t.description) ?? str(t.TrxDescription) ?? "";
        const amountRaw = str(t.Amount) ?? str(t.amount) ?? str(t.TrxAmount);
        const amount = parseAmount(amountRaw);
        const trxType = str(t.TransactionType) ?? str(t.transactionType) ?? str(t.TrxType);
        const reference = str(t.Reference) ?? str(t.reference);
        const rowCurrency = str(t.Currency) ?? str(t.currency);
        if (rowCurrency) currency = rowCurrency;

        const category = mapTrxType(trxType, description, amount);

        const line: PMSFolioLine = {date, description, amount, category, reference};

        if (!folioMap.has(confirmationNumber)) {
          folioMap.set(confirmationNumber, []);
        }
        folioMap.get(confirmationNumber)!.push(line);
      } catch (err) {
        console.warn(`[OperaXMLParser] Skipping folio txn: ${(err as Error).message}`);
      }
    }

    const folios: PMSFolio[] = [];
    for (const [confirmationNumber, lines] of folioMap) {
      const charges = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
      const payments = lines.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

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

  // ------------------------------------------------------------------
  // Activity Logs
  // ------------------------------------------------------------------

  parseActivityLogs(_headers: string[], _rows: string[][]): PMSActivityLog[] {
    const root = this.xmlData;
    const results: PMSActivityLog[] = [];

    const activityNodes = this.findNodes(root, [
      "ActivityLogs.Activity",
      "Activities.Activity",
      "ActivityLogs.ActivityLog",
    ]);

    for (const node of activityNodes) {
      try {
        const a = node as Record<string, unknown>;

        const timestampRaw = str(a.Timestamp) ?? str(a.timestamp) ?? str(a.ActivityDate) ?? str(a.activityDate);
        if (!timestampRaw) continue;

        const timestamp = timestampRaw.includes("T") ?
          timestampRaw :
          `${parseOperaDate(timestampRaw) ?? timestampRaw}T00:00:00`;

        const actionRaw = str(a.Action) ?? str(a.action) ?? str(a.ActivityType) ?? "unknown";
        const action = actionRaw.toLowerCase().replace(/\s+/g, "_");

        results.push({
          timestamp,
          action,
          details: str(a.Details) ?? str(a.details) ?? str(a.Description),
          performedBy: str(a.PerformedBy) ?? str(a.performedBy) ?? str(a.User) ?? str(a.user),
        });
      } catch (err) {
        console.warn(`[OperaXMLParser] Skipping activity: ${(err as Error).message}`);
      }
    }

    return results;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Walk the parsed XML object to find an array of nodes at a dotted path.
   * Tries multiple candidate paths and returns the first non-empty result.
   * Also tries from inside any single root wrapper element (e.g. <OperaExport>).
   */
  private findNodes(root: Record<string, unknown>, candidatePaths: string[]): unknown[] {
    const roots = this.getRoots(root);

    for (const r of roots) {
      for (const path of candidatePaths) {
        const parts = path.split(".");
        let current: unknown = r;

        for (const part of parts.slice(0, -1)) {
          if (current == null || typeof current !== "object") {
            current = undefined; break;
          }
          current = (current as Record<string, unknown>)[part];
        }

        if (current == null || typeof current !== "object") continue;

        const leafKey = parts[parts.length - 1];
        const leaf = (current as Record<string, unknown>)[leafKey];
        const arr = ensureArray(leaf);
        if (arr.length > 0) return arr;
      }
    }

    return [];
  }

  /**
   * Return candidate root objects: the root itself plus any single top-level
   * wrapper element (skipping XML declaration keys like "?xml").
   */
  private getRoots(root: Record<string, unknown>): Record<string, unknown>[] {
    const roots: Record<string, unknown>[] = [root];

    const keys = Object.keys(root).filter((k) => !k.startsWith("?"));
    if (keys.length === 1) {
      const inner = root[keys[0]];
      if (inner != null && typeof inner === "object" && !Array.isArray(inner)) {
        roots.push(inner as Record<string, unknown>);
      }
    }

    return roots;
  }

  private buildGuestName(r: Record<string, unknown>): string | undefined {
    const first = str(r.FirstName) ?? str(r.firstName) ?? str(r.GivenName);
    const last = str(r.LastName) ?? str(r.lastName) ?? str(r.Surname) ?? str(r.FamilyName);
    if (last && first) return `${last}, ${first}`;
    return last ?? first;
  }
}
