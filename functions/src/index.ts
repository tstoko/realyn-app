import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { Request, Response } from "express";
import { getOrganizationIdFromStripeEvent, getPaymentMetadata } from "./utils/stripeHelpers";
import { normalizeStripeDispute } from "./utils/disputeNormalizer";
import { upsertUnifiedDispute, updateDisputeStatus as updateUnifiedDisputeStatus } from "./services/disputeService";
import { recordDisputeOutcome } from "./services/winPatternService";
import { applyRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "./utils/rateLimiter";
import { sendInternalError } from "./utils/httpErrorResponse";

import { configureTelemetry } from "@realyn/ai-core/telemetry";
import { cloudLoggingEmitter } from "./lib/cloudLoggingTelemetry";
// Side-effect import: registers the Pinecone-backed VectorStorePort + rerank
// port via `configureVectorStore` / `configureRerankPort` so the ai-core
// retrieval path has a live backend in every deployed function (and not just
// in the scripts that explicitly import this module). Without this line, every
// invocation of `retrieveRagContext` short-circuits to EMPTY_RAG_RESULT
// silently because `_store` in ai-core's ragService is null — the bug that
// made the first C7 deploy log `[rag] chunksReturned=0` despite the index
// having 2284 vectors and the query being valid.
import "./services/ai/ragService";

admin.initializeApp();
// Ignore undefined fields when writing to Firestore. Required because the
// AI pipeline's fallback paths (e.g. fallback relevance scorer when the LLM
// is rate-limited or quota-exhausted) can produce nested objects with
// `undefined` properties, which the Firestore Admin SDK rejects by default
// — surfacing as `Cannot use "undefined" as a Firestore value (found in
// field "cachedRelevanceScores.scores.0.alreadyAvailable")` and breaking
// the planning pipeline write-back. Treating undefined as "don't write
// this field" is the firebase-admin equivalent of how the client SDK
// already behaves with this setting on. Settings must be applied before
// the first Firestore call, so this lives next to initializeApp().
admin.firestore().settings({ ignoreUndefinedProperties: true });
configureTelemetry(cloudLoggingEmitter);

// Define secrets
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const webhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

/**
 * Stripe webhook handler for dispute events
 * Note: Firebase Functions v2 parses JSON bodies automatically, so signature verification
 * is skipped when raw body is unavailable. For production, consider using v1 functions
 * or Cloud Run for proper signature verification.
 */
export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, webhookSecret],
    cors: false,
  },
  async (req: Request, res: Response) => {
    // Validate configuration
    const stripeKey = stripeSecretKey.value().trim();
    const webhookKey = webhookSecret.value().trim();
    
    if (!stripeKey || !webhookKey) {
      console.error("Missing Stripe configuration");
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      res.status(400).json({ error: "Missing signature header" });
      return;
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Attempt to get raw body for signature verification
    let event: Stripe.Event;
    const rawBody = getRawBody(req);

    if (rawBody) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookKey) as Stripe.Event;
      } catch (error: unknown) {
        console.error("Signature verification failed:", error);
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    } else {
      console.error("Raw body unavailable - cannot verify webhook signature. Use Firebase Functions v1 or Cloud Run for proper signature verification.");
      res.status(400).json({ error: "Unable to verify webhook signature" });
      return;
    }

    const rateLimitOk = await applyRateLimit(
      req, res, getClientIP(req), RATE_LIMIT_CONFIGS.webhook
    );
    if (!rateLimitOk) return;

    try {
      // Idempotency: skip if this event was already processed
      const db = admin.firestore();
      const eventRef = db.collection("_processedWebhookEvents").doc(event.id);
      const alreadyProcessed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef);
        if (snap.exists) return true;
        tx.set(eventRef, {
          provider: "stripe",
          eventType: event.type,
          processedAt: FieldValue.serverTimestamp(),
        });
        return false;
      });

      if (alreadyProcessed) {
        console.log(`[StripeWebhook] Duplicate event ${event.id} — skipping`);
        res.json({ received: true, duplicate: true });
        return;
      }

      await processStripeEvent(event, stripe);
      res.json({ received: true });
    } catch (error: unknown) {
      sendInternalError(res, error, "StripeWebhook");
    }
  }
);

/**
 * Extract raw body from request if available
 */
function getRawBody(req: Request): Buffer | null {
  // Try different methods to get raw body
  if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
    return (req as any).rawBody;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return null;
}

/**
 * Process Stripe webhook events using the unified dispute pipeline
 */
async function processStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  switch (event.type) {
    case "charge.dispute.created":
    case "charge.dispute.updated": {
      const organizationId = await getOrganizationIdFromStripeEvent(event, stripe);

      if (!organizationId) {
        // Cannot determine org — log for manual triage, do NOT assign to random org
        const db = admin.firestore();
        await db.collection("unmatchedWebhookEvents").add({
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
          disputeId: dispute.id,
          paymentIntentId: dispute.payment_intent || null,
          amount: dispute.amount,
          currency: dispute.currency,
          receivedAt: FieldValue.serverTimestamp(),
          reason: "Could not resolve organizationId from event metadata",
        });
        console.warn(
          `[StripeWebhook] Logged unmatched event ${event.id} (dispute ${dispute.id}) ` +
          "to unmatchedWebhookEvents for manual triage"
        );
        return;
      }

      const paymentMeta = dispute.payment_intent
        ? await getPaymentMetadata(dispute.payment_intent as string, stripe)
        : {};
      const normalized = normalizeStripeDispute(
        dispute,
        organizationId,
        paymentMeta.transactionDate,
        paymentMeta.last4
      );
      await upsertUnifiedDispute(normalized);
      console.log(`Upserted Stripe dispute ${dispute.id} for org ${organizationId}`);
      break;
    }
    case "charge.dispute.closed": {
      const { mapStripeStatus } = await import("./utils/disputeNormalizer");
      const mappedStatus = mapStripeStatus(dispute.status);
      await updateUnifiedDisputeStatus("stripe", dispute.id, mappedStatus);
      console.log(`Closed Stripe dispute: ${dispute.id}`);

      if (mappedStatus === "won" || mappedStatus === "lost") {
        const disputeDocId = `stripe_${dispute.id}`;
        recordDisputeOutcome(disputeDocId, mappedStatus).catch((err) => {
          console.error(`[WinPattern] Failed to record outcome for ${disputeDocId}:`, err);
        });
      }
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// --- HTTP / scheduled handlers (re-exported for deployment) ---
export {
  planEvidence,
  onEvidencePlanQueued,
  updateEvidenceItem,
  getProgress,
  toggleAIPlan,
  draftArgument,
} from "./handlers/aiDisputeHandlers";
export { testStripeConnection, testAdyenConnection } from "./handlers/pspConnectionTest";
export {
  submitStripeDisputeResponse,
  submitAdyenDisputeResponse,
  submitDisputeResponse,
} from "./handlers/submitDisputeResponse";
export { adyenWebhook } from "./handlers/adyenWebhook";
export { adyenManualSync } from "./handlers/adyenManualSync";
export { processCSVImportHandler as processCSVImport } from "./handlers/csvImportHandler";
export {
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  updateSelfProfileHandler,
} from "./handlers/userManagementHandler";
export {
  deleteOrganization,
  deleteDispute,
  deleteUser,
  anonymizeDisputeHandler,
  exportOrganization,
  exportUser,
} from "./handlers/dataRetention";
export { dataRetentionCleanup } from "./handlers/dataRetentionScheduler";
export {
  archiveOrganizationDisputes,
  getArchivedDisputesHandler,
} from "./handlers/disputeArchiveHandler";
export { seedOrganizationsHandler } from "./handlers/seedOrganizationsHandler";
export { seedUsersHandler } from "./handlers/seedUsersHandler";
export { seedTestDisputes } from "./handlers/seedTestDisputes";
export { seedCustomDispute } from "./handlers/seedCustomDispute";
export { seedDemoData } from "./handlers/seedDemoData";
export { seedDiceDemoData } from "./handlers/seedDiceDemoHandler";
export { seedNimaxDemoData } from "./handlers/seedNimaxDemoHandler";
export { seedZipworldDemoData } from "./handlers/seedZipworldDemoHandler";
export { seedSkiddleDemoData } from "./handlers/seedSkiddleDemoHandler";
export { seedSadlersWellsDemoData } from "./handlers/seedSadlersWellsDemoHandler";
export { seedAttractionworldDemoData } from "./handlers/seedAttractionworldDemoHandler";
export { seedKnowledgeBase } from "./handlers/seedKnowledgeBase";
export { resetTestEnvironmentHandler } from "./handlers/resetTestEnvironment";
export { clearDisputesHandler } from "./handlers/clearDisputes";
export { adminUpdateDispute } from "./handlers/adminUpdateDispute";
export { updateWebhookSecretHandler } from "./handlers/updateWebhookSecretHandler";
export { testOperaCloudConnection } from "./handlers/operaCloudConnectionTest";
export { seedPitchDemo } from "./handlers/seedPitchDemo";
export { argumentWriteHandler } from "./handlers/argumentHandler";
export { evidenceWriteHandler } from "./handlers/evidenceWriteHandler";
export { organizationWriteHandler } from "./handlers/organizationWriteHandler";
export { disputeWriteHandler } from "./handlers/disputeWriteHandler";
export { userWriteHandler } from "./handlers/userWriteHandler";
export { syncUserClaims, migrateCustomClaims } from "./handlers/setCustomClaims";
export { signup } from "./handlers/signupHandler";
export { createCheckoutSession, billingWebhook, createBillingPortalSession } from "./handlers/billingHandlers";
export { disputeNotificationTrigger } from "./handlers/disputeNotificationTrigger";
export { deadlineReminderScheduler } from "./handlers/deadlineReminderScheduler";
export { disputeSyncScheduler } from "./handlers/disputeSyncScheduler";
export { disputeManualSync } from "./handlers/disputeManualSync";
export { createInvite, listInvites, revokeInvite } from "./handlers/inviteHandlers";
export { acceptInvite } from "./handlers/acceptInviteHandler";
export {
  listTeamMembers,
  removeTeamMember,
  updateTeamMemberRole,
} from "./handlers/teamHandlers";
