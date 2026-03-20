import { CosmosClient, Container, Database } from "@azure/cosmos";

let client: CosmosClient | null = null;
let database: Database | null = null;

/**
 * Initialize Cosmos DB client (singleton)
 */
function getClient(): CosmosClient {
  if (!client) {
    const connectionString = process.env.COSMOS_CONNECTION;
    if (!connectionString) {
      throw new Error("COSMOS_CONNECTION environment variable is required");
    }
    client = new CosmosClient(connectionString);
  }
  return client;
}

/**
 * Get database instance
 */
function getDatabase(): Database {
  if (!database) {
    const databaseName = process.env.COSMOS_DATABASE || "realyn";
    database = getClient().database(databaseName);
  }
  return database;
}

/**
 * Get container by name
 */
export function getContainer(containerName: string): Container {
  return getDatabase().container(containerName);
}

/**
 * Get disputes container
 */
export function getDisputesContainer(): Container {
  return getContainer("disputes");
}

/**
 * Get organizations container
 */
export function getOrganizationsContainer(): Container {
  return getContainer("organizations");
}

/**
 * Get users container
 */
export function getUsersContainer(): Container {
  return getContainer("users");
}

// Export types for use in other modules
export type { Container, SqlQuerySpec } from "@azure/cosmos";
