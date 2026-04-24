import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';

const mockUseAuthContext = vi.fn();

vi.mock('@realyn/shared', () => ({
  useAuthContext: () => mockUseAuthContext(),
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

function renderWithRoute(adminOnly = false) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute adminOnly={adminOnly}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows spinner while loading', () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: true });
    renderWithRoute();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('redirects to /login when no user', () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: false });
    renderWithRoute();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: '1', name: 'Test', email: 'test@test.com', role: 'user' },
      loading: false,
    });
    renderWithRoute();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects non-admin to /dashboard on adminOnly route', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: '1', name: 'Test', email: 'test@test.com', role: 'user' },
      loading: false,
    });
    renderWithRoute(true);
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
  });

  it('allows admin through adminOnly route', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: '1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      loading: false,
    });
    renderWithRoute(true);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
