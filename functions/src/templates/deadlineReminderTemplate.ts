import { emailLayout, formatCurrency } from "./emailLayout";

export interface DeadlineReminderData {
  disputeId: string;
  amount: number;
  currency: string;
  reason: string | null;
  daysRemaining: number;
  respondBy: Date;
  dashboardUrl: string;
}

export function deadlineReminderTemplate(data: DeadlineReminderData): { subject: string; html: string } {
  const amountStr = formatCurrency(data.amount, data.currency);
  const deadlineStr = new Date(data.respondBy).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const urgencyClass = data.daysRemaining <= 1 ? "badge-lost" : "badge-urgent";
  const urgencyLabel = data.daysRemaining <= 1 ? "CRITICAL" : "URGENT";

  const subject = `Deadline in ${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"}: ${amountStr} dispute`;

  const html = emailLayout(subject, `
    <h1>Evidence Deadline Approaching</h1>
    <p>
      <span class="badge ${urgencyClass}">${urgencyLabel}</span>
    </p>
    <p>You have <strong>${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"}</strong> remaining to submit evidence for this dispute.</p>
    <div class="highlight">
      <p><strong>Amount:</strong> ${amountStr}</p>
      <p><strong>Reason:</strong> ${data.reason || "Not specified"}</p>
      <p><strong>Deadline:</strong> ${deadlineStr}</p>
    </div>
    <a href="${data.dashboardUrl}" class="btn">Submit Evidence</a>
    <p style="font-size: 13px; color: #94a3b8;">Dispute ID: ${data.disputeId}</p>
  `);

  return { subject, html };
}
