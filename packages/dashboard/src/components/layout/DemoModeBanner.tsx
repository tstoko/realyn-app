import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { performDemoReset } from '../../services/demoResetService';

interface DemoModeBannerProps {
  organizationId?: string | null;
  onReset?: () => void;
}

export const DemoModeBanner: React.FC<DemoModeBannerProps> = ({ organizationId, onReset }) => {
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    if (onReset) {
      onReset();
      return;
    }
    setIsResetting(true);
    try {
      const result = await performDemoReset(organizationId);
      if (result.ok) {
        window.location.reload();
      } else {
        window.alert(`Reset failed: ${result.message}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      window.alert(`Reset failed: ${message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="bg-cyan-600/20 border-b border-cyan-500/30 text-cyan-300 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-xs font-semibold uppercase tracking-wider">DEMO MODE</span>
        <span className="text-xs text-cyan-400">This is a demonstration environment</span>
      </div>
      <button
        onClick={handleReset}
        disabled={isResetting}
        className="flex items-center space-x-1 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors px-2 py-1 rounded hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
        <span>{isResetting ? 'Resetting…' : 'Reset Demo'}</span>
      </button>
    </div>
  );
};
