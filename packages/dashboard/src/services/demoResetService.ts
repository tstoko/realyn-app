import { auth } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';
import {
  ATTRACTIONWORLD_ORG_ID,
  DICE_ORG_ID,
  NIMAX_ORG_ID,
  SADLERS_WELLS_ORG_ID,
  SKIDDLE_ORG_ID,
  ZIPWORLD_ORG_ID,
} from '../config/demoOrganizations';

export type DemoResetResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Admin-authenticated HTTP reset: routes to the correct seed endpoint per demo org.
 * DICE → seedDiceDemoData, Nimax → seedNimaxDemoData, Zip World → seedZipworldDemoData, Skiddle → seedSkiddleDemoData, Sadler's Wells → seedSadlersWellsDemoData, Attraction World Group → seedAttractionworldDemoData, otherwise seedPitchDemo.
 * Note: those HTTP handlers return 403 when `shouldEnableTestHandlers()` is false (production Cloud Functions).
 * Use CLI `npm run seed:*` from the repo root for production/staging Firestore+Auth.
 */
export async function performDemoReset(organizationId?: string | null): Promise<DemoResetResult> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, message: 'You must be signed in to reset the demo.' };
  }
  const idToken = await user.getIdToken();

  let url: string;
  let body: string;

  if (organizationId === DICE_ORG_ID) {
    url = `${FUNCTIONS_BASE_URL}/seedDiceDemoData`;
    body = JSON.stringify({ replaceDisputes: true });
  } else if (organizationId === NIMAX_ORG_ID) {
    url = `${FUNCTIONS_BASE_URL}/seedNimaxDemoData`;
    body = JSON.stringify({ replaceDisputes: true });
  } else if (organizationId === ZIPWORLD_ORG_ID) {
    url = `${FUNCTIONS_BASE_URL}/seedZipworldDemoData`;
    body = JSON.stringify({ replaceDisputes: true });
  } else if (organizationId === SKIDDLE_ORG_ID) {
    url = `${FUNCTIONS_BASE_URL}/seedSkiddleDemoData`;
    body = JSON.stringify({ replaceDisputes: true });
  } else if (organizationId === SADLERS_WELLS_ORG_ID) {
    url = `${FUNCTIONS_BASE_URL}/seedSadlersWellsDemoData`;
    body = JSON.stringify({ replaceDisputes: true });
  } else if (organizationId === ATTRACTIONWORLD_ORG_ID) {
    url = `${FUNCTIONS_BASE_URL}/seedAttractionworldDemoData`;
    body = JSON.stringify({ replaceDisputes: true });
  } else {
    url = `${FUNCTIONS_BASE_URL}/seedPitchDemo`;
    body = '{}';
  }

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
