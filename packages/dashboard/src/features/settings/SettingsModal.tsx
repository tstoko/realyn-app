import React, { useState, useEffect } from 'react';
import type { User, UserPreferences } from '@realyn/shared';
import { useToast, auth, updateUserProfile, getUserPreferences, updateUserPreferences, DEFAULT_PREFERENCES } from '@realyn/shared';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { exportUserData, deleteUserAccount } from '../../services/dataRetentionService';

interface SettingsModalProps {
  user: User;
  onClose: () => void;
}

type SettingsTab = 'profile' | 'notifications' | 'preferences' | 'security' | 'help' | 'admin';

const Toggle: React.FC<{ 
  label: string; 
  enabled: boolean; 
  setEnabled: (enabled: boolean) => void; 
  description?: string;
}> = ({ label, enabled, setEnabled, description }) => (
    <div className="flex items-center justify-between py-3">
    <div className="flex-1">
      <span className="font-medium text-slate-300 block">{label}</span>
      {description && <span className="text-xs text-slate-500 mt-0.5 block">{description}</span>}
    </div>
        <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 focus:ring-offset-slate-800 ${enabled ? 'bg-cyan-600' : 'bg-slate-600'}`}
        >
            <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
        </button>
    </div>
);

const InputField: React.FC<{ 
  label: string; 
  value: string; 
  onChange: (value: string) => void; 
  type?: string; 
  disabled?: boolean; 
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', disabled = false, placeholder }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-300">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
    />
  </div>
);

const SelectField: React.FC<{ 
  label: string; 
  value: string; 
  onChange: (value: string) => void; 
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-300">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent"
    >
      {options.map(option => (
        <option key={option.value} value={option.value} className="bg-slate-800">{option.label}</option>
      ))}
    </select>
    </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ user, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const addToast = useToast();
  
  // Profile state
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Preferences state
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);
  
  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Data privacy state
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getUserPreferences(user.id);
        setPreferences(prefs);
      } catch (error: any) {
        console.error('Error loading preferences:', error);
        addToast({ type: 'error', message: 'Failed to load preferences' });
      } finally {
        setLoadingPreferences(false);
      }
    };
    loadPreferences().catch(() => {});
  }, [user.id, addToast]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateUserProfile(user.id, { name, phone });
      addToast({ type: 'success', message: 'Profile updated successfully' });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      addToast({ type: 'error', message: error.message || 'Failed to update profile' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePreferenceChange = async (updates: Partial<UserPreferences>) => {
    const previousPreferences = preferences;
    const newPreferences = { ...preferences, ...updates };
    
    // Optimistically update UI
    setPreferences(newPreferences);
    
    setSavingPreferences(true);
    try {
      await updateUserPreferences(user.id, updates);
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      addToast({ type: 'error', message: 'Failed to save preferences' });
      // Revert on error
      setPreferences(previousPreferences);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword || !currentPassword) {
      addToast({ type: 'error', message: 'Please fill in all password fields' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      addToast({ type: 'error', message: 'New passwords do not match' });
      return;
    }
    
    if (newPassword.length < 6) {
      addToast({ type: 'error', message: 'Password must be at least 6 characters' });
      return;
    }
    
    setChangingPassword(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('User not authenticated');
      }
      
      // Re-authenticate user
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      
      // Update password
      await updatePassword(currentUser, newPassword);
      
      addToast({ type: 'success', message: 'Password changed successfully' });
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      let errorMessage = 'Failed to change password';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Current password is incorrect';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      }
      addToast({ type: 'error', message: errorMessage });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleResetData = () => {
    if (window.confirm('Are you sure you want to reset all demo data? This action cannot be undone.')) {
        addToast({ type: 'info', message: 'Demo data reset (mocked action).' });
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      await exportUserData();
      addToast({ type: 'success', message: 'Your data has been exported and downloaded.' });
    } catch (error: any) {
      console.error('Export error:', error);
      addToast({ type: 'error', message: error.message || 'Failed to export data. Please try again.' });
    } finally {
      setExportingData(false);
    }
  };

  const handleRequestDeletion = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action cannot be undone.\n\n' +
      'All your personal data will be permanently deleted.'
    );
    
    if (!confirmed) return;
    
    // Double confirmation for destructive action
    const doubleConfirmed = window.confirm(
      'FINAL CONFIRMATION\n\n' +
      'Your account and all associated data will be permanently deleted.\n\n' +
      'Click OK to proceed with account deletion.'
    );
    
    if (!doubleConfirmed) return;
    
    setDeletingAccount(true);
    try {
      await deleteUserAccount(true);
      addToast({ type: 'success', message: 'Your account has been deleted.' });
      // The deleteUserAccount function will sign the user out
      onClose();
    } catch (error: any) {
      console.error('Deletion error:', error);
      addToast({ type: 'error', message: error.message || 'Failed to delete account. Please try again.' });
      setDeletingAccount(false);
    }
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'security', label: 'Security' },
    { id: 'help', label: 'Help & Support' },
    ...(user.role === 'admin' ? [{ id: 'admin' as SettingsTab, label: 'Admin' }] : [])
  ];

    return (
    <>
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-slate-800">
                    <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
              <div className="flex items-center justify-between">
                        <h3 className="text-xl leading-6 font-semibold text-white font-heading" id="modal-title">
                            Settings
                        </h3>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-300 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Tabs */}
              <div className="mt-4 flex space-x-1 border-b border-slate-800 overflow-x-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-cyan-600 text-cyan-400'
                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
                    </div>
            <div className="px-4 py-5 sm:p-6 max-h-[70vh] overflow-y-auto">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                        <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Profile Information</h4>
                    <div className="space-y-4">
                      <InputField label="Name" value={name} onChange={setName} placeholder="Your full name" />
                      <InputField label="Email" value={email} onChange={setEmail} type="email" placeholder="your.email@example.com" disabled />
                      <InputField label="Phone Number" value={phone} onChange={setPhone} type="tel" placeholder="+1 (555) 000-0000" />
                      <div className="bg-slate-800/50 p-4 rounded-lg space-y-2 border border-slate-800">
                                <div className="flex justify-between">
                                    <span className="text-sm text-slate-400">Role</span>
                                    <span className="text-sm font-medium text-slate-200 capitalize">{user.role}</span>
                                </div>
                                {user.hotelName && (
                                    <div className="flex justify-between">
                                        <span className="text-sm text-slate-400">Hotel</span>
                                        <span className="text-sm font-medium text-slate-200">{user.hotelName}</span>
                                    </div>
                                )}
                      </div>
                      <button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingProfile ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                            </div>
                        </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Notification Channels</h4>
                    <div className="divide-y divide-slate-800 space-y-0">
                      <Toggle 
                        label="Email Notifications" 
                        enabled={preferences.notifications.email} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, email: enabled } })}
                        description="Receive notifications via email"
                      />
                      <Toggle 
                        label="SMS Notifications" 
                        enabled={preferences.notifications.sms} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, sms: enabled } })}
                        description="Receive notifications via SMS"
                      />
                      <Toggle 
                        label="Push Notifications" 
                        enabled={preferences.notifications.push} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, push: enabled } })}
                        description="Receive browser push notifications"
                      />
                    </div>
                  </div>
                        <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Notification Types</h4>
                    <div className="divide-y divide-slate-800 space-y-0">
                      <Toggle 
                        label="New dispute requires action" 
                        enabled={preferences.notifications.onActionRequired} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, onActionRequired: enabled } })}
                        description="Get notified when a new dispute needs your attention"
                      />
                      <Toggle 
                        label="Dispute status changes" 
                        enabled={preferences.notifications.onStatusChange} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, onStatusChange: enabled } })}
                        description="Get notified when dispute status updates"
                      />
                      <Toggle 
                        label="Payment alerts" 
                        enabled={preferences.notifications.onPaymentAlert} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, onPaymentAlert: enabled } })}
                        description="Get notified about payment-related events"
                      />
                      <Toggle 
                        label="Weekly dispute summary" 
                        enabled={preferences.notifications.weeklySummary} 
                        setEnabled={(enabled) => handlePreferenceChange({ notifications: { ...preferences.notifications, weeklySummary: enabled } })}
                        description="Receive a weekly summary of all disputes"
                      />
                    </div>
                            </div>
                        </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Appearance</h4>
                    <SelectField
                      label="Theme"
                      value={preferences.theme}
                      onChange={(value) => handlePreferenceChange({ theme: value as 'dark' | 'light' | 'system' })}
                      options={[
                        { value: 'dark', label: 'Dark' },
                        { value: 'light', label: 'Light' },
                        { value: 'system', label: 'System' }
                      ]}
                    />
                  </div>
                        <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Localization</h4>
                    <div className="space-y-4">
                      <SelectField
                        label="Language"
                        value={preferences.language}
                        onChange={(value) => handlePreferenceChange({ language: value })}
                        options={[
                          { value: 'en', label: 'English' },
                          { value: 'es', label: 'Spanish' },
                          { value: 'fr', label: 'French' }
                        ]}
                      />
                      <SelectField
                        label="Timezone"
                        value={preferences.timezone}
                        onChange={(value) => handlePreferenceChange({ timezone: value })}
                        options={[
                          { value: 'UTC', label: 'UTC' },
                          { value: 'America/New_York', label: 'Eastern Time (ET)' },
                          { value: 'America/Chicago', label: 'Central Time (CT)' },
                          { value: 'America/Denver', label: 'Mountain Time (MT)' },
                          { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
                          { value: 'Europe/London', label: 'London (GMT)' },
                          { value: 'Europe/Paris', label: 'Paris (CET)' }
                        ]}
                      />
                      <SelectField
                        label="Date Format"
                        value={preferences.dateFormat}
                        onChange={(value) => handlePreferenceChange({ dateFormat: value as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' })}
                        options={[
                          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
                        ]}
                      />
                      <SelectField
                        label="Time Format"
                        value={preferences.timeFormat}
                        onChange={(value) => handlePreferenceChange({ timeFormat: value as '12h' | '24h' })}
                        options={[
                          { value: '12h', label: '12-hour (AM/PM)' },
                          { value: '24h', label: '24-hour' }
                        ]}
                      />
                    </div>
                            </div>
                        </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Password</h4>
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Change Password
                    </button>
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Two-Factor Authentication</h4>
                    <Toggle
                      label="Enable Two-Factor Authentication"
                      enabled={preferences.twoFactorEnabled}
                      setEnabled={(enabled) => handlePreferenceChange({ twoFactorEnabled: enabled })}
                      description="Add an extra layer of security to your account"
                    />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Active Sessions</h4>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-800">
                      <p className="text-sm text-slate-400">Current session: This device</p>
                      <p className="text-xs text-slate-500 mt-1">Last active: Just now</p>
                    </div>
                  </div>
                            <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Data & Privacy</h4>
                    <p className="text-sm text-slate-400 mb-4">
                      Exercise your data rights under GDPR. Export your data or request account deletion.
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={handleExportData}
                        disabled={exportingData}
                        className="w-full text-left px-4 py-2 bg-slate-800/50 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                      >
                        <span>{exportingData ? 'Exporting...' : 'Export My Data'}</span>
                        {exportingData && (
                          <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={handleRequestDeletion}
                        disabled={deletingAccount}
                        className="w-full text-left px-4 py-2 bg-slate-800/50 border border-red-900/50 text-red-400 rounded-lg hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                      >
                        <span>{deletingAccount ? 'Deleting Account...' : 'Delete My Account'}</span>
                        {deletingAccount && (
                          <svg className="animate-spin h-4 w-4 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Help & Support Tab */}
              {activeTab === 'help' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Resources</h4>
                    <div className="space-y-2">
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">How disputes flow through Realyn</a>
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Documentation Center</a>
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Keyboard Shortcuts</a>
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Release Notes</a>
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Status Page</a>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Get Help</h4>
                    <div className="space-y-2">
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Contact Support</a>
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Submit Feedback</a>
                      <a href="#" className="block text-sm text-cyan-500 hover:underline py-2">Report a Bug</a>
                    </div>
                                </div>
                            </div>
                        )}

              {/* Admin Tab */}
              {activeTab === 'admin' && user.role === 'admin' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">Demo Controls</h4>
                    <div className="space-y-4">
                      <button
                        onClick={handleResetData}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Reset Demo Data
                      </button>
                      <p className="text-xs text-slate-400">This will restore all hotels and disputes to their original state.</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-white font-heading mb-4">System Settings</h4>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-400">System Version</span>
                        <span className="text-sm font-medium text-slate-200">v1.0.0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-400">Environment</span>
                        <span className="text-sm font-medium text-slate-200">Production</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
                    </div>
                    <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-cyan-600 text-base font-medium text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed z-[60] inset-0 overflow-y-auto" aria-labelledby="password-modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowPasswordModal(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full border border-slate-800">
              <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl leading-6 font-semibold text-white font-heading" id="password-modal-title">
                    Change Password
                  </h3>
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    className="text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="px-4 py-5 sm:p-6 space-y-4">
                <InputField
                  label="Current Password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  type="password"
                  placeholder="Enter current password"
                />
                <InputField
                  label="New Password"
                  value={newPassword}
                  onChange={setNewPassword}
                  type="password"
                  placeholder="Enter new password"
                />
                <InputField
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  type="password"
                  placeholder="Confirm new password"
                />
              </div>
              <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-cyan-600 text-base font-medium text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-700 shadow-sm px-4 py-2 bg-slate-800 text-base font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
