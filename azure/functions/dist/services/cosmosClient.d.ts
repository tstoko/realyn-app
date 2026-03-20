import { Container } from "@azure/cosmos";
/**
 * Get container by name
 */
export declare function getContainer(containerName: string): Container;
/**
 * Get disputes container
 */
export declare function getDisputesContainer(): Container;
/**
 * Get organizations container
 */
export declare function getOrganizationsContainer(): Container;
/**
 * Get users container
 */
export declare function getUsersContainer(): Container;
export type { Container, SqlQuerySpec } from "@azure/cosmos";
//# sourceMappingURL=cosmosClient.d.ts.map