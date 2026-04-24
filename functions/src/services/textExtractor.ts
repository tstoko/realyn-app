/**
 * Text Extractor (functions copy)
 *
 * Extracts structured text from PMS data suitable for PSP text fields.
 * The canonical version is in packages/core/src/services/textExtractor.ts.
 */

import type {PMSFolio, PMSReservation, PMSActivityLog} from "../types/pmsData";

export function extractFolioText(
  folio: PMSFolio,
  reservation?: PMSReservation,
): string {
  const lines: string[] = [];
  lines.push(`GUEST FOLIO — Confirmation: ${folio.confirmationNumber}`);

  if (reservation) {
    lines.push(`Guest: ${reservation.guestName}`);
    lines.push(`Stay: ${reservation.checkIn} to ${reservation.checkOut}`);
    if (reservation.roomNumber) lines.push(`Room: ${reservation.roomNumber}`);
  }

  lines.push("");
  lines.push("CHARGES:");

  for (const item of folio.lines) {
    const sign = item.amount < 0 ? "-" : " ";
    const amt = (Math.abs(item.amount) / 100).toFixed(2);
    const cat = item.category.replace(/_/g, " ");
    lines.push(`  ${item.date}  ${sign}${folio.currency} ${amt}  ${item.description} [${cat}]`);
    if (item.reference) {
      lines.push(`    Ref: ${item.reference}`);
    }
  }

  lines.push("");
  lines.push(`Total Charges:  ${folio.currency} ${(folio.totalCharges / 100).toFixed(2)}`);
  lines.push(`Total Payments: ${folio.currency} ${(folio.totalPayments / 100).toFixed(2)}`);
  lines.push(`Balance:        ${folio.currency} ${(folio.balance / 100).toFixed(2)}`);

  return lines.join("\n");
}

export function extractReservationText(reservation: PMSReservation): string {
  const lines: string[] = [];
  lines.push(`RESERVATION CONFIRMATION — ${reservation.confirmationNumber}`);
  lines.push("");
  lines.push(`Guest Name:    ${reservation.guestName}`);
  if (reservation.guestEmail) lines.push(`Email:         ${reservation.guestEmail}`);
  lines.push(`Check-In:      ${reservation.checkIn}`);
  lines.push(`Check-Out:     ${reservation.checkOut}`);
  if (reservation.roomNumber) lines.push(`Room Number:   ${reservation.roomNumber}`);
  if (reservation.roomType) lines.push(`Room Type:     ${reservation.roomType}`);
  if (reservation.ratePlan) lines.push(`Rate Plan:     ${reservation.ratePlan}`);
  lines.push(`Total Amount:  ${reservation.currency} ${(reservation.totalAmount / 100).toFixed(2)}`);
  lines.push(`Status:        ${reservation.status.replace(/_/g, " ")}`);
  if (reservation.bookingSource) lines.push(`Booking Source: ${reservation.bookingSource}`);
  if (reservation.paymentMethodLast4) lines.push(`Card (last 4): ****${reservation.paymentMethodLast4}`);
  if (reservation.adults != null) lines.push(`Adults:        ${reservation.adults}`);
  if (reservation.children != null) lines.push(`Children:      ${reservation.children}`);

  return lines.join("\n");
}

export function extractActivityLogText(
  logs: PMSActivityLog[],
  confirmationNumber?: string,
): string {
  const lines: string[] = [];
  const heading = confirmationNumber
    ? `ACTIVITY LOG — Confirmation: ${confirmationNumber}`
    : "ACTIVITY LOG";
  lines.push(heading);
  lines.push("");

  if (logs.length === 0) {
    lines.push("No activity log entries recorded.");
    return lines.join("\n");
  }

  const sorted = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const log of sorted) {
    const action = log.action.replace(/_/g, " ");
    let entry = `${log.timestamp}  ${action}`;
    if (log.details) entry += ` — ${log.details}`;
    if (log.performedBy) entry += ` [${log.performedBy}]`;
    lines.push(`  ${entry}`);
  }

  lines.push("");
  lines.push(`Total events: ${logs.length}`);

  return lines.join("\n");
}
