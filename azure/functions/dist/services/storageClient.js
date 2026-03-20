"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEvidenceContainer = getEvidenceContainer;
exports.uploadEvidence = uploadEvidence;
exports.getEvidenceUrl = getEvidenceUrl;
exports.deleteEvidence = deleteEvidence;
exports.listDisputeEvidence = listDisputeEvidence;
const storage_blob_1 = require("@azure/storage-blob");
let blobServiceClient = null;
let evidenceContainer = null;
/**
 * Initialize Blob Service client (singleton)
 */
function getBlobServiceClient() {
    if (!blobServiceClient) {
        const connectionString = process.env.STORAGE_CONNECTION;
        if (!connectionString) {
            throw new Error("STORAGE_CONNECTION environment variable is required");
        }
        blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
    }
    return blobServiceClient;
}
/**
 * Get evidence container client
 */
function getEvidenceContainer() {
    if (!evidenceContainer) {
        evidenceContainer = getBlobServiceClient().getContainerClient("evidence");
    }
    return evidenceContainer;
}
/**
 * Upload a file to evidence storage
 */
async function uploadEvidence(disputeId, fileName, content, contentType) {
    const container = getEvidenceContainer();
    const blobName = `${disputeId}/${fileName}`;
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.upload(content, content.length, {
        blobHTTPHeaders: {
            blobContentType: contentType,
        },
    });
    return blobName;
}
/**
 * Get a temporary SAS URL for reading a file
 */
async function getEvidenceUrl(blobName, expiresInMinutes = 60) {
    const container = getEvidenceContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    // Generate SAS token
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);
    // Use user delegation for better security (requires managed identity)
    const sasUrl = await blockBlobClient.generateSasUrl({
        permissions: storage_blob_1.BlobSASPermissions.parse("r"),
        expiresOn,
    });
    return sasUrl;
}
/**
 * Delete evidence file
 */
async function deleteEvidence(blobName) {
    const container = getEvidenceContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
}
/**
 * List all evidence files for a dispute
 */
async function listDisputeEvidence(disputeId) {
    const container = getEvidenceContainer();
    const blobs = [];
    for await (const blob of container.listBlobsFlat({ prefix: `${disputeId}/` })) {
        blobs.push(blob.name);
    }
    return blobs;
}
//# sourceMappingURL=storageClient.js.map