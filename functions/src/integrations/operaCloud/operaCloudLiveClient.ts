/**
 * Opera Cloud Live Client
 *
 * Implements PMSLiveClient for the OPERA Cloud (OHIP) API.
 * Wraps the existing OperaCloudClient and operaEvidence functions
 * behind the common PMS live client interface.
 */

import type {PMSLiveClient} from "../../services/pms/types";
import type {PMSReservation, PMSFolio, PMSActivityLog} from "../../types/pmsData";
import {OperaCloudClient} from "./operaClient";
import {fetchReservationEvidence, fetchFolioEvidence} from "./operaEvidence";
import type {OperaCloudConfig} from "./types";

export class OperaCloudLiveClient implements PMSLiveClient {
  readonly pmsType = "opera_cloud";
  private client: OperaCloudClient;
  private config: OperaCloudConfig;

  constructor(config: OperaCloudConfig) {
    this.config = config;
    this.client = new OperaCloudClient(config);
  }

  async testConnection(): Promise<{success: boolean; message: string}> {
    try {
      // Try to authenticate — if this succeeds, the connection is working
      await this.client.authenticate();
      return {
        success: true,
        message: `OPERA Cloud connection successful (${this.config.hotelCodes.length} hotel(s))`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `OPERA Cloud connection failed: ${error.message}`,
      };
    }
  }

  async fetchReservation(
      confirmationNumber: string,
      hotelCode?: string,
  ): Promise<PMSReservation | null> {
    const code = hotelCode || this.config.hotelCodes?.[0];
    if (!code) {
      console.warn("[OperaCloudLiveClient] No hotel code available");
      return null;
    }

    try {
      return await fetchReservationEvidence(this.client, code, confirmationNumber);
    } catch (error: any) {
      console.error(
          `[OperaCloudLiveClient] Failed to fetch reservation ${confirmationNumber}:`,
          error.message,
      );
      return null;
    }
  }

  async fetchFolio(
      confirmationNumber: string,
      hotelCode?: string,
  ): Promise<PMSFolio | undefined> {
    const code = hotelCode || this.config.hotelCodes?.[0];
    if (!code) {
      return undefined;
    }

    try {
      return await fetchFolioEvidence(this.client, code, confirmationNumber);
    } catch (error: any) {
      console.error(
          `[OperaCloudLiveClient] Failed to fetch folio ${confirmationNumber}:`,
          error.message,
      );
      return undefined;
    }
  }

  // OPERA Cloud OHIP does not expose activity logs via API
  // Activity logs come from CSV/file imports only
}
