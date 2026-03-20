import {
  DisputeCase,
  EvidencePlan,
  EvidenceItem,
  DisputeArgument,
  DisputeArgumentSchema,
} from "../../types/aiDispute";
import { callLLMWithVision, ImageInput } from "./llmService";
import { 
  getEnrichedEvidence, 
  EnrichedEvidence,
  StripeEvidenceField,
  STRIPE_FIELD_DESCRIPTIONS,
} from "../evidenceService";
import { 
  sanitizeDisputeCaseWithLog, 
  sanitizePdfContent 
} from "../../utils/piiSanitizer";

// ============================================================
// Argument Generator
// Generates AI-powered dispute arguments for submission
// Uses GPT-5.2 vision to analyze actual evidence documents
// ============================================================

/**
 * Generate a dispute argument from case data and evidence
 * Now uses GPT-5.2 vision to read and analyze uploaded evidence files
 * 
 * @param disputeCase - The dispute case data
 * @param evidencePlan - The generated evidence plan
 * @param evidenceItems - Evidence item statuses
 * @param disputeId - The dispute ID (needed to fetch actual evidence files)
 */
export async function generateDisputeArgument(
  disputeCase: DisputeCase,
  evidencePlan: EvidencePlan,
  evidenceItems: EvidenceItem[],
  disputeId: string
): Promise<DisputeArgument | null> {
  try {
    // Fetch enriched evidence with full context
    const enrichedEvidence = await getEnrichedEvidence(disputeId, evidencePlan, evidenceItems);
    
    // Separate uploaded evidence with images for vision API
    const evidenceWithImages = enrichedEvidence.filter(e => e.imageUrl && e.item.status === 'uploaded');
    
    console.log(`[ArgumentGenerator] ${enrichedEvidence.length} total evidence items`);
    console.log(`[ArgumentGenerator] ${evidenceWithImages.length} with images for vision`);
    console.log(`[ArgumentGenerator] ${enrichedEvidence.filter(e => e.pdfText).length} with PDF text`);

    // GDPR Compliance: Sanitize PII before sending to OpenAI
    const sanitizedCase = sanitizeDisputeCaseWithLog(disputeCase);
    
    // Sanitize PDF text content in enriched evidence
    const sanitizedEvidence = enrichedEvidence.map(e => ({
      ...e,
      pdfText: e.pdfText ? sanitizePdfContent(e.pdfText) : undefined,
    }));
    
    console.log(`[ArgumentGenerator] PII sanitization applied to dispute case and PDF content`);

    // Build image inputs for GPT-5.2 vision
    const imageInputs: ImageInput[] = evidenceWithImages.map(e => ({
      url: e.imageUrl!,
      description: `${e.requirement.label}: ${e.file?.fileName || 'Document'}`,
    }));

    // Build the comprehensive prompt with sanitized data
    // Uses sanitized case and evidence to prevent PII from being sent to third-party AI
    const prompt = buildArgumentPrompt(sanitizedCase, evidencePlan, sanitizedEvidence);

    // Call the LLM with vision capabilities
    const result = await callLLMWithVision(prompt, DisputeArgumentSchema, {
      systemPrompt: ARGUMENT_GENERATOR_SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 8192,
      images: imageInputs,
    });

    if (!result.success || !result.data) {
      console.error("LLM vision call failed for argument generation:", result.error);
      // Generate fallback argument
      return generateFallbackArgument(disputeCase, evidencePlan, evidenceItems);
    }

    // Add metadata
    const argument = result.data;
    
    // Log if LLM response included a model field
    if ((argument as any).model) {
      console.log(`WARNING: LLM response included model field: ${(argument as any).model} - removing it`);
    }
    
    // Explicitly remove any model field from LLM response to ensure we control it
    delete (argument as any).model;
    
    argument.generatedAt = new Date().toISOString();
    argument.model = "gpt-5.2";

    const uploadedCount = enrichedEvidence.filter(e => e.item.status === 'uploaded').length;
    console.log(`Argument generated successfully using GPT-5.2 with ${uploadedCount} evidence files`);
    console.log(`Set argument.model to: ${argument.model}`);
    return argument;
  } catch (error) {
    console.error("Error generating dispute argument:", error);
    return generateFallbackArgument(disputeCase, evidencePlan, evidenceItems);
  }
}

// ============================================================
// System Prompt
// ============================================================

const ARGUMENT_GENERATOR_SYSTEM_PROMPT = `You are an elite hotel dispute analyst who writes winning chargeback responses. Your arguments have a high success rate because you:

1. QUOTE SPECIFIC EVIDENCE - Never speak generically. Always cite exact text, dates, amounts from documents.
2. UNDERSTAND STRIPE'S REQUIREMENTS - You know which fields Stripe needs and fill them with compelling content.
3. ADDRESS CLAIMS DIRECTLY - You don't ignore the customer's claim; you systematically disprove it with evidence.

## YOUR ROLE

You receive:
- STRATEGIC ASSESSMENT: Winnability rating and recommended approach
- DISPUTE DETAILS: Amount, reason code, customer claim
- EVIDENCE ORGANIZED BY STRIPE FIELD: Each piece of evidence is labeled with its Stripe submission field
- PDF TEXT CONTENT: Full text extracted from uploaded PDFs - QUOTE FROM THESE
- ATTACHED IMAGES: Actual document images to analyze visually

## WRITING VOICE AND PERSPECTIVE

**CRITICAL**: Write ALL arguments from the hotel's perspective, as if you ARE the hotel staff writing the dispute response.

- Use first-person plural: "we", "our", "us" (referring to the hotel)
- NEVER refer to yourself as an AI, analyst, assistant, or any third party
- NEVER use phrases like "I analyzed", "I have determined", "As an AI", "The system", etc.
- Write as if the hotel staff wrote this directly: "We provided", "Our records show", "We respectfully contest"
- The argument should sound like it was written by hotel management, not by an external service
- Example: "We respectfully contest this dispute. Our registration records show the guest checked in on March 15th..." NOT "I have analyzed the evidence and determined that..."

## CRITICAL INSTRUCTIONS

### Evidence Usage
- PDF text is provided in full - EXTRACT AND QUOTE specific clauses, dates, signatures, amounts
- Images are attached - DESCRIBE what you see (signatures, dates, check-in times, room numbers)
- Link evidence to claims - "The guest claims X, but the registration card shows Y..."
- Prioritize CRITICAL/HIGH priority evidence in your argument

### Stripe Field Strategy
- cancellation_policy: QUOTE the exact policy text from uploaded documents
- cancellation_policy_disclosure: Explain how/when guest saw the policy
- refund_policy: QUOTE exact refund terms
- service_documentation: Reference folios, registration cards, check-in records
- customer_communication: Summarize emails/messages from evidence

### Argument Quality Standards
- Executive summary: 2-3 sentences with at least ONE specific evidence citation
- Timeline: Use ACTUAL dates from documents, not generic placeholders
- Paragraphs: Each section should QUOTE or reference specific evidence
- Rebuttal: Directly counter the customer's claim with contradicting evidence
- Stripe fields: Fill with ACTUAL content from documents, not placeholders

### Response Format
Respond ONLY with valid JSON. No markdown outside JSON. Include all required fields.

### Winning Strategies by Dispute Type
- "fraudulent": Focus on 3D Secure, AVS/CVV match, IP location, signed registration
- "product_not_received": Show check-in records, key card logs, housekeeping records
- "credit_not_processed": Show refund policy, why criteria not met, communications
- "general"/"other": Comprehensive evidence showing service was provided as agreed

Remember: Generic arguments lose. Specific, evidence-backed arguments WIN.`;

// ============================================================
// Prompt Building - Enhanced with Full Evidence Context
// ============================================================

function buildArgumentPrompt(
  disputeCase: DisputeCase,
  evidencePlan: EvidencePlan,
  enrichedEvidence: EnrichedEvidence[]
): string {
  const parts: string[] = [];

  parts.push("# DISPUTE ARGUMENT GENERATION");
  parts.push("");

  // ==========================================================
  // STRATEGIC ASSESSMENT (from evidence plan)
  // ==========================================================
  parts.push("## 🎯 STRATEGIC ASSESSMENT");
  parts.push("");
  parts.push(`**Winnability**: ${evidencePlan.winnability.toUpperCase()}`);
  parts.push(`**Recommendation**: ${evidencePlan.recommendation.toUpperCase()}`);
  parts.push(`**Reason**: ${evidencePlan.winnabilityReason}`);
  parts.push("");
  parts.push(`**Dispute Category**: ${evidencePlan.disputeCategory}${evidencePlan.disputeSubtype ? ` - ${evidencePlan.disputeSubtype}` : ''}`);
  parts.push(`**AI Summary**: ${evidencePlan.summary}`);
  parts.push("");

  // ==========================================================
  // DISPUTE DETAILS
  // ==========================================================
  parts.push("## 📋 DISPUTE DETAILS");
  parts.push("");
  parts.push(`- **Amount**: ${disputeCase.currency.toUpperCase()} ${(disputeCase.amount / 100).toFixed(2)}`);
  parts.push(`- **Reason Code**: ${disputeCase.reason || "Not specified"}`);
  parts.push(`- **PSP**: ${disputeCase.pspProvider}`);
  if (disputeCase.transactionDate) {
    parts.push(`- **Transaction Date**: ${disputeCase.transactionDate}`);
  }
  if (disputeCase.respondByDate) {
    parts.push(`- **Response Deadline**: ${disputeCase.respondByDate}`);
  }
  parts.push("");

  // Customer's claim
  if (disputeCase.customerExplanation) {
    parts.push("### Customer's Claim (Address This Directly)");
    parts.push(`> "${disputeCase.customerExplanation}"`);
    parts.push("");
  }

  // ==========================================================
  // HOTEL & BOOKING CONTEXT
  // ==========================================================
  parts.push("## 🏨 HOTEL & BOOKING CONTEXT");
  parts.push("");

  if (disputeCase.hotelProfile) {
    parts.push(`**Hotel**: ${disputeCase.hotelProfile.name}`);
    if (disputeCase.hotelProfile.location) {
      parts.push(`**Location**: ${disputeCase.hotelProfile.location}`);
    }
    parts.push("");
  }

  if (disputeCase.booking) {
    parts.push("### Reservation Details");
    if (disputeCase.booking.guestName) parts.push(`- Guest: ${disputeCase.booking.guestName}`);
    if (disputeCase.booking.checkIn) parts.push(`- Check-in: ${disputeCase.booking.checkIn}`);
    if (disputeCase.booking.checkOut) parts.push(`- Check-out: ${disputeCase.booking.checkOut}`);
    if (disputeCase.booking.roomNumber) parts.push(`- Room: ${disputeCase.booking.roomNumber}`);
    if (disputeCase.booking.roomType) parts.push(`- Room Type: ${disputeCase.booking.roomType}`);
    if (disputeCase.booking.status) parts.push(`- Status: ${disputeCase.booking.status}`);
    parts.push("");
  }

  if (disputeCase.guest) {
    const name = [disputeCase.guest.firstName, disputeCase.guest.lastName].filter(Boolean).join(" ");
    if (name || disputeCase.guest.email) {
      parts.push("### Guest Information");
      if (name) parts.push(`- Name: ${name}`);
      if (disputeCase.guest.email) parts.push(`- Email: ${disputeCase.guest.email}`);
      parts.push("");
    }
  }

  if (disputeCase.paymentData) {
    parts.push("### Payment Verification");
    if (disputeCase.paymentData.last4) parts.push(`- Card Last 4: ${disputeCase.paymentData.last4}`);
    if (disputeCase.paymentData.authCode) parts.push(`- Auth Code: ${disputeCase.paymentData.authCode}`);
    if (disputeCase.paymentData.avsMatch !== undefined) parts.push(`- AVS Match: ${disputeCase.paymentData.avsMatch ? "✓ Yes" : "✗ No"}`);
    if (disputeCase.paymentData.cvvMatch !== undefined) parts.push(`- CVV Match: ${disputeCase.paymentData.cvvMatch ? "✓ Yes" : "✗ No"}`);
    if (disputeCase.paymentData.threeDSecure !== undefined) parts.push(`- 3D Secure: ${disputeCase.paymentData.threeDSecure ? "✓ Yes" : "✗ No"}`);
    parts.push("");
  }

  // ==========================================================
  // EVIDENCE ANALYSIS (Organized by Stripe Fields)
  // ==========================================================
  parts.push("## 📁 EVIDENCE FOR YOUR ARGUMENT");
  parts.push("");
  parts.push("Below is ALL the evidence you have to work with. Each item is organized by its Stripe submission field.");
  parts.push("**USE THIS EVIDENCE**: Quote specific text, cite specific details, reference exact documents.");
  parts.push("");

  // Group evidence by Stripe field
  const evidenceByStripeField = new Map<StripeEvidenceField, EnrichedEvidence[]>();
  for (const e of enrichedEvidence) {
    const existing = evidenceByStripeField.get(e.stripeField) || [];
    existing.push(e);
    evidenceByStripeField.set(e.stripeField, existing);
  }

  // Output evidence grouped by Stripe field
  const stripeFieldOrder: StripeEvidenceField[] = [
    'cancellation_policy',
    'refund_policy',
    'service_documentation',
    'customer_communication',
    'receipt',
    'uncategorized_file',
    'uncategorized_text',
  ];

  for (const stripeField of stripeFieldOrder) {
    const evidenceForField = evidenceByStripeField.get(stripeField);
    if (!evidenceForField || evidenceForField.length === 0) continue;

    const fieldDesc = STRIPE_FIELD_DESCRIPTIONS[stripeField];
    parts.push(`### 📄 ${stripeField.toUpperCase()}`);
    parts.push(`*Stripe Field: ${stripeField} - ${fieldDesc}*`);
    parts.push("");

    for (const e of evidenceForField) {
      const statusIcon = e.item.status === 'uploaded' ? '✅' : 
                        e.item.status === 'not_available' ? '❌' : 
                        e.item.status === 'not_applicable' ? '⚪' : '⏳';
      
      parts.push(`#### ${statusIcon} ${e.requirement.label}`);
      parts.push(`- **Priority**: ${e.priorityLabel}${e.requirement.required ? ' (REQUIRED)' : ''}`);
      parts.push(`- **Why Needed**: ${e.requirement.description}`);
      
      if (e.requirement.instructions) {
        parts.push(`- **How To Use**: ${e.requirement.instructions}`);
      }
      
      parts.push(`- **Status**: ${e.item.status.toUpperCase()}`);
      
      if (e.item.status === 'uploaded') {
        if (e.file) {
          parts.push(`- **File**: ${e.file.fileName}`);
        }
        
        // If there's an image, note it
        if (e.imageUrl) {
          parts.push(`- **📷 IMAGE ATTACHED**: Analyze this image carefully and extract specific details`);
        }
        
        // If there's PDF text, include it
        if (e.pdfText) {
          parts.push(`- **📄 PDF CONTENT** (${e.pdfPageCount || 0} pages):`);
          parts.push("");
          parts.push("```");
          parts.push(e.pdfText);
          parts.push("```");
          parts.push("");
          parts.push(`**↑ QUOTE FROM THIS**: Extract specific clauses, dates, amounts, or terms to cite in your argument.`);
        }
      } else if (e.item.status === 'not_available' && e.item.notes) {
        parts.push(`- **Reason Not Available**: ${e.item.notes}`);
      }
      
      parts.push("");
    }
  }

  // ==========================================================
  // EVIDENCE SUMMARY
  // ==========================================================
  const uploadedEvidence = enrichedEvidence.filter(e => e.item.status === 'uploaded');
  const evidenceWithPDF = enrichedEvidence.filter(e => e.pdfText);
  const evidenceWithImages = enrichedEvidence.filter(e => e.imageUrl && e.item.status === 'uploaded');
  const missingEvidence = enrichedEvidence.filter(e => e.item.status === 'not_available');
  
  parts.push("## 📊 EVIDENCE SUMMARY");
  parts.push("");
  parts.push(`- **Total Evidence Items**: ${enrichedEvidence.length}`);
  parts.push(`- **Uploaded**: ${uploadedEvidence.length}`);
  parts.push(`- **With PDF Content**: ${evidenceWithPDF.length} (you can quote from these)`);
  parts.push(`- **With Images**: ${evidenceWithImages.length} (attached to this message)`);
  parts.push(`- **Not Available**: ${missingEvidence.length}`);
  parts.push("");

  if (missingEvidence.length > 0) {
    parts.push("### Missing Evidence (Work Around These)");
    for (const e of missingEvidence) {
      parts.push(`- ${e.requirement.label}: ${e.item.notes || 'Not provided'}`);
    }
    parts.push("");
  }

  // ==========================================================
  // INSTRUCTIONS
  // ==========================================================
  parts.push("## 🎯 YOUR TASK");
  parts.push("");
  parts.push("Generate a **compelling, evidence-backed dispute argument**. You MUST:");
  parts.push("");
  parts.push("1. **QUOTE SPECIFIC TEXT** from PDF documents (use exact phrases, dates, amounts)");
  parts.push("2. **REFERENCE SPECIFIC DETAILS** from images you're analyzing");
  parts.push("3. **ADDRESS THE CUSTOMER'S CLAIM** directly with evidence-backed rebuttals");
  parts.push("4. **USE STRIPE FIELD STRUCTURE** - your output maps to Stripe's evidence submission");
  parts.push("5. **PRIORITIZE CRITICAL EVIDENCE** - lead with your strongest proof");
  parts.push("");
  parts.push("Respond with JSON in exactly this format:");
  parts.push("```json");
  parts.push("{");
  parts.push('  "executiveSummary": "2-3 sentences citing KEY evidence (e.g., \\"The signed registration card from March 15th proves...\\")",');
  parts.push('  "timeline": [');
  parts.push('    {"date": "YYYY-MM-DD", "description": "Event with specific evidence reference"}');
  parts.push("  ],");
  parts.push('  "paragraphs": [');
  parts.push('    {"heading": "Section Title", "content": "Detailed argument QUOTING specific evidence"}');
  parts.push("  ],");
  parts.push('  "customerClaimRebuttal": "Direct response quoting evidence that disproves claim",');
  parts.push('  "conclusion": "Strong closing with evidence summary",');
  parts.push('  "uncategorizedText": "Complete argument text for Stripe (include all key evidence quotes)",');
  parts.push('  "productDescription": "Hotel accommodation services description",');
  parts.push('  "serviceDates": "Exact dates from evidence (e.g., \\"March 15-18, 2025\\")",');
  parts.push('  "cancellationPolicy": "QUOTE exact policy text from uploaded documents",');
  parts.push('  "cancellationPolicyDisclosure": "How/when policy was shown to guest",');
  parts.push('  "refundPolicy": "QUOTE exact refund policy text",');
  parts.push('  "refundPolicyDisclosure": "How/when refund policy was shown",');
  parts.push('  "refundRefusalExplanation": "Why refund denied, citing policy",');
  parts.push('  "customerCommunication": "Summary of guest communications from evidence"');
  parts.push("}");
  parts.push("```");
  parts.push("");
  parts.push("**BE SPECIFIC**: Instead of \"Our policy states...\" write \"Our Cancellation Policy document states: '[exact quote]'\"");

  return parts.join("\n");
}

// ============================================================
// Fallback Argument Generation
// ============================================================

function generateFallbackArgument(
  disputeCase: DisputeCase,
  evidencePlan: EvidencePlan,
  evidenceItems: EvidenceItem[]
): DisputeArgument {
  const hotelName = disputeCase.hotelProfile?.name || "Our hotel";
  const amount = `${disputeCase.currency.toUpperCase()} ${(disputeCase.amount / 100).toFixed(2)}`;
  const reason = disputeCase.reason || "the stated reason";

  // Build timeline
  const timeline: { date: string; description: string; evidenceId?: string }[] = [];
  
  if (disputeCase.transactionDate) {
    timeline.push({
      date: disputeCase.transactionDate,
      description: "Original transaction processed",
    });
  }
  
  if (disputeCase.booking?.checkIn) {
    timeline.push({
      date: disputeCase.booking.checkIn,
      description: "Guest check-in",
    });
  }
  
  if (disputeCase.booking?.checkOut) {
    timeline.push({
      date: disputeCase.booking.checkOut,
      description: "Guest check-out",
    });
  }

  // Build paragraphs
  const paragraphs: { heading: string; content: string; evidenceReferences?: string[] }[] = [];

  paragraphs.push({
    heading: "Transaction Overview",
    content: `This dispute relates to a charge of ${amount} for services provided by ${hotelName}. The cardholder has disputed this charge citing "${reason}". We respectfully contest this dispute and provide evidence demonstrating that the charge is valid.`,
  });

  if (disputeCase.booking) {
    paragraphs.push({
      heading: "Service Provided",
      content: `The guest made a reservation at ${hotelName}${disputeCase.booking.roomType ? ` for a ${disputeCase.booking.roomType}` : ""}${disputeCase.booking.checkIn ? ` with check-in on ${disputeCase.booking.checkIn}` : ""}${disputeCase.booking.checkOut ? ` and check-out on ${disputeCase.booking.checkOut}` : ""}. The reservation was ${disputeCase.booking.status || "confirmed"}.`,
    });
  }

  const uploadedCount = evidenceItems.filter(i => i.status === "uploaded").length;
  if (uploadedCount > 0) {
    paragraphs.push({
      heading: "Supporting Evidence",
      content: `We have provided ${uploadedCount} piece${uploadedCount > 1 ? "s" : ""} of evidence supporting our position. This includes documentation from our property management system and relevant policies that were disclosed to the guest at the time of booking.`,
    });
  }

  // Build Stripe-specific fields
  const serviceDates = disputeCase.booking?.checkIn && disputeCase.booking?.checkOut
    ? `${disputeCase.booking.checkIn} to ${disputeCase.booking.checkOut}`
    : undefined;

  const cancellationPolicy = disputeCase.hotelProfile?.policies?.cancellation;
  const refundPolicy = disputeCase.hotelProfile?.policies?.refund;

  return {
    executiveSummary: `We respectfully contest this dispute of ${amount}. ${hotelName} provided the agreed-upon services, and the charge is valid. Evidence has been collected to support our position.`,
    timeline,
    paragraphs,
    customerClaimRebuttal: `The cardholder claims "${reason}". We have documentation showing that the service was provided as agreed and that our policies were clearly disclosed at the time of booking.`,
    conclusion: `Based on the evidence provided, we request that this dispute be resolved in favor of ${hotelName}. The charge of ${amount} is valid and the cardholder received the services they paid for.`,
    uncategorizedText: `${hotelName} contests this dispute of ${amount}. ${evidencePlan.summary}`,
    productDescription: `Hotel accommodation services at ${hotelName}`,
    serviceDates,
    cancellationPolicy,
    cancellationPolicyDisclosure: cancellationPolicy ? "Displayed during online booking process and included in confirmation email" : undefined,
    refundPolicy,
    refundPolicyDisclosure: refundPolicy ? "Displayed during online booking process and included in confirmation email" : undefined,
    refundRefusalExplanation: evidencePlan.recommendation === "fight" ? "The service was provided as agreed, and the charge is valid per our policies." : undefined,
    generatedAt: new Date().toISOString(),
    model: "fallback",
  };
}


