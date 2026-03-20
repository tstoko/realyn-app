import React, { useState, useRef } from 'react';
import type { Hotel } from '@realyn/shared';
import { ErrorBoundary } from '@realyn/shared';
import { IntegrationsTab } from './IntegrationsTab';
import type { PspCredentials } from './IntegrationsTab';

interface ManageIntegrationsModalProps {
  hotel: Hotel;
  onSave: (updatedHotel: Hotel, pspCredentials?: PspCredentials | null) => void;
  onClose: () => void;
  isAdmin?: boolean;
}

const darkPrimaryBtnStyle = "inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";
const lightSecondaryBtnStyle = "inline-flex justify-center items-center px-4 py-2 border border-slate-700 shadow-sm text-sm font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";

export const ManageIntegrationsModal: React.FC<ManageIntegrationsModalProps> = ({ hotel, onSave, onClose, isAdmin = false }) => {
  const [formData, setFormData] = useState<Hotel>(hotel);
  const [pspCredentials, setPspCredentials] = useState<PspCredentials | null>(null);
  const getPspCredentialsRef = useRef<(() => PspCredentials | null) | null>(null);

  const handleSave = () => {
    const currentCreds = getPspCredentialsRef.current ? getPspCredentialsRef.current() : pspCredentials;
    onSave(formData, currentCreds);
  };

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-cyan-600/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl leading-6 font-semibold text-slate-50 font-heading" id="modal-title">
                  Manage Integrations
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Configure your payment provider and other integrations
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
            <ErrorBoundary>
              <IntegrationsTab
                formData={formData}
                setFormData={setFormData}
                onPspCredentialsChange={setPspCredentials}
                onGetPspCredentialsRef={(getter) => { getPspCredentialsRef.current = getter; }}
                isAdmin={isAdmin}
              />
            </ErrorBoundary>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-4 sm:px-6 flex flex-row-reverse border-t border-slate-800">
            <button type="button" onClick={handleSave} className={darkPrimaryBtnStyle}>
              Save Integrations
            </button>
            <button type="button" onClick={onClose} className={`mr-3 ${lightSecondaryBtnStyle} bg-transparent`}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageIntegrationsModal;
