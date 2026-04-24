import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Logo, useAuthContext, Spinner } from '@realyn/shared';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuthContext();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    const loggedInUser = await login(email, password);
    if (loggedInUser) {
      navigate('/', { replace: true });
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
            Log in to your account
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Welcome back to the Realyn Dashboard.
          </p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-xl shadow-2xl border border-slate-800/50">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={textInputStyle}
              />
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                Forgot your password?
              </Link>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? <Spinner /> : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
              Sign up
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
};
