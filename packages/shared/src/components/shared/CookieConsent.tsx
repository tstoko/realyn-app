import React, { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cookie-consent';
const CONSENT_VERSION = '1.0';

interface CookieConsentState {
  essential: boolean;
  analytics: boolean;
  timestamp: string;
  version: string;
}

function getSavedConsent(): CookieConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentState;
    if (parsed.version === CONSENT_VERSION) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveConsent(analytics: boolean): void {
  const state: CookieConsentState = {
    essential: true,
    analytics,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getConsentState(): CookieConsentState | null {
  return getSavedConsent();
}

export function hasAnalyticsConsent(): boolean {
  return getSavedConsent()?.analytics === true;
}

export const CookieConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(false);

  useEffect(() => {
    if (!getSavedConsent()) {
      setVisible(true);
    }
  }, []);

  const accept = useCallback((analytics: boolean) => {
    saveConsent(analytics);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 sm:p-6 pointer-events-none">
      <div className="mx-auto max-w-2xl pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-sm p-5 shadow-2xl">
        {showPreferences ? (
          <>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Cookie Preferences</h3>
            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-200">Essential Cookies</span>
                  <p className="text-xs text-slate-400">Required for authentication and core functionality. Cannot be disabled.</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analyticsChecked}
                  onChange={(e) => setAnalyticsChecked(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-200">Analytics Cookies</span>
                  <p className="text-xs text-slate-400">Help us understand usage patterns to improve the service.</p>
                </div>
              </label>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowPreferences(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => accept(analyticsChecked)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
              >
                Save Preferences
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-4">
              We use cookies to ensure our platform works correctly and, with your permission, to analyse usage.
              See our{' '}
              <a href="/cookies" className="text-cyan-400 hover:text-cyan-300 underline">
                Cookie Policy
              </a>{' '}
              for details.
            </p>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                onClick={() => setShowPreferences(true)}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Manage Preferences
              </button>
              <button
                onClick={() => accept(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Essential Only
              </button>
              <button
                onClick={() => accept(true)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
              >
                Accept All
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
