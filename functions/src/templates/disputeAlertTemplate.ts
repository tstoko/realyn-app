import { emailLayout, formatCurrency } from "./emailLayout";

export interface DisputeAlertData {
  disputeId: string;
  amount: number;
  currency: string;
  reason: string | null;
  respondBy: Date | null;
  pspProvider: string;
  dashboardUrl: string;
}

export function disputeAlertTemplate(data: DisputeAlertData): { subject: string; html: string } {
  const amountStr = formatCurrency(data.amount, data.currency);
  const deadlineStr = data.respondBy
    ? new Date(data.respondBy).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Not specified";

  const subject = `New dispute: ${amountStr} — action required`;

  const html = emailLayout(subject, `
    <h1>New Dispute Received</h1>
    <p>A new chargeback dispute has been filed against your organization and requires your attention.</p>
    <div class="highlight">
      <p><strong>Amount:</strong> ${amountStr}</p>
      <p><strong>Reason:</strong> ${data.reason || "Not specified"}</p>
      <p><strong>Provider:</strong> ${data.pspProvider}</p>
      <p><strong>Response deadline:</strong> ${deadlineStr}</p>
    </div>
    <a href="${data.dashboardUrl}" class="btn">View Dispute</a>
    <p style="font-size: 13px; color: #94a3b8;">Dispute ID: ${data.disputeId}</p>
  `);

  return { subject, html };
}
