import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuthContext, Spinner, ErrorBoundary, UpdateBanner, CookieConsent, useVersionCheck } from '@realyn/shared';
import { useHotelContext } from './contexts/HotelContext';
import { getOrganization } from './services/organizationService';
import { organizationToHotel } from './features/hotels/HotelSelectionPage';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { DemoModeBanner } from './components/layout/DemoModeBanner';
import { AppShell } from './components/layout/AppShell';
import { PolicyConsentModal } from './components/shared/PolicyConsentModal';

const HotelSelectionPage = lazy(() => import('./features/hotels/HotelSelectionPage').then(m => ({ default: m.HotelSelectionPage })));
const HotelAnalyticsPage = lazy(() => import('./features/hotels/HotelAnalyticsPage').then(m => ({ default: m.HotelAnalyticsPage })));
const DisputeDashboard = lazy(() => import('./features/disputes/DisputeDashboard').then(m => ({ default: m.DisputeDashboard })));
const PortfolioAnalyticsPage = lazy(() => import('./features/analytics/PortfolioAnalyticsPage').then(m => ({ default: m.PortfolioAnalyticsPage })));
const ActivityLogPage = lazy(() => import('./features/admin/ActivityLogPage').then(m => ({ default: m.ActivityLogPage })));
const UserManagementPage = lazy(() => import('./features/admin/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const ContactSalesLeadsPage = lazy(() => import('./features/admin/ContactSalesLeadsPage').then(m => ({ default: m.ContactSalesLeadsPage })));
const SettingsModal = lazy(() => import('./features/settings/SettingsModal').then(m => ({ default: m.SettingsModal })));
const CommandPalette = lazy(() => import('./features/settings/CommandPalette').then(m => ({ default: m.CommandPalette })));
const KeyboardShortcutsModal = lazy(() => import('./features/settings/KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })));

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'https://www.realyn.com';

const PageSpinner = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center">
    <Spinner />
  </div>
);

const DashboardRedirect: React.FC = () => {
  const { user } = useAuthContext();
  if (!user) {
    window.location.href = `${WEBSITE_URL}/login`;
    return <PageSpinner />;
  }
  if (user.role === 'admin') return <Navigate to="/properties" replace />;
  return <Navigate to="/properties/my/disputes" replace />;
};

const HotelSelectionWrapper: React.FC = () => {
  const { selectHotel } = useHotelContext();
  const navigate = useNavigate();
  return (
    <HotelSelectionPage onSelectHotel={(h) => {
      selectHotel(h);
      navigate(`/properties/${h.id}/disputes`);
    }} />
  );
};

const HotelUrlSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hotelId } = useParams<{ hotelId: string }>();
  const { hotel, selectHotel } = useHotelContext();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!hotelId || hotel?.id === hotelId) return;
    let cancelled = false;
    setSyncing(true);
    getOrganization(hotelId).then(org => {
      if (cancelled) return;
      if (org) {
        selectHotel(organizationToHotel(org));
      } else {
        navigate('/properties', { replace: true });
      }
      setSyncing(false);
    }).catch(() => {
      if (!cancelled) {
        navigate('/properties', { replace: true });
        setSyncing(false);
      }
    });
    return () => { cancelled = true; };
  }, [hotelId, hotel?.id, selectHotel, navigate]);

  if (syncing || (hotelId && hotel?.id !== hotelId)) return <PageSpinner />;
  return <>{children}</>;
};

const NoOrganizationMessage: React.FC = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md text-center">
      <h2 className="text-xl font-semibold text-white mb-2">No Property Assigned</h2>
      <p className="text-slate-400">Your account is not associated with a property. Please contact your administrator to be assigned to one.</p>
    </div>
  </div>
);

const AuthenticatedRoutes: React.FC = () => {
  const { user } = useAuthContext();
  const { hotel, disputes, isLoading, noOrganization, updateHotel } = useHotelContext();

  if (!user) {
    window.location.href = `${WEBSITE_URL}/login`;
    return <PageSpinner />;
  }
  if (noOrganization) return <NoOrganizationMessage />;

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route index element={<Navigate to="properties" replace />} />
        <Route path="properties" element={<ErrorBoundary><HotelSelectionWrapper /></ErrorBoundary>} />
        <Route path="properties/:hotelId/disputes" element={
          <ErrorBoundary>
            <HotelUrlSync>
              {hotel ? <DisputeDashboard user={user} hotel={hotel} disputes={disputes} isLoading={isLoading} onUpdateHotel={updateHotel} /> : <PageSpinner />}
            </HotelUrlSync>
          </ErrorBoundary>
        } />
        <Route path="properties/:hotelId/analytics" element={
          <ErrorBoundary>
            <HotelUrlSync>
              {hotel ? <HotelAnalyticsPage hotel={hotel} disputes={disputes} isLoading={isLoading} /> : <PageSpinner />}
            </HotelUrlSync>
          </ErrorBoundary>
        } />
        <Route path="properties/my/disputes" element={
          <ErrorBoundary>
            {hotel ? <DisputeDashboard user={user} hotel={hotel} disputes={disputes} isLoading={isLoading} onUpdateHotel={updateHotel} /> : <PageSpinner />}
          </ErrorBoundary>
        } />
        <Route path="properties/my/analytics" element={
          <ErrorBoundary>
            {hotel ? <HotelAnalyticsPage hotel={hotel} disputes={disputes} isLoading={isLoading} /> : <PageSpinner />}
          </ErrorBoundary>
        } />
        <Route path="analytics" element={user.role === 'admin' ? <ErrorBoundary><PortfolioAnalyticsPage /></ErrorBoundary> : <Navigate to="/dashboard" replace />} />
        <Route path="activity" element={user.role === 'admin' ? <ErrorBoundary><ActivityLogPage /></ErrorBoundary> : <Navigate to="/dashboard" replace />} />
        <Route path="users" element={user.role === 'admin' ? <ErrorBoundary><UserManagementPage /></ErrorBoundary> : <Navigate to="/dashboard" replace />} />
        <Route path="leads" element={user.role === 'admin' ? <ErrorBoundary><ContactSalesLeadsPage /></ErrorBoundary> : <Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

const AuthenticatedShell: React.FC = () => {
  const { user, logout, needsPolicyConsent, markPolicyAccepted } = useAuthContext();
  const { hotel, clearHotel } = useHotelContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);

  const path = location.pathname;
  const isHotelAnalytics = path.includes('/analytics') && !!hotel;
  const isHotelDisputes = path.includes('/disputes');
  const hotelView = isHotelAnalytics ? 'analytics' as const : 'disputes' as const;

  let pageTitle = 'Dashboard';
  if (hotel && isHotelAnalytics) pageTitle = 'Hotel Analytics';
  else if (hotel && isHotelDisputes) pageTitle = 'Dispute Dashboard';
  else if (path.includes('/analytics')) pageTitle = 'Portfolio Analytics';
  else if (path.includes('/activity')) pageTitle = 'Activity Log';
  else if (path.includes('/users')) pageTitle = 'User Management';
  else if (path.includes('/leads')) pageTitle = 'Contact Sales Leads';
  else if (path.includes('/properties')) pageTitle = 'Manage Properties';

  const shouldDisablePageScroll = hotel && isHotelDisputes;
  const isDemoMode = hotel?.isDemo === true;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (event.key === '?' && !isInputField && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setIsKeyboardShortcutsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = WEBSITE_URL;
  };

  if (!user) {
    window.location.href = `${WEBSITE_URL}/login`;
    return <PageSpinner />;
  }

  return (
    <>
      {isDemoMode && <DemoModeBanner />}
      <AppShell
        user={user}
        onLogout={handleLogout}
        pageTitle={pageTitle}
        hotelContextName={hotel?.name}
        onBackToSelection={user.role === 'admin' && hotel ? () => { clearHotel(); navigate('/properties'); } : undefined}
        onNavigateToProperties={user.role === 'admin' ? () => { clearHotel(); navigate('/properties'); } : undefined}
        onNavigateToPortfolioAnalytics={user.role === 'admin' ? () => { clearHotel(); navigate('/analytics'); } : undefined}
        onNavigateToActivityLog={user.role === 'admin' ? () => { clearHotel(); navigate('/activity'); } : undefined}
        onNavigateToUserManagement={user.role === 'admin' ? () => { clearHotel(); navigate('/users'); } : undefined}
        onNavigateToContactSales={user.role === 'admin' ? () => { clearHotel(); navigate('/leads'); } : undefined}
        onOpenSettings={() => setIsSettingsOpen(true)}
        hotelView={hotelView}
        onNavigateToHotelDisputes={hotel ? () => navigate(`/properties/${hotel.id}/disputes`) : undefined}
        onNavigateToHotelAnalytics={hotel ? () => navigate(`/properties/${hotel.id}/analytics`) : undefined}
        disablePageScroll={!!shouldDisablePageScroll}
      >
        <AuthenticatedRoutes />
      </AppShell>

      <Suspense fallback={null}>
        {isSettingsOpen && <SettingsModal user={user} onClose={() => setIsSettingsOpen(false)} />}
        {isCommandPaletteOpen && (
          <CommandPalette
            onClose={() => setIsCommandPaletteOpen(false)}
            onNavigate={(view) => {
              if (view === 'properties') { clearHotel(); navigate('/properties'); }
              if (view === 'portfolio_analytics') { clearHotel(); navigate('/analytics'); }
              if (view === 'activity_log') { clearHotel(); navigate('/activity'); }
              if (view === 'user_management') { clearHotel(); navigate('/users'); }
              setIsCommandPaletteOpen(false);
            }}
            isAdmin={user.role === 'admin'}
          />
        )}
        {isKeyboardShortcutsOpen && (
          <KeyboardShortcutsModal onClose={() => setIsKeyboardShortcutsOpen(false)} />
        )}
      </Suspense>
      {needsPolicyConsent && user && (
        <PolicyConsentModal userId={user.id} onAccept={markPolicyAccepted} />
      )}
    </>
  );
};

const App: React.FC = () => {
  const { updateAvailable, dismiss } = useVersionCheck();

  return (
    <>
      {updateAvailable && <UpdateBanner onDismiss={dismiss} />}
      <CookieConsent />
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />
          <Route path="/*" element={
            <ProtectedRoute>
              <AuthenticatedShell />
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
    </>
  );
};

export default App;
