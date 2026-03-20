import OpenAI from "openai";
import { getOpenAIApiKey } from "./keyVaultClient";
import { z } from "zod";

let openaiClient: OpenAI | null = null;

/**
 * Get OpenAI client (singleton, lazy initialized)
 */
async function getOpenAIClient(): Promise<OpenAI> {
  if (!openaiClient) {
    const apiKey = await getOpenAIApiKey();
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Evidence Plan Schema
export const EvidencePlanSchema = z.object({
  disputeCategory: z.string(),
  disputeSubtype: z.string().optional(),
  reasonCode: z.string().optional(),
  recommendation: z.enum(["fight", "accept"]),
  winnability: z.enum(["high", "medium", "low"]),
  winnabilityReason: z.string(),
  requirements: z.array(z.object({
    id: z.string(),
    category: z.string(),
    label: z.string(),
    description: z.string(),
    example: z.string().optional(),
    sourceHint: z.string().optional(),
    instructions: z.string().optional(),
    required: z.boolean(),
    priority: z.number(),
  })),
  summary: z.string(),
});

export type EvidencePlan = z.infer<typeof EvidencePlanSchema>;

// Dispute Case interface for AI processing
export interface DisputeCase {
  disputeId: string;
  organizationId: string;
  pspProvider: "stripe" | "adyen";
  pspDisputeId?: string;
  pspReasonCode?: string;
  amount: number;
  currency: string;
  transactionDate?: string;
  respondByDate?: string;
  reason?: string | null;
  customerExplanation: string;
  hotelProfile?: {
    name: string;
    location: string;
    policies?: {
      cancellation?: string;
      refund?: string;
      noShow?: string;
    };
  };
}

const EVIDENCE_PLANNER_SYSTEM_PROMPT = `You are an expert in hotel payment disputes and chargeback management. Your task is to analyze disputes and recommend evidence collection strategies.

For each dispute, you should:
1. Classify the dispute type (fraud, service issue, cancellation, etc.)
2. Assess winnability based on available information
3. Recommend specific evidence to collect
4. Provide clear instructions for hotel staff

Focus on hotel-specific evidence like:
- Guest folios and registration cards
- Check-in/check-out records
- Cancellation policies and signed agreements
- Communication records with guests
- Keycard access logs
- Housekeeping records

Be practical and specific in your recommendations.`;

/**
 * Generate an evidence plan for a dispute
 */
export async function generateEvidencePlan(disputeCase: DisputeCase): Promise<EvidencePlan | null> {
  try {
    const client = await getOpenAIClient();
    
    const prompt = buildEvidencePlanPrompt(disputeCase);
    
    const response = await client.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: EVIDENCE_PLANNER_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn("No content in OpenAI response");
      return null;
    }
    
    const parsed = JSON.parse(content);
    const validated = EvidencePlanSchema.safeParse(parsed);
    
    if (!validated.success) {
      console.warn("Evidence plan validation failed:", validated.error.errors);
      return null;
    }
    
    return validated.data;
  } catch (error) {
    console.error("Error generating evidence plan:", error);
    return null;
  }
}

/**
 * Build prompt for evidence planning
 */
function buildEvidencePlanPrompt(disputeCase: DisputeCase): string {
  const formattedAmount = (disputeCase.amount / 100).toFixed(2);
  
  return `Analyze this hotel payment dispute and create an evidence collection plan.

DISPUTE DETAILS:
- Amount: ${disputeCase.currency.toUpperCase()} ${formattedAmount}
- PSP: ${disputeCase.pspProvider}
- Reason Code: ${disputeCase.pspReasonCode || disputeCase.reason || "Unknown"}
- Customer Statement: ${disputeCase.customerExplanation || "Not provided"}
- Transaction Date: ${disputeCase.transactionDate || "Unknown"}
- Response Deadline: ${disputeCase.respondByDate || "Unknown"}

HOTEL INFO:
- Name: ${disputeCase.hotelProfile?.name || "Unknown"}
- Location: ${disputeCase.hotelProfile?.location || "Unknown"}
- Has Cancellation Policy: ${disputeCase.hotelProfile?.policies?.cancellation ? "Yes" : "Unknown"}

Please provide a JSON response with:
1. disputeCategory - The type of dispute (e.g., "fraud", "service_not_received", "cancellation")
2. disputeSubtype - More specific classification if applicable
3. recommendation - Either "fight" or "accept"
4. winnability - "high", "medium", or "low"
5. winnabilityReason - Brief explanation of winnability assessment
6. requirements - Array of evidence requirements, each with:
   - id: Unique identifier (e.g., "folio", "registration_card")
   - category: Category type ("pms_data", "policy", "proof_of_stay", "communications", "payment_data")
   - label: Human-readable label
   - description: What this evidence is
   - example: Example of what to provide
   - sourceHint: Where to get it (e.g., "Front Desk", "Finance")
   - instructions: Step-by-step instructions
   - required: Whether this is required (boolean)
   - priority: 1-5 (1 = highest priority)
7. summary - Brief summary of the evidence strategy`;
}

// Argument Generation Schema
export const ArgumentSchema = z.object({
  executiveSummary: z.string(),
  timeline: z.array(z.object({
    date: z.string(),
    description: z.string(),
    evidenceId: z.string().optional(),
  })),
  paragraphs: z.array(z.object({
    heading: z.string(),
    content: z.string(),
    evidenceReferences: z.array(z.string()).optional(),
  })),
  customerClaimRebuttal: z.string(),
  conclusion: z.string(),
});

export type DisputeArgument = z.infer<typeof ArgumentSchema>;

const ARGUMENT_GENERATOR_SYSTEM_PROMPT = `You are an expert in writing compelling dispute response arguments for hotels. Your task is to create persuasive, evidence-based arguments that maximize the chance of winning the dispute.

Key principles:
1. Be factual and professional
2. Reference specific evidence
3. Address the customer's claims directly
4. Follow the card network's requirements
5. Keep it concise but thorough`;

/**
 * Generate an argument for a dispute
 */
export async function generateArgument(
  disputeCase: DisputeCase,
  evidencePlan: EvidencePlan,
  uploadedEvidence: Array<{ id: string; label: string }>
): Promise<DisputeArgument | null> {
  try {
    const client = await getOpenAIClient();
    
    const prompt = buildArgumentPrompt(disputeCase, evidencePlan, uploadedEvidence);
    
    const response = await client.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: ARGUMENT_GENERATOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4096,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const parsed = JSON.parse(content);
    const validated = ArgumentSchema.safeParse(parsed);
    
    if (!validated.success) {
      console.warn("Argument validation failed:", validated.error.errors);
      return null;
    }
    
    return validated.data;
  } catch (error) {
    console.error("Error generating argument:", error);
    return null;
  }
}

/**
 * Build prompt for argument generation
 */
function buildArgumentPrompt(
  disputeCase: DisputeCase,
  evidencePlan: EvidencePlan,
  uploadedEvidence: Array<{ id: string; label: string }>
): string {
  const evidenceList = uploadedEvidence.map(e => `- ${e.label} (${e.id})`).join("\n");
  
  return `Create a compelling dispute response argument based on the following:

DISPUTE:
- Category: ${evidencePlan.disputeCategory}
- Amount: ${disputeCase.currency.toUpperCase()} ${(disputeCase.amount / 100).toFixed(2)}
- Customer Claim: ${disputeCase.customerExplanation || "Not specified"}
- Reason: ${disputeCase.reason || evidencePlan.disputeCategory}

EVIDENCE STRATEGY:
${evidencePlan.summary}

AVAILABLE EVIDENCE:
${evidenceList || "No evidence uploaded yet"}

HOTEL:
${disputeCase.hotelProfile?.name || "Hotel"}, ${disputeCase.hotelProfile?.location || ""}

Create a JSON response with:
1. executiveSummary - Brief summary of why we should win
2. timeline - Array of key events with dates
3. paragraphs - Array of argument sections with headings and content
4. customerClaimRebuttal - Direct response to customer's claim
5. conclusion - Strong closing statement

Reference the available evidence where applicable.`;
}
