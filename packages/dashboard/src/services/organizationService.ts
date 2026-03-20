import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@realyn/shared';
import type { Organization, PSPIntegrationsConfig } from '@realyn/shared';

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
        lastTestedAt: data.operaCloudIntegration.lastTestedAt?.toDate?.() || undefined,
      } : undefined,
      isDemo: data.isDemo || false,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
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
      lastTestedAt: data.operaCloudIntegration.lastTestedAt?.toDate?.() || undefined,
    } : undefined,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Organization;
}

/**
 * Create or update organization
 */
export async function saveOrganization(organization: Organization): Promise<void> {
  const orgRef = doc(db, 'organizations', organization.id);
  const now = Timestamp.now();
  
  const orgData: Record<string, unknown> = {
    name: organization.name,
    location: organization.location,
    pspIntegrations: organization.pspIntegrations,
    pmsIntegrations: organization.pmsIntegrations,
    automationSettings: organization.automationSettings,
    teams: organization.teams,
    documents: organization.documents,
    users: organization.users,
    createdAt: organization.createdAt ? Timestamp.fromDate(organization.createdAt) : now,
    updatedAt: now,
  };
  if (organization.pmsIntegration) orgData.pmsIntegration = organization.pmsIntegration;
  if (organization.operaCloudIntegration) orgData.operaCloudIntegration = organization.operaCloudIntegration;

  await setDoc(orgRef, orgData, { merge: true });
}

/**
 * Delete organization
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const orgRef = doc(db, 'organizations', organizationId);
  await deleteDoc(orgRef);
}

/**
 * Update organization documents (policies)
 */
export async function updateOrganizationDocuments(
  organizationId: string,
  documents: Organization['documents']
): Promise<void> {
  const orgRef = doc(db, 'organizations', organizationId);
  await updateDoc(orgRef, {
    documents,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Update organization PSP integrations
 */
export async function updateOrganizationIntegrations(
  organizationId: string,
  pspIntegrations: PSPIntegrationsConfig
): Promise<void> {
  const orgRef = doc(db, 'organizations', organizationId);
  await updateDoc(orgRef, {
    pspIntegrations,
    updatedAt: Timestamp.now(),
  });
}