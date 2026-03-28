import React, { useState } from 'react';
import { auth, CURRENT_POLICY_VERSION } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../../config/environment';

interface PolicyConsentModalProps {
  userId: string;
  onAccept: () => void;
}

export const PolicyConsentModal: React.FC<PolicyConsentModalProps> = ({ userId, onAccept }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setSaving(true);
    setError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const idToken = await currentUser.getIdToken();

      const response = await fetch(`${FUNCTIONS_BASE_URL}/userWriteHandler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'acceptPolicyConsent',
          tosVersion: CURRENT_POLICY_VERSION,
          privacyVersion: CURRENT_POLICY_VERSION,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save consent');

      onAccept();
    } catch (err) {
      console.error('Failed to save policy consent:', err);
      setError('Failed to save your consent. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Updated Policies</h2>
        <p className="text-sm text-slate-300 mb-4">
          We have updated our Terms of Service and Privacy Policy. Please review and accept them to
          continue using Realyn.
        </p>
        <div className="flex flex-col gap-2 mb-5 text-sm">
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline"
          >
            Terms of Service
          </a>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline"
          >
            Privacy Policy
          </a>
        </div>
        {error && (
          <p className="text-sm text-red-400 mb-3">{error}</p>
        )}
        <button
          onClick={handleAccept}
          disabled={saving}
          className="w-full rounded-lg bg-cyan-600 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'I Accept'}
        </button>
      </div>
    </div>
  );
};
