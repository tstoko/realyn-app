/**
 * PMS Import Service (Frontend)
 *
 * Handles CSV upload to the processCSVImport Cloud Function and
 * retrieval of import history from Firestore.
 */

import { collection, query, orderBy, getDocs, limit } from "firebase/firestore";
import { db, auth } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from "../config/environment";

export interface ImportResult {
  success: boolean;
  importId?: string;
  source?: { type: string; fileName?: string };
  fileHash?: string;
  reservationCount?: number;
  folioCount?: number;
  activityLogCount?: number;
  warnings?: string[];
  rowsParsed?: number;
  rowsSkipped?: number;
  error?: string;
}

export interface ImportRecord {
  id: string;
  source: { type: string; fileName?: string };
  fileHash: string;
  importedAt: Date;
  importedBy: string;
  reservationCount: number;
  folioCount: number;
  activityLogCount: number;
  warnings: string[];
  rowsParsed: number;
  rowsSkipped: number;
}

/**
 * Upload a CSV file for PMS import processing.
 */
export async function uploadCSVForImport(
  organizationId: string,
  file: File
): Promise<ImportResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const idToken = await currentUser.getIdToken();

    // Read file as text — the backend supports csvText directly.
    // Using file.text() preserves UTF-8 multi-byte sequences (accented
    // guest names, etc.) which the previous btoa(Uint8Array) approach corrupted.
    const text = await file.text();

    const response = await fetch(`${FUNCTIONS_BASE_URL}/processCSVImport`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        organizationId,
        csvText: text,
        fileName: file.name,
        uploadedBy: currentUser.uid,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Import failed with status ${response.status}`,
      };
    }

    return data as ImportResult;
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || "Failed to upload CSV",
    };
  }
}

/**
 * Get import history for an organization.
 */
export async function getImportHistory(
  organizationId: string,
  maxResults = 10
): Promise<ImportRecord[]> {
  const importsRef = collection(
    db,
    "organizations",
    organizationId,
    "pmsImports"
  );

  const q = query(importsRef, orderBy("importedAt", "desc"), limit(maxResults));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      source: data.source,
      fileHash: data.fileHash,
      importedAt: data.importedAt?.toDate?.() || new Date(data.importedAt),
      importedBy: data.importedBy,
      reservationCount: data.reservationCount || 0,
      folioCount: data.folioCount || 0,
      activityLogCount: data.activityLogCount || 0,
      warnings: data.warnings || [],
      rowsParsed: data.rowsParsed || 0,
      rowsSkipped: data.rowsSkipped || 0,
    };
  });
}
