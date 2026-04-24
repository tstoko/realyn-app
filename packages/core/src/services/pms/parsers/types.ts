/**
 * PMS Parser Interface
 *
 * All PMS CSV parsers implement this interface. The import service uses
 * canParse() to auto-detect the parser, then delegates to the type-specific
 * parse methods.
 */

import type {
  PMSReservation,
  PMSFolio,
  PMSActivityLog,
} from "../../../types/pmsData";

export interface PMSParser {
  readonly pmsType: string;

  /**
   * Sniff normalised headers to determine if this parser handles the file.
   * Should return true if at least 3 known columns are recognised.
   */
  canParse(headers: string[]): boolean;

  parseReservations(headers: string[], rows: string[][]): PMSReservation[];
  parseFolios(headers: string[], rows: string[][]): PMSFolio[];
  parseActivityLogs(headers: string[], rows: string[][]): PMSActivityLog[];
}
