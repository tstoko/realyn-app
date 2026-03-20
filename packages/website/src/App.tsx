import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthContext, Spinner, CookieConsent } from '@realyn/shared';

const LandingPage = lazy(() => import('./components/landing/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ContactSalesPage = lazy(() => import('./components/landing/ContactSalesPage').then(m => ({ default: m.ContactSalesPage })));

const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService').then(m => ({ default: m.TermsOfService })));
const CookiePolicy = lazy(() => import('./pages/legal/CookiePolicy').then(m => ({ default: m.CookiePolicy })));
const AcceptableUsePolicy = lazy(() => import('./pages/legal/AcceptableUsePolicy').then(m => ({ default: m.AcceptableUsePolicy })));
const SubProcessors = lazy(() => import('./pages/legal/SubProcessors').then(m => ({ default: m.SubProcessors })));

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || 'https://app.realyn.com';

const PageSpinner = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center">
    <Spinner />
  </div>
);

const LoginPageWrapper: React.FC = () => {
  const { user, loading } = useAuthContext();
  if (loading) return <PageSpinner />;
  if (user) {
    window.location.href = `${DASHBOARD_URL}/dashboard`;
    return <PageSpinner />;
  }
  return (
    <Suspense fallback={<PageSpinner />}>
      <LoginPage onLoginSuccess={() => {
        window.location.href = `${DASHBOARD_URL}/dashboard`;
      }} />
    </Suspense>
  );
};

const App: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <CookieConsent />
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={
            <LandingPage
              onLoginClick={() => navigate('/login')}
              onContactSalesClick={() => navigate('/contact')}
              onNavigateToLegal={(page: string) => navigate(`/${page}`)}
            />
          } />
          <Route path="/login" element={<LoginPageWrapper />} />
          <Route path="/contact" element={<ContactSalesPage onBack={() => navigate('/')} />} />

          <Route path="/privacy" element={<PrivacyPolicy onBack={() => navigate(-1)} onNavigateToSubProcessors={() => navigate('/sub-processors')} />} />
          <Route path="/terms" element={<TermsOfService onBack={() => navigate(-1)} onNavigateToSubProcessors={() => navigate('/sub-processors')} />} />
          <Route path="/cookies" element={<CookiePolicy onBack={() => navigate(-1)} />} />
          <Route path="/acceptable-use" element={<AcceptableUsePolicy onBack={() => navigate(-1)} />} />
          <Route path="/sub-processors" element={<SubProcessors onBack={() => navigate(-1)} />} />

          {/* Redirect any dashboard routes to the dashboard app */}
          <Route path="/dashboard" element={<RedirectToDashboard />} />
          <Route path="/properties/*" element={<RedirectToDashboard />} />
          <Route path="/analytics" element={<RedirectToDashboard />} />
          <Route path="/activity" element={<RedirectToDashboard />} />
          <Route path="/users" element={<RedirectToDashboard />} />
          <Route path="/leads" element={<RedirectToDashboard />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
};

const RedirectToDashboard: React.FC = () => {
  window.location.href = `${DASHBOARD_URL}${window.location.pathname}`;
  return <PageSpinner />;
};

export default App;
