import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { sendDisputeAlert, sendDisputeOutcome } from "../services/emailService";
import {
  resendApiKeySecret,
  getDashboardBaseUrl,
} from "../config/emailAndDashboardParams";

/**
 * Firestore trigger that sends email notifications when disputes are
 * created or their status changes. Fires on every write to disputes/{disputeId}.
 */
export const disputeNotificationTrigger = onDocumentWritten(
  {
    document: "disputes/{disputeId}",
    secrets: [resendApiKeySecret],
  },
  async (event) => {
    const dashboardBaseUrl = getDashboardBaseUrl();
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!after) return;

    const organizationId = after.organizationId as string | undefined;
    if (!organizationId) return;

    const disputeId = event.params.disputeId;
    const dashboardUrl = `${dashboardBaseUrl}/disputes/${disputeId}`;

    try {
      if (!before) {
        await sendDisputeAlert(organizationId, {
          disputeId,
          amount: after.amount ?? 0,
          currency: after.currency ?? "usd",
          reason: after.reason ?? null,
          respondBy: after.respondBy?.toDate?.() ?? after.respondBy ?? null,
          pspProvider: after.pspProvider ?? "unknown",
          dashboardUrl,
        });
        return;
      }

      const oldStatus = before.status as string | undefined;
      const newStatus = after.status as string | undefined;

      if (oldStatus === newStatus) return;

      if (newStatus === "won" || newStatus === "lost") {
        await sendDisputeOutcome(organizationId, {
          disputeId,
          amount: after.amount ?? 0,
          currency: after.currency ?? "usd",
          reason: after.reason ?? null,
          outcome: newStatus,
          dashboardUrl,
        });
      }
    } catch (error) {
      console.error(`disputeNotificationTrigger error for ${disputeId}:`, error);
      // Rethrow to let Cloud Functions retry on transient failures (network, email service)
      throw error;
    }
  },
);
