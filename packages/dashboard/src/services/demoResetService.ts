import { auth } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';
import { DICE_ORG_ID } from '../config/demoOrganizations';

export type DemoResetResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Admin-authenticated HTTP reset: DICE org → seedDiceDemoData; otherwise seedPitchDemo.
 * Matches DemoModeBanner behaviour.
 */
export async function performDemoReset(organizationId?: string | null): Promise<DemoResetResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, message: 'You must be signed in to reset the demo.' };
  }
  const idToken = await user.getIdToken();
  const isDice = organizationId === DICE_ORG_ID;
  const url = isDice
    ? `${FUNCTIONS_BASE_URL}/seedDiceDemoData`
    : `${FUNCTIONS_BASE_URL}/seedPitchDemo`;
  const body = isDice ? JSON.stringify({ replaceDisputes: true }) : '{}';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body,
  });
  if (response.ok) {
    return { ok: true };
  }
  const text = await response.text();
  return { ok: false, message: text || response.statusText };
}
