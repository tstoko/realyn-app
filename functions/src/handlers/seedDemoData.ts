import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { triggerEvidencePlanning } from "../services/ai/evidencePlanningService";
import { buildDisputeCase } from "../services/ai/disputeCaseBuilder";
import { generateDisputeArgument } from "../services/ai/argumentGenerator";
import { updateEvidenceItemStatus } from "../services/ai/evidencePlanningService";
import { EvidenceItem } from "../types/aiDispute";

const db = admin.firestore();

/**
 * Helper to remove undefined values from an object
 * Firestore doesn't accept undefined values
 */
function removeUndefinedFields<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = removeUndefinedFields(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}

// Demo disputes with different lifecycle states
const demoDisputes = [
  {
    reason: "product_not_received",
    description: "Guest claims they never received the service/room",
    amount: 15000, // $150.00
    state: "new", // New dispute, no AI plan
  },
  {
    reason: "credit_not_processed",
    description: "Guest claims refund was promised but not received",
    amount: 8500, // $85.00
    state: "ai_plan_generated", // AI plan generated, evidence items initialized
  },
  {
    reason: "general",
    description: "General dispute - unspecified reason",
    amount: 20000, // $200.00
    state: "evidence_uploaded", // AI plan + 2 evidence items uploaded
  },
  {
    reason: "duplicate",
    description: "Guest claims they were charged twice",
    amount: 12000, // $120.00
    state: "argument_ready", // AI plan + all evidence + argument draft
  },
  {
    reason: "subscription_canceled",
    description: "Guest canceled but was still charged",
    amount: 9900, // $99.00
    state: "submitted", // Complete submission flow
  },
  {
    reason: "product_not_received",
    description: "Guest claims they never received the service/room",
    amount: 17500, // $175.00
    state: "won", // Won dispute
  },
  {
    reason: "fraudulent",
    description: "Cardholder claims transaction was fraudulent",
    amount: 25000, // $250.00
    state: "lost", // Lost dispute
  },
];

/**
 * HTTP endpoint to seed comprehensive demo data
 * 
 * Usage: POST /seedDemoData
 * 
 * Creates:
 * - Demo hotel organization (if doesn't exist)
 * - 7 disputes in different lifecycle states
 * - Pre-generates AI plans for some disputes
 * - Pre-uploads evidence for some disputes
 * - Pre-generates arguments for some disputes
 */
export const seedDemoData = onRequest(
  { cors: true, secrets: ["OPENAI_API_KEY"] },
  async (req: Request, res: Response) => {
    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    try {
      console.log("Starting demo data seeding...");

      // Find or create demo hotel organization
      let organizationId: string | null = null;
      const orgsSnapshot = await db.collection("organizations").get();
      
      // Look for existing demo hotel
      for (const doc of orgsSnapshot.docs) {
        const data = doc.data();
        if (data.name === "Grand Plaza Hotel" || data.name?.includes("Demo")) {
          organizationId = doc.id;
          console.log(`Found existing demo hotel: ${organizationId}`);
          break;
        }
      }

      // Create demo hotel if not found
      if (!organizationId) {
        const demoHotelData = {
          name: "Grand Plaza Hotel",
          location: "New York, NY",
          isDemo: true,
          teams: ["Finance", "Front Desk", "Operations"],
          documents: [
            {
              name: "Cancellation Policy",
              category: "Cancellation Policy",
              url: "https://example.com/cancellation-policy.pdf",
            },
            {
              name: "Terms of Service",
              category: "Terms of Service",
              url: "https://example.com/terms.pdf",
            },
          ],
          pspIntegrations: {
            stripe: {
              connected: true,
              testMode: true,
              restrictedApiKey: "rk_test_demo_key",
              webhookSecret: "whsec_demo_secret",
            },
          },
          pmsIntegrations: {
            mews: {
              connected: true,
              apiKey: "demo_api_key",
              accessToken: "demo_access_token",
              propertyId: "demo_property_id",
            },
          },
          automationSettings: {
            autoSubmissionEnabled: false,
            autoSubmissionMinAmount: 0,
            autoMarkNotContested: false,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const orgRef = await db.collection("organizations").add(demoHotelData);
        organizationId = orgRef.id;
        console.log(`Created demo hotel: ${organizationId}`);
      }

      if (!organizationId) {
        res.status(500).json({ error: "Failed to create or find organization" });
        return;
      }

      const now = new Date();
      const respondBy = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const created: string[] = [];

      // Create disputes in different states
      for (let i = 0; i < demoDisputes.length; i++) {
        const demoDispute = demoDisputes[i];
        const timestamp = Date.now() + i;
        const pspDisputeId = `du_demo_${demoDispute.reason}_${timestamp}`;
        const pspPaymentId = `pi_demo_${timestamp}`;

        // Base dispute data
        const disputeData: any = {
          organizationId: organizationId,
          pspProvider: "stripe",
          pspDisputeId: pspDisputeId,
          pspPaymentId: pspPaymentId,
          pspTransactionDate: admin.firestore.Timestamp.fromDate(
            new Date(now.getTime() - (14 + i) * 24 * 60 * 60 * 1000)
          ),
          pspLast4Digits: String(1000 + i).slice(-4),

          amount: demoDispute.amount,
          currency: "usd",
          reason: demoDispute.reason,
          status: getStripeStatusForState(demoDispute.state),
          customerExplanation: demoDispute.description,

          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
          respondBy: admin.firestore.Timestamp.fromDate(respondBy),

          internalStatus: getInternalStatusForState(demoDispute.state),
          lifecycleStatus: getLifecycleStatusForState(demoDispute.state),
          automationStatus: "manual_review",
          useAIPlan: true,

          auditTrail: [
            {
              timestamp: admin.firestore.Timestamp.now(),
              title: "Demo Dispute Created",
              description: `Demo ${demoDispute.reason} dispute in ${demoDispute.state} state. ${demoDispute.description}`,
              status: "success",
            },
          ],

          evidencePlan: null,
          evidenceItems: [],
          argumentDraft: null,
        };

        // Create the dispute
        const docRef = await db.collection("disputes").add(disputeData);
        const disputeId = docRef.id;
        created.push(`${demoDispute.reason} (${demoDispute.state}): ${disputeId}`);

        console.log(`Created dispute ${disputeId} in state: ${demoDispute.state}`);

        // Process based on state
        if (demoDispute.state === "ai_plan_generated" || 
            demoDispute.state === "evidence_uploaded" || 
            demoDispute.state === "argument_ready") {
          // Generate AI plan
          console.log(`Generating AI plan for dispute ${disputeId}...`);
          const planResult = await triggerEvidencePlanning(disputeId, organizationId);
          
          if (planResult.success && planResult.plan && planResult.evidenceItems) {
            console.log(`AI plan generated for ${disputeId}`);

            if (demoDispute.state === "evidence_uploaded" || demoDispute.state === "argument_ready") {
              // Upload 2 evidence items
              const evidenceItems = planResult.evidenceItems;
              const itemsToUpload = evidenceItems.slice(0, Math.min(2, evidenceItems.length));
              
              for (const item of itemsToUpload) {
                await updateEvidenceItemStatus(
                  disputeId,
                  item.requirementId,
                  "uploaded",
                  `file_demo_${item.requirementId}`,
                  `demo_evidence_${item.requirementId}.pdf`,
                  "demo_user",
                  "Demo evidence file"
                );
              }
              console.log(`Uploaded ${itemsToUpload.length} evidence items for ${disputeId}`);

              if (demoDispute.state === "argument_ready") {
                // Generate argument
                console.log(`Generating argument for dispute ${disputeId}...`);
                const disputeCase = await buildDisputeCase(disputeId, organizationId);
                if (disputeCase && planResult.plan) {
                  // Get updated evidence items
                  const disputeDoc = await db.collection("disputes").doc(disputeId).get();
                  const updatedDispute = disputeDoc.data();
                  const updatedEvidenceItems = (updatedDispute?.evidenceItems || []) as EvidenceItem[];

                  const argument = await generateDisputeArgument(
                    disputeCase,
                    planResult.plan,
                    updatedEvidenceItems,
                    disputeId
                  );

                  if (argument) {
                    await db.collection("disputes").doc(disputeId).update({
                      argumentDraft: removeUndefinedFields(argument),
                      argumentDraftGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                      lifecycleStatus: "draft_ready",
                      internalStatus: "ready_to_submit",
                    });
                    console.log(`Argument generated for ${disputeId}`);
                  }
                }
              }
            }
          }
        } else if (demoDispute.state === "submitted") {
          // For submitted state, create a complete dispute with plan, evidence, and argument
          const planResult = await triggerEvidencePlanning(disputeId, organizationId);
          if (planResult.success && planResult.plan && planResult.evidenceItems) {
            // Upload all evidence
            for (const item of planResult.evidenceItems) {
              await updateEvidenceItemStatus(
                disputeId,
                item.requirementId,
                "uploaded",
                `file_demo_${item.requirementId}`,
                `demo_evidence_${item.requirementId}.pdf`,
                "demo_user"
              );
            }

            // Generate argument
            const disputeCase = await buildDisputeCase(disputeId, organizationId);
            if (disputeCase && planResult.plan) {
              const disputeDoc = await db.collection("disputes").doc(disputeId).get();
              const updatedDispute = disputeDoc.data();
              const updatedEvidenceItems = (updatedDispute?.evidenceItems || []) as EvidenceItem[];

              const argument = await generateDisputeArgument(
                disputeCase,
                planResult.plan,
                updatedEvidenceItems,
                disputeId
              );

              if (argument) {
                await db.collection("disputes").doc(disputeId).update({
                  argumentDraft: removeUndefinedFields(argument),
                  argumentDraftGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                  argumentSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
                  lifecycleStatus: "submitted",
                  internalStatus: "submitted",
                  status: "under_review",
                });
              }
            }
          }
        }
      }

      console.log(`\n========================================`);
      console.log(`Created ${created.length} demo disputes`);
      console.log(`========================================\n`);

      res.status(200).json({
        success: true,
        message: `Created ${created.length} demo disputes`,
        organizationId: organizationId,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Demo seed failed:", error);
      res.status(500).json({
        error: "Failed to seed demo data",
        details: error.message,
      });
    }
  }
);

// Helper functions to map state to status values
function getStripeStatusForState(state: string): string {
  switch (state) {
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "submitted":
      return "under_review";
    default:
      return "needs_response";
  }
}

function getInternalStatusForState(state: string): string {
  switch (state) {
    case "new":
      return "needs_review";
    case "ai_plan_generated":
    case "evidence_uploaded":
      return "awaiting_docs";
    case "argument_ready":
      return "ready_to_submit";
    case "submitted":
      return "submitted";
    case "won":
      return "resolved";
    case "lost":
      return "resolved";
    default:
      return "needs_review";
  }
}

function getLifecycleStatusForState(state: string): string {
  switch (state) {
    case "new":
      return "new";
    case "ai_plan_generated":
    case "evidence_uploaded":
      return "evidence_in_progress";
    case "argument_ready":
      return "draft_ready";
    case "submitted":
      return "submitted";
    case "won":
      return "won";
    case "lost":
      return "lost";
    default:
      return "new";
  }
}

