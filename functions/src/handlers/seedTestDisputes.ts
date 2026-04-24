import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { verifyAdmin, sendAuthError } from "../utils/authMiddleware";
import { shouldEnableTestHandlers, ALLOWED_ORIGINS } from "../config/environment";

const db = admin.firestore();

// Test disputes with different reason codes
const testDisputes = [
  {
    reason: "product_not_received",
    description: "Guest claims they never received the service/room",
    amount: 15000, // $150.00
  },
  {
    reason: "credit_not_processed",
    description: "Guest claims refund was promised but not received",
    amount: 8500, // $85.00
  },
  {
    reason: "general",
    description: "General dispute - unspecified reason",
    amount: 12000, // $120.00
  },
];

export const seedTestDisputes = onRequest(
  { cors: ALLOWED_ORIGINS },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    if (!shouldEnableTestHandlers()) {
      res.status(403).json({ error: "Test handlers disabled in production" });
      return;
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      // Find an organization with Stripe integration
      const orgsSnapshot = await db.collection("organizations").get();
      
      let organizationId: string | null = null;
      
      for (const doc of orgsSnapshot.docs) {
        const data = doc.data();
        if (data.pspIntegrations?.stripe?.connected) {
          organizationId = doc.id;
          break;
        }
      }
      
      if (!organizationId && !orgsSnapshot.empty) {
        organizationId = orgsSnapshot.docs[0].id;
      }
      
      if (!organizationId) {
        res.status(400).json({ error: "No organization found!" });
        return;
      }

      console.log(`Using organization: ${organizationId}`);
      
      const now = new Date();
      const respondBy = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      const created: string[] = [];
      
      for (let i = 0; i < testDisputes.length; i++) {
        const testDispute = testDisputes[i];
        const timestamp = Date.now() + i;
        const pspDisputeId = `du_test_${testDispute.reason}_${timestamp}`;
        const pspPaymentId = `pi_test_${timestamp}`;
        
        const disputeData = {
          organizationId: organizationId,
          pspProvider: "stripe",
          pspDisputeId: pspDisputeId,
          pspPaymentId: pspPaymentId,
          pspTransactionDate: admin.firestore.Timestamp.fromDate(
            new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
          ),
          pspLast4Digits: String(1000 + i).slice(-4),
          
          amount: testDispute.amount,
          currency: "usd",
          reason: testDispute.reason,
          status: "needs_response",
          customerExplanation: testDispute.description,
          
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
          respondBy: admin.firestore.Timestamp.fromDate(respondBy),
          
          internalStatus: "needs_review",
          lifecycleStatus: "new",
          automationStatus: "manual_review",
          
          auditTrail: [
            {
              timestamp: admin.firestore.Timestamp.now(),
              title: "Test Dispute Created",
              description: `Test ${testDispute.reason} dispute. ${testDispute.description}`,
              status: "success",
            },
          ],
          
          evidencePlan: null,
          evidenceItems: [],
          useAIPlan: true,
        };
        
        const docRef = await db.collection("disputes").add(disputeData);
        created.push(`${testDispute.reason}: ${docRef.id}`);
      }

      res.status(200).json({
        success: true,
        message: `Created ${created.length} test disputes`,
        organizationId: organizationId,
        disputes: created,
      });
    } catch (error: any) {
      console.error("Seed failed:", error);
      res.status(500).json({ 
        error: "Failed to seed disputes", 
        details: error.message 
      });
    }
  }
);

