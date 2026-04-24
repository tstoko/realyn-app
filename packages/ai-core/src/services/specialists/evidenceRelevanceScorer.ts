/**
 * Evidence Relevance Scorer Specialist
 *
 * Scores how relevant each type of evidence would be for this specific dispute.
 * Uses the claim analysis to prioritize evidence that directly counters
 * the customer's arguments.
 */

import {
  DisputeCase,
  ClaimAnalysis,
  ExistingEvidenceAnalysis,
  EvidenceRelevanceScores,
  EvidenceRelevanceScoresSchema,
} from "../../types/aiDispute";
import { callLLM } from "../llmService";
import { buildDisputeContextBlock } from "../promptHelpers";

// ============================================================
// Evidence Types for Hotels
// ============================================================

const HOTEL_EVIDENCE_TYPES = [
  "registration_card",
  "folio",
  "cancellation_policy",
  "refund_policy",
  "terms_of_service",
  "booking_confirmation",
  "check_in_records",
  "check_out_records",
  "key_card_logs",
  "housekeeping_records",
  "guest_communications",
  "3d_secure_records",
  "avs_cvv_records",
  "authorization_records",
  "id_verification",
  "signed_agreements",
] as const;

const TICKETING_EVIDENCE_TYPES = [
  "order_confirmation",
  "ticket_delivery_proof",
  "redemption_log",
  "refund_policy",
  "terms_of_service",
  "buyer_communications",
  "3d_secure_records",
  "avs_cvv_records",
  "authorization_records",
  "id_verification",
  "signed_agreements",
] as const;

// ============================================================
// System Prompt
// ============================================================

const RELEVANCE_SCORER_SYSTEM_PROMPT_HOTEL = `You are an expert at evaluating evidence relevance for hotel chargeback disputes.

## YOUR ROLE

You receive:
- The dispute details
- The claim analysis (what the customer is arguing)
- A list of potential evidence types

Your job is to score each evidence type on how relevant it would be to WIN this specific dispute.

## SCORING CRITERIA

Score 0-100 based on:
- **Direct disproof (80-100)**: Evidence that directly contradicts a customer argument
- **Strong support (60-79)**: Evidence that strongly supports the hotel's position
- **Helpful (40-59)**: Evidence that provides useful context
- **Marginal (20-39)**: Evidence with limited relevance
- **Not relevant (0-19)**: Evidence that doesn't help this case

## EVIDENCE TYPE GUIDE

For FRAUD disputes, prioritize:
- 3d_secure_records (liability shift)
- avs_cvv_records (card verification)
- registration_card (signature matching cardholder)
- id_verification (guest ID matched card)

For CANCELLATION disputes, prioritize:
- cancellation_policy (the actual policy)
- booking_confirmation (shows policy was disclosed)
- guest_communications (any cancellation requests)
- signed_agreements (guest acknowledged terms)

For SERVICE disputes, prioritize:
- check_in_records (proof they arrived)
- check_out_records (proof they stayed)
- key_card_logs (room access records)
- folio (services rendered)
- housekeeping_records (room was used)

## OUTPUT FORMAT

For each evidence type:
1. Score it 0-100
2. Explain why in 1-2 sentences
3. If it directly disproves a customer argument, note which one

Then list:
- Top 3-5 priority evidence types
- Any low-value evidence not worth requesting

Respond with valid JSON.`;

const RELEVANCE_SCORER_SYSTEM_PROMPT_TICKETING = `You are an expert at evaluating evidence relevance for ticketing/events merchant chargeback disputes.

## YOUR ROLE

You receive:
- The dispute details
- The claim analysis (what the customer is arguing)
- A list of potential evidence types

Your job is to score each evidence type on how relevant it would be to WIN this specific dispute.

## SCORING CRITERIA

Score 0-100 based on:
- **Direct disproof (80-100)**: Evidence that directly contradicts a customer argument
- **Strong support (60-79)**: Evidence that strongly supports the merchant's position
- **Helpful (40-59)**: Evidence that provides useful context
- **Marginal (20-39)**: Evidence with limited relevance
- **Not relevant (0-19)**: Evidence that doesn't help this case

## EVIDENCE TYPE GUIDE

For FRAUD disputes, prioritize:
- 3d_secure_records (liability shift)
- avs_cvv_records (card verification)
- ticket_delivery_proof (proves tickets were sent to cardholder's email)
- id_verification (account linked to cardholder)

For CANCELLATION/REFUND disputes, prioritize:
- refund_policy (the actual refund/exchange terms)
- order_confirmation (proves purchase and terms were shown)
- buyer_communications (any refund requests or support threads)
- terms_of_service (buyer agreed at checkout)

For SERVICE/DELIVERY disputes, prioritize:
- ticket_delivery_proof (email delivery, download log)
- redemption_log (venue scan, barcode validation)
- order_confirmation (order details)
- buyer_communications (delivery confirmations)

## OUTPUT FORMAT

For each evidence type:
1. Score it 0-100
2. Explain why in 1-2 sentences
3. If it directly disproves a customer argument, note which one

Then list:
- Top 3-5 priority evidence types
- Any low-value evidence not worth requesting

Respond with valid JSON.`;

// ============================================================
// Main Function
// ============================================================

/**
 * Score evidence relevance based on the dispute, claim analysis, and existing evidence.
 */
export async function scoreEvidenceRelevance(
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  existingEvidence?: ExistingEvidenceAnalysis | null
): Promise<EvidenceRelevanceScores | null> {
  try {
    const prompt = buildRelevanceScoringPrompt(disputeCase, claimAnalysis, existingEvidence);
    const systemPrompt = disputeCase.merchantVertical === "ticketing"
      ? RELEVANCE_SCORER_SYSTEM_PROMPT_TICKETING
      : RELEVANCE_SCORER_SYSTEM_PROMPT_HOTEL;

    const result = await callLLM(prompt, EvidenceRelevanceScoresSchema, {
      systemPrompt,
      temperature: 0.2,
      maxTokens: 3000,
    });

    if (!result.success || !result.data) {
      console.warn("[RelevanceScorer] LLM call failed:", result.error);
      return generateFallbackScores(disputeCase, claimAnalysis, existingEvidence);
    }

    console.log(`[RelevanceScorer] Scored ${result.data.scores.length} evidence types, top priority: ${result.data.topPriorityEvidence.join(", ")}`);
    return result.data;
  } catch (error) {
    console.error("[RelevanceScorer] Error scoring relevance:", error);
    return generateFallbackScores(disputeCase, claimAnalysis, existingEvidence);
  }
}

// ============================================================
// Prompt Building
// ============================================================

function buildRelevanceScoringPrompt(
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  existingEvidence?: ExistingEvidenceAnalysis | null
): string {
  const parts: string[] = [];

  parts.push("# EVIDENCE RELEVANCE SCORING REQUEST\n");

  parts.push(buildDisputeContextBlock(disputeCase));

  // Claim analysis
  parts.push("## CLAIM ANALYSIS");
  parts.push(`**Claim Type**: ${claimAnalysis.claimType}`);
  parts.push("");

  parts.push("### Customer Arguments");
  for (const arg of claimAnalysis.customerArguments) {
    parts.push(`- ${arg}`);
  }
  parts.push("");

  parts.push("### Required Disproofs");
  for (const disproof of claimAnalysis.requiredDisproofs) {
    parts.push(`- ${disproof}`);
  }
  parts.push("");

  parts.push("### Weak Points in Claim");
  for (const weak of claimAnalysis.weakPoints) {
    parts.push(`- ${weak}`);
  }
  parts.push("");

  // Existing evidence already available
  if (existingEvidence && existingEvidence.availableDocuments.length > 0) {
    const relevantDocs = existingEvidence.availableDocuments.filter(d => d.relevantForDispute);
    if (relevantDocs.length > 0) {
      parts.push("## EVIDENCE ALREADY AVAILABLE");
      const entityLabel = disputeCase.merchantVertical === "ticketing" ? "merchant" : "hotel";
    parts.push(`The ${entityLabel} already has these relevant documents on file:`);
      for (const doc of relevantDocs) {
        parts.push(`- ${doc.name} (${doc.category})`);
      }
      parts.push("");
      parts.push("For evidence types that are already available, set `alreadyAvailable: true` in your score.");
      parts.push("");
    }
  }

  const evidenceTypes = disputeCase.merchantVertical === "ticketing" ? TICKETING_EVIDENCE_TYPES : HOTEL_EVIDENCE_TYPES;
  parts.push("## EVIDENCE TYPES TO SCORE");
  for (const evidenceType of evidenceTypes) {
    parts.push(`- ${evidenceType}`);
  }
  parts.push("");

  // Instructions
  parts.push("## YOUR TASK");
  parts.push("Score each evidence type 0-100 based on its relevance to winning THIS specific dispute.");
  parts.push("Focus on evidence that directly disproves the customer's arguments.");
  parts.push("If the evidence type is already available (see above), set `alreadyAvailable: true`.");
  parts.push("");
  parts.push("Respond with valid JSON.");

  return parts.join("\n");
}

// ============================================================
// Fallback Generation
// ============================================================

/**
 * Generate fallback relevance scores when LLM fails
 */
function generateFallbackScores(
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  existingEvidence?: ExistingEvidenceAnalysis | null
): EvidenceRelevanceScores {
  const claimType = claimAnalysis.claimType;
  const isTicketing = disputeCase.merchantVertical === "ticketing";
  const evidenceTypes: readonly string[] = isTicketing ? TICKETING_EVIDENCE_TYPES : HOTEL_EVIDENCE_TYPES;

  const scoreMap: Record<string, number> = {};

  for (const evidenceType of evidenceTypes) {
    scoreMap[evidenceType] = 30;
  }

  if (isTicketing) {
    switch (claimType) {
      case "fraud":
        scoreMap["3d_secure_records"] = 95;
        scoreMap["avs_cvv_records"] = 90;
        scoreMap["ticket_delivery_proof"] = 85;
        scoreMap["id_verification"] = 85;
        scoreMap["authorization_records"] = 80;
        scoreMap["order_confirmation"] = 70;
        break;
      case "cancellation":
        scoreMap["refund_policy"] = 95;
        scoreMap["order_confirmation"] = 90;
        scoreMap["buyer_communications"] = 85;
        scoreMap["terms_of_service"] = 80;
        scoreMap["signed_agreements"] = 75;
        break;
      case "service":
        scoreMap["ticket_delivery_proof"] = 95;
        scoreMap["redemption_log"] = 90;
        scoreMap["order_confirmation"] = 85;
        scoreMap["buyer_communications"] = 80;
        break;
      case "authorization":
        scoreMap["authorization_records"] = 95;
        scoreMap["3d_secure_records"] = 90;
        scoreMap["order_confirmation"] = 85;
        scoreMap["signed_agreements"] = 80;
        break;
      default:
        scoreMap["order_confirmation"] = 80;
        scoreMap["ticket_delivery_proof"] = 75;
        scoreMap["buyer_communications"] = 70;
        scoreMap["refund_policy"] = 65;
    }
  } else {
    switch (claimType) {
      case "fraud":
        scoreMap["3d_secure_records"] = 95;
        scoreMap["avs_cvv_records"] = 90;
        scoreMap["registration_card"] = 85;
        scoreMap["id_verification"] = 85;
        scoreMap["authorization_records"] = 80;
        scoreMap["check_in_records"] = 70;
        break;
      case "cancellation":
        scoreMap["cancellation_policy"] = 95;
        scoreMap["booking_confirmation"] = 90;
        scoreMap["guest_communications"] = 85;
        scoreMap["signed_agreements"] = 80;
        scoreMap["terms_of_service"] = 75;
        break;
      case "service":
        scoreMap["check_in_records"] = 95;
        scoreMap["check_out_records"] = 90;
        scoreMap["key_card_logs"] = 85;
        scoreMap["folio"] = 85;
        scoreMap["housekeeping_records"] = 80;
        scoreMap["registration_card"] = 75;
        break;
      case "authorization":
        scoreMap["authorization_records"] = 95;
        scoreMap["3d_secure_records"] = 90;
        scoreMap["signed_agreements"] = 85;
        scoreMap["booking_confirmation"] = 80;
        break;
      default:
        scoreMap["folio"] = 80;
        scoreMap["registration_card"] = 75;
        scoreMap["booking_confirmation"] = 70;
        scoreMap["guest_communications"] = 65;
    }
  }

  // Build a set of available document categories for alreadyAvailable tagging
  const availableDocNames = new Set(
    (existingEvidence?.availableDocuments || [])
      .filter(d => d.relevantForDispute)
      .map(d => d.name.toLowerCase())
  );

  // Simple mapping from evidence type to doc name keywords for availability check
  const typeToKeywords: Record<string, string[]> = {
    cancellation_policy: ["cancellation"],
    refund_policy: ["refund"],
    terms_of_service: ["terms", "service"],
    folio: ["folio"],
    registration_card: ["registration"],
  };

  const scores = evidenceTypes.map((evidenceType) => {
    const keywords = typeToKeywords[evidenceType] || [];
    const isAvailable = keywords.length > 0 && [...availableDocNames].some(
      name => keywords.some(kw => name.includes(kw))
    );
    return {
      evidenceType,
      relevanceScore: scoreMap[evidenceType],
      reasoning: `Standard relevance for ${claimType} disputes`,
      alreadyAvailable: isAvailable || undefined,
    };
  });

  // Sort by score descending
  scores.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Extract top priority and low value
  const topPriorityEvidence = scores
    .filter((s) => s.relevanceScore >= 70)
    .slice(0, 5)
    .map((s) => s.evidenceType);

  const lowValueEvidence = scores
    .filter((s) => s.relevanceScore < 30)
    .map((s) => s.evidenceType);

  return {
    scores,
    topPriorityEvidence,
    lowValueEvidence,
  };
}

