/**
 * Adyen Evidence Mapper
 * Maps our internal evidence structure to Adyen's chargeback defense format
 */

import type { EvidenceFile } from "../services/evidenceService";

export interface AdyenDefenseRequest {
  merchantAccount: string;
  originalReference: string;
  reference: string;
  comment?: string;
  documents?: Array<{
    documentType: string;
    content: string; // Base64 encoded file content
    filename: string;
  }>;
  defenseReasonCode?: string;
}

/**
 * Map evidence files by category to Adyen defense documents
 */
export function mapEvidenceFilesToAdyen(
  evidenceFiles: EvidenceFile[],
  merchantAccount: string,
  originalReference: string,
  reference: string
): AdyenDefenseRequest {
  const defenseRequest: AdyenDefenseRequest = {
    merchantAccount,
    originalReference,
    reference,
    documents: [],
  };

  // Group files by category and map to Adyen document types
  const filesByCategory = evidenceFiles.reduce((acc, file) => {
    if (!acc[file.category]) {
      acc[file.category] = [];
    }
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, EvidenceFile[]>);

  // Map comms files to CUSTOMER_COMMUNICATION
  if (filesByCategory.comms) {
    filesByCategory.comms.forEach(file => {
      defenseRequest.documents!.push({
        documentType: "CUSTOMER_COMMUNICATION",
        content: file.downloadURL, // Adyen accepts URLs or base64
        filename: file.fileName,
      });
    });
  }

  // Map pms, proofOfStay, and policy files to SERVICE_DOCUMENTATION
  if (filesByCategory.pms) {
    filesByCategory.pms.forEach(file => {
      defenseRequest.documents!.push({
        documentType: "SERVICE_DOCUMENTATION",
        content: file.downloadURL,
        filename: file.fileName,
      });
    });
  }
  if (filesByCategory.proofOfStay) {
    filesByCategory.proofOfStay.forEach(file => {
      defenseRequest.documents!.push({
        documentType: "SERVICE_DOCUMENTATION",
        content: file.downloadURL,
        filename: file.fileName,
      });
    });
  }
  if (filesByCategory.policy) {
    filesByCategory.policy.forEach(file => {
      defenseRequest.documents!.push({
        documentType: "SERVICE_DOCUMENTATION",
        content: file.downloadURL,
        filename: file.fileName,
      });
    });
  }

  // Map incidentReports files to OTHER
  if (filesByCategory.incidentReports) {
    filesByCategory.incidentReports.forEach(file => {
      defenseRequest.documents!.push({
        documentType: "OTHER",
        content: file.downloadURL,
        filename: file.fileName,
      });
    });
  }

  return defenseRequest;
}

/**
 * Build defense comment from text evidence
 */
export function buildAdyenDefenseComment(
  paymentData?: {
    avs?: string;
    cvv?: string;
    deviceIp?: string;
    threeDS?: string;
    priorHistory?: string;
  },
  pmsData?: {
    stayDates?: string;
    room?: string;
    ratePlan?: string;
    incidentals?: string;
  }
): string {
  const commentParts: string[] = [];

  if (pmsData) {
    commentParts.push("Guest Stay Information:");
    if (pmsData.stayDates) commentParts.push(`- Stay Dates: ${pmsData.stayDates}`);
    if (pmsData.room) commentParts.push(`- Room: ${pmsData.room}`);
    if (pmsData.ratePlan) commentParts.push(`- Rate Plan: ${pmsData.ratePlan}`);
    if (pmsData.incidentals) commentParts.push(`- Incidentals: ${pmsData.incidentals}`);
  }

  if (paymentData) {
    commentParts.push("\nPayment Verification:");
    if (paymentData.avs) commentParts.push(`- AVS: ${paymentData.avs}`);
    if (paymentData.cvv) commentParts.push(`- CVV: ${paymentData.cvv}`);
    if (paymentData.threeDS) commentParts.push(`- 3D Secure: ${paymentData.threeDS}`);
    if (paymentData.deviceIp) commentParts.push(`- Device IP: ${paymentData.deviceIp}`);
    if (paymentData.priorHistory) commentParts.push(`- Prior History: ${paymentData.priorHistory}`);
  }

  return commentParts.join("\n");
}




