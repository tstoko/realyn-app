"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContainer = getContainer;
exports.getDisputesContainer = getDisputesContainer;
exports.getOrganizationsContainer = getOrganizationsContainer;
exports.getUsersContainer = getUsersContainer;
const cosmos_1 = require("@azure/cosmos");
let client = null;
let database = null;
/**
 * Initialize Cosmos DB client (singleton)
 */
function getClient() {
    if (!client) {
        const connectionString = process.env.COSMOS_CONNECTION;
        if (!connectionString) {
            throw new Error("COSMOS_CONNECTION environment variable is required");
        }
        client = new cosmos_1.CosmosClient(connectionString);
    }
    return client;
}
/**
 * Get database instance
 */
function getDatabase() {
    if (!database) {
        const databaseName = process.env.COSMOS_DATABASE || "realyn";
        database = getClient().database(databaseName);
    }
    return database;
}
/**
 * Get container by name
 */
function getContainer(containerName) {
    return getDatabase().container(containerName);
}
/**
 * Get disputes container
 */
function getDisputesContainer() {
    return getContainer("disputes");
}
/**
 * Get organizations container
 */
function getOrganizationsContainer() {
    return getContainer("organizations");
}
/**
 * Get users container
 */
function getUsersContainer() {
    return getContainer("users");
}
//# sourceMappingURL=cosmosClient.js.map