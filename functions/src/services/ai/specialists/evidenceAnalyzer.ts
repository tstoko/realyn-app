/**
 * Evidence Analyzer Specialist
 *
 * Analyzes the hotel's existing organization documents to identify
 * what evidence is already available that could be used for the dispute.
 */

import * as admin from "firebase-admin";
import {
  ExistingEvidenceAnalysis,
  ExistingEvidenceAnalysisSchema,
  DisputeCase,
  ClaimAnalysis,
} from "../../../types/aiDispute";
import { callLLM } from "../llmService";

// ============================================================
// Types for Organization Documents
// ============================================================

interface HotelDocument {
  id: string;
  name: string;
  category: "Cancellation Policy" | "Terms of Service" | "House Rules" | "Other";
  fileName: string;
  fileSize: number;
}

// ============================================================
// System Prompt
// ============================================================

const EVIDENCE_ANALYZER_SYSTEM_PROMPT = `You are an expert at analyzing hotel documentation for chargeback disputes.

## YOUR ROLE

You receive information about:
- The hotel's existing documents (policies, terms, etc.)
- The dispute details (reason, customer claim)
- CLAIM ANALYSIS from a specialist who already analyzed the customer's arguments

Your job is to:
1. Identify which existing documents are relevant to this specific dispute
2. Summarize what policies the hotel has on file
3. Identify what documents are MISSING that the hotel should have
4. Assess how well existing documents COVER each customer argument (argumentCoverage)

## DOCUMENT RELEVANCE

A document is relevant if it could help win this dispute:
- Cancellation Policy → relevant for cancellation/no-show disputes
- Terms of Service → relevant for most disputes (contains general terms)
- House Rules → relevant for service quality disputes
- Other → depends on content and dispute type

## ARGUMENT COVERAGE

For each customer argument from the claim analysis, assess:
- Which existing documents address/cover this argument (coveredBy)
- If there's a gap, describe what's missing (gapDescription)
- Rate the gap severity: critical (no coverage), moderate (partial), minor (mostly covered)

## MISSING DOCUMENTS

Hotels should typically have:
- Cancellation policy (for cancellation disputes)
- Terms of service / booking terms
- Refund policy (for refund disputes)
- Check-in/check-out procedures documentation

If the hotel is missing documents that would help this dispute, list them.

## OUTPUT FORMAT

Respond with valid JSON. Be specific about why documents are or aren't relevant.`;

// ============================================================
// Main Function
// ============================================================

/**
 * Analyze existing organization documents to identify available evidence.
 * When claimAnalysis is provided, also assesses how well existing docs cover each customer argument.
 */
export async function analyzeExistingEvidence(
  organizationId: string,
  disputeCase?: DisputeCase,
  claimAnalysis?: ClaimAnalysis
): Promise<ExistingEvidenceAnalysis | null> {
  try {
    // Fetch organization documents from Firestore
    const db = admin.firestore();
    const orgDoc = await db.collection("organizations").doc(organizationId).get();

    if (!orgDoc.exists) {
      console.warn(`[EvidenceAnalyzer] Organization not found: ${organizationId}`);
      return generateEmptyAnalysis();
    }

    const orgData = orgDoc.data();
    const documents: HotelDocument[] = orgData?.documents || [];

    if (documents.length === 0) {
      console.log("[EvidenceAnalyzer] No documents found for organization");
      return generateEmptyAnalysis();
    }

    // If we have dispute context, use LLM to analyze relevance
    if (disputeCase) {
      const prompt = buildEvidenceAnalysisPrompt(documents, disputeCase, claimAnalysis);

      const result = await callLLM(prompt, ExistingEvidenceAnalysisSchema, {
        systemPrompt: EVIDENCE_ANALYZER_SYSTEM_PROMPT,
        temperature: 0.2,
        maxTokens: 2048,
      });

      if (result.success && result.data) {
        console.log(`[EvidenceAnalyzer] Analyzed ${documents.length} documents, ${result.data.availableDocuments.filter(d => d.relevantForDispute).length} relevant`);
        return result.data;
      }
    }

    // Fallback: return basic analysis without LLM
    return generateBasicAnalysis(documents, disputeCase);
  } catch (error) {
    console.error("[EvidenceAnalyzer] Error analyzing evidence:", error);
    return generateEmptyAnalysis();
  }
}

// ============================================================
// Prompt Building
// ============================================================

function buildEvidenceAnalysisPrompt(
  documents: HotelDocument[],
  disputeCase: DisputeCase,
  claimAnalysis?: ClaimAnalysis
): string {
  const parts: string[] = [];

  parts.push("# EVIDENCE ANALYSIS REQUEST\n");

  // Dispute context
  parts.push("## DISPUTE CONTEXT");
  parts.push(`- **Reason**: ${disputeCase.reason || "Not specified"}`);
  parts.push(`- **Amount**: ${disputeCase.currency} ${(disputeCase.amount / 100).toFixed(2)}`);
  if (disputeCase.customerExplanation) {
    parts.push(`- **Customer Claim**: "${disputeCase.customerExplanation}"`);
  }
  parts.push("");

  // Claim analysis context (from upstream Claim Analyst)
  if (claimAnalysis) {
    parts.push("## CLAIM ANALYSIS (from Claim Analyst)");
    parts.push(`**Claim Type**: ${claimAnalysis.claimType}`);
    parts.push("");
    parts.push("**Customer Arguments** (assess document coverage for each):");
    for (const arg of claimAnalysis.customerArguments) {
      parts.push(`- ${arg}`);
    }
    parts.push("");
    parts.push("**Required Disproofs**:");
    for (const disproof of claimAnalysis.requiredDisproofs) {
      parts.push(`- ${disproof}`);
    }
    parts.push("");
  }

  // Available documents
  parts.push("## AVAILABLE DOCUMENTS");
  if (documents.length === 0) {
    parts.push("*No documents on file*");
  } else {
    for (const doc of documents) {
      parts.push(`- **${doc.name}** (${doc.category})`);
      parts.push(`  - File: ${doc.fileName}`);
      parts.push(`  - ID: ${doc.id}`);
    }
  }
  parts.push("");

  // Instructions
  parts.push("## YOUR TASK");
  parts.push("Analyze these documents and provide:");
  parts.push("1. List of available documents with relevance assessment");
  parts.push("2. Extracted policies (summarize what each relevant document covers)");
  parts.push("3. Missing documents that would help this dispute");
  if (claimAnalysis) {
    parts.push("4. Argument coverage: for each customer argument, assess which documents address it and identify any gaps");
  }
  parts.push("");
  parts.push("Respond with valid JSON.");

  return parts.join("\n");
}

// ============================================================
// Fallback Generation
// ============================================================

/**
 * Generate empty analysis when no data is available
 */
function generateEmptyAnalysis(): ExistingEvidenceAnalysis {
  return {
    availableDocuments: [],
    extractedPolicies: [],
    missingDocuments: [
      "Cancellation Policy",
      "Terms of Service",
      "Refund Policy",
    ],
  };
}

/**
 * Generate basic analysis without LLM
 */
function generateBasicAnalysis(
  documents: HotelDocument[],
  disputeCase?: DisputeCase
): ExistingEvidenceAnalysis {
  const reason = disputeCase?.reason?.toLowerCase() || "";
  const explanation = disputeCase?.customerExplanation?.toLowerCase() || "";

  // Determine what's relevant based on dispute type
  const isCancellationDispute =
    reason.includes("cancel") || explanation.includes("cancel");
  const isServiceDispute =
    reason.includes("not_received") || explanation.includes("didn't stay");

  // Map documents
  const availableDocuments = documents.map((doc) => {
    let relevantForDispute = false;

    if (doc.category === "Cancellation Policy" && isCancellationDispute) {
      relevantForDispute = true;
    } else if (doc.category === "Terms of Service") {
      relevantForDispute = true; // Always relevant
    } else if (doc.category === "House Rules" && isServiceDispute) {
      relevantForDispute = true;
    }

    return {
      id: doc.id,
      name: doc.name,
      category: doc.category,
      relevantForDispute,
    };
  });

  // Extract policies
  const extractedPolicies = documents
    .filter((doc) =>
      doc.category === "Cancellation Policy" ||
      doc.category === "Terms of Service"
    )
    .map((doc) => ({
      type: doc.category === "Cancellation Policy"
        ? "cancellation" as const
        : "terms" as const,
      documentId: doc.id,
      summary: `${doc.name} (${doc.category})`,
    }));

  // Identify missing documents
  const missingDocuments: string[] = [];
  const hasCategories = new Set(documents.map((d) => d.category));

  if (isCancellationDispute && !hasCategories.has("Cancellation Policy")) {
    missingDocuments.push("Cancellation Policy");
  }
  if (!hasCategories.has("Terms of Service")) {
    missingDocuments.push("Terms of Service");
  }

  return {
    availableDocuments,
    extractedPolicies,
    missingDocuments,
  };
}

