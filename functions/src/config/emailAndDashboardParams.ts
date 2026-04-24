import { defineSecret } from "firebase-functions/params";

/** Resend API key — bind to any function that sends email. Injected as `process.env.RESEND_API_KEY` at runtime. */
export const resendApiKeySecret = defineSecret("RESEND_API_KEY");

/**
 * Dashboard base URL for email links (no trailing slash).
 * Set `DASHBOARD_URL` on each deployed function (or shared Cloud Run env) so staging
 * invite links and email CTAs match the hosting URL (e.g. `https://realyn-app-staging-dashboard.web.app`).
 */
export function getDashboardBaseUrl(): string {
  const u = process.env.DASHBOARD_URL?.trim();
  return (u || "https://dashboard.realyn.app").replace(/\/$/, "");
}
