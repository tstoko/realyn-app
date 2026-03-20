import {
  DisputeCase,
  EvidencePlan,
  EvidencePlanSchema,
  EvidenceRequirement,
  SpecialistContext,
} from "../../types/aiDispute";
import {
  getDisputeCodeInfo,
  detectNetworkFromCode,
  generateEvidenceRequirements,
  mapStripeReasonToCode,
  CardNetwork,
} from "../../config/disputeCodeMapping";
import { callLLM } from "./llmService";

// ============================================================
// Evidence Planner
// Generates AI-powered evidence plans for disputes
// Enhanced with specialist context for better plans
// ============================================================

/**
 * Resolve dispute code info from a dispute case.
 * Centralised so the orchestrator can call once and share with all specialists.
 */
export function resolveDisputeCode(disputeCase: DisputeCase): {
  reasonCode: string | null;
  network: CardNetwork;
  codeInfo: ReturnType<typeof getDisputeCodeInfo>;
} {
  let reasonCode = disputeCase.pspReasonCode || disputeCase.reason || null;
  let network: CardNetwork = "unknown";

  if (reasonCode && disputeCase.pspProvider === "stripe") {
    const mappedCode = mapStripeReasonToCode(reasonCode);
    if (mappedCode) {
      reasonCode = mappedCode;
    }
  }

  if (reasonCode) {
    network = detectNetworkFromCode(reasonCode);
  }

  const codeInfo = reasonCode ? getDisputeCodeInfo(reasonCode) : null;

  return { reasonCode, network, codeInfo };
}

/**
 * Generate an evidence plan for a dispute
 * Always returns a plan - uses AI when available, falls back to rule-based otherwise
 * 
 * @param disputeCase - The dispute case data (expected to be PII-sanitized by orchestrator)
 * @param context - Optional specialist context (claim analysis, relevance scores, revision feedback)
 */
export async function generateEvidencePlan(
  disputeCase: DisputeCase,
  context?: SpecialistContext
): Promise<EvidencePlan | null> {
  // Use codeInfo from context if provided, otherwise resolve locally (backward compat)
  const resolved = context?.codeInfo
    ? { reasonCode: context.codeInfo.code, network: context.codeInfo.network, codeInfo: context.codeInfo }
    : resolveDisputeCode(disputeCase);

  const { reasonCode, network, codeInfo } = resolved;

  // Extract hasFolio from context
  const hasFolio = context?.hasFolio || false;

  // Try AI-powered plan generation first
  try {
    // Build the prompt for the LLM (now with specialist context)
    // NOTE: disputeCase is expected to already be PII-sanitized by the orchestrator
    const prompt = buildEvidencePlanPrompt(disputeCase, codeInfo, network, context);

    // Use enhanced system prompt if we have specialist context
    const systemPrompt = context?.claimAnalysis
      ? ENHANCED_EVIDENCE_PLANNER_SYSTEM_PROMPT
      : EVIDENCE_PLANNER_SYSTEM_PROMPT;

    // Call the LLM
    const result = await callLLM(prompt, EvidencePlanSchema, {
      systemPrompt,
      temperature: 0.2,
      maxTokens: 4096,
    });

    if (!result.success || !result.data) {
      console.warn("LLM call failed, using fallback plan:", result.error);
      // Fall back to code-based requirements
      return generateFallbackPlan(disputeCase, codeInfo, network, reasonCode, hasFolio);
    }

    // Merge AI-generated requirements with code-based requirements
    const plan = result.data;

    // Post-processing (folio dedup + code merge) is now done by the orchestrator
    // via applyFolioDedup and applyCodeBasedMerge, NOT here.
    // This keeps the planner's output "pure" for the quality checker to validate.

    const contextInfo = context?.claimAnalysis ? " (with specialist context)" : "";
    console.log(`AI-powered evidence plan generated successfully${contextInfo}`);
    return plan;
  } catch (error) {
    // Any error in AI generation should fall back to rule-based plan
    console.warn("Error in AI evidence planning, using fallback:", error);
    return generateFallbackPlan(disputeCase, codeInfo, network, reasonCode, hasFolio);
  }
}

// ============================================================
// Prompt Building
// ============================================================

const EVIDENCE_PLANNER_SYSTEM_PROMPT = `You are an expert hotel dispute analyst specializing in chargeback defense for the hospitality industry.

Your task is to analyze a hotel dispute case and generate an evidence plan that will help the hotel win the chargeback.

IMPORTANT GUIDELINES:
1. Always respond with valid JSON matching the required schema
2. Be specific to hotels - focus on PMS data, registration cards, folios, proof of stay, etc.
3. Consider the dispute reason when recommending evidence
4. Prioritize evidence that directly refutes the cardholder's claim
5. Be realistic about winnability based on the evidence available
6. For no-show/cancellation disputes, focus on policy disclosure and booking terms
7. For fraud disputes, focus on guest identification and proof of stay
8. For service quality disputes, focus on communications and what was promised vs delivered
9. Mark evidence as "required: true" for highly recommended items and "required: false" for helpful items
10. Hotels can still submit without all evidence, so guide them on priority rather than blocking them
11. For EACH evidence requirement, generate specific, actionable instructions that directly address the customer's claim
12. Instructions should include concrete steps (e.g., "Take a photo of...", "Export logs from...") with context from this dispute (room numbers, dates, guest names)
13. Instructions should clearly state what evidence refutes the customer's specific claim
14. **CRITICAL: If the prompt indicates a folio is already available, DO NOT request a "Reservation Folio" or "Folio" requirement. The folio already contains check-in/check-out dates, charges, and guest details. Skip basic "Check-in/Check-out Records" unless you need detailed timestamps or keycard access logs.**

EVIDENCE CATEGORIES:
- pms_data: Folios, registration cards, booking records
- policy: Cancellation policy, terms, refund policy
- proof_of_stay: Check-in/out logs, keycard access, housekeeping records
- communications: Guest emails, confirmations, support interactions
- payment_data: Authorization codes, AVS/CVV results, 3D Secure
- incident_reports: Damage reports, complaints, incident logs
- delivery: Shipping/tracking (rarely used in hotels)
- other: Any miscellaneous evidence

WINNABILITY ASSESSMENT:
- high: Strong evidence available, guest likely stayed/benefited
- medium: Some evidence available, outcome uncertain
- low: Limited evidence, cardholder claim appears valid

RECOMMENDATION:
- fight: Evidence supports the hotel's case
- accept: Evidence is insufficient or cardholder claim appears valid`;

// Enhanced system prompt when specialist context is available
const ENHANCED_EVIDENCE_PLANNER_SYSTEM_PROMPT = `You are an expert hotel dispute analyst specializing in chargeback defense for the hospitality industry.

You have been provided with SPECIALIST ANALYSIS that you MUST use to create a targeted evidence plan:
- CLAIM ANALYSIS: Deep understanding of the customer's arguments and what needs to be disproven
- EVIDENCE RELEVANCE SCORES: Which evidence types will be most impactful for this specific dispute

## YOUR PRIMARY GOAL

Create an evidence plan that DIRECTLY ADDRESSES each customer argument. Every requirement should either:
1. Disprove a specific customer claim
2. Support the hotel's position with strong evidence
3. Provide necessary context for the dispute

## USING THE SPECIALIST ANALYSIS

### Claim Analysis
- Each customer argument MUST be addressed by at least one evidence requirement
- Focus on the "requiredDisproofs" - these tell you exactly what evidence is needed
- Use the "weakPoints" to prioritize evidence that exploits gaps in the customer's story

### Relevance Scores
- Prioritize evidence types with high relevance scores (70+)
- Evidence marked as "directly disproves" should be marked as required
- Don't waste time on low-relevance evidence unless it supports a key argument

## REVISION HANDLING

If you receive REVISION FEEDBACK, you MUST:
1. Add any requirements listed in "requirementsToAdd"
2. Remove any requirements listed in "requirementsToRemove"
3. Adjust priorities as specified in "prioritiesToChange"
4. Ensure the revised plan addresses ALL issues mentioned

## OUTPUT REQUIREMENTS

1. Always respond with valid JSON matching the required schema
2. Include 3-6 evidence requirements, prioritized by relevance
3. Each requirement needs specific, actionable instructions
4. Mark critical evidence as priority 1 and required: true
5. The plan should give the hotel a clear path to winning
6. **CRITICAL: If the prompt indicates a folio is already available, DO NOT request a "Reservation Folio" or "Folio" requirement. The folio already contains check-in/check-out dates, charges, and guest details. Skip basic "Check-in/Check-out Records" unless you need detailed timestamps or keycard access logs.**

EVIDENCE CATEGORIES:
- pms_data: Folios, registration cards, booking records
- policy: Cancellation policy, terms, refund policy
- proof_of_stay: Check-in/out logs, keycard access, housekeeping records
- communications: Guest emails, confirmations, support interactions
- payment_data: Authorization codes, AVS/CVV results, 3D Secure
- incident_reports: Damage reports, complaints, incident logs
- delivery: Shipping/tracking (rarely used in hotels)
- other: Any miscellaneous evidence`;

function buildEvidencePlanPrompt(
  disputeCase: DisputeCase,
  codeInfo: ReturnType<typeof getDisputeCodeInfo>,
  network: CardNetwork,
  context?: SpecialistContext
): string {
  const parts: string[] = [];

  parts.push("# Hotel Dispute Case Analysis\n");

  // Add prominent folio availability notice at the top if folio is available
  if (context?.hasFolio) {
    parts.push("## ⚠️ CRITICAL: FOLIO ALREADY AVAILABLE\n");
    parts.push("**A folio document is already available for this dispute.**");
    parts.push("");
    parts.push("The folio contains:");
    parts.push("- Check-in and check-out dates");
    parts.push("- Room charges, taxes, and incidentals");
    parts.push("- Guest name and booking details");
    parts.push("- Payment information");
    parts.push("");
    parts.push("**YOU MUST NOT REQUEST:**");
    parts.push("- ❌ 'Reservation Folio' or 'Folio' requirement");
    parts.push("- ❌ Basic 'Check-in/Check-out Records' (unless you need detailed timestamps)");
    parts.push("");
    parts.push("**YOU SHOULD STILL REQUEST:**");
    parts.push("- ✅ Signed Registration Card (separate document with signature)");
    parts.push("- ✅ Cancellation/Refund Policies (policy documents)");
    parts.push("- ✅ Guest Communications (emails, confirmations)");
    parts.push("- ✅ Keycard Access Logs (separate system, provides additional proof)");
    parts.push("- ✅ Payment Authorization Records (technical payment data)");
    parts.push("");
    parts.push("Focus on evidence that complements the folio, not duplicates it.\n");
    parts.push("---\n");
  }

  // Include specialist context if available
  if (context?.claimAnalysis || context?.relevanceScores || context?.revisionFeedback) {
    parts.push("## 🎯 SPECIALIST ANALYSIS (USE THIS TO GUIDE YOUR PLAN)\n");

    // Claim Analysis
    if (context.claimAnalysis) {
      parts.push("### Claim Analysis");
      parts.push(`**Claim Type**: ${context.claimAnalysis.claimType}`);
      parts.push("");

      parts.push("**Customer Arguments** (You MUST address each of these):");
      for (const arg of context.claimAnalysis.customerArguments) {
        parts.push(`- ${arg}`);
      }
      parts.push("");

      parts.push("**Required Disproofs** (Evidence needed to counter each argument):");
      for (const disproof of context.claimAnalysis.requiredDisproofs) {
        parts.push(`- ${disproof}`);
      }
      parts.push("");

      if (context.claimAnalysis.weakPoints.length > 0) {
        parts.push("**Weak Points in Customer's Claim** (Exploit these):");
        for (const weak of context.claimAnalysis.weakPoints) {
          parts.push(`- ${weak}`);
        }
        parts.push("");
      }

      if (context.claimAnalysis.suggestedCounterarguments.length > 0) {
        parts.push("**Suggested Counterarguments**:");
        for (const counter of context.claimAnalysis.suggestedCounterarguments) {
          parts.push(`- ${counter}`);
        }
        parts.push("");
      }
    }

    // Relevance Scores
    if (context.relevanceScores) {
      parts.push("### Evidence Relevance Scores");
      parts.push("**Top Priority Evidence** (Include these in your plan):");
      for (const evidence of context.relevanceScores.topPriorityEvidence) {
        const score = context.relevanceScores.scores.find(s => s.evidenceType === evidence);
        if (score) {
          parts.push(`- ${evidence}: ${score.relevanceScore}/100 - ${score.reasoning}`);
          if (score.directlyDisproves) {
            parts.push(`  → Directly disproves: "${score.directlyDisproves}"`);
          }
        }
      }
      parts.push("");

      if (context.relevanceScores.lowValueEvidence.length > 0) {
        parts.push("**Low Value Evidence** (Skip these unless necessary):");
        parts.push(context.relevanceScores.lowValueEvidence.join(", "));
        parts.push("");
      }
    }

    // Revision Feedback
    if (context.revisionFeedback) {
      parts.push("### ⚠️ REVISION REQUIRED");
      parts.push("The previous plan had issues. You MUST address these:");
      parts.push("");

      if (context.revisionFeedback.overallAssessment) {
        parts.push(`**Assessment**: ${context.revisionFeedback.overallAssessment}`);
        parts.push("");
      }

      if (context.revisionFeedback.previousScore !== undefined) {
        parts.push(`**Previous Score**: ${context.revisionFeedback.previousScore}/100`);
        parts.push("");
      }

      if (context.revisionFeedback.requirementsToAdd.length > 0) {
        parts.push("**Requirements to ADD**:");
        for (const req of context.revisionFeedback.requirementsToAdd) {
          parts.push(`- ${req.label} (${req.category}, priority ${req.priority}): ${req.description}`);
        }
        parts.push("");
      }

      if (context.revisionFeedback.requirementsToRemove.length > 0) {
        parts.push("**Requirements to REMOVE**:");
        parts.push(context.revisionFeedback.requirementsToRemove.join(", "));
        parts.push("");
      }

      if (context.revisionFeedback.prioritiesToChange.length > 0) {
        parts.push("**Priority Changes**:");
        for (const change of context.revisionFeedback.prioritiesToChange) {
          parts.push(`- ${change.id} → priority ${change.newPriority}`);
        }
        parts.push("");
      }

      if (context.revisionFeedback.unaddressedArguments && context.revisionFeedback.unaddressedArguments.length > 0) {
        parts.push("**Unaddressed Customer Arguments** (MUST be covered in revision):");
        for (const ua of context.revisionFeedback.unaddressedArguments) {
          parts.push(`- [${ua.severity}] "${ua.argument}" → suggested: ${ua.suggestedEvidence}`);
        }
        parts.push("");
      }

      if (context.revisionFeedback.specificGuidance) {
        parts.push(`**Guidance**: ${context.revisionFeedback.specificGuidance}`);
        parts.push("");
      }
    }

    // Full existing evidence analysis
    if (context.existingEvidence) {
      const ee = context.existingEvidence;
      if (ee.availableDocuments.length > 0) {
        parts.push("### Existing Hotel Documents");
        parts.push("The hotel already has these documents on file:");
        for (const doc of ee.availableDocuments) {
          const relevance = doc.relevantForDispute ? "✅ RELEVANT" : "⬜ not relevant";
          parts.push(`- ${doc.name} (${doc.category}) — ${relevance}`);
        }
        parts.push("");
      }

      if (ee.extractedPolicies.length > 0) {
        parts.push("### Extracted Policies");
        for (const policy of ee.extractedPolicies) {
          parts.push(`- **${policy.type}**: ${policy.summary}`);
        }
        parts.push("");
      }

      if (ee.missingDocuments.length > 0) {
        parts.push("### Missing Documents (hotel should obtain)");
        for (const missing of ee.missingDocuments) {
          parts.push(`- ${missing}`);
        }
        parts.push("");
      }

      if (ee.argumentCoverage && ee.argumentCoverage.length > 0) {
        parts.push("### Argument Coverage Gaps");
        for (const cov of ee.argumentCoverage) {
          const covered = cov.coveredBy && cov.coveredBy.length > 0
            ? `covered by: ${cov.coveredBy.join(", ")}`
            : "NOT COVERED";
          parts.push(`- "${cov.customerArgument}" — ${covered}${cov.gapDescription ? ` | Gap: ${cov.gapDescription} (${cov.gapSeverity})` : ""}`);
        }
        parts.push("");
      }
    }

    // Strategy context
    if (context.strategy) {
      parts.push("### Dispute Strategy");
      parts.push(`**Recommendation**: ${context.strategy.recommendation} (confidence: ${context.strategy.confidence}%)`);
      parts.push(`**Primary Defense**: ${context.strategy.primaryDefense}`);
      parts.push("");

      if (context.strategy.defensePoints.length > 0) {
        parts.push("**Defense Points**:");
        for (const dp of context.strategy.defensePoints) {
          parts.push(`- ${dp.point} (addresses: ${dp.addressesClaim})`);
          if (dp.supportingEvidence.length > 0) {
            parts.push(`  Evidence: ${dp.supportingEvidence.join(", ")}`);
          }
        }
        parts.push("");
      }

      if (context.strategy.evidencePriority.length > 0) {
        parts.push("**Evidence Priority Order**:");
        for (const ep of context.strategy.evidencePriority) {
          const status = ep.alreadyAvailable ? "✅ available" : ep.mustGather ? "⚠️ MUST GATHER" : "optional";
          parts.push(`- ${ep.evidenceType}: ${ep.reason} [${status}]`);
        }
        parts.push("");
      }

      if (context.strategy.knownWeaknesses.length > 0) {
        parts.push("**Known Weaknesses**:");
        for (const w of context.strategy.knownWeaknesses) {
          parts.push(`- ${w}`);
        }
        parts.push("");
      }

      parts.push(`**Approach**: ${context.strategy.approachNotes}`);
      parts.push("");
    }

    parts.push("---\n");
  }

  // Dispute overview
  parts.push("## Dispute Details");
  parts.push(`- **Amount**: ${disputeCase.currency} ${(disputeCase.amount / 100).toFixed(2)}`);
  parts.push(`- **Reason**: ${disputeCase.reason || "Not specified"}`);
  parts.push(`- **PSP**: ${disputeCase.pspProvider}`);
  if (disputeCase.transactionDate) {
    parts.push(`- **Transaction Date**: ${disputeCase.transactionDate}`);
  }
  if (disputeCase.respondByDate) {
    parts.push(`- **Respond By**: ${disputeCase.respondByDate}`);

    // Deadline awareness
    try {
      const deadline = new Date(disputeCase.respondByDate);
      const hoursRemaining = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursRemaining < 48) {
        parts.push("");
        parts.push("## ⏰ URGENT DEADLINE");
        if (hoursRemaining < 24) {
          parts.push(`**CRITICAL: Only ~${Math.max(1, Math.round(hoursRemaining))} hours remaining.**`);
          parts.push("Limit to 3-4 requirements. Focus ONLY on the most critical, easy-to-obtain evidence.");
          parts.push("Prioritize documents already on file and evidence that can be gathered immediately.");
        } else {
          parts.push(`**WARNING: Only ~${Math.round(hoursRemaining)} hours remaining.**`);
          parts.push("Keep requirements focused. Prioritize high-impact, readily available evidence.");
        }
      }
    } catch { /* invalid date, skip */ }
  }
  parts.push("");

  // Customer explanation
  if (disputeCase.customerExplanation) {
    parts.push("## Customer's Claim");
    parts.push(`"${disputeCase.customerExplanation}"`);
    parts.push("");
  }

  // Code info if available
  if (codeInfo) {
    parts.push("## Dispute Code Analysis");
    parts.push(`- **Code**: ${codeInfo.code} (${codeInfo.network.toUpperCase()})`);
    parts.push(`- **Category**: ${codeInfo.category}`);
    if (codeInfo.subcategory) {
      parts.push(`- **Subcategory**: ${codeInfo.subcategory}`);
    }
    parts.push(`- **Description**: ${codeInfo.description}`);
    parts.push(`- **Hotel Relevance**: ${codeInfo.hotelRelevance}`);
    parts.push(`- **Default Recommendation**: ${codeInfo.defaultRecommendation}`);
    parts.push(`- **Required Evidence Categories**: ${codeInfo.requiredEvidence.join(", ")}`);
    parts.push("");
  }

  // Hotel profile
  if (disputeCase.hotelProfile) {
    parts.push("## Hotel Information");
    parts.push(`- **Name**: ${disputeCase.hotelProfile.name}`);
    parts.push(`- **Location**: ${disputeCase.hotelProfile.location}`);
    if (disputeCase.hotelProfile.policies) {
      parts.push("- **Policies on File**:");
      if (disputeCase.hotelProfile.policies.cancellation) {
        parts.push(`  - Cancellation: ${disputeCase.hotelProfile.policies.cancellation}`);
      }
      if (disputeCase.hotelProfile.policies.refund) {
        parts.push(`  - Refund: ${disputeCase.hotelProfile.policies.refund}`);
      }
      if (disputeCase.hotelProfile.policies.noShow) {
        parts.push(`  - No-Show: ${disputeCase.hotelProfile.policies.noShow}`);
      }
    }
    parts.push("");
  }

  // Booking data
  if (disputeCase.booking) {
    parts.push("## Booking Information (from PMS)");
    if (disputeCase.booking.checkIn) {
      parts.push(`- **Check-in**: ${disputeCase.booking.checkIn}`);
    }
    if (disputeCase.booking.checkOut) {
      parts.push(`- **Check-out**: ${disputeCase.booking.checkOut}`);
    }
    if (disputeCase.booking.roomNumber) {
      parts.push(`- **Room**: ${disputeCase.booking.roomNumber}`);
    }
    if (disputeCase.booking.roomType) {
      parts.push(`- **Room Type**: ${disputeCase.booking.roomType}`);
    }
    if (disputeCase.booking.ratePlan) {
      parts.push(`- **Rate Plan**: ${disputeCase.booking.ratePlan}`);
    }
    if (disputeCase.booking.totalAmount) {
      parts.push(
        `- **Total**: ${disputeCase.booking.currency || disputeCase.currency} ${(
          disputeCase.booking.totalAmount / 100
        ).toFixed(2)}`
      );
    }
    if (disputeCase.booking.status) {
      parts.push(`- **Status**: ${disputeCase.booking.status}`);
    }
    if (disputeCase.booking.guestName) {
      parts.push(`- **Guest Name**: ${disputeCase.booking.guestName}`);
    }
    parts.push("");
  } else {
    parts.push("## Booking Information");
    parts.push("*No booking data linked to this dispute*");
    parts.push("");
  }

  // Guest data
  if (disputeCase.guest) {
    parts.push("## Guest Information (from PMS)");
    if (disputeCase.guest.firstName || disputeCase.guest.lastName) {
      parts.push(
        `- **Name**: ${disputeCase.guest.firstName || ""} ${disputeCase.guest.lastName || ""}`
      );
    }
    if (disputeCase.guest.email) {
      parts.push(`- **Email**: ${disputeCase.guest.email}`);
    }
    if (disputeCase.guest.phone) {
      parts.push(`- **Phone**: ${disputeCase.guest.phone}`);
    }
    parts.push("");
  }

  // Payment data
  if (disputeCase.paymentData) {
    parts.push("## Payment Verification");
    if (disputeCase.paymentData.last4) {
      parts.push(`- **Card Last 4**: ${disputeCase.paymentData.last4}`);
    }
    if (disputeCase.paymentData.authCode) {
      parts.push(`- **Auth Code**: ${disputeCase.paymentData.authCode}`);
    }
    if (disputeCase.paymentData.avsMatch !== undefined) {
      parts.push(`- **AVS Match**: ${disputeCase.paymentData.avsMatch ? "Yes" : "No"}`);
    }
    if (disputeCase.paymentData.cvvMatch !== undefined) {
      parts.push(`- **CVV Match**: ${disputeCase.paymentData.cvvMatch ? "Yes" : "No"}`);
    }
    if (disputeCase.paymentData.threeDSecure !== undefined) {
      parts.push(`- **3D Secure**: ${disputeCase.paymentData.threeDSecure ? "Yes" : "No"}`);
    }
    parts.push("");
  }

  // Instructions with explicit JSON structure
  parts.push("## Your Task");
  parts.push("Generate an evidence plan for this hotel dispute.");
  parts.push("");
  parts.push("## Instructions for Evidence Requirements");
  parts.push("For EACH evidence requirement, you MUST include an 'instructions' field with:");
  parts.push("- Specific, actionable steps (e.g., 'Take a photo of...', 'Export logs from...')");
  parts.push("- Context from this dispute (room numbers, dates, guest names)");
  parts.push("- What to capture/show that directly refutes the customer's claim");
  parts.push("- Format: Clear, numbered steps or bullet points");
  parts.push("");
  parts.push("Example: If customer claims 'bed was single', instructions should be:");
  parts.push('"Take a photo of the bed in Room [roomNumber] showing it is a [actualBedType].');
  parts.push('Include the room number visible in the photo. If possible, show the room type');
  parts.push('from the booking confirmation to prove the room type matches what was reserved."');
  parts.push("");
  parts.push("You MUST respond with a JSON object in exactly this format:");
  parts.push("```json");
  parts.push("{");
  parts.push('  "disputeCategory": "string (e.g., Consumer Dispute, Fraud, Authorization)",');
  parts.push('  "disputeSubtype": "string (e.g., Service Not Received, Cancellation)",');
  parts.push('  "recommendation": "fight" or "accept",');
  parts.push('  "winnability": "high" or "medium" or "low",');
  parts.push('  "winnabilityReason": "string explaining why",');
  parts.push('  "summary": "string summary for hotel staff",');
  parts.push('  "requirements": [');
  parts.push("    {");
  parts.push('      "id": "req-1",');
  parts.push('      "category": "pms_data" or "policy" or "proof_of_stay" or "communications" or "payment_data" or "incident_reports" or "delivery" or "other",');
  parts.push('      "label": "short name",');
  parts.push('      "tag": "structured_identifier (see TAG RULES below)",');
  parts.push('      "description": "what to provide",');
  parts.push('      "example": "example of good evidence",');
  parts.push('      "sourceHint": "where to find it",');
  parts.push('      "instructions": "Step-by-step guidance specific to this dispute",');
  parts.push('      "required": true or false,');
  parts.push('      "priority": 1-5');
  parts.push("    }");
  parts.push("  ]");
  parts.push("}");
  parts.push("```");
  parts.push("");
  parts.push("## TAG RULES");
  parts.push("Each requirement MUST include a `tag` field with one of these identifiers:");
  parts.push("- folio, registration_card, cancellation_policy, refund_policy, terms_of_service");
  parts.push("- booking_confirmation, checkin_checkout_records, keycard_logs, housekeeping_records");
  parts.push("- guest_communications, 3d_secure_records, avs_cvv_records, authorization_records");
  parts.push("- id_verification, signed_agreements, incident_report, damage_report, other");
  parts.push("Use the tag that best matches the evidence type. Tags are used for deduplication.");
  parts.push("");
  parts.push("Include 3-6 evidence requirements based on the dispute type.");

  return parts.join("\n");
}

// ============================================================
// Fallback Plan Generation
// ============================================================

/**
 * Generate a fallback plan when LLM fails
 */
function generateFallbackPlan(
  disputeCase: DisputeCase,
  codeInfo: ReturnType<typeof getDisputeCodeInfo>,
  network: CardNetwork,
  reasonCode: string | null,
  hasFolio: boolean = false
): EvidencePlan {
  let requirements: EvidenceRequirement[] = [];
  let category = "Consumer Dispute";
  let subtype = "General";
  let recommendation: "fight" | "accept" = "fight";
  let winnability: "high" | "medium" | "low" = "medium";
  let winnabilityReason = "Unable to assess - please review manually";
  let summary = "An evidence plan has been generated based on the dispute type.";

  if (codeInfo) {
    category = codeInfo.category;
    subtype = codeInfo.subcategory || "General";
    recommendation = codeInfo.defaultRecommendation === "accept" ? "accept" : "fight";
    winnability = codeInfo.defaultWinnability;
    winnabilityReason = `Based on dispute code ${codeInfo.code} (${codeInfo.description})`;
    summary = `This is a ${codeInfo.category} dispute (${codeInfo.code}). ${codeInfo.description}`;

    // Generate requirements from code info
    requirements = generateEvidenceRequirements(codeInfo, {
      hasBooking: !!disputeCase.booking,
      hasGuest: !!disputeCase.guest,
      hasPolicies: !!disputeCase.hotelProfile?.policies,
      hasFolio: hasFolio,
    });
  } else {
    // Default requirements for unknown dispute types
    requirements = getDefaultHotelRequirements(disputeCase, hasFolio);
    summary = `Dispute for ${disputeCase.currency} ${(disputeCase.amount / 100).toFixed(2)}. Reason: ${disputeCase.reason || "Not specified"}.`;
  }

  // Adjust based on booking data availability
  if (disputeCase.booking) {
    winnabilityReason += ". Booking data is available from PMS.";
    if (winnability === "low") winnability = "medium";
  } else {
    winnabilityReason += ". No booking data linked - manual matching may be needed.";
    if (winnability === "high") winnability = "medium";
  }

  return {
    disputeCategory: category,
    disputeSubtype: subtype,
    recommendation,
    winnability,
    winnabilityReason,
    summary,
    requirements,
    generatedAt: new Date().toISOString(),
    reasonCode: reasonCode || undefined,
    network,
  };
}

/**
 * Get default requirements for unknown dispute types
 */
function getDefaultHotelRequirements(disputeCase: DisputeCase, hasFolio: boolean = false): EvidenceRequirement[] {
  const requirements: EvidenceRequirement[] = [];
  let id = 1;

  // Always add folio requirement - if available, it will be marked as uploaded
  requirements.push({
    id: `req-${id++}`,
    category: "pms_data",
    label: "Reservation Folio",
    description: hasFolio
      ? "Complete folio showing all charges, dates, and guest details (already available from booking)"
      : "Complete folio showing all charges, dates, and guest details",
    example: "Folio export from PMS with room charges and payment details",
    sourceHint: hasFolio ? "Available from booking" : "Export from PMS (Mews, Opera, etc.)",
    instructions: hasFolio
      ? "The folio is already available from the booking. No action needed."
      : "Export the complete reservation folio from your PMS system. Include all pages showing room charges, dates, guest name, and payment details. Ensure the folio clearly shows the check-in and check-out dates and total amount charged.",
    required: true,
    priority: 1,
  });

  // Registration card
  requirements.push({
    id: `req-${id++}`,
    category: "pms_data",
    label: "Signed Registration Card",
    description: "Registration card with guest signature",
    example: "Signed card showing guest acknowledged terms",
    sourceHint: "Front desk / PMS attachments",
    instructions: "Locate the signed registration card from the guest's stay. The card should show the guest's signature acknowledging the hotel policies and stay details. Scan or photograph the card clearly showing the signature and date.",
    required: true,
    priority: 1,
  });

  // Cancellation policy if relevant
  if (
    disputeCase.reason?.includes("cancel") ||
    disputeCase.customerExplanation?.toLowerCase().includes("cancel")
  ) {
    requirements.push({
      id: `req-${id++}`,
      category: "policy",
      label: "Cancellation Policy",
      description: "Your cancellation policy as shown to the guest",
      example: "Policy stating 48-hour notice required",
      sourceHint: "Website / Booking engine",
      instructions: "Screenshot or export your hotel's cancellation policy as it appeared to the guest at the time of booking. Include the policy text from your website or booking engine. Ensure the policy clearly states the cancellation terms.",
      required: true,
      priority: 1,
    });
  }

  // Only ask for basic check-in/check-out records if folio is not available
  // (Folio already contains check-in/check-out dates)
  if (!hasFolio) {
    requirements.push({
      id: `req-${id++}`,
      category: "proof_of_stay",
      label: "Check-in/Check-out Records",
      description: "System logs showing guest arrival and departure",
      example: "PMS log showing check-in at 3:15 PM",
      sourceHint: "PMS activity logs",
      instructions: "Export check-in and check-out logs from your PMS system for the guest's stay dates. Include timestamps showing when the guest checked in and checked out. If available, also export any activity logs showing room access during the stay.",
      required: true,
      priority: 2,
    });
  }

  // Communications
  requirements.push({
    id: `req-${id++}`,
    category: "communications",
    label: "Booking Confirmation",
    description: "Confirmation email sent to guest",
    example: "Email confirming reservation details and policies",
    sourceHint: "Email system / Booking engine",
    instructions: "Export the booking confirmation email that was sent to the guest. This should show the reservation dates, room type, rate details, and any policies that were disclosed. Include the email headers showing when it was sent.",
    required: false,
    priority: 3,
  });

  // Authorization if fraud-related
  if (
    disputeCase.reason?.includes("fraud") ||
    disputeCase.reason?.includes("unauthorized")
  ) {
    requirements.push({
      id: `req-${id++}`,
      category: "payment_data",
      label: "Authorization Records",
      description: "Proof of valid authorization for the charge",
      example: "Auth code and approval timestamp",
      sourceHint: "Payment gateway / Processor",
      instructions: "Export authorization records from your payment gateway or processor portal. Include the authorization code, timestamp, amount authorized, and approval status. This proves the transaction was properly authorized before processing.",
      required: true,
      priority: 1,
    });
  }

  return requirements;
}

// ============================================================
// Requirement Merging (exported for use by orchestrator)
// ============================================================

/**
 * Key terms used for fuzzy label comparison.
 * Two labels are "similar" if they share the same category AND at least one key term.
 */
const LABEL_KEY_TERMS = [
  "folio", "registration", "cancellation", "refund", "terms",
  "check-in", "check-out", "checkin", "checkout", "keycard",
  "key card", "housekeeping", "authorization", "avs", "cvv",
  "3d secure", "booking confirmation", "communication", "email",
  "incident", "damage", "id verification", "signature",
];

/**
 * Check whether two labels are semantically similar enough to be considered duplicates.
 */
export function areLabelsSimilar(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();

  // Exact match after normalisation
  if (la === lb) return true;

  // Check if they share at least one key term
  for (const term of LABEL_KEY_TERMS) {
    if (la.includes(term) && lb.includes(term)) return true;
  }

  return false;
}

/**
 * Merge AI-generated requirements with code-based requirements.
 * Uses label-level similarity instead of category-level blocking so that, e.g.,
 * a "Cancellation Policy" from AI doesn't block a "Refund Policy" from code.
 */
export function mergeRequirements(
  aiRequirements: EvidenceRequirement[],
  codeRequirements: EvidenceRequirement[]
): EvidenceRequirement[] {
  const merged = [...aiRequirements];

  for (const req of codeRequirements) {
    // Skip only if there's already a requirement with the same category AND similar label
    const hasSimilar = aiRequirements.some(
      (ai) => ai.category === req.category && areLabelsSimilar(ai.label, req.label)
    );

    if (!hasSimilar && req.required) {
      merged.push({
        ...req,
        id: `req-merged-${merged.length + 1}`,
      });
    }
  }

  // Re-sort by priority
  merged.sort((a, b) => a.priority - b.priority);

  return merged;
}

// ============================================================
// Post-Processing Utilities (called by orchestrator)
// ============================================================

/**
 * Check if a requirement is a folio requirement using tag first, then label fallback.
 */
function isFolioRequirement(req: EvidenceRequirement): boolean {
  if (req.tag === "folio") return true;
  return (
    req.category === "pms_data" &&
    (req.label.toLowerCase().includes("folio") ||
     req.label.toLowerCase().includes("reservation folio"))
  );
}

/**
 * Check if a requirement is a basic check-in/check-out record (redundant when folio exists).
 */
function isBasicCheckinCheckout(req: EvidenceRequirement): boolean {
  if (req.tag === "checkin_checkout_records") return true;
  return (
    req.category === "proof_of_stay" &&
    (req.label.toLowerCase().includes("check-in/check-out") ||
     req.label.toLowerCase().includes("check-in and check-out")) &&
    !req.label.toLowerCase().includes("keycard") &&
    !req.label.toLowerCase().includes("timestamp")
  );
}

/**
 * Apply folio-aware deduplication to an evidence plan.
 * If folio is available: ensure folio req exists, remove redundant check-in/out.
 */
export function applyFolioDedup(plan: EvidencePlan, hasFolio: boolean): EvidencePlan {
  if (!hasFolio) return plan;

  const requirements = [...plan.requirements];

  // Ensure a folio requirement exists
  const hasFolioReq = requirements.some(isFolioRequirement);
  if (!hasFolioReq) {
    requirements.unshift({
      id: `req-folio-${Date.now()}`,
      category: "pms_data",
      tag: "folio",
      label: "Reservation Folio",
      description: "Complete folio showing all charges, room type, dates, and guest details (already available from booking)",
      example: "Folio from booking showing check-in/check-out dates and charges",
      sourceHint: "Available from booking",
      instructions: "The folio is already available from the booking. No action needed.",
      required: true,
      priority: 1,
    });
    console.log("[PostProcess] Added folio requirement (folio is available)");
  }

  // Remove basic check-in/check-out records (folio covers these)
  const filtered = requirements.filter((req) => {
    if (isBasicCheckinCheckout(req)) {
      console.log(`[PostProcess] Filtered redundant check-in/out: ${req.label}`);
      return false;
    }
    return true;
  });

  return { ...plan, requirements: filtered };
}

/**
 * Apply code-based requirement merge to an evidence plan.
 */
export function applyCodeBasedMerge(
  plan: EvidencePlan,
  codeInfo: ReturnType<typeof getDisputeCodeInfo>,
  disputeCase: DisputeCase,
  hasFolio: boolean
): EvidencePlan {
  if (!codeInfo) return plan;

  const codeRequirements = generateEvidenceRequirements(codeInfo, {
    hasBooking: !!disputeCase.booking,
    hasGuest: !!disputeCase.guest,
    hasPolicies: !!disputeCase.hotelProfile?.policies,
    hasFolio,
  });

  const merged = mergeRequirements(plan.requirements, codeRequirements);
  return { ...plan, requirements: merged };
}

