import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { sendDeadlineReminder } from "../services/emailService";

const DASHBOARD_BASE_URL = process.env.DASHBOARD_URL || "https://dashboard.realyn.app";
const REMINDER_DAYS_THRESHOLD = 3;

/**
 * Daily scheduled function that emails users about disputes
 * with evidence deadlines within the next 3 days.
 */
export const deadlineReminderScheduler = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "UTC",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + REMINDER_DAYS_THRESHOLD * 86_400_000);

    const disputesSnap = await db
      .collection("disputes")
      .where("status", "==", "needs_response")
      .where("respondBy", "<=", admin.firestore.Timestamp.fromDate(thresholdDate))
      .where("respondBy", ">", admin.firestore.Timestamp.fromDate(now))
      .get();

    if (disputesSnap.empty) {
      console.log("deadlineReminderScheduler: no upcoming deadlines");
      return;
    }

    console.log(`deadlineReminderScheduler: ${disputesSnap.size} disputes with upcoming deadlines`);

    let sent = 0;
    let errors = 0;

    for (const doc of disputesSnap.docs) {
      const data = doc.data();
      const organizationId = data.organizationId as string | undefined;
      if (!organizationId) continue;

      const respondBy = data.respondBy?.toDate?.() ?? new Date(data.respondBy);
      const daysRemaining = Math.max(0, Math.ceil((respondBy.getTime() - now.getTime()) / 86_400_000));

      try {
        await sendDeadlineReminder(organizationId, {
          disputeId: doc.id,
          amount: data.amount ?? 0,
          currency: data.currency ?? "usd",
          reason: data.reason ?? null,
          daysRemaining,
          respondBy,
          dashboardUrl: `${DASHBOARD_BASE_URL}/disputes/${doc.id}`,
        });
        sent++;
      } catch (error) {
        console.error(`Failed to send deadline reminder for ${doc.id}:`, error);
        errors++;
      }
    }

    console.log(`deadlineReminderScheduler: sent=${sent}, errors=${errors}`);
  },
);
