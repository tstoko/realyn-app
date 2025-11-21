import React, { useState } from 'react';
import { Logo } from './Logo';
import { User } from '../types';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import { ChartBarIcon } from './icons/ChartBarIcon';
import { UserGroupIcon } from './icons/UserGroupIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import { HomeIcon } from './icons/HomeIcon';

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
    onNavigateToProperties, onNavigateToPortfolioAnalytics, onNavigateToActivityLog, onOpenSettings,
    hotelView, onNavigateToHotelDisputes, onNavigateToHotelAnalytics,
    disablePageScroll = false
}) => {
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userInitials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
    
    const isInHotelContext = !!hotelContextName;

    return (
        <div className="h-screen flex text-slate-50 font-sans overflow-hidden bg-slate-950 w-full">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900/80 backdrop-blur-xl flex-shrink-0 flex flex-col border-r border-slate-800/60 h-full z-20">
                <div className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-800/60">
                   <div className="flex items-center gap-2">
                       <Logo className="h-7 w-auto" />
                   </div>
                   <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider text-cyan-400 bg-cyan-500/10 rounded border border-cyan-500/20">
                       BETA
                   </span>
                </div>
                
                <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {user.role === 'admin' ? (
                        <>
                            <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Overview</div>
                            <NavItem 
                                icon={<UserGroupIcon className="h-5 w-5" />} 
                                label="Properties" 
                                active={!isInHotelContext && pageTitle.includes("Properties")} 
                                onClick={onNavigateToProperties} 
                            />
                            <NavItem 
                                icon={<ChartBarIcon className="h-5 w-5" />} 
                                label="Portfolio Analytics" 
                                active={!isInHotelContext && pageTitle.includes("Analytics")} 
                                onClick={onNavigateToPortfolioAnalytics} 
                            />
                            <NavItem 
                                icon={<ActivityIcon className="h-5 w-5" />} 
                                label="Activity Log" 
                                active={!isInHotelContext && pageTitle.includes("Activity Log")} 
                                onClick={onNavigateToActivityLog} 
                            />
                            
                            {isInHotelContext && (
                                <>
                                 <div className="my-4 border-t border-slate-800/60"></div>
                                 <div className="px-3 mb-2 text-xs font-semibold text-cyan-500/80 uppercase tracking-wider truncate">{hotelContextName}</div>
                                    <NavItem 
                                        icon={<ShieldCheckIcon className="h-5 w-5" />} 
                                        label="Disputes" 
                                        active={hotelView === 'disputes'} 
                                        onClick={onNavigateToHotelDisputes}
                                    />
                                    <NavItem 
                                        icon={<ChartBarIcon className="h-5 w-5" />} 
                                        label="Analytics" 
                                        active={hotelView === 'analytics'} 
                                        onClick={onNavigateToHotelAnalytics}
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
                                onClick={onNavigateToHotelDisputes}
                            />
                             <NavItem 
                                icon={<ChartBarIcon className="h-5 w-5" />} 
                                label="Analytics" 
                                active={hotelView === 'analytics'}
                                onClick={onNavigateToHotelAnalytics}
                            />
                        </>
                    )}
                </nav>

                <div className="p-4 border-t border-slate-800/60 bg-slate-900/50 flex-shrink-0">
                     <NavItem icon={<SettingsIcon className="h-5 w-5" />} label="Settings" onClick={onOpenSettings} />
                </div>
            </aside>

            {/* Main content wrapper */}
            <div className="flex-1 flex flex-col h-full min-w-0 transition-all duration-300 overflow-hidden">
                <header className="h-16 flex-shrink-0 sticky top-0 z-10 bg-slate-950/70 backdrop-blur-md border-b border-slate-800/60 flex items-center justify-between px-8">
                    <div className="flex items-center">
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
                            <h1 className="text-xl font-bold text-slate-100 font-heading tracking-tight flex items-center">
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
                    className={`flex-1 flex flex-col w-full max-w-7xl mx-auto p-6 lg:p-8 min-h-0 ${
                        disablePageScroll ? 'overflow-hidden' : 'overflow-y-auto'
                    }`}
                >
                    {children}
                </main>
            </div>
        </div>
    );
};