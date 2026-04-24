import { emailLayout } from "./emailLayout";

export interface InviteEmailData {
  inviterName: string;
  organizationName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function inviteTemplate(data: InviteEmailData): { subject: string; html: string } {
  const subject = `You've been invited to join ${data.organizationName} on Realyn`;

  const html = emailLayout(subject, `
    <h1>You're Invited</h1>
    <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.organizationName}</strong> on Realyn as a <strong>${data.role}</strong>.</p>
    <p>Realyn helps hotels manage chargeback disputes with AI-powered evidence collection and response generation.</p>
    <div class="highlight">
      <p><strong>Organization:</strong> ${data.organizationName}</p>
      <p><strong>Your role:</strong> ${data.role}</p>
      <p><strong>Expires in:</strong> ${data.expiresInDays} days</p>
    </div>
    <a href="${data.acceptUrl}" class="btn">Accept Invitation</a>
    <p style="font-size: 13px; color: #94a3b8;">If you didn't expect this invitation, you can safely ignore this email.</p>
  `);

  return { subject, html };
}
