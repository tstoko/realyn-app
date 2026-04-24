/**
 * Claim Analyst Specialist
 *
 * Analyzes the customer's claim to identify what needs to be disproven.
 * This specialist deeply understands the customer's arguments and identifies
 * weak points and required evidence to counter each point.
 */

import { DisputeCase, ClaimAnalysis, ClaimAnalysisSchema } from "../../types/aiDispute";
import type { DisputeCodeInfo } from "../../config/disputeCodeMapping";
import type { SchemeRule } from "../../types/knowledgeBase";
import { callLLM } from "../llmService";
import { buildDisputeContextBlock } from "../promptHelpers";

// ============================================================
// System Prompt
// ============================================================

const CLAIM_ANALYST_SYSTEM_PROMPT = `You are an expert merchant dispute claim analyst. Your job is to deeply understand what the customer is claiming and identify how to defeat their argument.

## YOUR ROLE

You receive a dispute case with:
- The customer's explanation (their claim)
- The dispute reason code
- The dispute amount and context

Your job is to:
1. Classify the type of claim
2. Break down exactly what the customer is arguing
3. Identify weak points in their claim
4. Determine what evidence would disprove each argument
5. Suggest counterarguments the hotel can make

## CLAIM TYPES

- fraud: Customer claims they didn't authorize the transaction, card was stolen, or they don't recognize the charge
- cancellation: Customer claims they cancelled, weren't told the policy, or policy was unfair
- service: Customer claims service wasn't provided, was inadequate, or didn't match what was promised
- authorization: Customer claims the transaction wasn't properly authorized or they didn't agree to the amount
- other: Any other dispute type

## ANALYSIS GUIDELINES

### Customer Arguments
- Break down their claim into specific, individual arguments
- Be precise - "I cancelled" vs "I cancelled within the policy window" are different arguments
- Include both explicit claims and implied claims

### Weak Points
- Look for inconsistencies or gaps in their story
- Consider what they're NOT saying that would help their case
- Think about what a skeptical reviewer would question

### Required Disproofs
- For each customer argument, identify the specific evidence that would disprove it
- Be concrete - "signed registration card showing check-in at 3:14 PM on March 15th"
- Prioritize evidence that is typically available at hotels

### Counterarguments
- Suggest specific arguments the hotel can make
- Each counterargument should be backed by evidence
- Focus on what's provable, not just assertions

## OUTPUT FORMAT

Respond with valid JSON matching the schema. Be thorough but focused.`;

// ============================================================
// Main Function
// ============================================================

/**
 * Analyze the customer's claim to identify what needs to be disproven
 */
export interface ClaimAnalystOptions {
  codeInfo?: DisputeCodeInfo | null;
  schemeRule?: SchemeRule | null;
}

export async function analyzeClaim(
  disputeCase: DisputeCase,
  options?: ClaimAnalystOptions,
): Promise<ClaimAnalysis | null> {
  try {
    const prompt = buildClaimAnalysisPrompt(disputeCase, options);

    const result = await callLLM(prompt, ClaimAnalysisSchema, {
      systemPrompt: CLAIM_ANALYST_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 2048,
    });

    if (!result.success || !result.data) {
      console.warn("[ClaimAnalyst] LLM call failed:", result.error);
      return generateFallbackClaimAnalysis(disputeCase);
    }

    console.log(`[ClaimAnalyst] Analyzed claim: ${result.data.claimType}, ${result.data.customerArguments.length} arguments identified`);
    return result.data;
  } catch (error) {
    console.error("[ClaimAnalyst] Error analyzing claim:", error);
    return generateFallbackClaimAnalysis(disputeCase);
  }
}

// ============================================================
// Prompt Building
// ============================================================

function buildClaimAnalysisPrompt(
  disputeCase: DisputeCase,
  options?: ClaimAnalystOptions,
): string {
  const parts: string[] = [];

  parts.push("# CLAIM ANALYSIS REQUEST\n");

  parts.push(buildDisputeContextBlock(disputeCase, {
    includePsp: true,
    includeDates: true,
    includeHotelProfile: true,
    includeBooking: true,
    includePayment: true,
    paymentVerificationOnly: true,
  }));

  // Scheme rule context (when KB is populated)
  const rule = options?.schemeRule;
  const codeInfo = options?.codeInfo;
  if (rule && (rule.merchantObligation || rule.cardholderBurden || rule.citations.length > 0)) {
    parts.push("## CARD NETWORK SCHEME RULES");
    parts.push(`Reason code: ${rule.code} (${rule.network.toUpperCase()}) — ${rule.description}`);
    if (rule.merchantObligation) {
      parts.push(`**Merchant obligation:** ${rule.merchantObligation}`);
    }
    if (rule.cardholderBurden) {
      parts.push(`**Cardholder burden of proof:** ${rule.cardholderBurden}`);
    }
    if (rule.requiredEvidence.length > 0) {
      parts.push(`**Required evidence categories:** ${rule.requiredEvidence.join(", ")}`);
    }
    if (rule.citations.length > 0) {
      parts.push("**Relevant rule citations:**");
      for (const cite of rule.citations) {
        parts.push(`- ${cite.section}: "${cite.excerpt}"`);
      }
    }
    parts.push("");
  } else if (codeInfo) {
    parts.push("## DISPUTE CODE CONTEXT");
    parts.push(`Reason code: ${codeInfo.code} (${codeInfo.network.toUpperCase()}) — ${codeInfo.description}`);
    parts.push(`Category: ${codeInfo.category}${codeInfo.subcategory ? ` / ${codeInfo.subcategory}` : ""}`);
    parts.push(`Required evidence: ${codeInfo.requiredEvidence.join(", ")}`);
    parts.push(`Optional evidence: ${codeInfo.optionalEvidence.join(", ")}`);
    parts.push("");
  }

  // Customer's claim — expanded section (the most important part for this specialist)
  if (!disputeCase.customerExplanation) {
    parts.push("## CUSTOMER'S CLAIM");
    parts.push("*No explanation provided by customer*");
    parts.push(`The dispute reason code is: ${disputeCase.reason || "unknown"}`);
    parts.push("");
  }

  // Instructions
  parts.push("## YOUR TASK");
  parts.push("Analyze this claim and provide:");
  parts.push("1. The claim type (fraud, cancellation, service, authorization, or other)");
  parts.push("2. List of specific customer arguments (what they're claiming)");
  parts.push("3. Weak points in their claim (where it can be attacked)");
  parts.push("4. Required disproofs (what evidence would counter each argument)");
  parts.push("5. Suggested counterarguments for the hotel");
  parts.push("");
  parts.push("Respond with valid JSON.");

  return parts.join("\n");
}

// ============================================================
// Fallback Generation
// ============================================================

/**
 * Generate a fallback claim analysis when LLM fails
 * Exported so the orchestrator can guarantee a ClaimAnalysis is always available.
 */
export function generateFallbackClaimAnalysis(disputeCase: DisputeCase): ClaimAnalysis {
  const reason = disputeCase.reason?.toLowerCase() || "";
  const explanation = disputeCase.customerExplanation?.toLowerCase() || "";

  // Determine claim type from reason code
  let claimType: ClaimAnalysis["claimType"] = "other";
  if (reason.includes("fraud") || reason.includes("unauthorized")) {
    claimType = "fraud";
  } else if (reason.includes("cancel") || explanation.includes("cancel")) {
    claimType = "cancellation";
  } else if (reason.includes("not_received") || reason.includes("service") || explanation.includes("didn't stay")) {
    claimType = "service";
  } else if (reason.includes("duplicate") || reason.includes("incorrect_amount")) {
    claimType = "authorization";
  }

  // Generate basic customer arguments
  const customerArguments: string[] = [];
  if (disputeCase.customerExplanation) {
    customerArguments.push(disputeCase.customerExplanation);
  } else {
    customerArguments.push(`Customer disputes the charge citing: ${disputeCase.reason || "unspecified reason"}`);
  }

  // Generate basic weak points
  const weakPoints: string[] = [
    "No specific evidence provided by customer to support their claim",
  ];

  // Generate basic required disproofs based on claim type
  const requiredDisproofs: string[] = [];
  switch (claimType) {
    case "fraud":
      requiredDisproofs.push("Signed registration card matching cardholder name");
      requiredDisproofs.push("3D Secure authentication records");
      requiredDisproofs.push("AVS/CVV match confirmation");
      break;
    case "cancellation":
      requiredDisproofs.push("Cancellation policy as shown to guest at booking");
      requiredDisproofs.push("Timestamp of any cancellation request");
      requiredDisproofs.push("Booking confirmation showing policy disclosure");
      break;
    case "service":
      requiredDisproofs.push("Check-in/check-out records proving stay");
      requiredDisproofs.push("Folio showing services rendered");
      requiredDisproofs.push("Key card access logs");
      break;
    default:
      requiredDisproofs.push("Complete transaction records");
      requiredDisproofs.push("Authorization confirmation");
      requiredDisproofs.push("Service documentation");
  }

  // Generate basic counterarguments
  const suggestedCounterarguments: string[] = [
    "The transaction was properly authorized and services were provided as agreed",
    "All policies were disclosed to the guest at the time of booking",
  ];

  return {
    claimType,
    customerArguments,
    weakPoints,
    requiredDisproofs,
    suggestedCounterarguments,
  };
}

