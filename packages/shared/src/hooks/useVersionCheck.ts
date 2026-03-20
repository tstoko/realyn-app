import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 60_000;
const CURRENT_BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? '';

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (CURRENT_BUILD_ID && data.buildId && data.buildId !== CURRENT_BUILD_ID) {
        setUpdateAvailable(true);
      }
    } catch {
      // Network error — silently ignore
    }
  }, []);

  useEffect(() => {
    checkVersion();
    const id = setInterval(checkVersion, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [checkVersion]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { updateAvailable: updateAvailable && !dismissed, dismiss };
}
