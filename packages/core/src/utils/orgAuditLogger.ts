import * as admin from "firebase-admin";

export interface OrgAuditEvent {
  timestamp: admin.firestore.Timestamp;
  action: string;
  actor: { type: "user" | "system"; userId?: string; email?: string };
  details: Record<string, any>;
  status: "success" | "failure";
}

/**
 * Write an audit event to the org-level audit log subcollection.
 *
 * Unlike the dispute-scoped audit trail (array on the dispute doc), org-level
 * events are stored as individual documents so the collection can grow without
 * hitting Firestore document size limits.
 *
 * Callers must ensure `details` contains NO secrets or raw credentials.
 */
export async function logOrgAuditEvent(
    organizationId: string,
    event: Omit<OrgAuditEvent, "timestamp">,
): Promise<void> {
  const db = admin.firestore();
  try {
    await db
        .collection("organizations")
        .doc(organizationId)
        .collection("auditLog")
        .add({
          ...event,
          timestamp: admin.firestore.Timestamp.now(),
        });
  } catch (error) {
    console.error(
        `[OrgAudit] Failed to log event for org ${organizationId}:`,
        error,
    );
  }
}
