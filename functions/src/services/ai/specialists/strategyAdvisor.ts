/**
 * Strategy Advisor Specialist
 *
 * Synthesizes insights from Claim Analyst, Evidence Analyzer, and Relevance Scorer
 * into a coherent dispute strategy. Acts as a senior strategist who reviews
 * subordinate analysts' reports and produces a clear strategy brief.
 */

import {
  DisputeCase,
  ClaimAnalysis,
  ExistingEvidenceAnalysis,
  EvidenceRelevanceScores,
  DisputeStrategy,
  DisputeStrategySchema,
} from "../../../types/aiDispute";
import { DisputeCodeInfo } from "../../../config/disputeCodeMapping";
import { callLLM, LLMCallOptions } from "../llmService";

// ============================================================
// System Prompt
// ============================================================

const STRATEGY_ADVISOR_SYSTEM_PROMPT = `You are a senior hotel dispute strategist. You receive detailed reports from three specialist analysts and synthesize them into a clear dispute strategy.

## YOUR ROLE

You review:
1. **Claim Analysis** – What the customer is arguing, weak points, required disproofs
2. **Evidence Analysis** – What documents the hotel already has, gaps in coverage
3. **Relevance Scores** – Which evidence types are most impactful for this dispute
4. **Dispute Code Info** (when available) – Network rules and standard requirements

Your job is to produce a strategic recommendation:
- Should the hotel **fight** or **accept** this dispute?
- What is the **primary defense** line?
- What are the **defense points** and which evidence supports each?
- What are the **known weaknesses** in the hotel's position?
- What evidence should be **prioritized** (what must be gathered vs what's already available)?

## STRATEGY GUIDELINES

### Fight vs Accept
- Recommend "fight" if there's a reasonable path to winning with obtainable evidence
- Recommend "accept" only if the customer's claim is clearly valid or evidence is unobtainable
- Set confidence 0-100 based on how strong the defense case is

### Defense Points
- Each defense point should address a specific customer argument
- Link defense points to specific evidence types that support them
- Be concrete: "Signed registration card proves guest checked in" not "We have records"

### Known Weaknesses
- Be honest about gaps in the hotel's position
- Identify arguments the hotel cannot fully counter
- This helps the planner avoid over-promising

### Evidence Priority
- List evidence types in order of strategic importance
- Mark which are already available (no action needed)
- Mark which must be gathered (action required)
- Focus on evidence that's both high-impact and obtainable

## OUTPUT FORMAT

Respond with valid JSON matching the schema. Be strategic and practical.`;

// ============================================================
// Main Function
// ============================================================

/**
 * Synthesize a dispute strategy from specialist analyses.
 */
export async function synthesizeStrategy(
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  existingEvidence: ExistingEvidenceAnalysis | null,
  relevanceScores: EvidenceRelevanceScores | null,
  codeInfo: DisputeCodeInfo | null,
  options?: Partial<LLMCallOptions>
): Promise<DisputeStrategy | null> {
  try {
    const prompt = buildStrategyPrompt(
      disputeCase,
      claimAnalysis,
      existingEvidence,
      relevanceScores,
      codeInfo
    );

    const result = await callLLM(prompt, DisputeStrategySchema, {
      systemPrompt: STRATEGY_ADVISOR_SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 3000,
      ...options,
    });

    if (!result.success || !result.data) {
      console.warn("[StrategyAdvisor] LLM call failed:", result.error);
      return null;
    }

    console.log(
      `[StrategyAdvisor] Strategy: ${result.data.recommendation} ` +
      `(confidence: ${result.data.confidence}%), ` +
      `${result.data.defensePoints.length} defense points, ` +
      `${result.data.knownWeaknesses.length} weaknesses`
    );
    return result.data;
  } catch (error) {
    console.error("[StrategyAdvisor] Error synthesizing strategy:", error);
    return null;
  }
}

// ============================================================
// Prompt Building
// ============================================================

function buildStrategyPrompt(
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  existingEvidence: ExistingEvidenceAnalysis | null,
  relevanceScores: EvidenceRelevanceScores | null,
  codeInfo: DisputeCodeInfo | null
): string {
  const parts: string[] = [];

  parts.push("# DISPUTE STRATEGY SYNTHESIS REQUEST\n");

  // Dispute overview
  parts.push("## DISPUTE OVERVIEW");
  parts.push(`- **Amount**: ${disputeCase.currency} ${(disputeCase.amount / 100).toFixed(2)}`);
  parts.push(`- **Reason**: ${disputeCase.reason || "Not specified"}`);
  parts.push(`- **PSP**: ${disputeCase.pspProvider}`);
  if (disputeCase.customerExplanation) {
    parts.push(`- **Customer Claim**: "${disputeCase.customerExplanation}"`);
  }
  if (disputeCase.respondByDate) {
    parts.push(`- **Response Deadline**: ${disputeCase.respondByDate}`);
  }
  parts.push("");

  // Code info
  if (codeInfo) {
    parts.push("## DISPUTE CODE INFO");
    parts.push(`- **Code**: ${codeInfo.code} (${codeInfo.network.toUpperCase()})`);
    parts.push(`- **Category**: ${codeInfo.category}`);
    if (codeInfo.subcategory) {
      parts.push(`- **Subcategory**: ${codeInfo.subcategory}`);
    }
    parts.push(`- **Description**: ${codeInfo.description}`);
    parts.push(`- **Hotel Relevance**: ${codeInfo.hotelRelevance}`);
    parts.push(`- **Default Recommendation**: ${codeInfo.defaultRecommendation}`);
    parts.push(`- **Required Evidence**: ${codeInfo.requiredEvidence.join(", ")}`);
    parts.push("");
  }

  // Report 1: Claim Analysis
  parts.push("## ANALYST REPORT 1: CLAIM ANALYSIS");
  parts.push(`**Claim Type**: ${claimAnalysis.claimType}`);
  parts.push("");

  parts.push("**Customer Arguments**:");
  for (const arg of claimAnalysis.customerArguments) {
    parts.push(`- ${arg}`);
  }
  parts.push("");

  parts.push("**Required Disproofs**:");
  for (const disproof of claimAnalysis.requiredDisproofs) {
    parts.push(`- ${disproof}`);
  }
  parts.push("");

  parts.push("**Weak Points in Claim**:");
  for (const weak of claimAnalysis.weakPoints) {
    parts.push(`- ${weak}`);
  }
  parts.push("");

  parts.push("**Suggested Counterarguments**:");
  for (const counter of claimAnalysis.suggestedCounterarguments) {
    parts.push(`- ${counter}`);
  }
  parts.push("");

  // Report 2: Evidence Analysis
  if (existingEvidence) {
    parts.push("## ANALYST REPORT 2: EXISTING EVIDENCE");

    const relevantDocs = existingEvidence.availableDocuments.filter(d => d.relevantForDispute);
    if (relevantDocs.length > 0) {
      parts.push("**Relevant Documents on File**:");
      for (const doc of relevantDocs) {
        parts.push(`- ${doc.name} (${doc.category})`);
      }
      parts.push("");
    }

    if (existingEvidence.extractedPolicies.length > 0) {
      parts.push("**Extracted Policies**:");
      for (const policy of existingEvidence.extractedPolicies) {
        parts.push(`- ${policy.type}: ${policy.summary}`);
      }
      parts.push("");
    }

    if (existingEvidence.missingDocuments.length > 0) {
      parts.push("**Missing Documents**:");
      for (const missing of existingEvidence.missingDocuments) {
        parts.push(`- ${missing}`);
      }
      parts.push("");
    }

    if (existingEvidence.argumentCoverage && existingEvidence.argumentCoverage.length > 0) {
      parts.push("**Argument Coverage**:");
      for (const cov of existingEvidence.argumentCoverage) {
        const covered = cov.coveredBy && cov.coveredBy.length > 0
          ? `covered by: ${cov.coveredBy.join(", ")}`
          : "NOT COVERED";
        parts.push(`- "${cov.customerArgument}" — ${covered}`);
        if (cov.gapDescription) {
          parts.push(`  Gap (${cov.gapSeverity}): ${cov.gapDescription}`);
        }
      }
      parts.push("");
    }
  }

  // Report 3: Relevance Scores
  if (relevanceScores) {
    parts.push("## ANALYST REPORT 3: EVIDENCE RELEVANCE SCORES");

    parts.push("**Top Priority Evidence**:");
    for (const evidenceType of relevanceScores.topPriorityEvidence) {
      const score = relevanceScores.scores.find(s => s.evidenceType === evidenceType);
      if (score) {
        const available = score.alreadyAvailable ? " ✅ AVAILABLE" : "";
        parts.push(`- ${evidenceType}: ${score.relevanceScore}/100${available}`);
        parts.push(`  ${score.reasoning}`);
        if (score.directlyDisproves) {
          parts.push(`  → Disproves: "${score.directlyDisproves}"`);
        }
      }
    }
    parts.push("");

    if (relevanceScores.lowValueEvidence.length > 0) {
      parts.push("**Low Value Evidence**: " + relevanceScores.lowValueEvidence.join(", "));
      parts.push("");
    }
  }

  // Task
  parts.push("## YOUR TASK");
  parts.push("Synthesize the above analyst reports into a clear dispute strategy.");
  parts.push("Consider:");
  parts.push("1. Should we fight or accept? How confident are you?");
  parts.push("2. What is the primary line of defense?");
  parts.push("3. What are the specific defense points and supporting evidence?");
  parts.push("4. What weaknesses should we be aware of?");
  parts.push("5. What evidence should be prioritized for gathering?");
  parts.push("");
  parts.push("Respond with valid JSON.");

  return parts.join("\n");
}

// ============================================================
// Fallback Strategy Generation
// ============================================================

/**
 * Generate a deterministic fallback strategy when LLM is unavailable.
 */
export function generateFallbackStrategy(
  claimAnalysis: ClaimAnalysis,
  relevanceScores: EvidenceRelevanceScores | null,
  codeInfo: DisputeCodeInfo | null
): DisputeStrategy {
  const claimType = claimAnalysis.claimType;

  // Default recommendation based on claim type and code info
  let recommendation: "fight" | "accept" = "fight";
  let confidence = 50;

  if (codeInfo) {
    recommendation = codeInfo.defaultRecommendation === "accept" ? "accept" : "fight";
    confidence = codeInfo.defaultWinnability === "high" ? 75
      : codeInfo.defaultWinnability === "medium" ? 55
      : 35;
  }

  // Primary defense by claim type
  const defenseByType: Record<string, string> = {
    fraud: "Guest identity was verified at check-in and the transaction was properly authorized",
    cancellation: "The cancellation policy was clearly disclosed and the guest failed to cancel within the allowed window",
    service: "The hotel provided the agreed services and the guest completed their stay",
    authorization: "The transaction was properly authorized with the correct amount agreed upon by the guest",
    other: "Documentation shows the hotel fulfilled its obligations per the booking terms",
  };

  // Build defense points from claim analysis
  const defensePoints = claimAnalysis.requiredDisproofs.slice(0, 4).map((disproof, i) => ({
    point: `Counter argument ${i + 1}: ${disproof}`,
    supportingEvidence: [] as string[],
    addressesClaim: claimAnalysis.customerArguments[i] || claimAnalysis.customerArguments[0] || "general claim",
  }));

  // Evidence priority from relevance scores
  const evidencePriority = relevanceScores
    ? relevanceScores.scores
        .filter(s => s.relevanceScore >= 50)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 6)
        .map(s => ({
          evidenceType: s.evidenceType,
          reason: s.reasoning,
          alreadyAvailable: s.alreadyAvailable || false,
          mustGather: s.relevanceScore >= 70 && !s.alreadyAvailable,
        }))
    : codeInfo
      ? codeInfo.requiredEvidence.map(cat => ({
          evidenceType: cat,
          reason: `Required for ${codeInfo.category} disputes`,
          alreadyAvailable: false,
          mustGather: true,
        }))
      : [];

  return {
    recommendation,
    confidence,
    primaryDefense: defenseByType[claimType] || defenseByType.other,
    defensePoints,
    knownWeaknesses: ["Fallback strategy - LLM analysis unavailable; review manually"],
    evidencePriority,
    approachNotes: `Deterministic strategy for ${claimType} dispute. Review and adjust as needed.`,
  };
}
