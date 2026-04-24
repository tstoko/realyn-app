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

/** Firestore may store org roles beyond the narrow `User` type from shared. */
function orgRole(userRole: string | undefined): string {
  return String(userRole ?? '');
}

export const TeamManagementPage: React.FC = () => {
  const { user, logout } = useAuthContext();
  const myOrgRole = orgRole(user?.role);
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
    setError(null);
    try {
      const [invitesRes, membersRes] = await Promise.all([
        fetchWithAuth(`${FUNCTIONS_BASE_URL}/listInvites`, { method: 'POST' }),
        fetchWithAuth(`${FUNCTIONS_BASE_URL}/listTeamMembers`, { method: 'POST' }),
      ]);
      const invitesData = await invitesRes.json();
      const membersData = await membersRes.json();
      if (!invitesRes.ok) throw new Error(invitesData.error || 'Failed to load invites');
      if (!membersRes.ok) throw new Error(membersData.error || 'Failed to load team members');
      setInvites(invitesData.invites || []);
      setMembers(membersData.members || []);
    } catch (err) {
      console.error('Failed to load team data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team');
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
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 503
              ? 'Email could not be sent. No invite was created — try again or contact support.'
              : 'Failed to send invite'),
        );
      }
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Remove this person from your organization? They will lose access to disputes and evidence.')) return;
    setError(null);
    try {
      const res = await fetchWithAuth(`${FUNCTIONS_BASE_URL}/removeTeamMember`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove member');
      if (userId === user?.id) {
        await logout();
        window.location.href = '/login';
        return;
      }
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleRoleChange = async (userId: string, role: 'Manager' | 'Staff') => {
    setError(null);
    try {
      const res = await fetchWithAuth(`${FUNCTIONS_BASE_URL}/updateTeamMemberRole`, {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
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

  const canEditMember = (m: TeamMember) => {
    if (m.role === 'admin') return false;
    if (myOrgRole === 'Manager' && m.role === 'Manager') return false;
    return true;
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Team Management</h2>
        <p className="text-slate-400 mt-1">Invite team members and manage access to your organization.</p>
      </div>

      {members.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Current members</h3>
          <p className="text-sm text-slate-500 mb-4">
            Role changes apply after the user refreshes their session (sign out and back in) so permissions update everywhere.
          </p>
          <div className="divide-y divide-slate-800">
            {members.map((m) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
                <div>
                  <p className="text-white font-medium">{m.name || '—'}</p>
                  <p className="text-sm text-slate-400">{m.email}</p>
                  <p className="text-xs text-slate-500 mt-1">Role: {m.role}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEditMember(m) ? (
                    <>
                      <select
                        aria-label={`Role for ${m.email}`}
                        value={m.role === 'Manager' || m.role === 'Staff' ? m.role : 'Staff'}
                        onChange={(e) => {
                          const next = e.target.value as 'Manager' | 'Staff';
                          const current = m.role === 'Manager' || m.role === 'Staff' ? m.role : 'Staff';
                          if (next === current) return;
                          handleRoleChange(m.id, next);
                        }}
                        disabled={m.id === user?.id}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-40"
                      >
                        <option value="Staff">Staff</option>
                        {myOrgRole === 'admin' && <option value="Manager">Manager</option>}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-sm text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-900/20"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {m.role === 'admin' ? 'Organization admins are managed separately' : 'You cannot change this member'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
