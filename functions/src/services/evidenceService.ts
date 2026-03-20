/**
 * Evidence Service (Backend)
 * Handles retrieving evidence files from Firestore for dispute response submission
 */

import * as admin from "firebase-admin";
import axios from "axios";
const pdfParse = require("pdf-parse");

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
 * Vision-compatible file for GPT-5.2-Pro analysis
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

import { EvidenceRequirement, EvidenceItem, EvidencePlan } from "../types/aiDispute";

/**
 * Stripe evidence field names
 * These are the actual fields Stripe accepts in dispute evidence submission
 */
export type StripeEvidenceField = 
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

/**
 * Maps evidence categories to their primary Stripe evidence field
 */
export const CATEGORY_TO_STRIPE_FIELD: Record<string, StripeEvidenceField> = {
  policy: 'cancellation_policy',
  pms_data: 'service_documentation',
  proof_of_stay: 'service_documentation',
  communications: 'customer_communication',
  payment_data: 'uncategorized_text',
  incident_reports: 'uncategorized_file',
  delivery: 'shipping_documentation',
  other: 'uncategorized_file',
  // Also map the shorter category names used in EvidenceFile
  pms: 'service_documentation',
  proofOfStay: 'service_documentation',
  comms: 'customer_communication',
  incidentReports: 'uncategorized_file',
};

/**
 * Human-readable descriptions of Stripe evidence fields
 */
export const STRIPE_FIELD_DESCRIPTIONS: Record<StripeEvidenceField, string> = {
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
  
  // Image URL for vision analysis (if applicable)
  imageUrl?: string;
  
  // Which Stripe evidence field this maps to
  stripeField: StripeEvidenceField;
  stripeFieldDescription: string;
  
  // Priority label for display
  priorityLabel: string;
}

/**
 * Supported file types for GPT-5.2 vision analysis
 * Note: OpenAI vision API only supports image formats, not PDFs
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
 * Get evidence files formatted for GPT-5.2-Pro vision analysis
 * Filters to supported file types and returns URLs with context
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

  // Limit to prevent token overflow (GPT-5.2 can handle many, but be reasonable)
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
  evidenceItems: EvidenceItem[]
): Promise<EnrichedEvidence[]> {
  console.log(`[EnrichedEvidence] Building enriched evidence for dispute ${disputeId}`);
  
  // Fetch all evidence files for this dispute
  const evidenceFiles = await getEvidenceFiles(disputeId);
  console.log(`[EnrichedEvidence] Found ${evidenceFiles.length} evidence files`);
  
  const enrichedList: EnrichedEvidence[] = [];
  
  // Process each requirement from the evidence plan
  for (const requirement of evidencePlan.requirements) {
    // Find the corresponding evidence item (status tracking)
    const item = evidenceItems.find(i => i.requirementId === requirement.id);
    
    if (!item) {
      console.warn(`[EnrichedEvidence] No item found for requirement ${requirement.id}`);
      continue;
    }
    
    // Determine Stripe field mapping
    const stripeField = CATEGORY_TO_STRIPE_FIELD[requirement.category] || 'uncategorized_file';
    const stripeFieldDescription = STRIPE_FIELD_DESCRIPTIONS[stripeField];
    
    // Build base enriched evidence
    const enriched: EnrichedEvidence = {
      requirement,
      item,
      stripeField,
      stripeFieldDescription,
      priorityLabel: getPriorityLabel(requirement.priority),
    };
    
    // If uploaded, find and process the associated file
    if (item.status === 'uploaded' && item.fileId) {
      const file = evidenceFiles.find(f => f.id === item.fileId);
      
      if (file) {
        enriched.file = file;
        
        // Check if it's a PDF and extract text
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
  const withImage = enrichedList.filter(e => e.imageUrl).length;
  console.log(`[EnrichedEvidence] Summary: ${uploaded} uploaded, ${withPDF} with PDF text, ${withImage} with images`);
  
  return enrichedList;
}