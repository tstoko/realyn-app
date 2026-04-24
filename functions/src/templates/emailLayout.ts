/**
 * Shared HTML email layout wrapper.
 * All transactional emails use this for consistent branding.
 */

export function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: #1e293b; border-radius: 8px; padding: 32px; color: #e2e8f0; }
    .logo { font-size: 24px; font-weight: 700; color: #818cf8; margin-bottom: 24px; }
    h1 { color: #f8fafc; font-size: 20px; margin: 0 0 16px; }
    p { color: #cbd5e1; line-height: 1.6; margin: 0 0 12px; }
    .highlight { background-color: #334155; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .highlight strong { color: #f8fafc; }
    .btn { display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; padding-top: 24px; color: #64748b; font-size: 12px; }
    .footer a { color: #818cf8; text-decoration: none; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-won { background-color: #065f46; color: #6ee7b7; }
    .badge-lost { background-color: #7f1d1d; color: #fca5a5; }
    .badge-new { background-color: #1e3a5f; color: #93c5fd; }
    .badge-urgent { background-color: #78350f; color: #fcd34d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">Realyn</div>
      ${body}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Realyn. All rights reserved.</p>
      <p><a href="https://realyn.app">realyn.app</a></p>
    </div>
  </div>
</body>
</html>`;
}

export function formatCurrency(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}
