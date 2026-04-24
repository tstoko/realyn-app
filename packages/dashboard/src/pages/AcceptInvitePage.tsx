import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuthContext, Spinner } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';

export const AcceptInvitePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthContext();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'idle' | 'accepting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token || authLoading || !user || status !== 'idle') return;

    const accept = async () => {
      setStatus('accepting');
      try {
        const { auth } = await import('@realyn/shared');
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Not authenticated');

        const res = await fetch(`${FUNCTIONS_BASE_URL}/acceptInvite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, inviteToken: token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to accept invite');
        setStatus('success');
        setTimeout(() => navigate('/', { replace: true }), 2000);
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message);
      }
    };

    accept();
  }, [token, user, authLoading, status, navigate]);

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Invalid Invite Link</h2>
          <p className="text-slate-400 mb-4">This invite link is missing a token. Please check the link from your email.</p>
          <Link to="/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">Go to Login</Link>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Accept Invitation</h2>
          <p className="text-slate-400 mb-6">Please sign in or create an account to accept this invitation.</p>
          <div className="space-y-3">
            <Link
              to={`/login?redirect=/accept-invite?token=${encodeURIComponent(token)}`}
              className="block w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2.5 rounded-lg transition-colors text-center"
            >
              Sign In
            </Link>
            <Link
              to={`/signup?redirect=/accept-invite?token=${encodeURIComponent(token)}`}
              className="block w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-lg transition-colors text-center"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md text-center">
        {status === 'accepting' && (
          <>
            <Spinner />
            <p className="text-slate-400 mt-4">Accepting invitation...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Welcome to the team!</h2>
            <p className="text-slate-400">Redirecting to your dashboard...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Could not accept invite</h2>
            <p className="text-slate-400 mb-4">{errorMsg}</p>
            <Link to="/" className="text-cyan-400 hover:text-cyan-300 transition-colors">Go to Dashboard</Link>
          </>
        )}
      </div>
    </div>
  );
};
