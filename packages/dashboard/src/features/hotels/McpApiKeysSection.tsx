import React, { useState, useEffect, useCallback } from 'react';
import { FUNCTIONS_BASE_URL } from '../../config/environment';
import { auth } from '@realyn/shared';

interface ApiKeyMeta {
  id: string;
  name: string;
  prefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
}

interface McpApiKeysSectionProps {
  organizationId: string;
}

export const McpApiKeysSection: React.FC<McpApiKeysSectionProps> = ({ organizationId }) => {
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${FUNCTIONS_BASE_URL}/mcpApiKeyList?organizationId=${organizationId}`, { headers });
      const data = await res.json();
      setKeys((data.keys || []).filter((k: ApiKeyMeta) => !k.revokedAt));
    } catch {
      setError('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [organizationId, getAuthHeaders]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${FUNCTIONS_BASE_URL}/mcpApiKeyGenerate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ organizationId, name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewKeyValue(data.apiKey);
      setNewKeyName('');
      fetchKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`${FUNCTIONS_BASE_URL}/mcpApiKeyRevoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ organizationId, keyId }),
      });
      fetchKeys();
    } catch {
      setError('Failed to revoke key');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="mt-8 border-t border-slate-700 pt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">MCP API Keys</h3>
          <p className="text-sm text-slate-400 mt-0.5">Manage API keys for MCP server access</p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setNewKeyValue(null); }}
          className="px-3 py-1.5 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
        >
          {showCreate ? 'Cancel' : 'New Key'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">{error}</div>
      )}

      {newKeyValue && (
        <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-800 rounded-lg">
          <p className="text-sm text-emerald-300 font-medium mb-1">API key created. Copy it now — it won't be shown again.</p>
          <code className="block text-xs bg-slate-900 p-2 rounded text-emerald-200 break-all select-all">{newKeyValue}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(newKeyValue); setNewKeyValue(null); }}
            className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
          >
            Copy & dismiss
          </button>
        </div>
      )}

      {showCreate && !newKeyValue && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production Agent)"
            className="flex-1 text-sm rounded-lg bg-slate-800 border-slate-600 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-slate-500">No API keys yet. Create one to connect an MCP client.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 font-medium">{key.name}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{key.prefix}...</span>
                  {' · '}Created {formatDate(key.createdAt)}
                  {key.lastUsedAt && <>{' · '}Last used {formatDate(key.lastUsedAt)}</>}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(key.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
