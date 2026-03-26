// @ts-nocheck
import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import Stripe from "stripe";
import { Client, Config, ModificationApi } from "@adyen/api-library";
import * as admin from "firebase-admin";
import { getOrganization } from "../services/organizationService";
import { getEvidenceFiles } from "../services/evidenceService";
import { buildStripeEvidencePayload } from "../utils/stripeEvidenceMapper";
import { mapEvidenceFilesToAdyen, buildAdyenDefenseComment } from "../utils/adyenEvidenceMapper";
import axios from "axios";
import { AdyenClient } from "../services/psp/adyenClient";
import { DisputeArgument, ArgumentVersion } from "../types/aiDispute";
import { verifyUser, verifyUserInOrganization, sendAuthError } from "../utils/authMiddleware";
import { createPSPAdapter } from "../services/psp/pspFactory";
import type { PSPProvider } from "../types/dispute";

/**
 * Build full argument text from DisputeArgument for Stripe's uncategorized_text field
 */
function buildFullArgumentText(argument: DisputeArgument): string {
  const parts: string[] = [];
  
  // Executive Summary
  if (argument.executiveSummary) {
    parts.push("EXECUTIVE SUMMARY");
    parts.push(argument.executiveSummary);
    parts.push("");
  }
  
  // Timeline
  if (argument.timeline && argument.timeline.length > 0) {
    parts.push("TIMELINE OF EVENTS");
    for (const event of argument.timeline) {
      parts.push(`${event.date}: ${event.description}`);
    }
    parts.push("");
  }
  
  // Argument Paragraphs
  if (argument.paragraphs && argument.paragraphs.length > 0) {
    for (const para of argument.paragraphs) {
      if (para.heading) {
        parts.push(para.heading.toUpperCase());
      }
      parts.push(para.content);
      parts.push("");
    }
  }
  
  // Customer Claim Rebuttal
  if (argument.customerClaimRebuttal) {
    parts.push("RESPONSE TO CUSTOMER'S CLAIM");
    parts.push(argument.customerClaimRebuttal);
    parts.push("");
  }
  
  // Conclusion
  if (argument.conclusion) {
    parts.push("CONCLUSION");
    parts.push(argument.conclusion);
  }
  
  return parts.join("\n").trim();
}

/**
 * Submit dispute response to Stripe
 */
export const submitStripeDisputeResponse = onRequest(
  {
    cors: true,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { disputeId, organizationId, evidence } = req.body;

    if (!disputeId || !organizationId) {
      return res.status(400).json({
        success: false,
        message: "Missing disputeId or organizationId",
      });
    }

    // Verify authentication AND organization membership
    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      return sendAuthError(res, authResult);
    }

    let retries = 0;
    const maxRetries = 3;
    let dispute: any;

    try {
      const db = admin.firestore();
      
      // Get dispute
      const disputeDoc = await db.collection("disputes").doc(disputeId).get();
      if (!disputeDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "Dispute not found",
        });
      }

      dispute = disputeDoc.data();
      if (dispute.pspProvider !== "stripe") {
        return res.status(400).json({
          success: false,
          message: "This dispute is not from Stripe",
        });
      }

      // Get organization with decrypted credentials
      const organization = await getOrganization(organizationId);
      if (!organization || !organization.pspIntegrations?.stripe) {
        return res.status(400).json({
          success: false,
          message: "Stripe integration not configured",
        });
      }

      const stripeIntegration = organization.pspIntegrations.stripe;
      // Use secretKey if available (manual setup), otherwise use accessToken (OAuth setup)
      const apiKey = stripeIntegration.secretKey || stripeIntegration.accessToken;
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: "Stripe credentials not found (secretKey or accessToken required)",
        });
      }
      const stripe = new Stripe(apiKey, { apiVersion: "2023-10-16" });

      // Get evidence files
      const evidenceFiles = await getEvidenceFiles(disputeId);

      // Get text evidence from request body or dispute document
      const textEvidence = evidence?.textEvidence || {};

      // Build evidence payload for Stripe using mapper
      const evidencePayload = buildStripeEvidencePayload(
        evidenceFiles,
        textEvidence
      );

      // Check if dispute has an AI-generated argument draft
      const argumentDraft: DisputeArgument | undefined = dispute.argumentDraft;

      // Also include any direct evidence fields from request (for backward compatibility)
      const finalPayload: Stripe.DisputeEvidenceParams = {
        ...evidencePayload,
        // Allow override from request body if provided
        customer_communication: evidence?.customerCommunication || evidencePayload.customer_communication,
        customer_signature: evidence?.customerSignature || evidencePayload.customer_signature,
        receipt: evidence?.receipt || evidencePayload.receipt,
        service_documentation: evidence?.serviceDocumentation || evidencePayload.service_documentation,
        uncategorized_file: evidence?.uncategorizedFile || evidencePayload.uncategorized_file,
        product_description: evidence?.productDescription || evidencePayload.product_description,
        access_activity_log: evidence?.accessActivityLog || evidencePayload.access_activity_log,
        customer_purchase_ip: evidence?.customerPurchaseIp || evidencePayload.customer_purchase_ip,
      };

      // If we have an AI-generated argument, use it to fill Stripe text fields
      if (argumentDraft) {
        // Build the full argument text from all sections
        const fullArgumentText = buildFullArgumentText(argumentDraft);
        
        // Map argument fields to Stripe evidence
        finalPayload.uncategorized_text = argumentDraft.uncategorizedText || fullArgumentText;
        
        if (argumentDraft.productDescription) {
          finalPayload.product_description = argumentDraft.productDescription;
        }
        if (argumentDraft.serviceDates) {
          // Stripe expects this in service_date format
          // But uncategorized_text is our best option for free-form text
        }
        if (argumentDraft.cancellationPolicy) {
          finalPayload.cancellation_policy = argumentDraft.cancellationPolicy;
        }
        if (argumentDraft.cancellationPolicyDisclosure) {
          finalPayload.cancellation_policy_disclosure = argumentDraft.cancellationPolicyDisclosure;
        }
        if (argumentDraft.refundPolicy) {
          finalPayload.refund_policy = argumentDraft.refundPolicy;
        }
        if (argumentDraft.refundPolicyDisclosure) {
          finalPayload.refund_policy_disclosure = argumentDraft.refundPolicyDisclosure;
        }
        if (argumentDraft.refundRefusalExplanation) {
          finalPayload.refund_refusal_explanation = argumentDraft.refundRefusalExplanation;
        }
        if (argumentDraft.customerCommunication) {
          // Only use text if no file was uploaded
          if (!finalPayload.customer_communication) {
            finalPayload.customer_communication = argumentDraft.customerCommunication;
          }
        }
        if (argumentDraft.accessActivityLog) {
          // Only use text if no file was uploaded
          if (!finalPayload.access_activity_log) {
            finalPayload.access_activity_log = argumentDraft.accessActivityLog;
          }
        }
      }

      // Remove undefined values
      Object.keys(finalPayload).forEach(key => {
        if (finalPayload[key as keyof Stripe.DisputeEvidenceParams] === undefined) {
          delete finalPayload[key as keyof Stripe.DisputeEvidenceParams];
        }
      });

      // Submit evidence to Stripe with retry logic
      let updatedDispute: Stripe.Dispute;
      
      while (retries <= maxRetries) {
        try {
          updatedDispute = await stripe.disputes.update(
            dispute.pspDisputeId,
            finalPayload
          );
          break; // Success, exit retry loop
        } catch (error: any) {
          retries++;
          
          // Don't retry on certain errors
          if (error.type === 'StripeInvalidRequestError' && 
              (error.code === 'dispute_already_submitted' || 
               error.code === 'dispute_not_found' ||
               error.code === 'invalid_evidence')) {
            throw error; // Don't retry invalid requests
          }
          
          // Retry on rate limits or network errors
          if (retries > maxRetries) {
            throw error; // Max retries reached
          }
          
          // Exponential backoff: wait 2^retries seconds
          const delayMs = Math.pow(2, retries) * 1000;
          console.log(`Stripe API call failed, retrying in ${delayMs}ms (attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      // Update dispute status in Firestore
      const updateData: Record<string, any> = {
        status: updatedDispute.status,
        lifecycleStatus: "submitted",
        automationStatus: "submitted",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      // Mark argument submission time if used
      if (argumentDraft) {
        updateData.argumentSubmittedAt = admin.firestore.FieldValue.serverTimestamp();
        
        // Also update the argument version to mark it as submitted
        const existingVersions: ArgumentVersion[] = dispute.argumentVersions || [];
        const currentVersion = existingVersions.find(v => v.isCurrent);
        
        if (currentVersion) {
          currentVersion.isSubmitted = true;
          currentVersion.submittedAt = new Date();
          
          // Update the versions array
          const updatedVersions = existingVersions.map(v => 
            v.version === currentVersion.version ? currentVersion : v
          );
          
          updateData.argumentVersions = updatedVersions;
        }
      }
      
      await db.collection("disputes").doc(disputeId).update(updateData);

      console.log(`Successfully submitted Stripe dispute ${dispute.pspDisputeId} for organization ${organizationId}`);

      return res.status(200).json({
        success: true,
        message: "Dispute response submitted successfully",
        disputeStatus: updatedDispute.status,
        evidenceFilesSubmitted: evidenceFiles.length,
      });
    } catch (error: any) {
      console.error("Error submitting Stripe dispute response:", error);
      
      // Log detailed error information
      const errorDetails = {
        disputeId,
        organizationId,
        pspDisputeId: dispute?.pspDisputeId,
        errorType: error.type,
        errorCode: error.code,
        errorMessage: error.message,
      };
      console.error("Error details:", JSON.stringify(errorDetails, null, 2));

      // Provide user-friendly error messages
      let userMessage = "Failed to submit dispute response";
      if (error.type === "StripeRateLimitError") {
        userMessage = "Rate limit exceeded. Please try again in a few moments.";
      } else if (error.type === "StripeInvalidRequestError") {
        if (error.code === "dispute_already_submitted") {
          userMessage = "This dispute has already been submitted.";
        } else if (error.code === "dispute_not_found") {
          userMessage = "Dispute not found in Stripe. Please verify the dispute ID.";
        } else if (error.code === "invalid_evidence") {
          userMessage = "Invalid evidence format. Please check your evidence files.";
        } else {
          userMessage = `Invalid request: ${error.message}`;
        }
      } else if (error.type === "StripeConnectionError") {
        userMessage = "Connection error. Please check your internet connection and try again.";
      }

      return res.status(500).json({
        success: false,
        message: userMessage,
        error: error.message,
        errorCode: error.code,
      });
    }
  }
);

/**
 * Submit dispute response to Adyen
 */
export const submitAdyenDisputeResponse = onRequest(
  {
    cors: true,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { disputeId, organizationId, evidence } = req.body;

    if (!disputeId || !organizationId) {
      return res.status(400).json({
        success: false,
        message: "Missing disputeId or organizationId",
      });
    }

    // Verify authentication AND organization membership
    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      return sendAuthError(res, authResult);
    }

    let dispute: any;

    try {
      const db = admin.firestore();
      
      // Get dispute
      const disputeDoc = await db.collection("disputes").doc(disputeId).get();
      if (!disputeDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "Dispute not found",
        });
      }

      dispute = disputeDoc.data();
      if (dispute.pspProvider !== "adyen") {
        return res.status(400).json({
          success: false,
          message: "This dispute is not from Adyen",
        });
      }

      // Get organization with decrypted credentials
      const organization = await getOrganization(organizationId);
      if (!organization || !organization.pspIntegrations?.adyen) {
        console.error(`Adyen: Integration not configured for organization: ${organizationId}`);
        return res.status(400).json({
          success: false,
          message: "Adyen integration not configured",
        });
      }

      const adyenIntegration = organization.pspIntegrations.adyen;
      
      if (!adyenIntegration.apiKey) {
        console.error(`Adyen: Missing API key for organization: ${organizationId}`);
        return res.status(400).json({
          success: false,
          message: "Adyen API key not found",
        });
      }

      console.log(`Adyen: Submitting dispute response for organization: ${organizationId}, dispute: ${dispute.pspDisputeId}`);
      
      // Get first merchant account from array or use legacy field
      const merchantAccount = (adyenIntegration.merchantAccounts && adyenIntegration.merchantAccounts.length > 0)
        ? adyenIntegration.merchantAccounts[0]
        : (adyenIntegration.merchantAccount || "");
      
      // Initialize Adyen client using service
      const client = new AdyenClient({
        apiKey: adyenIntegration.apiKey || "",
        merchantAccount: merchantAccount,
        liveEndpointPrefix: adyenIntegration.liveEndpointPrefix,
      });

      // Get evidence files
      const evidenceFiles = await getEvidenceFiles(disputeId);

      // Get text evidence from request body
      const textEvidence = evidence?.textEvidence || {};

      // Build defense request with evidence mapping
      const defenseReference = `defense_${disputeId}_${Date.now()}`;
      const mappedEvidence = mapEvidenceFilesToAdyen(
        evidenceFiles,
        merchantAccount,
        dispute.pspPaymentId,
        defenseReference
      );

      // Add defense comment from text evidence
      const defenseComment = buildAdyenDefenseComment(
        textEvidence.paymentData,
        textEvidence.pmsData
      );

      // Submit defense to Adyen with retry logic
      let retries = 0;
      const maxRetries = 3;
      let defenseResponse: any;

      while (retries <= maxRetries) {
        try {
          // Use Adyen client's defendDispute method
          defenseResponse = await client.defendDispute(dispute.pspDisputeId, {
            documents: mappedEvidence.documents,
            comment: defenseComment || mappedEvidence.comment,
            defenseReasonCode: mappedEvidence.defenseReasonCode,
          });
          break; // Success, exit retry loop
        } catch (error: any) {
          retries++;
          
          // Don't retry on certain errors
          if (error.response?.status === 400 || error.response?.status === 422) {
            throw error; // Don't retry invalid requests
          }
          
          // Retry on rate limits or network errors
          if (retries > maxRetries) {
            throw error; // Max retries reached
          }
          
          // Exponential backoff
          const delayMs = Math.pow(2, retries) * 1000;
          console.log(`Adyen API call failed, retrying in ${delayMs}ms (attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      // Update dispute status in Firestore
      await db.collection("disputes").doc(disputeId).update({
        lifecycleStatus: "submitted",
        automationStatus: "submitted",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Adyen: ✅ Successfully submitted chargeback defense ${defenseReference} for organization ${organizationId}, dispute: ${dispute.pspDisputeId}`);

      return res.status(200).json({
        success: true,
        message: "Dispute response submitted successfully",
        defenseReference: defenseReference,
        evidenceFilesSubmitted: evidenceFiles.length,
      });
    } catch (error: any) {
      console.error("Error submitting Adyen dispute response:", error);
      
      // Log detailed error information
      const errorDetails = {
        disputeId,
        organizationId,
        adyenPaymentId: dispute?.pspPaymentId,
        errorStatus: error.response?.status,
        errorMessage: error.message,
        errorResponse: error.response?.data,
      };
      console.error("Error details:", JSON.stringify(errorDetails, null, 2));

      // Provide user-friendly error messages
      let userMessage = "Failed to submit dispute response";
      if (error.response?.status === 401 || error.response?.status === 403) {
        userMessage = "Invalid Adyen credentials. Please check your API key and merchant account.";
      } else if (error.response?.status === 400 || error.response?.status === 422) {
        userMessage = `Invalid request: ${error.response?.data?.message || error.message}`;
      } else if (error.response?.status === 429) {
        userMessage = "Rate limit exceeded. Please try again in a few moments.";
      } else if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        userMessage = "Connection error. Please check your internet connection and try again.";
      }

      return res.status(error.response?.status || 500).json({
        success: false,
        message: userMessage,
        error: error.message,
        errorCode: error.response?.status,
      });
    }
  }
);

// =============================================================================
// Unified Submission Handler (PSP-agnostic)
// =============================================================================

/**
 * Unified dispute response submission handler.
 *
 * Reads the dispute to determine the PSP provider, resolves credentials from
 * the organization document, and delegates to the appropriate PSPAdapter.
 *
 * This is the recommended handler for new integrations. The Stripe- and
 * Adyen-specific handlers above are kept for backward compatibility.
 */
export const submitDisputeResponse = onRequest(
  {
    cors: true,
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { disputeId, organizationId } = req.body;

    if (!disputeId || !organizationId) {
      return res.status(400).json({
        success: false,
        message: "Missing disputeId or organizationId",
      });
    }

    // Verify authentication AND organization membership
    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      return sendAuthError(res, authResult);
    }

    try {
      const db = admin.firestore();

      // Get dispute to determine PSP provider
      const disputeDoc = await db.collection("disputes").doc(disputeId).get();
      if (!disputeDoc.exists) {
        return res.status(404).json({ success: false, message: "Dispute not found" });
      }

      const dispute = disputeDoc.data()!;
      const provider = dispute.pspProvider as PSPProvider;

      if (!provider) {
        return res.status(400).json({
          success: false,
          message: "Dispute has no PSP provider set",
        });
      }

      // Get organization credentials
      const organization = await getOrganization(organizationId);
      if (!organization || !organization.pspIntegrations) {
        return res.status(400).json({
          success: false,
          message: "Organization PSP integrations not configured",
        });
      }

      // Create the appropriate adapter
      const adapter = createPSPAdapter(provider, organization.pspIntegrations);

      // Gather evidence
      const evidenceFiles = await getEvidenceFiles(disputeId);
      const argument: DisputeArgument | undefined = dispute.argumentDraft;
      const textEvidence = req.body.evidence?.textEvidence || {};

      // Submit defense
      const result = await adapter.submitDefense(
        disputeId,
        dispute.pspDisputeId,
        { files: evidenceFiles, argument, textEvidence },
      );

      if (result.success) {
        // Update dispute status
        const updateData: Record<string, any> = {
          lifecycleStatus: "submitted",
          automationStatus: "submitted",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (argument) {
          updateData.argumentSubmittedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        await db.collection("disputes").doc(disputeId).update(updateData);

        console.log(
          `Successfully submitted ${provider} dispute ${dispute.pspDisputeId} ` +
          `for organization ${organizationId} via unified handler`,
        );
      }

      return res.status(result.success ? 200 : 500).json({
        success: result.success,
        message: result.message,
        disputeStatus: result.status,
        evidenceFilesSubmitted: evidenceFiles.length,
        pspResponseId: result.pspResponseId,
      });
    } catch (error: any) {
      console.error("Error in unified dispute submission:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to submit dispute response",
      });
    }
  },
);

