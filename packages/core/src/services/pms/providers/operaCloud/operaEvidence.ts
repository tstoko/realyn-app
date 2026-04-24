import {OperaCloudClient} from "./operaClient";
import {
  OHIPReservationResponse,
  OHIPFolioResponse,
  OHIPGuestProfileResponse,
} from "./types";
import type {PMSReservation, PMSFolio, PMSFolioLineCategory} from "../../../../types/pmsData";

/**
 * Fetch reservation evidence from OPERA Cloud and normalize to PMSReservation.
 *
 * OHIP_VERIFY: endpoint path GET /rsv/v1/hotels/{hotelCode}/reservations/{reservationId}
 */
export async function fetchReservationEvidence(
    client: OperaCloudClient,
    hotelCode: string,
    reservationId: string,
): Promise<PMSReservation> {
  const response = await client.get<OHIPReservationResponse>(
      `/rsv/v1/hotels/${encodeURIComponent(hotelCode)}/reservations/${encodeURIComponent(reservationId)}`,
  );

  const resv = response?.reservations?.[0];
  const guest = resv?.reservationGuests?.[0];
  const room = resv?.roomStay;
  const payment = resv?.paymentMethods?.[0];

  const rawStatus = resv?.reservationStatus?.toLowerCase() ?? "";
  const isNoShow = resv?.noShow === true;
  const isCancelled = !!resv?.cancellation?.cancellationDate;

  return {
    confirmationNumber: reservationId,
    guestName: formatGuestName(guest?.givenName, guest?.surname),
    guestEmail: guest?.email ?? undefined,
    guestPhone: guest?.phone ?? undefined,
    checkIn: room?.arrivalDate ?? "",
    checkOut: room?.departureDate ?? "",
    roomNumber: room?.roomId ?? undefined,
    roomType: room?.roomType ?? undefined,
    ratePlan: room?.ratePlanCode ?? undefined,
    totalAmount: Math.round((room?.totalAmount?.amount ?? 0) * 100),
    currency: room?.totalAmount?.currencyCode ?? "USD",
    status: mapReservationStatus(rawStatus, isNoShow, isCancelled),
    bookingSource: resv?.bookingChannel ?? undefined,
    paymentMethodLast4: payment?.cardNumberLast4 ?? undefined,
    adults: room?.numberOfAdults ?? undefined,
    children: room?.numberOfChildren ?? undefined,
  };
}

/**
 * Fetch folio evidence from OPERA Cloud and normalize to PMSFolio.
 *
 * OHIP_VERIFY: endpoint path GET /fof/v1/hotels/{hotelCode}/reservations/{reservationId}/folios
 */
export async function fetchFolioEvidence(
    client: OperaCloudClient,
    hotelCode: string,
    reservationId: string,
): Promise<PMSFolio> {
  const response = await client.get<OHIPFolioResponse>(
      `/fof/v1/hotels/${encodeURIComponent(hotelCode)}/reservations/${encodeURIComponent(reservationId)}/folios`,
  );

  const folio = response?.folios?.[0];
  const postings =
    folio?.folioWindows?.flatMap((w) => w.postings ?? []) ?? [];

  const lines = postings.map((p) => ({
    date: p.transactionDate ?? p.postingDateTime ?? "",
    description: p.description ?? p.transactionCode ?? "Unknown",
    amount: Math.round((p.amount?.amount ?? 0) * 100),
    category: mapTransactionCategory(p.transactionCode),
    reference: p.reference ?? undefined,
  }));

  const totalCharges = Math.round(
      (folio?.totalCharges?.amount ?? 0) * 100,
  );
  const totalPayments = Math.round(
      (folio?.totalPayments?.amount ?? 0) * 100,
  );
  const balance =
    folio?.folioWindows?.[0]?.balance?.amount != null ?
      Math.round(folio.folioWindows[0].balance.amount * 100) :
      totalCharges - totalPayments;

  return {
    confirmationNumber: reservationId,
    lines,
    totalCharges,
    totalPayments,
    balance,
    currency:
      folio?.totalCharges?.currencyCode ??
      folio?.totalPayments?.currencyCode ??
      "USD",
  };
}

/**
 * Fetch minimal guest profile data for dispute evidence.
 *
 * OHIP_VERIFY: guest profile endpoint — assumed GET /crm/v1/hotels/{hotelCode}/profiles/{guestId}
 */
export async function fetchGuestProfile(
    client: OperaCloudClient,
    hotelCode: string,
    guestId: string,
): Promise<{ name: string; email?: string }> {
  const response = await client.get<OHIPGuestProfileResponse>(
      `/crm/v1/hotels/${encodeURIComponent(hotelCode)}/profiles/${encodeURIComponent(guestId)}`,
  );

  const person =
    response?.profileInfo?.profile?.customer?.personName?.[0];
  const emails = response?.profileInfo?.profile?.emails ?? [];
  const primaryEmail =
    emails.find((e) => e.primary)?.email ?? emails[0]?.email;

  return {
    name: formatGuestName(person?.givenName, person?.surname),
    email: primaryEmail ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatGuestName(givenName?: string, surname?: string): string {
  if (surname && givenName) return `${surname}, ${givenName}`;
  if (surname) return surname;
  if (givenName) return givenName;
  return "Unknown";
}

function mapReservationStatus(
    raw: string,
    noShow: boolean,
    cancelled: boolean,
): "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show" {
  if (noShow) return "no_show";
  if (cancelled) return "cancelled";

  // OHIP_VERIFY: actual status string values returned by OPERA Cloud
  const map: Record<
    string,
    "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show"
  > = {
    reserved: "confirmed",
    confirmed: "confirmed",
    duein: "confirmed",
    inhouse: "checked_in",
    checkedin: "checked_in",
    checkedout: "checked_out",
    dueout: "checked_in",
    cancelled: "cancelled",
    noshow: "no_show",
  };

  return map[raw.replace(/[\s_-]/g, "").toLowerCase()] ?? "confirmed";
}

/** OHIP_VERIFY: transaction code categorization — actual codes TBD */
function mapTransactionCategory(code?: string): PMSFolioLineCategory {
  if (!code) return "other_charge";
  const upper = code.toUpperCase();
  if (upper.includes("ROOM") || upper.includes("LODG")) return "room";
  if (upper.includes("TAX")) return "tax";
  if (upper.includes("FB") || upper.includes("FOOD") || upper.includes("BEV")) {
    return "food_beverage";
  }
  if (
    upper.includes("PAY") ||
    upper.includes("CREDIT") ||
    upper.includes("CC")
  ) {
    return "payment";
  }
  if (upper.includes("ADJ") || upper.includes("REBATE")) return "adjustment";
  return "other_charge";
}
