
import React, { useState, useEffect } from 'react';
import type { User, Hotel } from './types';
import { LoginPage } from './components/LoginPage';
import { HotelSelectionPage } from './components/HotelSelectionPage';
import { PortfolioAnalyticsPage } from './components/PortfolioAnalyticsPage';
import { Spinner } from './components/Spinner';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { DisputeDashboard } from './components/DisputeDashboard';
import { SettingsModal } from './components/SettingsModal';
import { HotelAnalyticsPage } from './components/HotelAnalyticsPage';
import { useDisputes } from './hooks/useDisputes';
import { CommandPalette } from './components/CommandPalette';
import { ActivityLogPage } from './components/ActivityLogPage';


type AdminView = 'hotel_selection' | 'analytics' | 'activity_log';
type HotelView = 'disputes' | 'analytics';

const App: React.FC = () => {
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null);
  const [dashboardContext, setDashboardContext] = useState<Hotel | null>(null);
  const [adminView, setAdminView] = useState<AdminView>('hotel_selection');
  const [hotelView, setHotelView] = useState<HotelView>('disputes');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  
  const { disputes: hotelDisputes, loading: disputesLoading } = useDisputes(dashboardContext?.id);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogin = (user: User) => {
    setLoggedInUser(user);
    if (user.role === 'user') {
        const placeholderHotel: Hotel = {
            id: user.organizationId!,
            name: user.hotelName!,
            location: '',
            teams: [],
            documents: [],
            integrations: { psp: { type: 'none', status: 'not_connected' }, pms: { type: 'none', status: 'not_connected' } },
            automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 0, autoMarkNotContested: false },
            users: []
        };
      setDashboardContext(placeholderHotel);
      setHotelView('disputes');
    }
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setDashboardContext(null);
    setAdminView('hotel_selection');
  };
  
  const handleSelectHotel = (hotel: Hotel) => {
    setDashboardContext(hotel);
    setHotelView('disputes');
  };
  
  const handleBackToSelection = () => {
    setDashboardContext(null);
  };
  
  const handleNavigateToProperties = () => {
    setDashboardContext(null);
    setAdminView('hotel_selection');
  };

  const handleNavigateToPortfolioAnalytics = () => {
    setDashboardContext(null);
    setAdminView('analytics');
  };

  const handleNavigateToActivityLog = () => {
    setDashboardContext(null);
    setAdminView('activity_log');
  };

  const renderContent = () => {
    if (!loggedInUser) {
      return <LoginPage onLoginSuccess={handleLogin} />;
    }

    let pageContent;
    let pageTitle = "Dashboard";
    // Determine if we want to disable page-level scroll (for dashboards with internal scrolling)
    let shouldDisablePageScroll = false;

    if (loggedInUser.role === 'admin') {
      if (dashboardContext) {
          if (hotelView === 'analytics') {
              pageTitle = "Hotel Analytics";
              pageContent = <HotelAnalyticsPage hotel={dashboardContext} disputes={hotelDisputes} isLoading={disputesLoading} />;
          } else {
              pageTitle = "Dispute Dashboard";
              shouldDisablePageScroll = true;
              pageContent = <DisputeDashboard 
                user={loggedInUser}
                hotel={dashboardContext}
                disputes={hotelDisputes}
                isLoading={disputesLoading}
              />;
          }
      } else if (adminView === 'analytics') {
          pageTitle = "Portfolio Analytics";
          pageContent = <PortfolioAnalyticsPage />;
      } else if (adminView === 'activity_log') {
          pageTitle = "Activity Log";
          pageContent = <ActivityLogPage />;
      } else {
          pageTitle = "Manage Properties";
          pageContent = <HotelSelectionPage onSelectHotel={handleSelectHotel} />;
      }
    } else if (dashboardContext) {
        if (hotelView === 'analytics') {
            pageTitle = "Hotel Analytics";
            pageContent = <HotelAnalyticsPage hotel={dashboardContext} disputes={hotelDisputes} isLoading={disputesLoading} />;
        } else {
            pageTitle = "Dispute Dashboard";
            shouldDisablePageScroll = true;
            pageContent = <DisputeDashboard 
                user={loggedInUser} 
                hotel={dashboardContext} 
                disputes={hotelDisputes}
                isLoading={disputesLoading}
            />;
        }
    } else {
      // Fallback for unexpected states
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950">
          <Spinner />
        </div>
      );
    }
    
    return (
       <>
        <AppShell 
          user={loggedInUser} 
          onLogout={handleLogout}
          pageTitle={pageTitle}
          hotelContextName={dashboardContext?.name}
          onBackToSelection={loggedInUser.role === 'admin' && !!dashboardContext ? handleBackToSelection : undefined}
          onNavigateToProperties={loggedInUser.role === 'admin' ? handleNavigateToProperties : undefined}
          onNavigateToPortfolioAnalytics={loggedInUser.role === 'admin' ? handleNavigateToPortfolioAnalytics : undefined}
          onNavigateToActivityLog={loggedInUser.role === 'admin' ? handleNavigateToActivityLog : undefined}
          onOpenSettings={() => setIsSettingsOpen(true)}
          // Hotel-specific navigation
          hotelView={hotelView}
          onNavigateToHotelDisputes={() => setHotelView('disputes')}
          onNavigateToHotelAnalytics={() => setHotelView('analytics')}
          disablePageScroll={shouldDisablePageScroll}
        >
          {pageContent}
       </AppShell>
       {isSettingsOpen && <SettingsModal user={loggedInUser} onClose={() => setIsSettingsOpen(false)} />}
       {isCommandPaletteOpen && (
          <CommandPalette
            onClose={() => setIsCommandPaletteOpen(false)}
            onNavigate={(view) => {
              if (view === 'properties') handleNavigateToProperties();
              if (view === 'portfolio_analytics') handleNavigateToPortfolioAnalytics();
              if (view === 'activity_log') handleNavigateToActivityLog();
              setIsCommandPaletteOpen(false);
            }}
            isAdmin={loggedInUser.role === 'admin'}
          />
       )}
      </>
    );
  }

  return (
    <ToastProvider>
      {renderContent()}
    </ToastProvider>
  );
};

export default App;