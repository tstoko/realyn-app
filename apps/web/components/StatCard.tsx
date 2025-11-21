import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, description, icon }) => {
  return (
    <div className="group relative bg-slate-900/50 backdrop-blur-sm rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-900/10 overflow-hidden">
      {/* Gradient Glow Effect on Hover */}
      <div className="absolute -inset-px bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-50 tracking-tight min-w-0 flex-1 truncate font-heading">
             {value}
          </p>
          {description && (
              <div className="mt-2 flex items-center">
                <span className="text-xs text-slate-500 truncate">{description}</span>
              </div>
          )}
        </div>
        <div className="ml-4 flex-shrink-0">
             <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 text-cyan-400 shadow-sm group-hover:text-cyan-300 group-hover:border-cyan-500/30 transition-all duration-300">
                {icon}
             </div>
        </div>
      </div>
    </div>
  );
};