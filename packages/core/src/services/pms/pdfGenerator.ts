/**
 * PMS Evidence PDF Generator
 *
 * Generates formatted PDF documents from parsed PMS data for use as
 * chargeback evidence. Each PDF includes a provenance footer linking
 * back to the source import.
 */

// @ts-ignore - CJS/ESM interop
import PDFDocument = require("pdfkit");
import type {
  PMSReservation,
  PMSFolio,
  PMSActivityLog,
} from "../../types/pmsData";

const PAGE_MARGIN = 50;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_HEADING = 12;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_FOOTER = 8;
const GREY = "#666666";
const BLACK = "#000000";
const LIGHT_GREY = "#EEEEEE";

interface ProvenanceInfo {
  hotelName: string;
  importDate: string;
  sourceHashPrefix: string;
  source?: string;
}

/**
 * Collect a PDFDocument stream into a Buffer.
 */
function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/**
 * Add provenance footer to every page.
 */
function addProvenanceFooter(doc: PDFKit.PDFDocument, provenance: ProvenanceInfo): void {
  const sourcePart = provenance.source ?
    ` | Source: ${provenance.source}` :
    "";
  const footerText =
    `Generated from ${provenance.hotelName} PMS data | ` +
    `Date: ${provenance.importDate} | ` +
    `Ref: ${provenance.sourceHashPrefix}${sourcePart}`;

  doc.on("pageAdded", () => {
    drawFooter(doc, footerText);
  });

  drawFooter(doc, footerText);
}

function drawFooter(doc: PDFKit.PDFDocument, text: string): void {
  const y = doc.page.height - PAGE_MARGIN + 10;
  doc
      .save()
      .fontSize(FONT_SIZE_FOOTER)
      .fillColor(GREY)
      .text(text, PAGE_MARGIN, y, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: "center",
      })
      .restore();
}

/**
 * Generate a formatted folio PDF with line items, totals, and provenance.
 */
export async function generateFolioPDF(
    folio: PMSFolio,
    provenance: ProvenanceInfo,
): Promise<Buffer> {
  const doc = new PDFDocument({margin: PAGE_MARGIN, size: "A4"});

  addProvenanceFooter(doc, provenance);

  // Title
  doc
      .fontSize(FONT_SIZE_TITLE)
      .fillColor(BLACK)
      .text("Guest Folio / Invoice", {align: "center"})
      .moveDown(0.5);

  // Hotel and reservation info
  doc
      .fontSize(FONT_SIZE_HEADING)
      .text(provenance.hotelName, {align: "center"})
      .moveDown(0.3);

  doc
      .fontSize(FONT_SIZE_BODY)
      .fillColor(GREY)
      .text(`Confirmation: ${folio.confirmationNumber}`, {align: "center"})
      .text(`Currency: ${folio.currency}`, {align: "center"})
      .moveDown(1);

  // Table header
  doc.fillColor(BLACK).fontSize(FONT_SIZE_BODY);
  const tableTop = doc.y;
  const colDate = PAGE_MARGIN;
  const colDesc = PAGE_MARGIN + 80;
  const colCategory = PAGE_MARGIN + 280;
  const colAmount = PAGE_MARGIN + 380;

  doc
      .rect(colDate - 5, tableTop - 3, doc.page.width - PAGE_MARGIN * 2 + 10, 18)
      .fill(LIGHT_GREY);

  doc
      .fillColor(BLACK)
      .font("Helvetica-Bold")
      .text("Date", colDate, tableTop, {width: 75})
      .text("Description", colDesc, tableTop, {width: 195})
      .text("Category", colCategory, tableTop, {width: 95})
      .text("Amount", colAmount, tableTop, {width: 100, align: "right"});

  doc.font("Helvetica").moveDown(0.5);

  // Table rows
  for (const line of folio.lines) {
    const y = doc.y;
    if (y > doc.page.height - PAGE_MARGIN - 60) {
      doc.addPage();
    }

    doc
        .fontSize(FONT_SIZE_BODY)
        .fillColor(BLACK)
        .text(line.date, colDate, doc.y, {width: 75})
        .text(line.description, colDesc, doc.y - doc.currentLineHeight(), {width: 195})
        .text(formatCategory(line.category), colCategory, doc.y - doc.currentLineHeight(), {width: 95})
        .text(formatAmount(line.amount, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
          width: 100,
          align: "right",
        })
        .moveDown(0.3);
  }

  // Totals
  doc.moveDown(0.5);
  const totalsX = colCategory;
  doc
      .font("Helvetica-Bold")
      .text("Total Charges:", totalsX, doc.y, {width: 95})
      .text(formatAmount(folio.totalCharges, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
        width: 100,
        align: "right",
      })
      .moveDown(0.3);

  doc
      .text("Total Payments:", totalsX, doc.y, {width: 95})
      .text(formatAmount(folio.totalPayments, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
        width: 100,
        align: "right",
      })
      .moveDown(0.3);

  doc
      .text("Balance:", totalsX, doc.y, {width: 95})
      .text(formatAmount(folio.balance, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
        width: 100,
        align: "right",
      });

  return pdfToBuffer(doc);
}

/**
 * Generate a check-in/check-out record PDF from reservation data.
 */
export async function generateCheckInOutPDF(
    reservation: PMSReservation,
    provenance: ProvenanceInfo,
): Promise<Buffer> {
  const doc = new PDFDocument({margin: PAGE_MARGIN, size: "A4"});

  addProvenanceFooter(doc, provenance);

  doc
      .fontSize(FONT_SIZE_TITLE)
      .fillColor(BLACK)
      .text("Reservation Confirmation", {align: "center"})
      .moveDown(0.5);

  doc
      .fontSize(FONT_SIZE_HEADING)
      .text(provenance.hotelName, {align: "center"})
      .moveDown(1);

  const fields: [string, string | undefined][] = [
    ["Confirmation Number", reservation.confirmationNumber],
    ["Guest Name", reservation.guestName],
    ["Check-In Date", reservation.checkIn],
    ["Check-Out Date", reservation.checkOut],
    ["Room Number", reservation.roomNumber],
    ["Room Type", reservation.roomType],
    ["Rate Plan", reservation.ratePlan],
    ["Total Amount", formatAmount(reservation.totalAmount, reservation.currency)],
    ["Reservation Status", reservation.status.replace(/_/g, " ").toUpperCase()],
    ["Booking Source", reservation.bookingSource],
    ["Payment (last 4)", reservation.paymentMethodLast4 ? `****${reservation.paymentMethodLast4}` : undefined],
    ["Adults", reservation.adults?.toString()],
    ["Children", reservation.children?.toString()],
  ];

  doc.fontSize(FONT_SIZE_BODY);
  for (const [label, value] of fields) {
    if (value === undefined) continue;
    doc
        .font("Helvetica-Bold")
        .fillColor(GREY)
        .text(`${label}:`, PAGE_MARGIN, doc.y, {continued: true, width: 200})
        .font("Helvetica")
        .fillColor(BLACK)
        .text(`  ${value}`)
        .moveDown(0.2);
  }

  return pdfToBuffer(doc);
}

/**
 * Generate an activity log PDF from PMS activity data.
 */
export async function generateActivityLogPDF(
    logs: PMSActivityLog[],
    confirmationNumber: string,
    provenance: ProvenanceInfo,
): Promise<Buffer> {
  const doc = new PDFDocument({margin: PAGE_MARGIN, size: "A4"});

  addProvenanceFooter(doc, provenance);

  doc
      .fontSize(FONT_SIZE_TITLE)
      .fillColor(BLACK)
      .text("Guest Activity Log", {align: "center"})
      .moveDown(0.5);

  doc
      .fontSize(FONT_SIZE_HEADING)
      .text(provenance.hotelName, {align: "center"})
      .moveDown(0.3);

  doc
      .fontSize(FONT_SIZE_BODY)
      .fillColor(GREY)
      .text(`Confirmation: ${confirmationNumber}`, {align: "center"})
      .moveDown(1);

  // Table header
  doc.fillColor(BLACK).fontSize(FONT_SIZE_BODY);
  const tableTop = doc.y;
  const colTime = PAGE_MARGIN;
  const colAction = PAGE_MARGIN + 130;
  const colDetails = PAGE_MARGIN + 220;
  const colBy = PAGE_MARGIN + 380;

  doc
      .rect(colTime - 5, tableTop - 3, doc.page.width - PAGE_MARGIN * 2 + 10, 18)
      .fill(LIGHT_GREY);

  doc
      .fillColor(BLACK)
      .font("Helvetica-Bold")
      .text("Timestamp", colTime, tableTop, {width: 125})
      .text("Action", colAction, tableTop, {width: 85})
      .text("Details", colDetails, tableTop, {width: 155})
      .text("By", colBy, tableTop, {width: 100});

  doc.font("Helvetica").moveDown(0.5);

  // Rows
  for (const log of logs) {
    const y = doc.y;
    if (y > doc.page.height - PAGE_MARGIN - 60) {
      doc.addPage();
    }

    doc
        .fontSize(FONT_SIZE_BODY)
        .fillColor(BLACK)
        .text(log.timestamp, colTime, doc.y, {width: 125})
        .text(log.action.replace(/_/g, " "), colAction, doc.y - doc.currentLineHeight(), {width: 85})
        .text(log.details || "", colDetails, doc.y - doc.currentLineHeight(), {width: 155})
        .text(log.performedBy || "", colBy, doc.y - doc.currentLineHeight(), {width: 100})
        .moveDown(0.3);
  }

  return pdfToBuffer(doc);
}

/**
 * Generate a combined multi-page evidence packet containing reservation,
 * folio, and activity log data in a single PDF.
 */
export async function generateEvidencePacketPDF(
    reservation: PMSReservation,
    folio: PMSFolio | undefined,
    activityLogs: PMSActivityLog[],
    provenance: ProvenanceInfo,
): Promise<Buffer> {
  const doc = new PDFDocument({margin: PAGE_MARGIN, size: "A4"});

  addProvenanceFooter(doc, provenance);

  // --- Page 1: Reservation Summary ---
  doc
      .fontSize(FONT_SIZE_TITLE)
      .fillColor(BLACK)
      .text("Evidence Packet — Reservation Summary", {align: "center"})
      .moveDown(0.5);

  doc
      .fontSize(FONT_SIZE_HEADING)
      .text(provenance.hotelName, {align: "center"})
      .moveDown(1);

  const fields: [string, string | undefined][] = [
    ["Confirmation Number", reservation.confirmationNumber],
    ["Guest Name", reservation.guestName],
    ["Check-In Date", reservation.checkIn],
    ["Check-Out Date", reservation.checkOut],
    ["Room Number", reservation.roomNumber],
    ["Room Type", reservation.roomType],
    ["Rate Plan", reservation.ratePlan],
    ["Total Amount", formatAmount(reservation.totalAmount, reservation.currency)],
    ["Reservation Status", reservation.status.replace(/_/g, " ").toUpperCase()],
    ["Booking Source", reservation.bookingSource],
    ["Payment (last 4)", reservation.paymentMethodLast4 ? `****${reservation.paymentMethodLast4}` : undefined],
    ["Adults", reservation.adults?.toString()],
    ["Children", reservation.children?.toString()],
  ];

  doc.fontSize(FONT_SIZE_BODY);
  for (const [label, value] of fields) {
    if (value === undefined) continue;
    doc
        .font("Helvetica-Bold")
        .fillColor(GREY)
        .text(`${label}:`, PAGE_MARGIN, doc.y, {continued: true, width: 200})
        .font("Helvetica")
        .fillColor(BLACK)
        .text(`  ${value}`)
        .moveDown(0.2);
  }

  // --- Page 2+: Folio Line Items ---
  if (folio && folio.lines.length > 0) {
    doc.addPage();

    doc
        .fontSize(FONT_SIZE_TITLE)
        .fillColor(BLACK)
        .text("Evidence Packet — Guest Folio", {align: "center"})
        .moveDown(0.5);

    doc
        .fontSize(FONT_SIZE_BODY)
        .fillColor(GREY)
        .text(`Confirmation: ${folio.confirmationNumber} | Currency: ${folio.currency}`, {align: "center"})
        .moveDown(1);

    doc.fillColor(BLACK).fontSize(FONT_SIZE_BODY);
    const tableTop = doc.y;
    const colDate = PAGE_MARGIN;
    const colDesc = PAGE_MARGIN + 80;
    const colCategory = PAGE_MARGIN + 280;
    const colAmount = PAGE_MARGIN + 380;

    doc
        .rect(colDate - 5, tableTop - 3, doc.page.width - PAGE_MARGIN * 2 + 10, 18)
        .fill(LIGHT_GREY);

    doc
        .fillColor(BLACK)
        .font("Helvetica-Bold")
        .text("Date", colDate, tableTop, {width: 75})
        .text("Description", colDesc, tableTop, {width: 195})
        .text("Category", colCategory, tableTop, {width: 95})
        .text("Amount", colAmount, tableTop, {width: 100, align: "right"});

    doc.font("Helvetica").moveDown(0.5);

    for (const line of folio.lines) {
      if (doc.y > doc.page.height - PAGE_MARGIN - 60) {
        doc.addPage();
      }
      doc
          .fontSize(FONT_SIZE_BODY)
          .fillColor(BLACK)
          .text(line.date, colDate, doc.y, {width: 75})
          .text(line.description, colDesc, doc.y - doc.currentLineHeight(), {width: 195})
          .text(formatCategory(line.category), colCategory, doc.y - doc.currentLineHeight(), {width: 95})
          .text(formatAmount(line.amount, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
            width: 100,
            align: "right",
          })
          .moveDown(0.3);
    }

    doc.moveDown(0.5);
    const totalsX = colCategory;
    doc
        .font("Helvetica-Bold")
        .text("Total Charges:", totalsX, doc.y, {width: 95})
        .text(formatAmount(folio.totalCharges, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
          width: 100,
          align: "right",
        })
        .moveDown(0.3)
        .text("Total Payments:", totalsX, doc.y, {width: 95})
        .text(formatAmount(folio.totalPayments, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
          width: 100,
          align: "right",
        })
        .moveDown(0.3)
        .text("Balance:", totalsX, doc.y, {width: 95})
        .text(formatAmount(folio.balance, folio.currency), colAmount, doc.y - doc.currentLineHeight(), {
          width: 100,
          align: "right",
        });
  }

  // --- Next page: Activity Log ---
  if (activityLogs.length > 0) {
    doc.addPage();

    doc
        .fontSize(FONT_SIZE_TITLE)
        .fillColor(BLACK)
        .text("Evidence Packet — Activity Log", {align: "center"})
        .moveDown(0.5);

    doc
        .fontSize(FONT_SIZE_BODY)
        .fillColor(GREY)
        .text(`Confirmation: ${reservation.confirmationNumber}`, {align: "center"})
        .moveDown(1);

    doc.fillColor(BLACK).fontSize(FONT_SIZE_BODY);
    const logTop = doc.y;
    const colTime = PAGE_MARGIN;
    const colAction = PAGE_MARGIN + 130;
    const colDetails = PAGE_MARGIN + 220;
    const colBy = PAGE_MARGIN + 380;

    doc
        .rect(colTime - 5, logTop - 3, doc.page.width - PAGE_MARGIN * 2 + 10, 18)
        .fill(LIGHT_GREY);

    doc
        .fillColor(BLACK)
        .font("Helvetica-Bold")
        .text("Timestamp", colTime, logTop, {width: 125})
        .text("Action", colAction, logTop, {width: 85})
        .text("Details", colDetails, logTop, {width: 155})
        .text("By", colBy, logTop, {width: 100});

    doc.font("Helvetica").moveDown(0.5);

    for (const log of activityLogs) {
      if (doc.y > doc.page.height - PAGE_MARGIN - 60) {
        doc.addPage();
      }
      doc
          .fontSize(FONT_SIZE_BODY)
          .fillColor(BLACK)
          .text(log.timestamp, colTime, doc.y, {width: 125})
          .text(log.action.replace(/_/g, " "), colAction, doc.y - doc.currentLineHeight(), {width: 85})
          .text(log.details || "", colDetails, doc.y - doc.currentLineHeight(), {width: 155})
          .text(log.performedBy || "", colBy, doc.y - doc.currentLineHeight(), {width: 100})
          .moveDown(0.3);
    }
  }

  return pdfToBuffer(doc);
}

// ============================================================
// Formatters
// ============================================================

function formatAmount(cents: number, currency: string): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${sign}${symbol}${major.toLocaleString()}.${minor}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
};

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
