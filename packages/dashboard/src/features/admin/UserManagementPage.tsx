import React, { useState } from 'react';
import type { User } from '@realyn/shared';
import { Spinner, useToast } from '@realyn/shared';
import { useUsers } from '../../hooks/useUsers';
import { useOrganizations } from '../../hooks/useOrganizations';
import { createUser, updateUser, deleteUser } from '../../services/userManagementService';
import { ConfirmationModal } from '../../components/shared/ConfirmationModal';

export const UserManagementPage: React.FC = () => {
  const { users, loading, error, refresh } = useUsers();
  const { organizations } = useOrganizations();
  const addToast = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    organizationId: '',
  });
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'user' as 'admin' | 'user',
    organizationId: '',
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const selectedOrg = organizations.find(org => org.id === createFormData.organizationId);
      const result = await createUser({
        email: createFormData.email,
        password: createFormData.password,
        name: createFormData.name,
        role: createFormData.role,
        organizationId: createFormData.organizationId || undefined,
        hotelName: selectedOrg?.name || undefined,
      });

      if (result.success) {
        addToast({ type: 'success', message: 'User created successfully' });
        setShowCreateForm(false);
        setCreateFormData({
          name: '',
          email: '',
          password: '',
          role: 'user',
          organizationId: '',
        });
        await refresh();
      } else {
        addToast({ type: 'error', message: result.error || 'Failed to create user' });
      }
    } catch (error: any) {
      addToast({ type: 'error', message: error.message || 'Failed to create user' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name,
      role: user.role,
      organizationId: user.organizationId || '',
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsUpdating(true);

    try {
      const selectedOrg = organizations.find(org => org.id === editFormData.organizationId);
      const result = await updateUser({
        userId: editingUser.id,
        name: editFormData.name,
        role: editFormData.role,
        organizationId: editFormData.organizationId || undefined,
        hotelName: selectedOrg?.name || undefined,
      });

      if (result.success) {
        addToast({ type: 'success', message: 'User updated successfully' });
        setEditingUser(null);
        await refresh();
      } else {
        addToast({ type: 'error', message: result.error || 'Failed to update user' });
      }
    } catch (error: any) {
      addToast({ type: 'error', message: error.message || 'Failed to update user' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);

    try {
      const result = await deleteUser({
        userId: userToDelete.id,
      });

      if (result.success) {
        addToast({ type: 'success', message: 'User deleted successfully' });
        setUserToDelete(null);
        await refresh();
      } else {
        addToast({ type: 'error', message: result.error || 'Failed to delete user' });
      }
    } catch (error: any) {
      addToast({ type: 'error', message: error.message || 'Failed to delete user' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="md:flex md:items-center md:justify-between mb-10">
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-bold leading-7 text-slate-50 sm:text-4xl sm:truncate font-heading tracking-tight">
            User Management
          </h2>
          <p className="mt-2 text-lg text-slate-400">
            Create and manage user accounts and link them to accounts.
          </p>
        </div>
        <div className="mt-6 flex md:mt-0 md:ml-4">
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-xl shadow-lg shadow-cyan-500/20 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 focus:ring-offset-slate-950 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create User
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-8 p-6 bg-slate-900/50 rounded-xl border border-slate-800">
          <h3 className="text-xl font-semibold text-slate-50 mb-4">Create New User</h3>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={createFormData.name}
                  onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Role
                </label>
                <select
                  value={createFormData.role}
                  onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value as 'admin' | 'user' })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {createFormData.role === 'user' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Account
                  </label>
                  <select
                    value={createFormData.organizationId}
                    onChange={(e) => setCreateFormData({ ...createFormData, organizationId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select an account...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isCreating}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateFormData({
                    name: '',
                    email: '',
                    password: '',
                    role: 'user',
                    organizationId: '',
                  });
                }}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className="mb-8 p-6 bg-slate-900/50 rounded-xl border border-slate-800">
          <h3 className="text-xl font-semibold text-slate-50 mb-4">Edit User: {editingUser.email}</h3>
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Role
                </label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as 'admin' | 'user' })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {editFormData.role === 'user' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Account
                  </label>
                  <select
                    value={editFormData.organizationId}
                    onChange={(e) => setEditFormData({ ...editFormData, organizationId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select an account...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isUpdating}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUpdating ? 'Updating...' : 'Update User'}
              </button>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/30 divide-y divide-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    {user.email || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.role === 'admin'
                        ? 'bg-purple-900/20 text-purple-300 border border-purple-900/50'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    {user.hotelName || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setUserToDelete(user)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              No users found. Create your first user above.
            </div>
          )}
        </div>
      </div>

      {userToDelete && (
        <ConfirmationModal
          isOpen={!!userToDelete}
          onClose={() => setUserToDelete(null)}
          onConfirm={handleDeleteUser}
          title="Delete User"
          message={`Are you sure you want to permanently delete "${userToDelete.name}" (${userToDelete.email})? This action cannot be undone.`}
          confirmButtonText="Delete"
          confirmButtonVariant="danger"
        />
      )}
    </div>
  );
};

