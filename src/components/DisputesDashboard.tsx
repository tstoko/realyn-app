import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Header } from './Header';
import { FilterControls } from './FilterControls';
import { DisputeTable } from './DisputeTable';
import { Spinner } from './Spinner';
import type { Dispute, FilterState, SortState } from '../types';

/**
 * Convert Firestore Timestamp or Date to Date object
 */
const toDate = (value: Timestamp | Date | undefined): Date => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  // Fallback for any other case
  return new Date(value as any);
};

export const DisputesDashboard: React.FC = () => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ status: 'all' });
  const [sort, setSort] = useState<SortState>({ field: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const fetchDisputes = async () => {
      try {
        const q = query(collection(db, 'disputes'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        setDisputes(
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Dispute[]
        );
      } catch (error) {
        console.error('Error fetching disputes:', error);
        setDisputes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDisputes();
  }, []);

  // Memoize filtered and sorted disputes
  const filteredDisputes = useMemo(() => {
    let result = [...disputes];

    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      result = result.filter(d => d.status === filters.status);
    }

    // Apply date filters
    if (filters.startDate) {
      result = result.filter(d => {
        const date = toDate(d.createdAt);
        return date >= filters.startDate!;
      });
    }

    if (filters.endDate) {
      result = result.filter(d => {
        const date = toDate(d.createdAt);
        return date <= filters.endDate!;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any = a[sort.field];
      let bVal: any = b[sort.field];
      
      // Handle Firestore Timestamps and Dates
      if (aVal instanceof Timestamp || aVal instanceof Date) {
        aVal = toDate(aVal);
      }
      if (bVal instanceof Timestamp || bVal instanceof Date) {
        bVal = toDate(bVal);
      }
      
      // Handle comparison
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [disputes, filters, sort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <FilterControls 
        onFilterChange={setFilters}
        onSortChange={setSort}
        initialSort={sort}
      />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <DisputeTable 
          disputes={filteredDisputes}
          sort={sort}
          onSortChange={setSort}
        />
      </div>
    </div>
  );
};
