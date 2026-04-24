/**
 * Stripe PSP Adapter
 *
 * Implements the PSPAdapter interface for Stripe. Wraps the Stripe SDK
 * and evidence mapper into the common adapter pattern.
 */

import Stripe from "stripe";
import type {PSPAdapter, PSPEvidencePayload, PSPSubmissionResult} from "../types";
import type {PSPProvider} from "../../../types/dispute";
import type {DisputeArgument} from "../../../types/aiDispute";
import {buildStripeEvidencePayload} from "../../../utils/stripeEvidenceMapper";

export interface StripeAdapterConfig {
  secretKey?: string;
  accessToken?: string;
  webhookSecret?: string;
}

/**
 * Build full argument text from DisputeArgument for Stripe's uncategorized_text field.
 */
function buildFullArgumentText(argument: DisputeArgument): string {
  const parts: string[] = [];

  if (argument.executiveSummary) {
    parts.push("EXECUTIVE SUMMARY");
    parts.push(argument.executiveSummary);
    parts.push("");
  }

  if (argument.timeline && argument.timeline.length > 0) {
    parts.push("TIMELINE OF EVENTS");
    for (const event of argument.timeline) {
      parts.push(`${event.date}: ${event.description}`);
    }
    parts.push("");
  }

  if (argument.paragraphs && argument.paragraphs.length > 0) {
    for (const para of argument.paragraphs) {
      if (para.heading) {
        parts.push(para.heading.toUpperCase());
      }
      parts.push(para.content);
      parts.push("");
    }
  }

  if (argument.customerClaimRebuttal) {
    parts.push("RESPONSE TO CUSTOMER'S CLAIM");
    parts.push(argument.customerClaimRebuttal);
    parts.push("");
  }

  if (argument.conclusion) {
    parts.push("CONCLUSION");
    parts.push(argument.conclusion);
  }

  return parts.join("\n").trim();
}

export class StripeAdapter implements PSPAdapter {
  readonly provider: PSPProvider = "stripe";
  private stripe: Stripe;

  constructor(config: StripeAdapterConfig) {
    const apiKey = config.secretKey || config.accessToken;
    if (!apiKey) {
      throw new Error("Stripe credentials not found (secretKey or accessToken required)");
    }
    this.stripe = new Stripe(apiKey, {apiVersion: "2023-10-16"});
  }

  async testConnection(): Promise<{success: boolean; message: string}> {
    try {
      await this.stripe.balance.retrieve();
      return {success: true, message: "Stripe connection successful"};
    } catch (error: any) {
      return {
        success: false,
        message: `Stripe connection failed: ${error.message}`,
      };
    }
  }

  async submitDefense(
      disputeId: string,
      pspDisputeId: string,
      evidence: PSPEvidencePayload,
  ): Promise<PSPSubmissionResult> {
    // Build evidence payload using the existing mapper
    const evidencePayload = buildStripeEvidencePayload(
        evidence.files,
        evidence.textEvidence as any,
    );

    const finalPayload: Stripe.DisputeUpdateParams = {
      evidence: {...evidencePayload},
    };

    // Overlay AI-generated argument fields
    if (evidence.argument) {
      const arg = evidence.argument;
      const fullText = buildFullArgumentText(arg);

      finalPayload.evidence = {
        ...finalPayload.evidence,
        uncategorized_text: arg.uncategorizedText || fullText,
        ...(arg.productDescription && {product_description: arg.productDescription}),
        ...(arg.cancellationPolicy && {cancellation_policy: arg.cancellationPolicy}),
        ...(arg.cancellationPolicyDisclosure && {cancellation_policy_disclosure: arg.cancellationPolicyDisclosure}),
        ...(arg.refundPolicy && {refund_policy: arg.refundPolicy}),
        ...(arg.refundPolicyDisclosure && {refund_policy_disclosure: arg.refundPolicyDisclosure}),
        ...(arg.refundRefusalExplanation && {refund_refusal_explanation: arg.refundRefusalExplanation}),
      };
    }

    // Submit with retry logic
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const updatedDispute = await this.stripe.disputes.update(
            pspDisputeId,
            finalPayload,
        );

        return {
          success: true,
          pspResponseId: updatedDispute.id,
          status: updatedDispute.status,
          message: "Dispute response submitted successfully",
          rawResponse: updatedDispute,
        };
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (
          error.type === "StripeInvalidRequestError" &&
          (error.code === "dispute_already_submitted" ||
            error.code === "dispute_not_found" ||
            error.code === "invalid_evidence")
        ) {
          break;
        }

        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt + 1) * 1000;
          console.log(`Stripe API call failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
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
      const closedDispute = await this.stripe.disputes.close(pspDisputeId);
      return {
        success: true,
        pspResponseId: closedDispute.id,
        status: closedDispute.status,
        message: "Dispute accepted (closed without contesting)",
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
