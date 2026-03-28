import { auth } from '@realyn/shared';

/**
 * Headers for HTTPS Cloud Functions that use Firebase ID token verification.
 */
export async function getCloudFunctionJsonHeaders(): Promise<
  { ok: true; headers: Record<string, string> } | { ok: false; error: string }
> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { ok: false, error: 'Not authenticated' };
  }
  const idToken = await currentUser.getIdToken();
  return {
    ok: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  };
}
