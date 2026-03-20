import { ContainerClient } from "@azure/storage-blob";
/**
 * Get evidence container client
 */
export declare function getEvidenceContainer(): ContainerClient;
/**
 * Upload a file to evidence storage
 */
export declare function uploadEvidence(disputeId: string, fileName: string, content: Buffer, contentType: string): Promise<string>;
/**
 * Get a temporary SAS URL for reading a file
 */
export declare function getEvidenceUrl(blobName: string, expiresInMinutes?: number): Promise<string>;
/**
 * Delete evidence file
 */
export declare function deleteEvidence(blobName: string): Promise<void>;
/**
 * List all evidence files for a dispute
 */
export declare function listDisputeEvidence(disputeId: string): Promise<string[]>;
//# sourceMappingURL=storageClient.d.ts.map