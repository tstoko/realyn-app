/**
 * Adyen PSP Adapter
 *
 * Implements the PSPAdapter interface for Adyen. Wraps the existing
 * AdyenClient and evidence mapper into the common adapter pattern.
 */

import type {PSPAdapter, PSPEvidencePayload, PSPSubmissionResult} from "../types";
import type {PSPProvider} from "../../../types/dispute";
import type {DisputeArgument} from "../../../types/aiDispute";
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

    // Use the AI-generated argument for the defense comment when available,
    // falling back to the basic text-evidence comment builder.
    const defenseComment = evidence.argument
      ? buildDefenseCommentFromArgument(evidence.argument)
      : buildAdyenDefenseComment(
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

/**
 * Build a structured defense comment from the AI-generated DisputeArgument.
 * Adyen accepts a free-text comment field on the defense submission.
 */
function buildDefenseCommentFromArgument(argument: DisputeArgument): string {
  const parts: string[] = [];

  parts.push(argument.executiveSummary);
  parts.push("");

  for (const para of argument.paragraphs) {
    parts.push(`--- ${para.heading} ---`);
    parts.push(para.content);
    parts.push("");
  }

  if (argument.customerClaimRebuttal) {
    parts.push("--- Customer Claim Rebuttal ---");
    parts.push(argument.customerClaimRebuttal);
    parts.push("");
  }

  parts.push("--- Conclusion ---");
  parts.push(argument.conclusion);

  // Adyen comment field has a limit; truncate if needed
  const MAX_COMMENT_LENGTH = 10000;
  const comment = parts.join("\n");
  if (comment.length > MAX_COMMENT_LENGTH) {
    return comment.slice(0, MAX_COMMENT_LENGTH - 3) + "...";
  }
  return comment;
}
