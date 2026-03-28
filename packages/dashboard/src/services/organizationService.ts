import { collection, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@realyn/shared';
import type { Organization, PSPIntegrationsConfig } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as any).toDate === 'function') return (value as any).toDate();
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'object' && ('seconds' in (value as any))) {
    return new Date((value as any).seconds * 1000);
  }
  return undefined;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not authenticated');
  const idToken = await currentUser.getIdToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` };
}

async function callOrgWriteHandler(body: Record<string, any>): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/organizationWriteHandler`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
  return data;
}

/**
 * Get all organizations from Firestore
 */
export async function getAllOrganizations(): Promise<Organization[]> {
  const snapshot = await getDocs(collection(db, 'organizations'));
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Unnamed Organization',
      location: data.location || '',
      industry: data.industry || undefined,
      pspIntegrations: data.pspIntegrations || {},
      pmsIntegrations: data.pmsIntegrations || {},
      automationSettings: data.automationSettings || {
        autoSubmissionEnabled: false,
        autoSubmissionMinAmount: 0,
        autoMarkNotContested: false,
      },
      teams: Array.isArray(data.teams) ? data.teams : [],
      documents: Array.isArray(data.documents) ? data.documents : [],
      users: Array.isArray(data.users) ? data.users : [],
      pmsIntegration: data.pmsIntegration || undefined,
      operaCloudIntegration: data.operaCloudIntegration ? {
        ...data.operaCloudIntegration,
        lastTestedAt: toDate(data.operaCloudIntegration.lastTestedAt),
      } : undefined,
      isDemo: data.isDemo || false,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    } as Organization;
  });
}

/**
 * Get organization by ID
 */
export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const docRef = doc(db, 'organizations', organizationId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: data.name || 'Unnamed Organization',
    location: data.location || '',
    industry: data.industry || undefined,
    pspIntegrations: data.pspIntegrations || {},
    pmsIntegrations: data.pmsIntegrations || {},
    automationSettings: data.automationSettings || {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    teams: Array.isArray(data.teams) ? data.teams : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    users: Array.isArray(data.users) ? data.users : [],
    pmsIntegration: data.pmsIntegration || undefined,
    operaCloudIntegration: data.operaCloudIntegration ? {
      ...data.operaCloudIntegration,
      lastTestedAt: toDate(data.operaCloudIntegration.lastTestedAt),
    } : undefined,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  } as Organization;
}

/**
 * Create or update organization via Cloud Function
 */
export async function saveOrganization(organization: Organization): Promise<void> {
  const orgData: Record<string, unknown> = {
    id: organization.id,
    name: organization.name,
    location: organization.location,
    industry: organization.industry || '',
    pspIntegrations: organization.pspIntegrations,
    pmsIntegrations: organization.pmsIntegrations,
    automationSettings: organization.automationSettings,
    teams: organization.teams,
    documents: organization.documents,
    users: organization.users,
    createdAt: organization.createdAt ? organization.createdAt.toISOString() : new Date().toISOString(),
  };
  if (organization.pmsIntegration) orgData.pmsIntegration = organization.pmsIntegration;
  if (organization.operaCloudIntegration) orgData.operaCloudIntegration = organization.operaCloudIntegration;

  await callOrgWriteHandler({
    action: 'saveOrganization',
    organization: orgData,
  });
}

/**
 * Delete organization via existing Cloud Function
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/deleteOrganization`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ organizationId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
}

/**
 * Update organization documents (policies) via Cloud Function
 */
export async function updateOrganizationDocuments(
  organizationId: string,
  documents: Organization['documents']
): Promise<void> {
  await callOrgWriteHandler({
    action: 'updateOrganizationDocuments',
    organizationId,
    documents,
  });
}

/**
 * Update organization PSP integrations via Cloud Function
 */
export async function updateOrganizationIntegrations(
  organizationId: string,
  pspIntegrations: PSPIntegrationsConfig
): Promise<void> {
  await callOrgWriteHandler({
    action: 'updateOrganizationIntegrations',
    organizationId,
    pspIntegrations,
  });
}