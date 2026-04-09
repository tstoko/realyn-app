import * as admin from "firebase-admin";

/**
 * Firestore rules use `request.auth.token.orgId`. CLI seeds hit Auth + Firestore directly;
 * the `syncUserClaims` trigger only runs when the Functions emulator is up — set claims here too.
 */
export async function applyDemoUserClaims(
  uid: string,
  organizationId: string,
  role: "user" | "admin" = "user",
): Promise<void> {
  const userRecord = await admin.auth().getUser(uid);
  const prev = (userRecord.customClaims || {}) as { claimsVersion?: number };
  const claimsVersion = typeof prev.claimsVersion === "number" ? prev.claimsVersion + 1 : 1;
  await admin.auth().setCustomUserClaims(uid, {
    orgId: organizationId,
    role,
    claimsVersion,
  });
  await admin.firestore().collection("users").doc(uid).set({ claimsVersion }, { merge: true });
}
