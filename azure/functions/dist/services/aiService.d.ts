import { z } from "zod";
export declare const EvidencePlanSchema: z.ZodObject<{
    disputeCategory: z.ZodString;
    disputeSubtype: z.ZodOptional<z.ZodString>;
    reasonCode: z.ZodOptional<z.ZodString>;
    recommendation: z.ZodEnum<["fight", "accept"]>;
    winnability: z.ZodEnum<["high", "medium", "low"]>;
    winnabilityReason: z.ZodString;
    requirements: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodString;
        label: z.ZodString;
        description: z.ZodString;
        example: z.ZodOptional<z.ZodString>;
        sourceHint: z.ZodOptional<z.ZodString>;
        instructions: z.ZodOptional<z.ZodString>;
        required: z.ZodBoolean;
        priority: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        category: string;
        label: string;
        description: string;
        required: boolean;
        priority: number;
        example?: string | undefined;
        sourceHint?: string | undefined;
        instructions?: string | undefined;
    }, {
        id: string;
        category: string;
        label: string;
        description: string;
        required: boolean;
        priority: number;
        example?: string | undefined;
        sourceHint?: string | undefined;
        instructions?: string | undefined;
    }>, "many">;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    disputeCategory: string;
    recommendation: "fight" | "accept";
    winnability: "high" | "medium" | "low";
    winnabilityReason: string;
    requirements: {
        id: string;
        category: string;
        label: string;
        description: string;
        required: boolean;
        priority: number;
        example?: string | undefined;
        sourceHint?: string | undefined;
        instructions?: string | undefined;
    }[];
    summary: string;
    disputeSubtype?: string | undefined;
    reasonCode?: string | undefined;
}, {
    disputeCategory: string;
    recommendation: "fight" | "accept";
    winnability: "high" | "medium" | "low";
    winnabilityReason: string;
    requirements: {
        id: string;
        category: string;
        label: string;
        description: string;
        required: boolean;
        priority: number;
        example?: string | undefined;
        sourceHint?: string | undefined;
        instructions?: string | undefined;
    }[];
    summary: string;
    disputeSubtype?: string | undefined;
    reasonCode?: string | undefined;
}>;
export type EvidencePlan = z.infer<typeof EvidencePlanSchema>;
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
/**
 * Generate an evidence plan for a dispute
 */
export declare function generateEvidencePlan(disputeCase: DisputeCase): Promise<EvidencePlan | null>;
export declare const ArgumentSchema: z.ZodObject<{
    executiveSummary: z.ZodString;
    timeline: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        description: z.ZodString;
        evidenceId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        description: string;
        evidenceId?: string | undefined;
    }, {
        date: string;
        description: string;
        evidenceId?: string | undefined;
    }>, "many">;
    paragraphs: z.ZodArray<z.ZodObject<{
        heading: z.ZodString;
        content: z.ZodString;
        evidenceReferences: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        heading: string;
        content: string;
        evidenceReferences?: string[] | undefined;
    }, {
        heading: string;
        content: string;
        evidenceReferences?: string[] | undefined;
    }>, "many">;
    customerClaimRebuttal: z.ZodString;
    conclusion: z.ZodString;
}, "strip", z.ZodTypeAny, {
    executiveSummary: string;
    timeline: {
        date: string;
        description: string;
        evidenceId?: string | undefined;
    }[];
    paragraphs: {
        heading: string;
        content: string;
        evidenceReferences?: string[] | undefined;
    }[];
    customerClaimRebuttal: string;
    conclusion: string;
}, {
    executiveSummary: string;
    timeline: {
        date: string;
        description: string;
        evidenceId?: string | undefined;
    }[];
    paragraphs: {
        heading: string;
        content: string;
        evidenceReferences?: string[] | undefined;
    }[];
    customerClaimRebuttal: string;
    conclusion: string;
}>;
export type DisputeArgument = z.infer<typeof ArgumentSchema>;
/**
 * Generate an argument for a dispute
 */
export declare function generateArgument(disputeCase: DisputeCase, evidencePlan: EvidencePlan, uploadedEvidence: Array<{
    id: string;
    label: string;
}>): Promise<DisputeArgument | null>;
//# sourceMappingURL=aiService.d.ts.map