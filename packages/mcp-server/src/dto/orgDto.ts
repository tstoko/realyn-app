export interface OrgSummaryDto {
  id: string;
  name: string;
  location?: string;
  industry?: string;
  teamCount: number;
  documentCount: number;
  automationSettings?: {
    autoSubmissionEnabled: boolean;
    autoSubmissionMinAmount: number;
    autoMarkNotContested: boolean;
  };
  integrationStatus: {
    stripe: boolean;
    adyen: boolean;
    operaCloud: boolean;
    pmsType: string;
  };
}

export interface IntegrationStatusDto {
  orgId: string;
  stripe: { connected: boolean; merchantAccountId?: string };
  adyen: { connected: boolean; merchantAccounts?: string[] };
  operaCloud: { connected: boolean; hotelCodes?: string[] };
  pms: { type: string; lastImportAt?: string };
}

export function projectOrg(org: any): OrgSummaryDto {
  return {
    id: org.id,
    name: org.name,
    location: org.location,
    industry: org.industry,
    teamCount: org.teams?.length ?? 0,
    documentCount: org.documents?.length ?? 0,
    automationSettings: org.automationSettings,
    integrationStatus: {
      stripe: !!org.pspIntegrations?.stripe?.status && org.pspIntegrations.stripe.status === "connected",
      adyen: !!org.pspIntegrations?.adyen?.status && org.pspIntegrations.adyen.status === "connected",
      operaCloud:
        !!org.operaCloudIntegration &&
        org.operaCloudIntegration.status === "connected",
      pmsType: org.pmsIntegration?.type ?? "none",
    },
  };
}

export function projectIntegrationStatus(org: any): IntegrationStatusDto {
  return {
    orgId: org.id,
    stripe: {
      connected: org.pspIntegrations?.stripe?.status === "connected",
      merchantAccountId: org.pspIntegrations?.stripe?.merchantAccountId,
    },
    adyen: {
      connected: org.pspIntegrations?.adyen?.status === "connected",
      merchantAccounts: org.pspIntegrations?.adyen?.merchantAccounts,
    },
    operaCloud: {
      connected: org.operaCloudIntegration?.status === "connected",
      hotelCodes: org.operaCloudIntegration?.hotelCodes,
    },
    pms: {
      type: org.pmsIntegration?.type ?? "none",
      lastImportAt: org.pmsIntegration?.lastImportAt?.toDate?.()?.toISOString(),
    },
  };
}
