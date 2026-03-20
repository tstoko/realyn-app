"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArgumentSchema = exports.EvidencePlanSchema = void 0;
exports.generateEvidencePlan = generateEvidencePlan;
exports.generateArgument = generateArgument;
const openai_1 = __importDefault(require("openai"));
const keyVaultClient_1 = require("./keyVaultClient");
const zod_1 = require("zod");
let openaiClient = null;
/**
 * Get OpenAI client (singleton, lazy initialized)
 */
async function getOpenAIClient() {
    if (!openaiClient) {
        const apiKey = await (0, keyVaultClient_1.getOpenAIApiKey)();
        openaiClient = new openai_1.default({ apiKey });
    }
    return openaiClient;
}
// Evidence Plan Schema
exports.EvidencePlanSchema = zod_1.z.object({
    disputeCategory: zod_1.z.string(),
    disputeSubtype: zod_1.z.string().optional(),
    reasonCode: zod_1.z.string().optional(),
    recommendation: zod_1.z.enum(["fight", "accept"]),
    winnability: zod_1.z.enum(["high", "medium", "low"]),
    winnabilityReason: zod_1.z.string(),
    requirements: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        category: zod_1.z.string(),
        label: zod_1.z.string(),
        description: zod_1.z.string(),
        example: zod_1.z.string().optional(),
        sourceHint: zod_1.z.string().optional(),
        instructions: zod_1.z.string().optional(),
        required: zod_1.z.boolean(),
        priority: zod_1.z.number(),
    })),
    summary: zod_1.z.string(),
});
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
async function generateEvidencePlan(disputeCase) {
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
        const validated = exports.EvidencePlanSchema.safeParse(parsed);
        if (!validated.success) {
            console.warn("Evidence plan validation failed:", validated.error.errors);
            return null;
        }
        return validated.data;
    }
    catch (error) {
        console.error("Error generating evidence plan:", error);
        return null;
    }
}
/**
 * Build prompt for evidence planning
 */
function buildEvidencePlanPrompt(disputeCase) {
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
exports.ArgumentSchema = zod_1.z.object({
    executiveSummary: zod_1.z.string(),
    timeline: zod_1.z.array(zod_1.z.object({
        date: zod_1.z.string(),
        description: zod_1.z.string(),
        evidenceId: zod_1.z.string().optional(),
    })),
    paragraphs: zod_1.z.array(zod_1.z.object({
        heading: zod_1.z.string(),
        content: zod_1.z.string(),
        evidenceReferences: zod_1.z.array(zod_1.z.string()).optional(),
    })),
    customerClaimRebuttal: zod_1.z.string(),
    conclusion: zod_1.z.string(),
});
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
async function generateArgument(disputeCase, evidencePlan, uploadedEvidence) {
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
        if (!content)
            return null;
        const parsed = JSON.parse(content);
        const validated = exports.ArgumentSchema.safeParse(parsed);
        if (!validated.success) {
            console.warn("Argument validation failed:", validated.error.errors);
            return null;
        }
        return validated.data;
    }
    catch (error) {
        console.error("Error generating argument:", error);
        return null;
    }
}
/**
 * Build prompt for argument generation
 */
function buildArgumentPrompt(disputeCase, evidencePlan, uploadedEvidence) {
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
//# sourceMappingURL=aiService.js.map