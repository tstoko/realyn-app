import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DisputeTable } from '../DisputeTable';
import type { Dispute, User, Hotel, SortState } from '@realyn/shared';

vi.mock('@realyn/shared', async () => {
  const actual: Record<string, unknown> = await vi.importActual('@realyn/shared');
  return {
    ...actual,
    InformationCircleIcon: () => <span data-testid="info-icon">i</span>,
  };
});

const mockUser: User = {
  id: 'u1',
  name: 'Test User',
  email: 'test@hotel.com',
  role: 'user',
  organizationId: 'org1',
};

const mockHotel: Hotel = {
  id: 'org1',
  name: 'Test Hotel',
  location: 'NYC',
  teams: [],
  documents: [],
  users: [],
  integrations: { psp: { type: 'none', status: 'not_connected' } },
  automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
};

const defaultSort: SortState = { field: 'createdAt', direction: 'desc' };

const defaultColumns = new Set(['amount', 'status', 'reason', 'createdAt'] as (keyof Dispute)[]);

function renderTable(disputes: Dispute[] = []) {
  return render(
    <MemoryRouter>
      <DisputeTable
        disputes={disputes}
        user={mockUser}
        hotel={mockHotel}
        sort={defaultSort}
        onSortChange={() => {}}
        updateDispute={() => {}}
        currentPage={1}
        rowsPerPage={25}
        onPageChange={() => {}}
        onRowsPerPageChange={() => {}}
        selectedDisputes={[]}
        onSelectionChange={() => {}}
        visibleColumns={defaultColumns}
        rowDensity="comfortable"
      />
    </MemoryRouter>
  );
}

describe('DisputeTable', () => {
  it('renders the empty state when no disputes', () => {
    renderTable([]);
    expect(screen.getByText(/no matching disputes/i)).toBeInTheDocument();
  });

  it('renders dispute rows when disputes are provided', () => {
    const dispute: Dispute = {
      id: 'disp-1',
      organizationId: 'org1',
      amount: 15000,
      currency: 'USD',
      status: 'needs_response',
      reason: 'fraudulent',
      createdAt: new Date('2025-01-15'),
      pspProvider: 'stripe',
      pspDisputeId: 'dp_123',
    };
    renderTable([dispute]);
    expect(screen.getByText(/\$150/)).toBeInTheDocument();
  });
});
