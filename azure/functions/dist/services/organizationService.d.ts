export interface StripeIntegration {
    secretKey?: string;
    accessToken?: string;
    webhookSecret?: string;
    merchantAccountId?: string;
    status: "connected" | "not_connected";
}
export interface AdyenIntegration {
    apiKey?: string;
    merchantAccounts?: string[];
    webhookUsername?: string;
    webhookPassword?: string;
    liveEndpointPrefix?: string;
    status: "connected" | "not_connected";
}
export interface PSPIntegrations {
    stripe?: StripeIntegration;
    adyen?: AdyenIntegration;
}
export interface Organization {
    id: string;
    name: string;
    location: string;
    pspIntegrations: PSPIntegrations;
    automationSettings: {
        autoSubmissionEnabled: boolean;
        autoSubmissionMinAmount: number;
        autoMarkNotContested: boolean;
    };
    teams: Array<{
        name: string;
        email: string;
    }>;
    documents: Array<{
        id: string;
        name: string;
        category: string;
        fileName: string;
        fileSize: number;
    }>;
    users: Array<{
        id: string;
        name: string;
        email: string;
        role: string;
    }>;
    createdAt: string;
    updatedAt: string;
}
/**
 * Get organization by ID
 */
export declare function getOrganization(organizationId: string): Promise<Organization | null>;
/**
 * Get all organizations
 */
export declare function getAllOrganizations(): Promise<Organization[]>;
/**
 * Create organization
 */
export declare function createOrganization(org: Omit<Organization, "id" | "createdAt" | "updatedAt">): Promise<string>;
/**
 * Update organization
 */
export declare function updateOrganization(organizationId: string, updates: Partial<Organization>): Promise<void>;
/**
 * Get organization by Stripe webhook signature
 */
export declare function getOrganizationByStripeWebhook(rawBody: Buffer, signature: string): Promise<{
    organization: Organization;
    stripe: any;
} | null>;
/**
 * Get organization by Adyen merchant account
 */
export declare function getOrganizationByAdyenMerchant(merchantAccount: string): Promise<Organization | null>;
//# sourceMappingURL=organizationService.d.ts.map