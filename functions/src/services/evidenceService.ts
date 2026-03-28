/**
 * Evidence Service (Backend)
 * Handles retrieving evidence files from Firestore for dispute response submission
 */

import * as admin from "firebase-admin";
import axios from "axios";
const pdfParse = require("pdf-parse");

import type { PMSMatchResult } from "./pms/pmsLookupService";
import { EvidenceRequirement, EvidenceItem, EvidencePlan } from "../types/aiDispute";

export interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storagePath: string;
  downloadURL: string;
  uploadedAt: admin.firestore.Timestamp;
  uploadedBy: string;
  category: 'pms' | 'policy' | 'proofOfStay' | 'comms' | 'incidentReports' | 'other';
}

/**
 * Get all evidence files for a dispute
 */
export async function getEvidenceFiles(disputeId: string): Promise<EvidenceFile[]> {
  const db = admin.firestore();
  const evidenceRef = db.collection("disputes").doc(disputeId).collection("evidence");
  const snapshot = await evidenceRef.get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as EvidenceFile[];
}

/**
 * Register an evidence file in the disputes/{disputeId}/evidence subcollection.
 *
 * This is the canonical way to make evidence visible to all downstream consumers:
 * - getEvidenceFiles() / getEnrichedEvidence() (AI argument generation)
 * - PSP evidence mappers (Stripe / Adyen submission)
 * - Dashboard evidence list
 *
 * Both manual uploads (from the dashboard) and automated uploads (PMS auto-collector)
 * MUST call this function so that evidence appears in the subcollection.
 *
 * @returns The Firestore document ID assigned to the evidence file.
 */
export async function registerEvidenceFile(params: {
  disputeId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storagePath: string;
  downloadURL: string;
  uploadedBy: string;
  category: EvidenceFile["category"];
  requirementId?: string;
}): Promise<string> {
  const db = admin.firestore();
  const evidenceDocId = `evidence_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  const batch = db.batch();

  // Write to evidence subcollection
  const evidenceRef = db
    .collection("disputes")
    .doc(params.disputeId)
    .collection("evidence")
    .doc(evidenceDocId);

  batch.set(evidenceRef, {
    id: evidenceDocId,
    fileName: params.fileName,
    fileSize: params.fileSize,
    fileType: params.fileType,
    storagePath: params.storagePath,
    downloadURL: params.downloadURL,
    uploadedBy: params.uploadedBy,
    category: params.category,
    ...(params.requirementId ? { requirementId: params.requirementId } : {}),
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update dispute's evidenceFiles array
  const disputeRef = db.collection("disputes").doc(params.disputeId);
  batch.update(disputeRef, {
    evidenceFiles: admin.firestore.FieldValue.arrayUnion(evidenceDocId),
  });

  await batch.commit();
  return evidenceDocId;
}

/**
 * Vision-compatible file for Claude vision analysis
 */
export interface VisionEvidenceFile {
  url: string;
  description: string;
  category: string;
  fileName: string;
  fileId: string;
}

/**
 * PDF file with extracted text content for AI analysis
 */
export interface PDFEvidenceFile {
  fileName: string;
  category: string;
  textContent: string;
  pageCount: number;
  fileId: string;
}

// =============================================================================
// Enriched Evidence Types (for comprehensive AI context)
// =============================================================================

/**
 * PSP-agnostic evidence slot names.
 * These represent meaningful evidence categories used across all PSP adapters.
 * The values align with Stripe's field names for backward compatibility,
 * but PSP-specific translation happens in the submission layer.
 */
export type EvidenceSlot = 
  | 'cancellation_policy'
  | 'cancellation_policy_disclosure'
  | 'refund_policy'
  | 'refund_policy_disclosure'
  | 'service_documentation'
  | 'customer_communication'
  | 'receipt'
  | 'duplicate_charge_documentation'
  | 'shipping_documentation'
  | 'uncategorized_file'
  | 'uncategorized_text';

/** @deprecated Use EvidenceSlot instead */
export type StripeEvidenceField = EvidenceSlot;

/**
 * Maps evidence categories to their primary evidence slot
 */
export const CATEGORY_TO_EVIDENCE_SLOT: Record<string, EvidenceSlot> = {
  policy: 'cancellation_policy',
  pms_data: 'service_documentation',
  proof_of_stay: 'service_documentation',
  communications: 'customer_communication',
  payment_data: 'uncategorized_text',
  incident_reports: 'uncategorized_file',
  delivery: 'shipping_documentation',
  other: 'uncategorized_file',
  pms: 'service_documentation',
  proofOfStay: 'service_documentation',
  comms: 'customer_communication',
  incidentReports: 'uncategorized_file',
};

/** @deprecated Use CATEGORY_TO_EVIDENCE_SLOT instead */
export const CATEGORY_TO_STRIPE_FIELD = CATEGORY_TO_EVIDENCE_SLOT;

/**
 * Human-readable descriptions for each evidence slot
 */
export const EVIDENCE_SLOT_DESCRIPTIONS: Record<EvidenceSlot, string> = {
  cancellation_policy: "Your cancellation policy as shown to the customer",
  cancellation_policy_disclosure: "Proof the customer was shown the cancellation policy",
  refund_policy: "Your refund policy as shown to the customer",
  refund_policy_disclosure: "Proof the customer was shown the refund policy",
  service_documentation: "Documentation showing service was provided (folios, check-in records)",
  customer_communication: "Communications with the customer (emails, messages)",
  receipt: "Receipt or invoice for the transaction",
  duplicate_charge_documentation: "Proof charges are not duplicates",
  shipping_documentation: "Shipping/tracking information",
  uncategorized_file: "Additional supporting documentation",
  uncategorized_text: "Additional text explanation",
};

/** @deprecated Use EVIDENCE_SLOT_DESCRIPTIONS instead */
export const STRIPE_FIELD_DESCRIPTIONS = EVIDENCE_SLOT_DESCRIPTIONS;

/**
 * Enriched evidence combining requirement, status, file, and extracted content
 * This provides comprehensive context to the AI for argument generation
 */
export interface EnrichedEvidence {
  // The requirement definition (what evidence was requested)
  requirement: EvidenceRequirement;
  
  // The status/tracking info (uploaded, not_available, etc.)
  item: EvidenceItem;
  
  // The actual file if uploaded
  file?: EvidenceFile;
  
  // Extracted PDF text content (if applicable)
  pdfText?: string;
  pdfPageCount?: number;
  
  // Pre-formatted text from structured PMS data (bypasses PDF round-trip)
  structuredPmsText?: string;
  
  // Image URL for vision analysis (if applicable)
  imageUrl?: string;
  
  // PSP-agnostic evidence slot this maps to
  evidenceSlot: EvidenceSlot;
  evidenceSlotDescription: string;
  
  /** @deprecated Use evidenceSlot */
  stripeField: EvidenceSlot;
  /** @deprecated Use evidenceSlotDescription */
  stripeFieldDescription: string;
  
  // Priority label for display
  priorityLabel: string;
}

/**
 * Supported file types for Claude vision analysis.
 * Vision only supports image formats, not PDFs directly.
 */
const VISION_SUPPORTED_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Category labels for evidence descriptions
 */
const CATEGORY_LABELS: Record<string, string> = {
  pms: "PMS/Booking System Record",
  policy: "Hotel Policy Document",
  proofOfStay: "Proof of Guest Stay",
  comms: "Guest Communication",
  incidentReports: "Incident Report",
  other: "Supporting Document",
};

/**
 * Get evidence files formatted for Claude vision analysis.
 * Filters to supported file types and returns URLs with context.
 */
export async function getEvidenceFilesForVision(
  disputeId: string
): Promise<VisionEvidenceFile[]> {
  const evidenceFiles = await getEvidenceFiles(disputeId);
  const visionFiles: VisionEvidenceFile[] = [];

  for (const file of evidenceFiles) {
    // Check if file type is supported for vision
    const isSupported = VISION_SUPPORTED_TYPES.some(type => 
      file.fileType.toLowerCase().includes(type.split('/')[1]) ||
      file.fileType.toLowerCase() === type
    );

    if (!isSupported) {
      console.log(`[Vision] Skipping unsupported file type: ${file.fileType} (${file.fileName})`);
      continue;
    }
    
    console.log(`[Vision] Including file: ${file.fileName} (${file.fileType})`);

    // Build description from category and filename
    const categoryLabel = CATEGORY_LABELS[file.category] || "Document";
    const description = `${categoryLabel}: ${file.fileName}`;

    visionFiles.push({
      url: file.downloadURL,
      description,
      category: file.category,
      fileName: file.fileName,
      fileId: file.id,
    });
  }

  // Limit to prevent token overflow (Claude can handle many, but be reasonable)
  const MAX_VISION_FILES = 10;
  if (visionFiles.length > MAX_VISION_FILES) {
    console.warn(`[Vision] Too many evidence files (${visionFiles.length}), limiting to ${MAX_VISION_FILES}`);
    return visionFiles.slice(0, MAX_VISION_FILES);
  }

  console.log(`[Vision] Returning ${visionFiles.length} files for analysis`);
  return visionFiles;
}

/**
 * Extract text content from a PDF file URL
 * Downloads the PDF, parses it, and returns extracted text
 * Limits to 10,000 characters to prevent token overflow
 */
async function getPDFTextContent(url: string): Promise<{ text: string; pageCount: number } | null> {
  try {
    console.log(`[PDF] Downloading PDF from: ${url}`);
    
    // Download PDF as buffer
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
      maxContentLength: 10 * 1024 * 1024, // 10MB max file size
    });

    const pdfBuffer = Buffer.from(response.data);
    
    // Parse PDF and extract text
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text || '';
    const pageCount = pdfData.numpages || 0;
    
    console.log(`[PDF] Extracted ${extractedText.length} characters from ${pageCount} pages`);
    
    // Limit text to 10,000 characters to prevent token overflow
    const MAX_TEXT_LENGTH = 10000;
    const limitedText = extractedText.length > MAX_TEXT_LENGTH
      ? extractedText.substring(0, MAX_TEXT_LENGTH) + `\n\n[... Content truncated - original length: ${extractedText.length} characters ...]`
      : extractedText;
    
    return {
      text: limitedText.trim(),
      pageCount,
    };
  } catch (error: any) {
    console.error(`[PDF] Failed to extract text from PDF (${url}):`, error.message);
    return null;
  }
}

/**
 * Get all PDF evidence files with extracted text content
 * Filters to PDF files, downloads each, and extracts text
 * Limits to 5 PDFs to balance thoroughness vs cost
 */
export async function getEvidencePDFsWithText(
  disputeId: string
): Promise<PDFEvidenceFile[]> {
  const evidenceFiles = await getEvidenceFiles(disputeId);
  const pdfFiles: PDFEvidenceFile[] = [];
  
  // Filter to PDF files only
  const pdfEvidenceFiles = evidenceFiles.filter(file => 
    file.fileType.toLowerCase() === 'application/pdf' ||
    file.fileType.toLowerCase().includes('pdf') ||
    file.fileName.toLowerCase().endsWith('.pdf')
  );
  
  console.log(`[PDF] Found ${pdfEvidenceFiles.length} PDF files to process`);
  
  // Limit to 5 PDFs max
  const MAX_PDF_FILES = 5;
  const filesToProcess = pdfEvidenceFiles.slice(0, MAX_PDF_FILES);
  
  if (pdfEvidenceFiles.length > MAX_PDF_FILES) {
    console.warn(`[PDF] Too many PDF files (${pdfEvidenceFiles.length}), limiting to ${MAX_PDF_FILES}`);
  }
  
  // Process each PDF
  for (const file of filesToProcess) {
    console.log(`[PDF] Processing: ${file.fileName}`);
    
    const textResult = await getPDFTextContent(file.downloadURL);
    
    if (!textResult || !textResult.text) {
      console.warn(`[PDF] No text extracted from ${file.fileName}, skipping`);
      continue;
    }
    
    const categoryLabel = CATEGORY_LABELS[file.category] || "Document";
    
    pdfFiles.push({
      fileName: file.fileName,
      category: categoryLabel,
      textContent: textResult.text,
      pageCount: textResult.pageCount,
      fileId: file.id,
    });
    
    console.log(`[PDF] Successfully extracted text from ${file.fileName} (${textResult.pageCount} pages)`);
  }
  
  console.log(`[PDF] Returning ${pdfFiles.length} PDFs with extracted text`);
  return pdfFiles;
}

// =============================================================================
// Enriched Evidence Function
// =============================================================================

/**
 * Get priority label based on priority number
 */
function getPriorityLabel(priority: number): string {
  if (priority === 1) return "CRITICAL";
  if (priority === 2) return "HIGH";
  if (priority === 3) return "MEDIUM";
  return "LOW";
}

// =============================================================================
// PMS Structured Text Formatters (bypass PDF round-trip)
// =============================================================================

/**
 * Format PMS match data as text for a specific evidence requirement.
 * Returns the same information the PDF would contain, without the
 * generate → upload → download → parse cycle.
 */
export function formatPmsDataAsText(
  pmsMatch: PMSMatchResult,
  requirement: EvidenceRequirement
): string | null {
  const tag = requirement.tag || "";
  const labelLower = requirement.label.toLowerCase();

  const isFolio = tag === "folio" || tag === "reservation_folio" ||
    labelLower.includes("folio") || labelLower.includes("invoice");

  if (isFolio && pmsMatch.folio) {
    return formatFolioText(pmsMatch);
  }

  if (tag === "checkin_checkout_records" || labelLower.includes("check-in") ||
      labelLower.includes("check-out") || labelLower.includes("reservation")) {
    return formatReservationText(pmsMatch);
  }

  if (tag === "keycard_logs" || tag === "guest_activity_log" ||
      labelLower.includes("activity") || labelLower.includes("keycard") || labelLower.includes("key card")) {
    return formatActivityLogText(pmsMatch);
  }

  if (tag === "authorization_records" || labelLower.includes("authorization") || labelLower.includes("payment")) {
    return formatPaymentRecordsText(pmsMatch);
  }

  if (pmsMatch.reservation) {
    return formatReservationText(pmsMatch);
  }

  return null;
}

function formatFolioText(match: PMSMatchResult): string {
  const folio = match.folio!;
  const lines: string[] = [];
  lines.push(`RESERVATION FOLIO — Confirmation: ${folio.confirmationNumber}`);
  lines.push(`Guest: ${match.reservation.guestName}`);
  lines.push(`Check-in: ${match.reservation.checkIn}  |  Check-out: ${match.reservation.checkOut}`);
  if (match.reservation.roomNumber) lines.push(`Room: ${match.reservation.roomNumber}`);
  if (match.reservation.roomType) lines.push(`Room Type: ${match.reservation.roomType}`);
  lines.push("");
  lines.push("LINE ITEMS:");
  for (const line of folio.lines) {
    const sign = line.amount < 0 ? "-" : " ";
    lines.push(`  ${line.date}  ${sign}${folio.currency} ${(Math.abs(line.amount) / 100).toFixed(2)}  ${line.description} (${line.category})`);
  }
  lines.push("");
  lines.push(`Total Charges: ${folio.currency} ${(folio.totalCharges / 100).toFixed(2)}`);
  lines.push(`Total Payments: ${folio.currency} ${(folio.totalPayments / 100).toFixed(2)}`);
  lines.push(`Balance: ${folio.currency} ${(folio.balance / 100).toFixed(2)}`);
  lines.push("");
  lines.push(`Source: ${match.source} (confidence: ${match.confidence}%)`);
  return lines.join("\n");
}

function formatReservationText(match: PMSMatchResult): string {
  const r = match.reservation;
  const lines: string[] = [];
  lines.push(`RESERVATION RECORD — Confirmation: ${r.confirmationNumber}`);
  lines.push(`Guest: ${r.guestName}`);
  if (r.guestEmail) lines.push(`Email: ${r.guestEmail}`);
  lines.push(`Check-in: ${r.checkIn}  |  Check-out: ${r.checkOut}`);
  if (r.roomNumber) lines.push(`Room: ${r.roomNumber}`);
  if (r.roomType) lines.push(`Room Type: ${r.roomType}`);
  if (r.ratePlan) lines.push(`Rate Plan: ${r.ratePlan}`);
  lines.push(`Total: ${r.currency} ${(r.totalAmount / 100).toFixed(2)}`);
  lines.push(`Status: ${r.status}`);
  if (r.bookingSource) lines.push(`Booking Source: ${r.bookingSource}`);
  if (r.paymentMethodLast4) lines.push(`Card Last 4: ${r.paymentMethodLast4}`);
  lines.push("");
  lines.push(`Source: ${match.source} (confidence: ${match.confidence}%)`);
  return lines.join("\n");
}

function formatActivityLogText(match: PMSMatchResult): string {
  const lines: string[] = [];
  lines.push(`ACTIVITY LOG — Confirmation: ${match.confirmationNumber}`);
  lines.push(`Guest: ${match.reservation.guestName}`);
  lines.push("");
  if (match.activityLogs.length === 0) {
    lines.push("No activity logs available.");
  } else {
    for (const log of match.activityLogs) {
      const detail = log.details ? ` — ${log.details}` : "";
      const by = log.performedBy ? ` [${log.performedBy}]` : "";
      lines.push(`  ${log.timestamp}  ${log.action}${detail}${by}`);
    }
  }
  lines.push("");
  lines.push(`Source: ${match.source} (confidence: ${match.confidence}%)`);
  return lines.join("\n");
}

function formatPaymentRecordsText(match: PMSMatchResult): string {
  const lines: string[] = [];
  lines.push(`PAYMENT RECORDS — Confirmation: ${match.confirmationNumber}`);
  lines.push(`Guest: ${match.reservation.guestName}`);
  lines.push("");
  if (match.folio) {
    const paymentLines = match.folio.lines.filter(l => l.category === "payment");
    if (paymentLines.length === 0) {
      lines.push("No payment line items on folio.");
    } else {
      for (const line of paymentLines) {
        const sign = line.amount < 0 ? "-" : " ";
        lines.push(`  ${line.date}  ${sign}${match.folio.currency} ${(Math.abs(line.amount) / 100).toFixed(2)}  ${line.description}`);
        if (line.reference) lines.push(`    Ref: ${line.reference}`);
      }
    }
  } else {
    lines.push("No folio data available for payment records.");
  }
  lines.push("");
  lines.push(`Source: ${match.source} (confidence: ${match.confidence}%)`);
  return lines.join("\n");
}

/**
 * Get enriched evidence combining requirements, items, files, and extracted content
 * This provides comprehensive context to the AI for generating top-notch arguments
 * 
 * @param disputeId - The dispute ID
 * @param evidencePlan - The evidence plan with requirements
 * @param evidenceItems - The evidence item statuses
 * @returns Array of EnrichedEvidence sorted by priority
 */
export async function getEnrichedEvidence(
  disputeId: string,
  evidencePlan: EvidencePlan,
  evidenceItems: EvidenceItem[],
  options?: {
    preloadedFiles?: EvidenceFile[];
    pmsMatch?: PMSMatchResult;
  }
): Promise<EnrichedEvidence[]> {
  console.log(`[EnrichedEvidence] Building enriched evidence for dispute ${disputeId}`);
  
  // Use pre-loaded files if provided, otherwise fetch from Firestore
  const evidenceFiles = options?.preloadedFiles || await getEvidenceFiles(disputeId);
  console.log(`[EnrichedEvidence] Found ${evidenceFiles.length} evidence files${options?.preloadedFiles ? " (pre-loaded)" : ""}`);
  
  const enrichedList: EnrichedEvidence[] = [];
  
  // Process each requirement from the evidence plan
  for (const requirement of evidencePlan.requirements) {
    // Find the corresponding evidence item (status tracking)
    const item = evidenceItems.find(i => i.requirementId === requirement.id);
    
    if (!item) {
      console.warn(`[EnrichedEvidence] No item found for requirement ${requirement.id}`);
      continue;
    }
    
    // Determine evidence slot mapping
    const evidenceSlot = CATEGORY_TO_EVIDENCE_SLOT[requirement.category] || 'uncategorized_file';
    const evidenceSlotDescription = EVIDENCE_SLOT_DESCRIPTIONS[evidenceSlot];
    
    // Build base enriched evidence
    const enriched: EnrichedEvidence = {
      requirement,
      item,
      evidenceSlot,
      evidenceSlotDescription,
      stripeField: evidenceSlot,
      stripeFieldDescription: evidenceSlotDescription,
      priorityLabel: getPriorityLabel(requirement.priority),
    };
    
    // If uploaded, find and process the associated file
    if (item.status === 'uploaded' && item.fileId) {
      const file = evidenceFiles.find(f => f.id === item.fileId);
      
      if (file) {
        enriched.file = file;
        
        const isPmsAutoCollected = file.uploadedBy === 'system:pms_auto_collect';
        
        // For PMS auto-collected files, use structured text directly
        // instead of downloading the generated PDF and re-parsing it.
        if (isPmsAutoCollected && options?.pmsMatch) {
          const structuredText = formatPmsDataAsText(options.pmsMatch, requirement);
          if (structuredText) {
            enriched.structuredPmsText = structuredText;
            console.log(`[EnrichedEvidence] Using structured PMS text for ${file.fileName} (skipped PDF download)`);
          }
        }
        
        // Fall back to PDF extraction if no structured text is available
        if (!enriched.structuredPmsText) {
          const isPDF = file.fileType.toLowerCase() === 'application/pdf' ||
                        file.fileType.toLowerCase().includes('pdf') ||
                        file.fileName.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            console.log(`[EnrichedEvidence] Extracting PDF text for ${file.fileName}`);
            const pdfResult = await getPDFTextContent(file.downloadURL);
            if (pdfResult) {
              enriched.pdfText = pdfResult.text;
              enriched.pdfPageCount = pdfResult.pageCount;
            }
          }
        }
        
        // Check if it's an image for vision analysis
        const isImage = VISION_SUPPORTED_TYPES.some(type => 
          file.fileType.toLowerCase().includes(type.split('/')[1]) ||
          file.fileType.toLowerCase() === type
        );
        
        if (isImage) {
          enriched.imageUrl = file.downloadURL;
        }
      } else {
        console.warn(`[EnrichedEvidence] File ${item.fileId} not found for requirement ${requirement.id}`);
      }
    }
    
    enrichedList.push(enriched);
  }
  
  // Sort by priority (1 = highest) and required status
  enrichedList.sort((a, b) => {
    // Required items first
    if (a.requirement.required !== b.requirement.required) {
      return a.requirement.required ? -1 : 1;
    }
    // Then by priority
    return a.requirement.priority - b.requirement.priority;
  });
  
  console.log(`[EnrichedEvidence] Returning ${enrichedList.length} enriched evidence items`);
  
  // Log summary
  const uploaded = enrichedList.filter(e => e.item.status === 'uploaded').length;
  const withPDF = enrichedList.filter(e => e.pdfText).length;
  const withPmsText = enrichedList.filter(e => e.structuredPmsText).length;
  const withImage = enrichedList.filter(e => e.imageUrl).length;
  console.log(`[EnrichedEvidence] Summary: ${uploaded} uploaded, ${withPDF} with PDF text, ${withPmsText} with PMS text, ${withImage} with images`);
  
  return enrichedList;
}