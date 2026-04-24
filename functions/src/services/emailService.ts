import { Resend } from "resend";
import * as admin from "firebase-admin";
import { disputeAlertTemplate, type DisputeAlertData } from "../templates/disputeAlertTemplate";
import { deadlineReminderTemplate, type DeadlineReminderData } from "../templates/deadlineReminderTemplate";
import { disputeOutcomeTemplate, type DisputeOutcomeData } from "../templates/disputeOutcomeTemplate";

const FROM_ADDRESS = "Realyn <notifications@realyn.app>";
const MAX_RETRIES = 3;

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resend = getResend();
      const { error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      if (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw new Error(`Email send failed: ${error.message}`);
        }
        console.warn(`Email to ${to} failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, error.message);
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      console.warn(`Email to ${to} threw (attempt ${attempt + 1}/${MAX_RETRIES}):`, err instanceof Error ? err.message : err);
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}

function logBulkSendFailures(
  results: PromiseSettledResult<void>[],
  context: string,
): void {
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length > 0) {
    console.error(
      `${failures.length}/${results.length} emails failed for ${context}:`,
      failures.map((f) => f.reason?.message ?? f.reason),
    );
  }
}

export interface UserPreferences {
  notifications: {
    email: boolean;
    onActionRequired: boolean;
    onStatusChange: boolean;
    onPaymentAlert: boolean;
  };
}

const DEFAULT_PREFS: UserPreferences = {
  notifications: {
    email: true,
    onActionRequired: true,
    onStatusChange: true,
    onPaymentAlert: true,
  },
};

export async function getOrgUsersWithPreferences(
  organizationId: string,
): Promise<Array<{ email: string; preferences: UserPreferences }>> {
  const db = admin.firestore();
  const usersSnap = await db
    .collection("users")
    .where("organizationId", "==", organizationId)
    .get();

  return usersSnap.docs.map((doc) => {
    const data = doc.data();
    const prefs = data.preferences || {};
    return {
      email: data.email as string,
      preferences: {
        notifications: {
          ...DEFAULT_PREFS.notifications,
          ...(prefs.notifications || {}),
        },
      },
    };
  });
}

export async function sendDisputeAlert(
  organizationId: string,
  data: DisputeAlertData,
): Promise<void> {
  const users = await getOrgUsersWithPreferences(organizationId);
  const { subject, html } = disputeAlertTemplate(data);

  const recipients = users.filter(
    (u) => u.preferences.notifications.email && u.preferences.notifications.onActionRequired,
  );

  const results = await Promise.allSettled(
    recipients.map((u) => sendEmail(u.email, subject, html)),
  );
  logBulkSendFailures(results, `dispute alert org=${organizationId}`);
}

export async function sendDeadlineReminder(
  organizationId: string,
  data: DeadlineReminderData,
): Promise<void> {
  const users = await getOrgUsersWithPreferences(organizationId);
  const { subject, html } = deadlineReminderTemplate(data);

  const recipients = users.filter(
    (u) => u.preferences.notifications.email && u.preferences.notifications.onActionRequired,
  );

  const results = await Promise.allSettled(
    recipients.map((u) => sendEmail(u.email, subject, html)),
  );
  logBulkSendFailures(results, `deadline reminder org=${organizationId}`);
}

export async function sendDisputeOutcome(
  organizationId: string,
  data: DisputeOutcomeData,
): Promise<void> {
  const users = await getOrgUsersWithPreferences(organizationId);
  const { subject, html } = disputeOutcomeTemplate(data);

  const recipients = users.filter(
    (u) => u.preferences.notifications.email && u.preferences.notifications.onStatusChange,
  );

  const results = await Promise.allSettled(
    recipients.map((u) => sendEmail(u.email, subject, html)),
  );
  logBulkSendFailures(results, `dispute outcome org=${organizationId}`);
}

export async function sendRawEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  return sendEmail(to, subject, html);
}
