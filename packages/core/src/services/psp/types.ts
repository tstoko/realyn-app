/**
 * PSP Adapter Types
 *
 * Provider-agnostic interfaces for Payment Service Provider integrations.
 * Every PSP (Stripe, Adyen, Worldpay, Checkout.com, etc.) implements these
 * interfaces. The submission handler, evidence pipeline, and dashboard never
 * reference a specific PSP outside of adapter code.
 *
 * Adding a new PSP requires:
 * 1. Implement PSPAdapter
 * 2. Implement PSPEvidenceMapper
 * 3. Add a case to pspFactory.ts
 * 4. Add credential types to organization.ts
 */

import type {EvidenceFile} from "../evidenceService";
import type {PSPProvider} from "../../types/dispute";
import type {DisputeArgument} from "../../types/aiDispute";

// =============================================================================
// Submission Result
// =============================================================================

export interface PSPSubmissionResult {
  success: boolean;
  /** Provider-specific response ID (e.g. Stripe dispute ID, Adyen defense ref) */
  pspResponseId?: string;
  /** Updated status from the provider */
  status?: string;
  /** Human-readable message */
  message?: string;
  /** Raw provider response for debugging */
  rawResponse?: unknown;
}

// =============================================================================
// Evidence Payload
// =============================================================================

export interface PSPEvidencePayload {
  /** Uploaded evidence files from the evidence subcollection */
  files: EvidenceFile[];
  /** AI-generated argument (optional — may not be generated yet) */
  argument?: DisputeArgument;
  /** Key-value text evidence (payment data, PMS data, etc.) */
  textEvidence?: Record<string, unknown>;
}

// =============================================================================
// PSP Adapter (core interface)
// =============================================================================

export interface PSPAdapter {
  /** Which provider this adapter handles */
  readonly provider: PSPProvider;

  /**
   * Test that the PSP credentials work.
   * Used by the "Test Connection" button in the integrations UI.
   */
  testConnection(): Promise<{success: boolean; message: string}>;

  /**
   * Submit a defense (evidence + argument) for a dispute.
   *
   * @param disputeId - Internal Realyn dispute ID
   * @param pspDisputeId - The dispute ID on the PSP side
   * @param evidence - Evidence payload (files, argument, text)
   */
  submitDefense(
    disputeId: string,
    pspDisputeId: string,
    evidence: PSPEvidencePayload,
  ): Promise<PSPSubmissionResult>;

  /**
   * Accept (don't contest) a dispute.
   *
   * @param pspDisputeId - The dispute ID on the PSP side
   */
  acceptDispute(pspDisputeId: string): Promise<PSPSubmissionResult>;
}

// =============================================================================
// PSP Evidence Mapper
// =============================================================================

/**
 * Maps internal evidence to the PSP-specific payload format.
 * Each PSP has different field names, file upload mechanisms, and text limits.
 */
export interface PSPEvidenceMapper {
  readonly provider: PSPProvider;

  /**
   * Transform internal evidence into the PSP's expected format.
   * Returns a PSP-specific payload shape (Stripe.DisputeEvidenceParams, Adyen defense, etc.)
   */
  mapEvidence(
    files: EvidenceFile[],
    argument?: DisputeArgument,
    textEvidence?: Record<string, unknown>,
  ): unknown;
}

// =============================================================================
// PSP Webhook Handler (for future use — currently webhook handlers are
// separate Cloud Functions, but this interface defines the contract)
// =============================================================================

export interface PSPWebhookNormalizedEvent {
  eventType: "dispute.created" | "dispute.updated" | "dispute.closed";
  pspDisputeId: string;
  /** null when the provider can't determine the org (e.g. missing metadata) */
  organizationId: string | null;
  rawEvent: unknown;
}
