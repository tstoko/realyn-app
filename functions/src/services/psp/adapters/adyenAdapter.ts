/**
 * Adyen PSP Adapter
 *
 * Implements the PSPAdapter interface for Adyen. Wraps the existing
 * AdyenClient and evidence mapper into the common adapter pattern.
 */

import type {PSPAdapter, PSPEvidencePayload, PSPSubmissionResult} from "../types";
import type {PSPProvider} from "../../../types/dispute";
import {AdyenClient, type AdyenClientConfig} from "../adyenClient";
import {mapEvidenceFilesToAdyen, buildAdyenDefenseComment} from "../../../utils/adyenEvidenceMapper";

export class AdyenAdapter implements PSPAdapter {
  readonly provider: PSPProvider = "adyen";
  private client: AdyenClient;
  private merchantAccount: string;

  constructor(config: AdyenClientConfig) {
    this.client = new AdyenClient(config);
    this.merchantAccount = Array.isArray(config.merchantAccount)
      ? config.merchantAccount[0]
      : config.merchantAccount;
  }

  async testConnection(): Promise<{success: boolean; message: string}> {
    return this.client.testConnection();
  }

  async submitDefense(
      disputeId: string,
      pspDisputeId: string,
      evidence: PSPEvidencePayload,
  ): Promise<PSPSubmissionResult> {
    const defenseReference = `defense_${disputeId}_${Date.now()}`;

    // Use existing mapper to build Adyen-specific evidence format
    const mappedEvidence = mapEvidenceFilesToAdyen(
        evidence.files,
        this.merchantAccount,
        "", // originalReference — not needed for defense submission
        defenseReference,
    );

    // Build defense comment from text evidence
    const defenseComment = buildAdyenDefenseComment(
      evidence.textEvidence?.paymentData as any,
      evidence.textEvidence?.pmsData as any,
    );

    // Submit with retry logic
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.defendDispute(pspDisputeId, {
          documents: mappedEvidence.documents,
          comment: defenseComment || mappedEvidence.comment,
          defenseReasonCode: mappedEvidence.defenseReasonCode,
        });

        return {
          success: true,
          pspResponseId: defenseReference,
          message: "Dispute response submitted successfully",
          rawResponse: response,
        };
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (error.response?.status === 400 || error.response?.status === 422) {
          break;
        }

        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt + 1) * 1000;
          console.log(`Adyen API call failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    return {
      success: false,
      message: lastError?.message || "Failed to submit dispute response",
      rawResponse: lastError,
    };
  }

  async acceptDispute(pspDisputeId: string): Promise<PSPSubmissionResult> {
    try {
      const response = await this.client.acceptDispute(pspDisputeId);
      return {
        success: true,
        pspResponseId: pspDisputeId,
        message: "Dispute accepted (not contesting)",
        rawResponse: response,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to accept dispute: ${error.message}`,
        rawResponse: error,
      };
    }
  }
}
