/**
 * OPERA Cloud (OHIP) Integration Types
 *
 * All OHIP response types follow the tolerant-reader pattern:
 * every field is optional, access via ?. and ??, never crash on missing data.
 *
 * Fields marked OHIP_VERIFY need validation against real OHIP documentation.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OperaCloudAuthMode = "ocim" | "ssd";

/**
 * Connection config stored per-org in Firestore.
 * Encrypted fields: oauthClientSecret, appKey, integrationPassword
 */
export interface OperaCloudConfig {
  gatewayUrl: string;
  authMode: OperaCloudAuthMode;
  oauthClientId: string;
  oauthClientSecret: string;
  appKey: string;
  enterpriseId?: string;
  hotelCodes: string[];
  integrationUsername?: string;
  integrationPassword?: string;
  status: "connected" | "not_connected" | "error";
  lastTestedAt?: Date;
  lastError?: string;
}

export const OPERA_CLOUD_ENCRYPTED_FIELDS: (keyof OperaCloudConfig)[] = [
  "oauthClientSecret",
  "appKey",
  "integrationPassword",
];

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class OperaAuthError extends Error {
  constructor(
      message: string,
    public readonly statusCode?: number,
    public readonly ohipErrorCode?: string,
  ) {
    super(message);
    this.name = "OperaAuthError";
  }
}

export class OperaApiError extends Error {
  constructor(
      message: string,
    public readonly statusCode: number,
    public readonly ohipErrorCode?: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "OperaApiError";
  }
}

// ---------------------------------------------------------------------------
// OHIP Tolerant-Reader Response Types
// ---------------------------------------------------------------------------

// OHIP_VERIFY: OAuth token response shape — assumed fields
export interface OHIPTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

// OHIP_VERIFY: reservation response envelope and all nested field names
export interface OHIPReservationResponse {
  reservations?: {
    reservationIdList?: Array<{ id?: string; type?: string }>;
    reservationGuests?: Array<{
      profileId?: { id?: string };
      givenName?: string;
      surname?: string;
      email?: string;
      phone?: string;
    }>;
    roomStay?: {
      roomId?: string;
      roomType?: string;
      ratePlanCode?: string;
      arrivalDate?: string;
      departureDate?: string;
      numberOfAdults?: number;
      numberOfChildren?: number;
      totalAmount?: { amount?: number; currencyCode?: string };
    };
    reservationStatus?: string;
    cancellation?: {
      cancellationDate?: string;
      cancellationReason?: string;
    };
    noShow?: boolean;
    bookingChannel?: string;
    paymentMethods?: Array<{
      paymentType?: string;
      cardNumberLast4?: string;
    }>;
  }[];
}

// OHIP_VERIFY: folio response envelope and all nested field names
export interface OHIPFolioResponse {
  folios?: {
    folioId?: string;
    folioWindows?: Array<{
      postings?: Array<{
        transactionDate?: string;
        transactionCode?: string;
        description?: string;
        amount?: { amount?: number; currencyCode?: string };
        postingDateTime?: string;
        reference?: string;
      }>;
      balance?: { amount?: number; currencyCode?: string };
    }>;
    totalCharges?: { amount?: number; currencyCode?: string };
    totalPayments?: { amount?: number; currencyCode?: string };
  }[];
}

// OHIP_VERIFY: guest profile response envelope and all nested field names
export interface OHIPGuestProfileResponse {
  profileInfo?: {
    profile?: {
      customer?: {
        personName?: Array<{
          givenName?: string;
          surname?: string;
        }>;
      };
      emails?: Array<{
        email?: string;
        primary?: boolean;
      }>;
    };
  };
}

// OHIP_VERIFY: hotel details response — used for connection test
export interface OHIPHotelDetailsResponse {
  hotelId?: string;
  hotelName?: string;
  hotelStatus?: string;
}
