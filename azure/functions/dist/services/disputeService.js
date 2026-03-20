"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertUnifiedDispute = upsertUnifiedDispute;
exports.updateDisputeStatus = updateDisputeStatus;
exports.getDispute = getDispute;
exports.getDisputesByOrganization = getDisputesByOrganization;
const cosmosClient_1 = require("./cosmosClient");
/**
 * Upsert a dispute from PSP webhook
 */
async function upsertUnifiedDispute(data) {
    const container = (0, cosmosClient_1.getDisputesContainer)();
    // Check if dispute exists
    const querySpec = {
        query: "SELECT * FROM c WHERE c.pspProvider = @pspProvider AND c.pspDisputeId = @pspDisputeId",
        parameters: [
            { name: "@pspProvider", value: data.pspProvider },
            { name: "@pspDisputeId", value: data.pspDisputeId },
        ],
    };
    const { resources: existing } = await container.items.query(querySpec).fetchAll();
    const now = new Date().toISOString();
    if (existing.length === 0) {
        // Create new dispute
        const newDispute = {
            id: `disp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            organizationId: data.organizationId,
            pspProvider: data.pspProvider,
            pspDisputeId: data.pspDisputeId,
            pspPaymentId: data.pspPaymentId,
            pspTransactionDate: data.pspTransactionDate.toISOString(),
            pspLast4Digits: data.pspLast4Digits,
            stripeDisputeId: data.pspDisputeId,
            stripePaymentIntentId: data.pspPaymentId,
            amount: data.amount,
            currency: data.currency,
            stripeStatus: data.stripeStatus,
            reason: data.reason,
            respondBy: data.respondBy?.toISOString(),
            createdAt: data.pspTransactionDate.toISOString(),
            updatedAt: now,
            customerExplanation: data.customerExplanation || "",
            automationStatus: "auditing",
            lifecycleStatus: "new",
            internalStatus: "needs_review",
            auditTrail: [],
            aiSummary: "",
            aiDraftResponse: "",
            isDraftApproved: false,
            internalNotes: [],
        };
        const { resource } = await container.items.create(newDispute);
        console.log(`Created ${data.pspProvider} dispute: ${data.pspDisputeId}`);
        return resource.id;
    }
    else {
        // Update existing dispute
        const existingDispute = existing[0];
        const updated = {
            ...existingDispute,
            stripeStatus: data.stripeStatus,
            respondBy: data.respondBy?.toISOString(),
            customerExplanation: data.customerExplanation || existingDispute.customerExplanation,
            updatedAt: now,
        };
        await container.item(existingDispute.id, existingDispute.organizationId).replace(updated);
        console.log(`Updated ${data.pspProvider} dispute: ${data.pspDisputeId}`);
        return existingDispute.id;
    }
}
/**
 * Update dispute status
 */
async function updateDisputeStatus(pspProvider, pspDisputeId, status) {
    const container = (0, cosmosClient_1.getDisputesContainer)();
    const querySpec = {
        query: "SELECT * FROM c WHERE c.pspProvider = @pspProvider AND c.pspDisputeId = @pspDisputeId",
        parameters: [
            { name: "@pspProvider", value: pspProvider },
            { name: "@pspDisputeId", value: pspDisputeId },
        ],
    };
    const { resources: disputes } = await container.items.query(querySpec).fetchAll();
    if (disputes.length === 0) {
        console.warn(`Dispute not found: ${pspProvider}/${pspDisputeId}`);
        return;
    }
    const dispute = disputes[0];
    let lifecycleStatus = dispute.lifecycleStatus;
    if (status === "won")
        lifecycleStatus = "won";
    else if (status === "lost")
        lifecycleStatus = "lost";
    else if (status === "under_review")
        lifecycleStatus = "under_review";
    const updated = {
        ...dispute,
        stripeStatus: status,
        lifecycleStatus,
        updatedAt: new Date().toISOString(),
    };
    await container.item(dispute.id, dispute.organizationId).replace(updated);
    console.log(`Updated ${pspProvider} dispute ${pspDisputeId} to status ${status}`);
}
/**
 * Get dispute by ID
 */
async function getDispute(disputeId, organizationId) {
    const container = (0, cosmosClient_1.getDisputesContainer)();
    try {
        const { resource } = await container.item(disputeId, organizationId).read();
        return resource || null;
    }
    catch (error) {
        if (error.code === 404)
            return null;
        throw error;
    }
}
/**
 * Get disputes by organization
 */
async function getDisputesByOrganization(organizationId) {
    const container = (0, cosmosClient_1.getDisputesContainer)();
    const querySpec = {
        query: "SELECT * FROM c WHERE c.organizationId = @organizationId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@organizationId", value: organizationId }],
    };
    const { resources } = await container.items.query(querySpec).fetchAll();
    return resources;
}
//# sourceMappingURL=disputeService.js.map