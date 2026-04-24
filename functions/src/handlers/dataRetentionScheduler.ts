/**
 * Scheduled Data Retention Enforcer
 *
 * Runs daily to auto-anonymize resolved disputes that have exceeded the
 * configured retention period, and cleans up stale rate-limit entries.
 *
 * GDPR Art. 5(1)(e) - Storage Limitation: personal data shall be kept
 * no longer than is necessary for the purposes for which it is processed.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { anonymizeDispute, cleanupExpiredPMSData } from "../services/dataRetentionService";
import { getRateLimiter } from "../utils/rateLimiter";

const DEFAULT_RETENTION_DAYS = 730; // 2 years

function getRetentionDays(): number {
  const envVal = process.env.DATA_RETENTION_DAYS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_RETENTION_DAYS;
}

export const dataRetentionCleanup = onSchedule(
  {
    schedule: "every day 02:00",
    timeZone: "UTC",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const db = admin.firestore();
    const retentionDays = getRetentionDays();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(
      `[DataRetention Scheduler] Running with retention=${retentionDays} days, cutoff=${cutoffDate.toISOString()}`
    );

    const terminalStatuses = ["won", "lost", "warning_closed"];
    let anonymized = 0;
    let errors = 0;

    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoffDate);
    const PAGE_SIZE = 200;
    /** Max disputes to process per terminal status per scheduler run (prevents timeout starvation). */
    const MAX_PER_STATUS = 5000;

    for (const status of terminalStatuses) {
      let processedThisStatus = 0;
      let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

      while (processedThisStatus < MAX_PER_STATUS) {
        let q = db
          .collection("disputes")
          .where("status", "==", status)
          .where("updatedAt", "<", cutoffTs)
          .orderBy("updatedAt", "asc")
          .limit(PAGE_SIZE);
        if (lastDoc) {
          q = q.startAfter(lastDoc);
        }
        const snapshot = await q.get();
        if (snapshot.empty) break;

        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (data.anonymizedAt) continue;

          const orgId = data.organizationId;
          if (!orgId) continue;

          const result = await anonymizeDispute(doc.id, orgId);
          if (result.success) {
            anonymized++;
          } else {
            errors++;
            console.warn(
              `[DataRetention Scheduler] Failed to anonymize ${doc.id}: ${result.error}`
            );
          }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        processedThisStatus += snapshot.docs.length;
        if (snapshot.docs.length < PAGE_SIZE) break;
      }
    }

    // Clean up stale rate-limit entries (older than 24 hours)
    let rateLimitsCleaned = 0;
    try {
      rateLimitsCleaned = await getRateLimiter().cleanup(86400);
    } catch (err) {
      console.warn("[DataRetention Scheduler] Rate limit cleanup error:", err);
    }

    // Clean up expired PMS import data (resolved disputes + 90 day grace)
    let pmsReservationsDeleted = 0;
    try {
      const pmsResult = await cleanupExpiredPMSData();
      pmsReservationsDeleted = pmsResult.reservationsDeleted;
    } catch (err) {
      console.warn("[DataRetention Scheduler] PMS data cleanup error:", err);
    }

    console.log(
      `[DataRetention Scheduler] Complete: ${anonymized} disputes anonymized, ` +
      `${errors} errors, ${rateLimitsCleaned} rate-limit entries cleaned, ` +
      `${pmsReservationsDeleted} PMS reservations cleaned`
    );
  }
);
