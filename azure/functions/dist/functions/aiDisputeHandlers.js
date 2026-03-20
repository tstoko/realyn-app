"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@azure/functions");
const disputeService_1 = require("../services/disputeService");
const organizationService_1 = require("../services/organizationService");
const cosmosClient_1 = require("../services/cosmosClient");
const aiService_1 = require("../services/aiService");
/**
 * Generate evidence plan for a dispute
 */
async function planEvidence(request, context) {
    try {
        const body = await request.json();
        const { disputeId, organizationId } = body;
        if (!disputeId || !organizationId) {
            return {
                status: 400,
                jsonBody: { error: "Missing disputeId or organizationId" },
            };
        }
        // Get dispute and organization
        const dispute = await (0, disputeService_1.getDispute)(disputeId, organizationId);
        if (!dispute) {
            return {
                status: 404,
                jsonBody: { error: "Dispute not found" },
            };
        }
        const organization = await (0, organizationService_1.getOrganization)(organizationId);
        // Build dispute case
        const disputeCase = {
            disputeId: dispute.id,
            organizationId: dispute.organizationId,
            pspProvider: dispute.pspProvider,
            pspDisputeId: dispute.pspDisputeId,
            pspReasonCode: dispute.reason || undefined,
            amount: dispute.amount,
            currency: dispute.currency,
            transactionDate: dispute.pspTransactionDate,
            respondByDate: dispute.respondBy,
            reason: dispute.reason,
            customerExplanation: dispute.customerExplanation,
            hotelProfile: organization ? {
                name: organization.name,
                location: organization.location,
                policies: undefined, // Would need to extract from documents
            } : undefined,
        };
        // Generate evidence plan
        const evidencePlan = await (0, aiService_1.generateEvidencePlan)(disputeCase);
        if (!evidencePlan) {
            return {
                status: 500,
                jsonBody: { error: "Failed to generate evidence plan" },
            };
        }
        // Update dispute with evidence plan
        const container = (0, cosmosClient_1.getDisputesContainer)();
        const updated = {
            ...dispute,
            evidencePlan,
            evidencePlanGeneratedAt: new Date().toISOString(),
            evidencePlanStatus: "complete",
            automationStatus: "awaiting_info",
            updatedAt: new Date().toISOString(),
        };
        await container.item(disputeId, organizationId).replace(updated);
        return {
            status: 200,
            jsonBody: {
                success: true,
                evidencePlan,
                message: "Evidence plan generated successfully",
            },
        };
    }
    catch (error) {
        context.error(`Error in planEvidence: ${error.message}`);
        return {
            status: 500,
            jsonBody: { error: error.message },
        };
    }
}
/**
 * Generate argument draft for a dispute
 */
async function draftArgument(request, context) {
    try {
        const body = await request.json();
        const { disputeId, organizationId } = body;
        if (!disputeId || !organizationId) {
            return {
                status: 400,
                jsonBody: { error: "Missing disputeId or organizationId" },
            };
        }
        // Get dispute
        const dispute = await (0, disputeService_1.getDispute)(disputeId, organizationId);
        if (!dispute) {
            return {
                status: 404,
                jsonBody: { error: "Dispute not found" },
            };
        }
        if (!dispute.evidencePlan) {
            return {
                status: 400,
                jsonBody: { error: "Evidence plan required before generating argument" },
            };
        }
        const organization = await (0, organizationService_1.getOrganization)(organizationId);
        // Build dispute case
        const disputeCase = {
            disputeId: dispute.id,
            organizationId: dispute.organizationId,
            pspProvider: dispute.pspProvider,
            pspDisputeId: dispute.pspDisputeId,
            pspReasonCode: dispute.reason || undefined,
            amount: dispute.amount,
            currency: dispute.currency,
            transactionDate: dispute.pspTransactionDate,
            respondByDate: dispute.respondBy,
            reason: dispute.reason,
            customerExplanation: dispute.customerExplanation,
            hotelProfile: organization ? {
                name: organization.name,
                location: organization.location,
            } : undefined,
        };
        // Get uploaded evidence
        const uploadedEvidence = (dispute.evidenceItems || [])
            .filter((item) => item.status === "uploaded")
            .map((item) => ({
            id: item.requirementId,
            label: item.fileName || item.requirementId,
        }));
        // Generate argument
        const argument = await (0, aiService_1.generateArgument)(disputeCase, dispute.evidencePlan, uploadedEvidence);
        if (!argument) {
            return {
                status: 500,
                jsonBody: { error: "Failed to generate argument" },
            };
        }
        // Update dispute with argument
        const container = (0, cosmosClient_1.getDisputesContainer)();
        const updated = {
            ...dispute,
            argumentDraft: argument,
            argumentDraftGeneratedAt: new Date().toISOString(),
            automationStatus: "responding",
            lifecycleStatus: "draft_ready",
            updatedAt: new Date().toISOString(),
        };
        await container.item(disputeId, organizationId).replace(updated);
        return {
            status: 200,
            jsonBody: {
                success: true,
                argument,
                message: "Argument draft generated successfully",
            },
        };
    }
    catch (error) {
        context.error(`Error in draftArgument: ${error.message}`);
        return {
            status: 500,
            jsonBody: { error: error.message },
        };
    }
}
/**
 * Update evidence item status
 */
async function updateEvidenceItem(request, context) {
    try {
        const body = await request.json();
        const { disputeId, organizationId, requirementId, status, fileId, fileName } = body;
        if (!disputeId || !organizationId || !requirementId || !status) {
            return {
                status: 400,
                jsonBody: { error: "Missing required fields" },
            };
        }
        // Get dispute
        const dispute = await (0, disputeService_1.getDispute)(disputeId, organizationId);
        if (!dispute) {
            return {
                status: 404,
                jsonBody: { error: "Dispute not found" },
            };
        }
        // Update evidence items
        const evidenceItems = dispute.evidenceItems || [];
        const existingIndex = evidenceItems.findIndex((item) => item.requirementId === requirementId);
        const updatedItem = {
            requirementId,
            status,
            fileId,
            fileName,
            uploadedAt: status === "uploaded" ? new Date().toISOString() : undefined,
        };
        if (existingIndex >= 0) {
            evidenceItems[existingIndex] = { ...evidenceItems[existingIndex], ...updatedItem };
        }
        else {
            evidenceItems.push(updatedItem);
        }
        // Update dispute
        const container = (0, cosmosClient_1.getDisputesContainer)();
        const updated = {
            ...dispute,
            evidenceItems,
            updatedAt: new Date().toISOString(),
        };
        await container.item(disputeId, organizationId).replace(updated);
        return {
            status: 200,
            jsonBody: { success: true, evidenceItems },
        };
    }
    catch (error) {
        context.error(`Error in updateEvidenceItem: ${error.message}`);
        return {
            status: 500,
            jsonBody: { error: error.message },
        };
    }
}
/**
 * Get disputes for an organization
 */
async function getDisputes(request, context) {
    try {
        const organizationId = request.query.get("organizationId");
        if (!organizationId) {
            return {
                status: 400,
                jsonBody: { error: "Missing organizationId" },
            };
        }
        const disputes = await (0, disputeService_1.getDisputesByOrganization)(organizationId);
        return {
            status: 200,
            jsonBody: { disputes },
        };
    }
    catch (error) {
        context.error(`Error in getDisputes: ${error.message}`);
        return {
            status: 500,
            jsonBody: { error: error.message },
        };
    }
}
// Register functions
functions_1.app.http("planEvidence", {
    methods: ["POST"],
    authLevel: "anonymous", // TODO: Add auth
    handler: planEvidence,
});
functions_1.app.http("draftArgument", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: draftArgument,
});
functions_1.app.http("updateEvidenceItem", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: updateEvidenceItem,
});
functions_1.app.http("getDisputes", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: getDisputes,
});
//# sourceMappingURL=aiDisputeHandlers.js.map