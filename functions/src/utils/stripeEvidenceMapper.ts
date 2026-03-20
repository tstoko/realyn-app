/**
 * Stripe Evidence Mapper
 * Maps our internal evidence structure to Stripe's dispute evidence format
 */

import type { EvidenceFile } from "../services/evidenceService";

export interface StripeEvidenceMapping {
  customer_communication?: string; // URL or text
  customer_signature?: string; // URL
  receipt?: string; // URL
  service_documentation?: string; // URL
  uncategorized_file?: string; // URL
  product_description?: string; // Text
  shipping_documentation?: string; // URL
  access_activity_log?: string; // URL or text
  billing_address?: string; // Text
  shipping_address?: string; // Text
  customer_name?: string; // Text
  customer_email?: string; // Text
  customer_purchase_ip?: string; // Text
  customer_purchase_ip_address?: string; // Text (deprecated, use customer_purchase_ip)
  uncategorized_text?: string; // Text
}

/**
 * Map evidence files by category to Stripe evidence types
 */
export function mapEvidenceFilesToStripe(
  evidenceFiles: EvidenceFile[]
): Partial<StripeEvidenceMapping> {
  const mapping: Partial<StripeEvidenceMapping> = {};

  // Group files by category
  const filesByCategory = evidenceFiles.reduce((acc, file) => {
    if (!acc[file.category]) {
      acc[file.category] = [];
    }
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, EvidenceFile[]>);

  // Map comms files to customer_communication
  if (filesByCategory.comms && filesByCategory.comms.length > 0) {
    // Stripe accepts one URL for customer_communication
    mapping.customer_communication = filesByCategory.comms[0].downloadURL;
  }

  // Map pms, proofOfStay, and policy files to service_documentation
  const serviceDocs: string[] = [];
  if (filesByCategory.pms) {
    serviceDocs.push(...filesByCategory.pms.map(f => f.downloadURL));
  }
  if (filesByCategory.proofOfStay) {
    serviceDocs.push(...filesByCategory.proofOfStay.map(f => f.downloadURL));
  }
  if (filesByCategory.policy) {
    serviceDocs.push(...filesByCategory.policy.map(f => f.downloadURL));
  }
  // Stripe accepts one URL for service_documentation, use first one
  if (serviceDocs.length > 0) {
    mapping.service_documentation = serviceDocs[0];
  }

  // Map proofOfStay or pms files to receipt (if they look like receipts)
  if (filesByCategory.proofOfStay && filesByCategory.proofOfStay.length > 0) {
    const receiptFile = filesByCategory.proofOfStay.find(
      f => f.fileName.toLowerCase().includes('receipt') || 
           f.fileName.toLowerCase().includes('invoice')
    );
    if (receiptFile) {
      mapping.receipt = receiptFile.downloadURL;
    }
  }

  // Map incidentReports files to uncategorized_file
  if (filesByCategory.incidentReports && filesByCategory.incidentReports.length > 0) {
    mapping.uncategorized_file = filesByCategory.incidentReports[0].downloadURL;
  }

  return mapping;
}

/**
 * Map text evidence fields to Stripe evidence types
 */
export function mapTextEvidenceToStripe(
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
): Partial<StripeEvidenceMapping> {
  const mapping: Partial<StripeEvidenceMapping> = {};

  if (paymentData) {
    // Map payment data to relevant Stripe fields
    if (paymentData.deviceIp) {
      mapping.customer_purchase_ip = paymentData.deviceIp;
    }
    
    // Combine payment data into access_activity_log
    const activityLogParts: string[] = [];
    if (paymentData.avs) {
      activityLogParts.push(`AVS: ${paymentData.avs}`);
    }
    if (paymentData.cvv) {
      activityLogParts.push(`CVV: ${paymentData.cvv}`);
    }
    if (paymentData.threeDS) {
      activityLogParts.push(`3D Secure: ${paymentData.threeDS}`);
    }
    if (paymentData.priorHistory) {
      activityLogParts.push(`Prior History: ${paymentData.priorHistory}`);
    }
    if (activityLogParts.length > 0) {
      mapping.access_activity_log = activityLogParts.join('\n');
    }
  }

  if (pmsData) {
    // Map PMS data to product_description
    const productParts: string[] = [];
    if (pmsData.stayDates) {
      productParts.push(`Stay Dates: ${pmsData.stayDates}`);
    }
    if (pmsData.room) {
      productParts.push(`Room: ${pmsData.room}`);
    }
    if (pmsData.ratePlan) {
      productParts.push(`Rate Plan: ${pmsData.ratePlan}`);
    }
    if (pmsData.incidentals) {
      productParts.push(`Incidentals: ${pmsData.incidentals}`);
    }
    if (productParts.length > 0) {
      mapping.product_description = productParts.join('\n');
    }
  }

  return mapping;
}

/**
 * Combine file and text evidence into complete Stripe evidence payload
 */
export function buildStripeEvidencePayload(
  evidenceFiles: EvidenceFile[],
  textEvidence?: {
    paymentData?: {
      avs?: string;
      cvv?: string;
      deviceIp?: string;
      threeDS?: string;
      priorHistory?: string;
    };
    pmsData?: {
      stayDates?: string;
      room?: string;
      ratePlan?: string;
      incidentals?: string;
    };
  }
): StripeEvidenceMapping {
  const fileMapping = mapEvidenceFilesToStripe(evidenceFiles);
  const textMapping = mapTextEvidenceToStripe(
    textEvidence?.paymentData,
    textEvidence?.pmsData
  );

  // Merge mappings, with file URLs taking precedence
  return {
    ...textMapping,
    ...fileMapping, // File URLs override text fields where applicable
  };
}




