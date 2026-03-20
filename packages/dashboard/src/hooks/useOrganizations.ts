import { useState, useEffect, useCallback } from 'react';
import { getAllOrganizations, saveOrganization, deleteOrganization } from '../services/organizationService';
import type { Organization } from '@realyn/shared';

export const useOrganizations = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllOrganizations();
      console.log(`Fetched ${data.length} organization(s) from Firestore`);
      setOrganizations(data);
    } catch (err: any) {
      console.error('Error fetching organizations:', {
        error: err,
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
      setError(err.message || 'Failed to fetch organizations');
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const save = useCallback(async (organization: Organization) => {
    try {
      await saveOrganization(organization);
      await fetchOrganizations(); // Refresh list
    } catch (err: any) {
      console.error('Error saving organization:', err);
      throw err;
    }
  }, [fetchOrganizations]);

  const remove = useCallback(async (organizationId: string) => {
    try {
      await deleteOrganization(organizationId);
      await fetchOrganizations(); // Refresh list
    } catch (err: any) {
      console.error('Error deleting organization:', err);
      throw err;
    }
  }, [fetchOrganizations]);

  return { organizations, loading, error, save, remove, refresh: fetchOrganizations };
};

