/**
 * PMS Data Types and Zod Schemas
 *
 * PMS-agnostic interfaces that all PMS integrations (Opera CSV, Mews API, etc.)
 * target. The AI evidence pipeline consumes these types regardless of the
 * underlying PMS system.
 */

import { z } from "zod";

// =============================================================================
// PMS Source
// =============================================================================

export const PMSSourceSchema = z.object({
  type: z.enum(["opera_csv", "opera_xml", "opera_delimited", "mews_api", "manual_entry"]),
  fileName: z.string().optional(),
  apiVersion: z.string().optional(),
});

export type PMSSource = z.infer<typeof PMSSourceSchema>;

// =============================================================================
// Reservation
// =============================================================================

export const PMSReservationStatusSchema = z.enum([
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);

export type PMSReservationStatus = z.infer<typeof PMSReservationStatusSchema>;

export const PMSReservationSchema = z.object({
  confirmationNumber: z.string(),
  guestName: z.string(),
  guestEmail: z.string().optional(),
  guestPhone: z.string().optional(),
  checkIn: z.string(), // ISO date
  checkOut: z.string(), // ISO date
  roomNumber: z.string().optional(),
  roomType: z.string().optional(),
  ratePlan: z.string().optional(),
  totalAmount: z.number(), // In cents
  currency: z.string(),
  status: PMSReservationStatusSchema,
  bookingSource: z.string().optional(),
  paymentMethodLast4: z.string().optional(),
  adults: z.number().optional(),
  children: z.number().optional(),
});

export type PMSReservation = z.infer<typeof PMSReservationSchema>;

// =============================================================================
// Folio
// =============================================================================

export const PMSFolioLineCategorySchema = z.enum([
  "room",
  "tax",
  "food_beverage",
  "other_charge",
  "payment",
  "adjustment",
]);

export type PMSFolioLineCategory = z.infer<typeof PMSFolioLineCategorySchema>;

export const PMSFolioLineSchema = z.object({
  date: z.string(), // ISO date
  description: z.string(),
  amount: z.number(), // In cents, negative for credits/payments
  category: PMSFolioLineCategorySchema,
  reference: z.string().optional(),
});

export type PMSFolioLine = z.infer<typeof PMSFolioLineSchema>;

export const PMSFolioSchema = z.object({
  confirmationNumber: z.string(),
  lines: z.array(PMSFolioLineSchema),
  totalCharges: z.number(), // In cents
  totalPayments: z.number(), // In cents (positive value)
  balance: z.number(), // In cents
  currency: z.string(),
});

export type PMSFolio = z.infer<typeof PMSFolioSchema>;

// =============================================================================
// Activity Log
// =============================================================================

export const PMSActivityLogSchema = z.object({
  timestamp: z.string(), // ISO datetime
  action: z.string(), // 'check_in', 'check_out', 'key_encoded', 'room_move', etc.
  details: z.string().optional(),
  performedBy: z.string().optional(),
  confirmationNumber: z.string().optional(), // Links log to a reservation; PMS-agnostic (any parser can supply it)
});

export type PMSActivityLog = z.infer<typeof PMSActivityLogSchema>;

// =============================================================================
// Import Result
// =============================================================================

export const PMSImportResultSchema = z.object({
  source: PMSSourceSchema,
  importedAt: z.string(), // ISO datetime
  importedBy: z.string(),
  fileHash: z.string(), // SHA-256 of original file
  reservations: z.array(PMSReservationSchema),
  folios: z.array(PMSFolioSchema),
  activityLogs: z.array(PMSActivityLogSchema),
  warnings: z.array(z.string()),
  rowsParsed: z.number(),
  rowsSkipped: z.number(),
});

export type PMSImportResult = z.infer<typeof PMSImportResultSchema>;

// =============================================================================
// Firestore Document Types
// =============================================================================

/**
 * Stored in organizations/{orgId}/pmsImports/{importId}
 */
export interface PMSImportDocument {
  id: string;
  source: PMSSource;
  fileHash: string;
  importedAt: Date;
  importedBy: string;
  reservationCount: number;
  folioCount: number;
  activityLogCount: number;
  warnings: string[];
  rowsParsed: number;
  rowsSkipped: number;
}

/**
 * Stored in organizations/{orgId}/pmsReservations/{confirmationNo}
 */
export interface PMSReservationDocument {
  reservation: PMSReservation;
  folio?: PMSFolio;
  activityLogs: PMSActivityLog[];
  sourceImportId: string;
  importedAt: Date;
  organizationId: string;
}

// =============================================================================
// Organization PMS Integration Config
// =============================================================================

export interface PMSIntegrationConfig {
  type: "opera_csv" | "opera_xml" | "opera_delimited" | "mews_api" | "none";
  lastImportAt?: Date;
  lastImportId?: string;
  reservationCount?: number;
}
