/**
 * Evidence Plan Quality Checker Specialist
 *
 * Validates the generated evidence plan before presenting to the user.
 * Ensures the plan addresses the customer's claim and doesn't miss
 * critical evidence.
 */

import {
  DisputeCase,
  ClaimAnalysis,
  EvidencePlan,
  EvidencePlanQualityCheck,
  EvidencePlanQualityCheckSchema,
  QualityIssue,
  RevisionInstructions,
  AttemptContext,
} from "../../types/aiDispute";
import { callLLM } from "../llmService";
import { buildDisputeContextBlock } from "../promptHelpers";

// ============================================================
// Constants
// ============================================================

const PASSING_SCORE_THRESHOLD = 70;

// ============================================================
// System Prompt
// ============================================================

const QUALITY_CHECKER_SYSTEM_PROMPT_HOTEL = `You are a quality assurance specialist for hotel chargeback evidence plans.

## YOUR ROLE

You validate evidence plans BEFORE the hotel starts gathering evidence, to ensure they're collecting the RIGHT evidence.

You are NOT creating the plan. You are VALIDATING it. Be thorough but practical.

## CRITICAL CHECKS

### 1. Claim Coverage Check
The customer made a specific claim. Does the evidence plan request evidence that DIRECTLY DISPROVES that claim?

Examples:
- Customer claims "I never stayed" → Plan MUST include proof of stay (registration card, key card logs)
- Customer claims "I cancelled in time" → Plan MUST include cancellation policy AND timestamps
- Customer claims "Unauthorized transaction" → Plan MUST include authorization records, 3D Secure data

If the plan doesn't request evidence that directly addresses the claim, this is a CRITICAL issue.

### 2. Missing Critical Evidence
For each dispute type, certain evidence is essential:

FRAUD DISPUTES must have:
- Authorization/3D Secure records
- AVS/CVV match results
- Signed registration (if card-present)

CANCELLATION DISPUTES must have:
- Cancellation policy document
- Proof of policy disclosure
- Cancellation request timestamp (if any)

SERVICE DISPUTES must have:
- Proof of service delivery
- Check-in/check-out records
- Folio showing services rendered

### 3. Priority Check
Is the most important evidence marked as highest priority?
- Evidence that directly disproves the claim should be priority 1
- Supporting evidence should be priority 2-3
- Nice-to-have evidence should be priority 4-5

### 4. Realistic Requirements
Are we asking for evidence the hotel can actually provide?
- Don't ask for CCTV footage if hotels rarely have 30+ day retention
- Don't ask for phone call recordings without knowing if they record calls
- Be reasonable about what documentation hotels typically have`;

const QUALITY_CHECKER_SYSTEM_PROMPT_TICKETING = `You are a quality assurance specialist for ticketing/events merchant chargeback evidence plans.

## YOUR ROLE

You validate evidence plans BEFORE the merchant starts gathering evidence, to ensure they're collecting the RIGHT evidence.

You are NOT creating the plan. You are VALIDATING it. Be thorough but practical.

## CRITICAL CHECKS

### 1. Claim Coverage Check
The customer made a specific claim. Does the evidence plan request evidence that DIRECTLY DISPROVES that claim?

Examples:
- Customer claims "I never received the tickets" → Plan MUST include ticket delivery proof (email logs, download records, venue scan data)
- Customer claims "I was charged after cancelling" → Plan MUST include refund/exchange policy AND order timeline
- Customer claims "Unauthorized transaction" → Plan MUST include authorization records, 3D Secure data

If the plan doesn't request evidence that directly addresses the claim, this is a CRITICAL issue.

### 2. Missing Critical Evidence
For each dispute type, certain evidence is essential:

FRAUD DISPUTES must have:
- Authorization/3D Secure records
- AVS/CVV match results
- Ticket delivery proof linking cardholder to the order

CANCELLATION/REFUND DISPUTES must have:
- Refund/exchange policy from checkout
- Proof the buyer agreed to terms at purchase
- Order timeline showing when cancellation was requested (if any)

SERVICE DISPUTES must have:
- Proof of ticket delivery or event access
- Order confirmation with event/ticket details
- Buyer communications

### 3. Priority Check
Is the most important evidence marked as highest priority?
- Evidence that directly disproves the claim should be priority 1
- Supporting evidence should be priority 2-3
- Nice-to-have evidence should be priority 4-5

### 4. Realistic Requirements
Are we asking for evidence the merchant can actually provide?
- Focus on digital records: order logs, email delivery receipts, platform exports
- Don't ask for evidence the merchant's platform wouldn't typically retain
- Be reasonable about what ticketing platforms typically track

## SCORING

- 90-100: Excellent plan, ready to use
- 70-89: Good plan, minor improvements possible
- 50-69: Needs revision, missing important elements
- Below 50: Significant issues, must revise

## OUTPUT FORMAT

Return JSON with:
- passed: boolean (true if score >= 70 and no critical issues)
- overallScore: number 0-100
- issues: array of specific issues found
- revisionInstructions: if not passed, provide:
  - requirementsToAdd: requirements to add
  - requirementsToRemove: requirement IDs to remove
  - prioritiesToChange: priority adjustments
  - overallAssessment: brief summary of what's wrong
  - unaddressedArguments: customer arguments not covered by the plan (with suggested evidence and severity)
  - previousScore: the score you just assigned
  - specificGuidance: concrete guidance for the planner on what to fix

Focus on what's MISSING or WRONG. A working plan is better than endless revisions.`;

// ============================================================
// Main Function
// ============================================================

/**
 * Check the quality of an evidence plan.
 * @param attemptContext - Optional context about previous revision attempts for awareness.
 */
export async function checkEvidencePlanQuality(
  plan: EvidencePlan,
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  attemptContext?: AttemptContext
): Promise<EvidencePlanQualityCheck> {
  try {
    const prompt = buildQualityCheckPrompt(plan, disputeCase, claimAnalysis, attemptContext);

    const systemPrompt = disputeCase.merchantVertical === "ticketing"
      ? QUALITY_CHECKER_SYSTEM_PROMPT_TICKETING
      : QUALITY_CHECKER_SYSTEM_PROMPT_HOTEL;

    const result = await callLLM(prompt, EvidencePlanQualityCheckSchema, {
      systemPrompt,
      temperature: 0.1,
      maxTokens: 3000,
    });

    if (!result.success || !result.data) {
      console.warn("[QualityChecker] LLM call failed, using fallback check:", result.error);
      return runFallbackQualityCheck(plan, disputeCase, claimAnalysis);
    }

    const check = result.data;
    console.log(`[QualityChecker] Score: ${check.overallScore}, Passed: ${check.passed}, Issues: ${check.issues.length}`);
    return check;
  } catch (error) {
    console.error("[QualityChecker] Error checking quality:", error);
    return runFallbackQualityCheck(plan, disputeCase, claimAnalysis);
  }
}

// ============================================================
// Prompt Building
// ============================================================

function buildQualityCheckPrompt(
  plan: EvidencePlan,
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis,
  attemptContext?: AttemptContext
): string {
  const parts: string[] = [];

  parts.push("# EVIDENCE PLAN QUALITY CHECK REQUEST\n");

  // Revision awareness
  if (attemptContext && attemptContext.attemptNumber > 1) {
    parts.push("## ⚠️ THIS IS A REVISION CHECK (Attempt #" + attemptContext.attemptNumber + ")");
    parts.push("");
    if (attemptContext.previousScore !== undefined) {
      parts.push(`The previous version scored **${attemptContext.previousScore}/100**.`);
    }
    if (attemptContext.previousIssues && attemptContext.previousIssues.length > 0) {
      parts.push("");
      parts.push("**Issues from the previous version that should be FIXED:**");
      for (const issue of attemptContext.previousIssues) {
        parts.push(`- [${issue.severity}] ${issue.description} → ${issue.suggestedFix}`);
      }
      parts.push("");
      parts.push("**IMPORTANT**: Verify that these issues have been addressed. If any remain, flag them as regressions.");
    }
    if (attemptContext.strategy) {
      parts.push("");
      parts.push(`**Strategy context**: ${attemptContext.strategy.recommendation} (confidence: ${attemptContext.strategy.confidence}%). Primary defense: ${attemptContext.strategy.primaryDefense}`);
    }
    parts.push("");
    parts.push("---\n");
  }

  parts.push(buildDisputeContextBlock(disputeCase, {
    includePsp: true,
    includeDates: true,
    includeHotelProfile: true,
    includeHotelPolicies: true,
    includeBooking: true,
    includeGuest: true,
    includePayment: true,
    includeUrgency: true,
  }));

  // Claim analysis
  parts.push("## CLAIM ANALYSIS");
  parts.push(`**Claim Type**: ${claimAnalysis.claimType}`);
  parts.push("");

  parts.push("### Customer Arguments (These MUST be addressed)");
  for (const arg of claimAnalysis.customerArguments) {
    parts.push(`- ${arg}`);
  }
  parts.push("");

  parts.push("### Required Disproofs");
  for (const disproof of claimAnalysis.requiredDisproofs) {
    parts.push(`- ${disproof}`);
  }
  parts.push("");

  // The plan to check
  parts.push("## EVIDENCE PLAN TO CHECK");
  parts.push(`**Category**: ${plan.disputeCategory}`);
  parts.push(`**Subtype**: ${plan.disputeSubtype || "N/A"}`);
  parts.push(`**Recommendation**: ${plan.recommendation}`);
  parts.push(`**Winnability**: ${plan.winnability} - ${plan.winnabilityReason}`);
  parts.push("");

  parts.push("### Evidence Requirements");
  for (const req of plan.requirements) {
    parts.push(`- **[${req.id}] ${req.label}** (Priority: ${req.priority}, Required: ${req.required})`);
    parts.push(`  Category: ${req.category}`);
    parts.push(`  Description: ${req.description}`);
    parts.push("");
  }

  // Instructions
  parts.push("## YOUR TASK");
  parts.push("Validate this evidence plan:");
  parts.push("1. Does it address ALL customer arguments?");
  parts.push("2. Is any critical evidence missing?");
  parts.push("3. Are priorities correct?");
  parts.push("4. Are requirements realistic?");
  parts.push("");
  parts.push("Score the plan 0-100 and list any issues.");
  parts.push("If score < 70 or critical issues exist, provide revision instructions.");
  parts.push("");
  parts.push("Respond with valid JSON.");

  return parts.join("\n");
}

// ============================================================
// Fallback Quality Check
// ============================================================

/**
 * Run a basic quality check without LLM
 */
function runFallbackQualityCheck(
  plan: EvidencePlan,
  disputeCase: DisputeCase,
  claimAnalysis: ClaimAnalysis
): EvidencePlanQualityCheck {
  const issues: QualityIssue[] = [];
  let score = 80; // Start with a decent score

  const claimType = claimAnalysis.claimType;
  const requirementCategories = new Set(plan.requirements.map((r) => r.category));
  const requirementLabels = plan.requirements.map((r) => r.label.toLowerCase());
  const isTicketing = disputeCase.merchantVertical === "ticketing";

  if (isTicketing) {
    // ---- Ticketing-specific fallback checks ----
    if (claimType === "fraud") {
      if (!requirementCategories.has("payment_data")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Fraud dispute missing payment verification evidence (3D Secure, AVS/CVV)",
          suggestedFix: "Add requirement for authorization/3D Secure records",
        });
        score -= 20;
      }
      if (!requirementCategories.has("delivery") && !requirementLabels.some((l) => l.includes("delivery") || l.includes("order"))) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "Fraud dispute should include ticket delivery proof linking cardholder to order",
          suggestedFix: "Add requirement for ticket delivery proof or order confirmation",
        });
        score -= 10;
      }
    }

    if (claimType === "cancellation") {
      if (!requirementCategories.has("policy")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Cancellation dispute missing refund/exchange policy",
          suggestedFix: "Add requirement for refund/exchange policy from checkout",
        });
        score -= 20;
      }
      if (!requirementLabels.some((l) => l.includes("confirmation") || l.includes("order"))) {
        issues.push({
          severity: "major",
          category: "claim_not_addressed",
          description: "Need proof that buyer agreed to terms at purchase",
          suggestedFix: "Add requirement for order confirmation showing terms",
        });
        score -= 10;
      }
    }

    if (claimType === "service") {
      if (!requirementCategories.has("delivery")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Service dispute missing ticket delivery or access proof",
          suggestedFix: "Add requirement for ticket delivery proof or redemption log",
        });
        score -= 20;
      }
      if (!requirementCategories.has("communications")) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "Service dispute should include buyer communications",
          suggestedFix: "Add requirement for buyer communications",
        });
        score -= 10;
      }
    }

    if (claimType === "authorization") {
      if (!requirementCategories.has("payment_data")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Authorization dispute missing payment/transaction records",
          suggestedFix: "Add requirement for authorization records and payment data",
        });
        score -= 20;
      }
    }

    if (claimType === "other") {
      if (!requirementCategories.has("delivery") && !requirementCategories.has("communications")) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "General dispute should include delivery proof or buyer communications",
          suggestedFix: "Add requirement for order confirmation or buyer communications",
        });
        score -= 10;
      }
      const hasSupportingEvidence =
        requirementCategories.has("policy") ||
        requirementCategories.has("payment_data");
      if (!hasSupportingEvidence) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "Dispute needs at least one supporting evidence category beyond delivery",
          suggestedFix: "Add requirement for refund policy or payment data",
        });
        score -= 10;
      }
    }
  } else {
    // ---- Hotel-specific fallback checks ----
    if (claimType === "fraud") {
      if (!requirementCategories.has("payment_data")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Fraud dispute missing payment verification evidence (3D Secure, AVS/CVV)",
          suggestedFix: "Add requirement for authorization/3D Secure records",
        });
        score -= 20;
      }
      if (!requirementLabels.some((l) => l.includes("registration") || l.includes("signature"))) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "Fraud dispute should include signed registration card",
          suggestedFix: "Add requirement for signed registration card",
        });
        score -= 10;
      }
    }

    if (claimType === "cancellation") {
      if (!requirementCategories.has("policy")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Cancellation dispute missing policy documentation",
          suggestedFix: "Add requirement for cancellation policy",
        });
        score -= 20;
      }
      if (!requirementLabels.some((l) => l.includes("confirmation") || l.includes("disclosure"))) {
        issues.push({
          severity: "major",
          category: "claim_not_addressed",
          description: "Need proof that policy was disclosed to guest",
          suggestedFix: "Add requirement for booking confirmation showing policy",
        });
        score -= 10;
      }
    }

    if (claimType === "service") {
      if (!requirementCategories.has("proof_of_stay")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Service dispute missing proof of stay",
          suggestedFix: "Add requirement for check-in/check-out records",
        });
        score -= 20;
      }
      if (!requirementCategories.has("pms_data")) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "Service dispute should include folio/PMS records",
          suggestedFix: "Add requirement for folio or PMS data",
        });
        score -= 10;
      }
    }

    if (claimType === "authorization") {
      if (!requirementCategories.has("payment_data")) {
        issues.push({
          severity: "critical",
          category: "missing_critical_evidence",
          description: "Authorization dispute missing payment/transaction records",
          suggestedFix: "Add requirement for authorization records and payment data",
        });
        score -= 20;
      }
      if (!requirementLabels.some((l) => l.includes("confirmation") || l.includes("agreement") || l.includes("signed"))) {
        issues.push({
          severity: "major",
          category: "claim_not_addressed",
          description: "Need proof guest agreed to the charge amount",
          suggestedFix: "Add requirement for booking confirmation or signed agreement",
        });
        score -= 10;
      }
    }

    if (claimType === "other") {
      if (!requirementCategories.has("pms_data")) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "General dispute should include PMS records (folio/registration)",
          suggestedFix: "Add requirement for folio or registration card",
        });
        score -= 10;
      }
      const hasSupportingEvidence =
        requirementCategories.has("policy") ||
        requirementCategories.has("communications") ||
        requirementCategories.has("proof_of_stay") ||
        requirementCategories.has("payment_data");
      if (!hasSupportingEvidence) {
        issues.push({
          severity: "major",
          category: "missing_critical_evidence",
          description: "Dispute needs at least one supporting evidence category beyond PMS data",
          suggestedFix: "Add requirement for communications, policies, or proof of stay",
        });
        score -= 10;
      }
    }
  }

  // Check for priority issues
  const hasHighPriorityRequired = plan.requirements.some(
    (r) => r.priority === 1 && r.required
  );
  if (!hasHighPriorityRequired && plan.requirements.length > 0) {
    issues.push({
      severity: "minor",
      category: "wrong_priority",
      description: "No requirements marked as priority 1 and required",
      suggestedFix: "Mark the most critical evidence as priority 1",
    });
    score -= 5;
  }

  // Check minimum requirements
  if (plan.requirements.length < 2) {
    issues.push({
      severity: "major",
      category: "missing_critical_evidence",
      description: "Plan has fewer than 2 evidence requirements",
      suggestedFix: "Add more evidence requirements to strengthen the case",
    });
    score -= 15;
  }

  // Build revision instructions if needed
  let revisionInstructions: RevisionInstructions | undefined;
  const hasCriticalIssues = issues.some((i) => i.severity === "critical");
  const passed = score >= PASSING_SCORE_THRESHOLD && !hasCriticalIssues;

  if (!passed) {
    revisionInstructions = {
      requirementsToAdd: [],
      requirementsToRemove: [],
      prioritiesToChange: [],
      overallAssessment: `Plan scored ${score}/100 with ${issues.filter(i => i.severity === "critical").length} critical and ${issues.filter(i => i.severity === "major").length} major issues`,
      previousScore: score,
      specificGuidance: issues.map(i => i.suggestedFix).join(". "),
      unaddressedArguments: [],
    };

    // Add missing requirements based on issues
    for (const issue of issues) {
      if (issue.category === "missing_critical_evidence") {
        if (issue.description.includes("payment") || issue.description.includes("authorization")) {
          revisionInstructions.requirementsToAdd.push({
            category: "payment_data",
            label: "Authorization/3D Secure Records",
            description: "Proof of valid authorization and 3D Secure authentication",
            priority: 1,
          });
        }
        if (issue.description.includes("policy")) {
          revisionInstructions.requirementsToAdd.push({
            category: "policy",
            label: "Cancellation Policy",
            description: "The cancellation policy as displayed to the guest",
            priority: 1,
          });
        }
        if (issue.description.includes("proof of stay")) {
          revisionInstructions.requirementsToAdd.push({
            category: "proof_of_stay",
            label: "Check-in/Check-out Records",
            description: "System records showing guest arrival and departure",
            priority: 1,
          });
        }
        if (issue.description.includes("PMS records")) {
          revisionInstructions.requirementsToAdd.push({
            category: "pms_data",
            label: "Reservation Folio",
            description: "Complete folio showing charges, dates, and guest details",
            priority: 1,
          });
        }
        if (issue.description.includes("supporting evidence category")) {
          revisionInstructions.requirementsToAdd.push({
            category: "communications",
            label: "Booking Confirmation",
            description: "Confirmation email showing reservation details and policies",
            priority: 2,
          });
        }
      }
      if (issue.category === "claim_not_addressed" && issue.description.includes("agreed to the charge")) {
        revisionInstructions.requirementsToAdd.push({
          category: "communications",
          label: "Booking Confirmation / Signed Agreement",
          description: "Proof the guest agreed to the charge amount at time of booking",
          priority: 1,
        });
      }
    }
  }

  // Ensure score is in valid range
  score = Math.max(0, Math.min(100, score));

  return {
    passed,
    overallScore: score,
    issues,
    revisionInstructions,
  };
}

