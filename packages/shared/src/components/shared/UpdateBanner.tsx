import React from 'react';
import { RefreshCw, X } from 'lucide-react';

interface UpdateBannerProps {
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ onDismiss }) => {
  return (
    <div className="fixed top-0 inset-x-0 z-[200] bg-cyan-600/90 backdrop-blur-sm border-b border-cyan-400/40 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
      <div className="flex items-center space-x-3">
        <RefreshCw className="w-4 h-4 animate-spin-slow" />
        <span className="text-sm font-medium">A new version of Realyn is available.</span>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-semibold bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 rounded-md"
        >
          Refresh now
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
