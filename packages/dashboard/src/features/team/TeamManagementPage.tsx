import React, { useState, useEffect, useCallback } from 'react';
import { useAuthContext, Spinner } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../../config/environment';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface InviteRecord {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const { auth } = await import('@realyn/shared').then(m => ({ auth: m.auth }));
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      ...options.headers,
    },
  });
}

export const TeamManagementPage: React.FC = () => {
  const { user } = useAuthContext();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Manager' | 'Staff'>('Staff');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.organizationId) return;
    setLoading(true);
    try {
      const invitesRes = await fetchWithAuth(`${FUNCTIONS_BASE_URL}/listInvites`, { method: 'POST' });
      const invitesData = await invitesRes.json();
      setInvites(invitesData.invites || []);
    } catch (err) {
      console.error('Failed to load team data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!inviteEmail.trim()) return;

    setSending(true);
    try {
      const res = await fetchWithAuth(`${FUNCTIONS_BASE_URL}/createInvite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      const res = await fetchWithAuth(`${FUNCTIONS_BASE_URL}/revokeInvite`, {
        method: 'POST',
        body: JSON.stringify({ inviteId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke invite');
      }
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const pendingInvites = invites.filter(i => i.status === 'pending');
  const pastInvites = invites.filter(i => i.status !== 'pending');

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Team Management</h2>
        <p className="text-slate-400 mt-1">Invite team members and manage access to your organization.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Invite Team Member</h3>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@hotel.com"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'Manager' | 'Staff')}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <option value="Staff">Staff</option>
            <option value="Manager">Manager</option>
          </select>
          <button
            type="submit"
            disabled={sending || !inviteEmail.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {sending ? 'Sending...' : 'Send Invite'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}
      </div>

      {pendingInvites.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Pending Invitations</h3>
          <div className="divide-y divide-slate-800">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-white font-medium">{invite.email}</p>
                  <p className="text-sm text-slate-400">
                    {invite.role} &middot; Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(invite.id)}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors px-3 py-1 rounded-lg hover:bg-red-900/20"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pastInvites.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Invitation History</h3>
          <div className="divide-y divide-slate-800">
            {pastInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-white font-medium">{invite.email}</p>
                  <p className="text-sm text-slate-400">{invite.role}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  invite.status === 'accepted'
                    ? 'bg-emerald-900/30 text-emerald-400'
                    : invite.status === 'expired'
                    ? 'bg-amber-900/30 text-amber-400'
                    : 'bg-red-900/30 text-red-400'
                }`}>
                  {invite.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
