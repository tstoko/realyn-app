import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo, useAuthContext, Spinner } from '@realyn/shared';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: any) {
      let message = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        message = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const textInputStyle =
    'appearance-none block w-full px-4 py-2.5 border border-slate-700 rounded-lg shadow-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-cyan-500 sm:text-sm bg-slate-800 transition-all duration-200';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <Logo className="h-20 w-auto mx-auto" />
          <h2 className="mt-6 text-3xl font-bold text-slate-50 font-heading tracking-tight">
            Reset your password
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-xl shadow-2xl border border-slate-800/50">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-300">
                Check your email for a password reset link. It may take a minute to arrive.
              </p>
              <Link
                to="/login"
                className="inline-block text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-400 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={textInputStyle}
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {loading ? <Spinner /> : 'Send reset link'}
              </button>
            </form>
          )}

          {!sent && (
            <p className="mt-6 text-center text-sm text-slate-400">
              Remember your password?{' '}
              <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                Log in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
