import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDispute, getDisputesByOrganization } from "../services/disputeService";
import { getOrganization } from "../services/organizationService";
import { getDisputesContainer } from "../services/cosmosClient";
import { generateEvidencePlan, generateArgument, DisputeCase, EvidencePlan } from "../services/aiService";

/**
 * Generate evidence plan for a dispute
 */
async function planEvidence(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as { disputeId: string; organizationId: string };
    const { disputeId, organizationId } = body;
    
    if (!disputeId || !organizationId) {
      return {
        status: 400,
        jsonBody: { error: "Missing disputeId or organizationId" },
      };
    }
    
    // Get dispute and organization
    const dispute = await getDispute(disputeId, organizationId);
    if (!dispute) {
      return {
        status: 404,
        jsonBody: { error: "Dispute not found" },
      };
    }
    
    const organization = await getOrganization(organizationId);
    
    // Build dispute case
    const disputeCase: DisputeCase = {
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
    const evidencePlan = await generateEvidencePlan(disputeCase);
    
    if (!evidencePlan) {
      return {
        status: 500,
        jsonBody: { error: "Failed to generate evidence plan" },
      };
    }
    
    // Update dispute with evidence plan
    const container = getDisputesContainer();
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
  } catch (error: any) {
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
async function draftArgument(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as { disputeId: string; organizationId: string };
    const { disputeId, organizationId } = body;
    
    if (!disputeId || !organizationId) {
      return {
        status: 400,
        jsonBody: { error: "Missing disputeId or organizationId" },
      };
    }
    
    // Get dispute
    const dispute = await getDispute(disputeId, organizationId);
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
    
    const organization = await getOrganization(organizationId);
    
    // Build dispute case
    const disputeCase: DisputeCase = {
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
      .filter((item: any) => item.status === "uploaded")
      .map((item: any) => ({
        id: item.requirementId,
        label: item.fileName || item.requirementId,
      }));
    
    // Generate argument
    const argument = await generateArgument(
      disputeCase,
      dispute.evidencePlan as EvidencePlan,
      uploadedEvidence
    );
    
    if (!argument) {
      return {
        status: 500,
        jsonBody: { error: "Failed to generate argument" },
      };
    }
    
    // Update dispute with argument
    const container = getDisputesContainer();
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
  } catch (error: any) {
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
async function updateEvidenceItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as {
      disputeId: string;
      organizationId: string;
      requirementId: string;
      status: string;
      fileId?: string;
      fileName?: string;
    };
    
    const { disputeId, organizationId, requirementId, status, fileId, fileName } = body;
    
    if (!disputeId || !organizationId || !requirementId || !status) {
      return {
        status: 400,
        jsonBody: { error: "Missing required fields" },
      };
    }
    
    // Get dispute
    const dispute = await getDispute(disputeId, organizationId);
    if (!dispute) {
      return {
        status: 404,
        jsonBody: { error: "Dispute not found" },
      };
    }
    
    // Update evidence items
    const evidenceItems = dispute.evidenceItems || [];
    const existingIndex = evidenceItems.findIndex((item: any) => item.requirementId === requirementId);
    
    const updatedItem = {
      requirementId,
      status,
      fileId,
      fileName,
      uploadedAt: status === "uploaded" ? new Date().toISOString() : undefined,
    };
    
    if (existingIndex >= 0) {
      evidenceItems[existingIndex] = { ...evidenceItems[existingIndex], ...updatedItem };
    } else {
      evidenceItems.push(updatedItem);
    }
    
    // Update dispute
    const container = getDisputesContainer();
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
  } catch (error: any) {
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
async function getDisputes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const organizationId = request.query.get("organizationId");
    
    if (!organizationId) {
      return {
        status: 400,
        jsonBody: { error: "Missing organizationId" },
      };
    }
    
    const disputes = await getDisputesByOrganization(organizationId);
    
    return {
      status: 200,
      jsonBody: { disputes },
    };
  } catch (error: any) {
    context.error(`Error in getDisputes: ${error.message}`);
    return {
      status: 500,
      jsonBody: { error: error.message },
    };
  }
}

// Register functions
app.http("planEvidence", {
  methods: ["POST"],
  authLevel: "anonymous", // TODO: Add auth
  handler: planEvidence,
});

app.http("draftArgument", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: draftArgument,
});

app.http("updateEvidenceItem", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: updateEvidenceItem,
});

app.http("getDisputes", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: getDisputes,
});
