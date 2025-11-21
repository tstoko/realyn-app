import React, { useState } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from './Spinner';
import type { User } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

const DemoAccount: React.FC<{ email: string; password: string; role: string; onSelect: (email: string, pass: string) => void; }> = ({ email, password, role, onSelect }) => (
  <button 
    type="button" 
    onClick={() => onSelect(email, password)} 
    className="text-left w-full p-3 hover:bg-slate-700/50 rounded-lg transition-colors duration-200"
  >
    <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-cyan-500">{email}</span>
        <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{role}</span>
    </div>
    <p className="text-xs text-slate-400 mt-1">Password: {password}</p>
  </button>
);


export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    const user = await login(email, password);
    if (user) {
      onLoginSuccess(user);
    }
  };
  
  const handleDemoLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  }

  const textInputStyle = "appearance-none block w-full px-4 py-2.5 border border-slate-700 rounded-lg shadow-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 sm:text-sm bg-slate-800";

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
            <Logo className="h-12 w-auto mx-auto" />
            <h2 className="mt-6 text-3xl font-bold text-slate-50 font-heading tracking-tight">
                Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-slate-400">
                Welcome back to the Realyn Dashboard.
            </p>
        </div>
        
        <div className="bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-800">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-400">
                Email address
              </label>
              <div className="mt-1">
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
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-400">
                Password
              </label>
              <div className="mt-1">
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
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Spinner /> : 'Sign in'}
              </button>
            </div>
          </form>
          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-center text-sm font-medium text-slate-400 mb-3">Or click to use a demo account</p>
            <div className="space-y-1 bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <DemoAccount email="admin@realyn.com" password="masterpass" role="Admin" onSelect={handleDemoLogin} />
                <DemoAccount email="user1@gph.com" password="password123" role="User" onSelect={handleDemoLogin} />
                <DemoAccount email="user2@lakeside.com" password="password123" role="User" onSelect={handleDemoLogin} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};