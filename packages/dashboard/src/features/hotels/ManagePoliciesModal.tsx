import React, { useState } from 'react';
import type { Hotel, HotelDocument, DocumentCategory } from '@realyn/shared';

interface ManagePoliciesModalProps {
  hotel: Hotel;
  onSave: (documents: HotelDocument[]) => void;
  onClose: () => void;
}

const documentCategories: DocumentCategory[] = ['Cancellation Policy', 'Terms of Service', 'Terms & Conditions', 'Other'];

const inputBaseStyle = "block w-full text-sm rounded-lg bg-slate-800 border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600";
const darkTextInputStyle = `${inputBaseStyle} px-3 py-2`;
const darkSelectStyle = `${inputBaseStyle} pl-3 pr-10 py-2`;
const darkPrimaryBtnStyle = "inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";
const lightSecondaryBtnStyle = "inline-flex justify-center items-center px-4 py-2 border border-slate-700 shadow-sm text-sm font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";

export const ManagePoliciesModal: React.FC<ManagePoliciesModalProps> = ({ hotel, onSave, onClose }) => {
  const [documents, setDocuments] = useState<HotelDocument[]>(hotel.documents || []);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<DocumentCategory>('Cancellation Policy');
  const [newDocFile, setNewDocFile] = useState<File | null>(null);

  const handleAddDocument = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (newDocName && newDocFile) {
      const newDocument: HotelDocument = {
        id: `doc_${new Date().getTime()}`,
        name: newDocName,
        category: newDocCategory,
        fileName: newDocFile.name,
        fileSize: newDocFile.size,
      };
      setDocuments(prev => [...prev, newDocument]);
      setNewDocName('');
      setNewDocCategory('Cancellation Policy');
      setNewDocFile(null);
      const fileInput = document.getElementById('policy-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const handleSave = () => {
    onSave(documents);
  };

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-cyan-600/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl leading-6 font-semibold text-slate-50 font-heading" id="modal-title">
                  Manage Policies
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Upload policies to include with all dispute responses
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
            {/* Existing Documents */}
            <div className="space-y-2 mb-6">
              <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Current Policies</h4>
              {documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm font-medium text-slate-50 truncate">
                          {doc.name}
                          <span className="ml-2 text-xs font-normal text-slate-400">({doc.category})</span>
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {doc.fileName} ({(doc.fileSize / 1024).toFixed(1)} KB)
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveDocument(doc.id)}
                        className="flex-shrink-0 h-7 w-7 flex items-center justify-center bg-red-900/50 text-red-400 rounded-full hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-slate-800/50 rounded-lg border border-dashed border-slate-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2 text-sm text-slate-500">No policies uploaded yet</p>
                  <p className="text-xs text-slate-600">Add your cancellation policy, T&Cs, and terms below</p>
                </div>
              )}
            </div>

            {/* Add New Document */}
            <div className="p-4 border border-slate-800 rounded-lg bg-slate-900/50">
              <h5 className="text-sm font-medium text-slate-50 font-heading mb-3">Add New Policy</h5>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Policy Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Non-Refundable Rate Policy"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className={darkTextInputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <select
                    value={newDocCategory}
                    onChange={(e) => setNewDocCategory(e.target.value as DocumentCategory)}
                    className={darkSelectStyle}
                  >
                    {documentCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">File</label>
                  <div className="flex items-center space-x-3">
                    <label htmlFor="policy-file" className={`cursor-pointer ${lightSecondaryBtnStyle}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                      Choose file
                    </label>
                    <input
                      type="file"
                      id="policy-file"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={(e) => setNewDocFile(e.target.files ? e.target.files[0] : null)}
                      className="sr-only"
                    />
                    <span className="text-sm text-slate-500 truncate flex-1">
                      {newDocFile ? newDocFile.name : 'No file chosen'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleAddDocument}
                  disabled={!newDocName || !newDocFile}
                  className={`w-full ${darkPrimaryBtnStyle} bg-slate-700 hover:bg-slate-600`}
                >
                  Add Policy
                </button>
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-4 p-3 bg-cyan-900/20 border border-cyan-800 rounded-lg">
              <p className="text-xs text-cyan-300">
                <strong>Tip:</strong> Uploaded policies will be automatically included as evidence when submitting dispute responses. This helps strengthen your case with consistent documentation.
              </p>
            </div>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-4 sm:px-6 flex flex-row-reverse border-t border-slate-800">
            <button type="button" onClick={handleSave} className={darkPrimaryBtnStyle}>
              Save Policies
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

export default ManagePoliciesModal;

