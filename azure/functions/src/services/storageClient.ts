import { BlobServiceClient, ContainerClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";

let blobServiceClient: BlobServiceClient | null = null;
let evidenceContainer: ContainerClient | null = null;

/**
 * Initialize Blob Service client (singleton)
 */
function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const connectionString = process.env.STORAGE_CONNECTION;
    if (!connectionString) {
      throw new Error("STORAGE_CONNECTION environment variable is required");
    }
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  }
  return blobServiceClient;
}

/**
 * Get evidence container client
 */
export function getEvidenceContainer(): ContainerClient {
  if (!evidenceContainer) {
    evidenceContainer = getBlobServiceClient().getContainerClient("evidence");
  }
  return evidenceContainer;
}

/**
 * Upload a file to evidence storage
 */
export async function uploadEvidence(
  disputeId: string,
  fileName: string,
  content: Buffer,
  contentType: string
): Promise<string> {
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
export async function getEvidenceUrl(blobName: string, expiresInMinutes: number = 60): Promise<string> {
  const container = getEvidenceContainer();
  const blockBlobClient = container.getBlockBlobClient(blobName);
  
  // Generate SAS token
  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);
  
  // Use user delegation for better security (requires managed identity)
  const sasUrl = await blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    expiresOn,
  });

  return sasUrl;
}

/**
 * Delete evidence file
 */
export async function deleteEvidence(blobName: string): Promise<void> {
  const container = getEvidenceContainer();
  const blockBlobClient = container.getBlockBlobClient(blobName);
  await blockBlobClient.deleteIfExists();
}

/**
 * List all evidence files for a dispute
 */
export async function listDisputeEvidence(disputeId: string): Promise<string[]> {
  const container = getEvidenceContainer();
  const blobs: string[] = [];
  
  for await (const blob of container.listBlobsFlat({ prefix: `${disputeId}/` })) {
    blobs.push(blob.name);
  }
  
  return blobs;
}
