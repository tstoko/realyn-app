import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

/**
 * HTTP endpoint to seed a custom dispute with provided data
 * 
 * Usage: POST /seedCustomDispute
 * Body: {
 *   organizationId: string (optional - will use first org if not provided)
 *   amount: number (in minor units, e.g. pence/cents)
 *   currency: string
 *   reason: string
 *   customerExplanation: string
 *   last4: string (optional)
 *   transactionDate: string (ISO date, optional)
 *   bookingRef: string (optional - for description)
 * }
 */
export const seedCustomDispute = onRequest(
  { cors: true },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    try {
      const db = admin.firestore();
      const {
        organizationId: providedOrgId,
        amount,
        currency = "gbp",
        reason = "subscription_canceled",
        customerExplanation,
        last4 = "1234",
        transactionDate,
        bookingRef,
      } = req.body;

      // Find organization
      let organizationId = providedOrgId;
      
      if (!organizationId) {
        const orgsSnapshot = await db.collection("organizations").limit(10).get();
        
        // Prefer test_stripe_org
        for (const doc of orgsSnapshot.docs) {
          if (doc.id === "test_stripe_org") {
            organizationId = doc.id;
            break;
          }
        }
        
        // Fall back to first organization
        if (!organizationId && !orgsSnapshot.empty) {
          organizationId = orgsSnapshot.docs[0].id;
        }
      }
      
      if (!organizationId) {
        res.status(400).json({ error: "No organization found!" });
        return;
      }

      const now = new Date();
      const txDate = transactionDate ? new Date(transactionDate) : new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const respondBy = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
      const timestamp = Date.now();

      const disputeData = {
        // Organization and PSP info
        organizationId: organizationId,
        pspProvider: "stripe",
        pspDisputeId: `du_custom_${timestamp}`,
        pspPaymentId: `pi_custom_${timestamp}`,
        pspTransactionDate: admin.firestore.Timestamp.fromDate(txDate),
        pspLast4Digits: last4,
        
        // Dispute details
        amount: amount || 41280,
        currency: currency,
        reason: reason,
        status: "needs_response",
        customerExplanation: customerExplanation || "Custom test dispute",
        
        // Dates
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        respondBy: admin.firestore.Timestamp.fromDate(respondBy),
        
        // Internal status
        internalStatus: "needs_review",
        lifecycleStatus: "new",
        automationStatus: "auditing",
        
        // Audit trail
        auditTrail: [
          {
            timestamp: admin.firestore.Timestamp.now(),
            title: "Dispute Received",
            description: bookingRef 
              ? `Chargeback received. Booking ref: ${bookingRef}` 
              : "Custom test dispute created via API",
            status: "success",
            category: "dispute_received",
          },
        ],
        
        internalNotes: [],
        evidencePlan: null,
        evidenceItems: [],
        useAIPlan: true,
        aiSummary: "",
        aiDraftResponse: "",
        isDraftApproved: false,
      };

      const docRef = await db.collection("disputes").add(disputeData);
      
      res.status(200).json({
        success: true,
        message: "Custom dispute created",
        disputeId: docRef.id,
        organizationId: organizationId,
        amount: amount,
        currency: currency,
        reason: reason,
      });
    } catch (error: any) {
      console.error("Seed custom dispute failed:", error);
      res.status(500).json({ 
        error: "Failed to create dispute", 
        details: error.message 
      });
    }
  }
);

