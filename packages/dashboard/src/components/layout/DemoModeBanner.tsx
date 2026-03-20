import React from 'react';
import { RefreshCw } from 'lucide-react';

interface DemoModeBannerProps {
  onReset?: () => void;
}

export const DemoModeBanner: React.FC<DemoModeBannerProps> = ({ onReset }) => {
  const handleReset = async () => {
    if (!onReset) {
      // Call the seedDemoData endpoint
      try {
        const response = await fetch(
          'https://us-central1-realyn-app.cloudfunctions.net/seedDemoData',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('Demo data reset:', data);
          // Reload the page to show updated data
          window.location.reload();
        } else {
          console.error('Failed to reset demo data');
        }
      } catch (error) {
        console.error('Error resetting demo data:', error);
      }
    } else {
      onReset();
    }
  };

  return (
    <div className="bg-cyan-600/20 border-b border-cyan-500/30 text-cyan-300 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-xs font-semibold uppercase tracking-wider">DEMO MODE</span>
        <span className="text-xs text-cyan-400">This is a demonstration environment</span>
      </div>
      {onReset !== undefined && (
        <button
          onClick={handleReset}
          className="flex items-center space-x-1 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors px-2 py-1 rounded hover:bg-cyan-500/20"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Reset Demo</span>
        </button>
      )}
    </div>
  );
};

