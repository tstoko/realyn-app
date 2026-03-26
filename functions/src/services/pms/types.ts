/**
 * PMS Live Client Interface
 *
 * Provider-agnostic interface for live PMS API integrations (e.g. Opera Cloud
 * OHIP, Mews API, Cloudbeds API). File-based imports use PMSParser (see
 * parsers/types.ts); live API queries use PMSLiveClient.
 *
 * Adding a new live PMS integration:
 * 1. Implement PMSLiveClient
 * 2. Add a case to createPMSClient() in pmsLookupService.ts
 * 3. Add config type to types/organization.ts
 */

import type {PMSReservation, PMSFolio, PMSActivityLog} from "../../types/pmsData";

export interface PMSLiveClient {
  /** Identifier for the PMS type (e.g. 'opera_cloud', 'mews', 'cloudbeds') */
  readonly pmsType: string;

  /**
   * Test that the PMS API connection is working.
   * Used by the "Test Connection" button in the integrations UI.
   */
  testConnection(): Promise<{success: boolean; message: string}>;

  /**
   * Fetch a single reservation by confirmation number.
   * Returns null if not found.
   */
  fetchReservation(
    confirmationNumber: string,
    hotelCode?: string,
  ): Promise<PMSReservation | null>;

  /**
   * Fetch a folio by confirmation number.
   * Returns undefined if not found or not supported.
   */
  fetchFolio(
    confirmationNumber: string,
    hotelCode?: string,
  ): Promise<PMSFolio | undefined>;

  /**
   * Fetch activity logs for a reservation.
   * Optional — not all PMS APIs expose activity logs.
   */
  fetchActivityLogs?(
    confirmationNumber: string,
    hotelCode?: string,
  ): Promise<PMSActivityLog[]>;
}
