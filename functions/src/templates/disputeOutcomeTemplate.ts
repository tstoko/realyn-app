import { emailLayout, formatCurrency } from "./emailLayout";

export interface DisputeOutcomeData {
  disputeId: string;
  amount: number;
  currency: string;
  reason: string | null;
  outcome: "won" | "lost";
  dashboardUrl: string;
}

export function disputeOutcomeTemplate(data: DisputeOutcomeData): { subject: string; html: string } {
  const amountStr = formatCurrency(data.amount, data.currency);
  const isWon = data.outcome === "won";
  const badgeClass = isWon ? "badge-won" : "badge-lost";
  const outcomeLabel = isWon ? "WON" : "LOST";
  const message = isWon
    ? "The dispute has been resolved in your favor. The chargeback amount will be returned."
    : "Unfortunately, the dispute was not resolved in your favor. The chargeback amount has been deducted.";

  const subject = `Dispute ${data.outcome}: ${amountStr}`;

  const html = emailLayout(subject, `
    <h1>Dispute Resolved</h1>
    <p>
      <span class="badge ${badgeClass}">${outcomeLabel}</span>
    </p>
    <p>${message}</p>
    <div class="highlight">
      <p><strong>Amount:</strong> ${amountStr}</p>
      <p><strong>Reason:</strong> ${data.reason || "Not specified"}</p>
      <p><strong>Outcome:</strong> ${outcomeLabel}</p>
    </div>
    <a href="${data.dashboardUrl}" class="btn">View Details</a>
    <p style="font-size: 13px; color: #94a3b8;">Dispute ID: ${data.disputeId}</p>
  `);

  return { subject, html };
}
