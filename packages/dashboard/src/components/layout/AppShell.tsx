import React, { useState } from 'react';
import { User } from '@realyn/shared';
import { ShieldCheckIcon, ChartBarIcon, UserGroupIcon, SettingsIcon, HomeIcon, UsersIcon } from '@realyn/shared';

type HotelView = 'disputes' | 'analytics';

interface AppShellProps {
  user: User;
  onLogout: () => void;
  pageTitle: string;
  children: React.ReactNode;
  hotelContextName?: string;
  onBackToSelection?: () => void;
  onNavigateToProperties?: () => void;
  onNavigateToPortfolioAnalytics?: () => void;
  onNavigateToActivityLog?: () => void;
  onNavigateToUserManagement?: () => void;
  onNavigateToContactSales?: () => void;
  onOpenSettings: () => void;
  hotelView?: HotelView;
  onNavigateToHotelDisputes?: () => void;
  onNavigateToHotelAnalytics?: () => void;
  disablePageScroll?: boolean;
}

const NavItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
    <button 
        onClick={onClick} 
        disabled={!onClick}
        className={`group w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden ${
            active 
                ? 'bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)] border border-cyan-500/20' 
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
        } ${
            !onClick ? 'cursor-default opacity-60' : ''
        }`}
    >
        <span className={`mr-3 transition-colors duration-200 ${active ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}>{icon}</span>
        <span>{label}</span>
    </button>
);

const ActivityIcon: React.FC<{ className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
)

export const AppShell: React.FC<AppShellProps> = ({ 
    user, onLogout, pageTitle, children, hotelContextName, onBackToSelection,
    onNavigateToProperties, onNavigateToPortfolioAnalytics, onNavigateToActivityLog, onNavigateToUserManagement, onNavigateToContactSales, onOpenSettings,
    hotelView, onNavigateToHotelDisputes, onNavigateToHotelAnalytics,
    disablePageScroll = false
}) => {
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const userInitials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
    
    const isInHotelContext = !!hotelContextName;

    const closeSidebar = () => setSidebarOpen(false);

    const sidebarContent = (
        <>
            <div className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-800/60">
                <span className="text-sm font-semibold text-slate-300 truncate">{hotelContextName || 'Realyn'}</span>
                <button onClick={closeSidebar} className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" aria-label="Close sidebar">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
                {user.role === 'admin' ? (
                    <>
                        <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Overview</div>
                        <NavItem 
                            icon={<UserGroupIcon className="h-5 w-5" />} 
                            label="Properties" 
                            active={!isInHotelContext && pageTitle.includes("Properties")} 
                            onClick={onNavigateToProperties ? () => { onNavigateToProperties(); closeSidebar(); } : undefined} 
                        />
                        <NavItem 
                            icon={<ChartBarIcon className="h-5 w-5" />} 
                            label="Portfolio Analytics" 
                            active={!isInHotelContext && pageTitle.includes("Analytics")} 
                            onClick={onNavigateToPortfolioAnalytics ? () => { onNavigateToPortfolioAnalytics(); closeSidebar(); } : undefined} 
                        />
                        <NavItem 
                            icon={<ActivityIcon className="h-5 w-5" />} 
                            label="Activity Log" 
                            active={!isInHotelContext && pageTitle.includes("Activity Log")} 
                            onClick={onNavigateToActivityLog ? () => { onNavigateToActivityLog(); closeSidebar(); } : undefined} 
                        />
                        <NavItem 
                            icon={<UsersIcon className="h-5 w-5" />} 
                            label="User Management" 
                            active={!isInHotelContext && pageTitle.includes("User Management")} 
                            onClick={onNavigateToUserManagement ? () => { onNavigateToUserManagement(); closeSidebar(); } : undefined} 
                        />
                        <NavItem 
                            icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>} 
                            label="Contact Sales" 
                            active={!isInHotelContext && pageTitle.includes("Contact Sales")} 
                            onClick={onNavigateToContactSales ? () => { onNavigateToContactSales(); closeSidebar(); } : undefined} 
                        />
                        
                        {isInHotelContext && (
                            <>
                             <div className="my-4 border-t border-slate-800/60"></div>
                             <div className="px-3 mb-2 text-xs font-semibold text-cyan-500/80 uppercase tracking-wider truncate">{hotelContextName}</div>
                                <NavItem 
                                    icon={<ShieldCheckIcon className="h-5 w-5" />} 
                                    label="Disputes" 
                                    active={hotelView === 'disputes'} 
                                    onClick={onNavigateToHotelDisputes ? () => { onNavigateToHotelDisputes(); closeSidebar(); } : undefined}
                                />
                                <NavItem 
                                    icon={<ChartBarIcon className="h-5 w-5" />} 
                                    label="Analytics" 
                                    active={hotelView === 'analytics'} 
                                    onClick={onNavigateToHotelAnalytics ? () => { onNavigateToHotelAnalytics(); closeSidebar(); } : undefined}
                                />
                            </>
                        )}
                    </>
                ) : (
                    <>
                       <NavItem 
                            icon={<ShieldCheckIcon className="h-5 w-5" />} 
                            label="Disputes" 
                            active={hotelView === 'disputes'}
                            onClick={onNavigateToHotelDisputes ? () => { onNavigateToHotelDisputes(); closeSidebar(); } : undefined}
                        />
                         <NavItem 
                            icon={<ChartBarIcon className="h-5 w-5" />} 
                            label="Analytics" 
                            active={hotelView === 'analytics'}
                            onClick={onNavigateToHotelAnalytics ? () => { onNavigateToHotelAnalytics(); closeSidebar(); } : undefined}
                        />
                    </>
                )}
            </nav>

            <div className="p-4 border-t border-slate-800/60 bg-slate-900/50 flex-shrink-0">
                 <NavItem icon={<SettingsIcon className="h-5 w-5" />} label="Settings" onClick={() => { onOpenSettings(); closeSidebar(); }} />
            </div>
        </>
    );

    return (
        <div className="h-screen flex text-slate-50 font-sans overflow-hidden bg-slate-950 w-full">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden" onClick={closeSidebar} />
            )}

            {/* Sidebar - fixed overlay on mobile, static on desktop */}
            <aside className={`
                fixed inset-y-0 left-0 z-40 w-64 bg-slate-900/95 backdrop-blur-xl flex flex-col border-r border-slate-800/60
                transform transition-transform duration-300 ease-in-out
                md:relative md:z-20 md:translate-x-0 md:flex-shrink-0 md:bg-slate-900/80
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                {sidebarContent}
            </aside>

            {/* Main content wrapper */}
            <div className="flex-1 flex flex-col h-full min-w-0 transition-all duration-300 overflow-hidden">
                <header className="min-h-16 pt-6 md:pt-8 flex-shrink-0 sticky top-0 z-10 flex items-center justify-between px-4 md:px-8">
                    <div className="flex items-center">
                        {/* Hamburger menu - mobile only */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 mr-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors md:hidden"
                            aria-label="Open navigation menu"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        {onBackToSelection && (
                           <button
                             onClick={onBackToSelection}
                             className="p-2 mr-4 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                             aria-label="Back to hotel selection"
                           >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                              </svg>
                           </button>
                        )}
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center text-slate-50"
                                style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                            {pageTitle}
                            </h1>
                            {hotelContextName && <p className="text-xs text-slate-500 font-medium mt-0.5">Managing {hotelContextName}</p>}
                        </div>
                    </div>
                    <div className="relative">
                        <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center space-x-3 focus:outline-none group">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{user.name}</p>
                                <p className="text-xs text-slate-500 uppercase">{user.role}</p>
                            </div>
                            <div className="h-9 w-9 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md ring-2 ring-slate-900 group-hover:ring-slate-800 transition-all">
                                {userInitials}
                            </div>
                        </button>
                        
                        {userMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)}></div>
                                <div 
                                    className="absolute right-0 mt-3 w-48 rounded-xl shadow-xl py-1 bg-slate-900 border border-slate-800 z-20 transform opacity-100 scale-100 origin-top-right"
                                >
                                    <button onClick={() => { onOpenSettings(); setUserMenuOpen(false); }} className="w-full text-left block px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">Settings</button>
                                    <div className="border-t border-slate-800 my-1"></div>
                                    <button onClick={onLogout} className="w-full text-left block px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors">
                                        Sign out
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </header>
                <main 
                    className={`flex-1 flex flex-col w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 min-h-0 ${
                        disablePageScroll ? 'overflow-hidden' : 'overflow-y-auto'
                    }`}
                >
                    {children}
                </main>
            </div>
        </div>
    );
};