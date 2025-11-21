import React, { useState, useEffect } from 'react';
import type { User } from '../types';
import { useToast } from '../hooks/useToast';

interface SettingsModalProps {
  user: User;
  onClose: () => void;
}

const Toggle: React.FC<{ label: string; enabled: boolean; setEnabled: (enabled: boolean) => void; }> = ({ label, enabled, setEnabled }) => (
    <div className="flex items-center justify-between py-3">
        <span className="font-medium text-slate-300">{label}</span>
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

export const SettingsModal: React.FC<SettingsModalProps> = ({ user, onClose }) => {
    const [notifyOnAction, setNotifyOnAction] = useState(true);
    const [notifyWeekly, setNotifyWeekly] = useState(false);
    const addToast = useToast();

    const handleResetData = () => {
        addToast({ type: 'info', message: 'Demo data reset (mocked action).' });
    };

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-800">
                    <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
                        <h3 className="text-xl leading-6 font-semibold text-white font-heading" id="modal-title">
                            Settings
                        </h3>
                    </div>
                    <div className="px-4 py-5 sm:p-6 space-y-8 max-h-[70vh] overflow-y-auto">
                        {/* Profile Section */}
                        <div>
                            <h4 className="text-lg font-medium text-white font-heading">Profile</h4>
                            <div className="mt-4 bg-slate-800/50 p-4 rounded-lg space-y-3 border border-slate-800">
                                <div className="flex justify-between">
                                    <span className="text-sm text-slate-400">Name</span>
                                    <span className="text-sm font-medium text-slate-200">{user.name}</span>
                                </div>
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
                        </div>

                        {/* Notifications Section */}
                        <div>
                            <h4 className="text-lg font-medium text-white font-heading">Notifications</h4>
                            <div className="mt-4 divide-y divide-slate-800">
                                <Toggle label="New dispute requires action" enabled={notifyOnAction} setEnabled={setNotifyOnAction} />
                                <Toggle label="Weekly dispute summary" enabled={notifyWeekly} setEnabled={setNotifyWeekly} />
                            </div>
                        </div>

                        {/* Help & Support Section */}
                        <div>
                            <h4 className="text-lg font-medium text-white font-heading">Help & Support</h4>
                            <div className="mt-4 space-y-2">
                                <a href="#" className="block text-sm text-cyan-500 hover:underline">How disputes flow through Realyn</a>
                                <a href="#" className="block text-sm text-cyan-500 hover:underline">Contact Support</a>
                            </div>
                        </div>

                        {/* Admin Controls Section */}
                        {user.role === 'admin' && (
                            <div>
                                <h4 className="text-lg font-medium text-white font-heading">Demo Controls</h4>
                                <div className="mt-4">
                                    <button onClick={handleResetData} className="text-sm font-medium text-red-500 hover:text-red-400">
                                        Reset Demo Data
                                    </button>
                                    <p className="text-xs text-slate-400 mt-1">This will restore all hotels and disputes to their original state.</p>
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
    );
};