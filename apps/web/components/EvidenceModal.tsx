
import React, { useState, useMemo, useEffect } from 'react';
import type { Dispute, Hotel, Note } from '../types';
import { Dropzone } from './Dropzone';
import { getChecklistForReason, EvidenceChecklistItem, ChecklistItemStatus } from '../config/evidenceChecklists';
import { useToast } from '../hooks/useToast';

interface EvidenceModalProps {
  dispute: Dispute;
  onClose: () => void;
  updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
  hotel: Hotel;
}

interface EvidenceState {
  pms: {
    stayDates: string;
    room: string;
    ratePlan: string;
    incidentals: string;
    files: File[];
  };
  policy: {
    files: File[];
    selectedDocIds: string[];
  };
  proofOfStay: {
    files: File[];
  };
  comms: {
    files: File[];
  };
  paymentData: {
    avs: string;
    cvv: string;
    deviceIp: string;
    threeDS: string;
    priorHistory: string;
  };
  incidentReports: {
    files: File[];
  };
}

const EvidenceSection: React.FC<{ title: string; children: React.ReactNode, isComplete?: boolean, isOpen?: boolean, onToggle?: () => void }> = ({ title, children, isComplete, isOpen = false, onToggle }) => (
    <div className="border border-slate-800 rounded-xl overflow-hidden mb-4 bg-slate-900/30 shadow-sm">
        <button 
            onClick={onToggle}
            className={`w-full p-4 flex justify-between items-center text-left transition-all duration-200 ${isOpen ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'}`}
        >
            <div className="flex items-center space-x-3">
                {isComplete ? (
                     <div className="flex-shrink-0 h-6 w-6 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                     </div>
                ) : (
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-800 border border-slate-700"></div>
                )}
                <span className={`font-semibold font-heading ${isOpen ? 'text-cyan-400' : 'text-slate-300'}`}>{title}</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-500 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        </button>
        
        {/* Content Area with simple height transition */}
        <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-5 border-t border-slate-800 bg-slate-900/20">
                {children}
            </div>
        </div>
    </div>
);

const darkTextInputStyle = "mt-1 block w-full text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 shadow-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500 transition-colors";

const TextInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; name: string; placeholder?: string }> = ({ label, value, onChange, name, placeholder }) => (
    <div>
        <label htmlFor={name} className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
        <input type="text" name={name} id={name} value={value} onChange={onChange} placeholder={placeholder} className={darkTextInputStyle} />
    </div>
);

const ChecklistItem: React.FC<{ item: EvidenceChecklistItem & { status: ChecklistItemStatus } }> = ({ item }) => {
    const statusStyles = {
        required: 'bg-red-900/20 text-red-400 border-red-900/30',
        optional: 'bg-slate-800 text-slate-400 border-slate-700',
        provided: 'bg-green-900/20 text-green-400 border-green-900/30',
    };
    const icon = item.status === 'provided' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
    ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-current opacity-60"></div>
    );

    return (
        <li className="flex items-center justify-between py-3 border-b border-slate-800/60 last:border-0">
            <span className={`text-sm ${item.status === 'provided' ? 'text-slate-300 line-through opacity-70' : 'text-slate-200'}`}>{item.label}</span>
            <span className={`flex-shrink-0 ml-3 inline-flex items-center justify-center h-6 px-2 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusStyles[item.status]}`}>
                {item.status === 'provided' ? icon : item.status}
            </span>
        </li>
    );
};

export const EvidenceModal: React.FC<EvidenceModalProps> = ({ dispute, onClose, updateDispute, hotel }) => {
  const [evidence, setEvidence] = useState<EvidenceState>({
    pms: { stayDates: '', room: '', ratePlan: '', incidentals: '', files: [] },
    policy: { files: [], selectedDocIds: [] },
    proofOfStay: { files: [] },
    comms: { files: [] },
    paymentData: { avs: '', cvv: '', deviceIp: '', threeDS: '', priorHistory: '' },
    incidentReports: { files: [] },
  });

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['pms']));

  const toggleSection = (section: string) => {
      const newSections = new Set(openSections);
      if (newSections.has(section)) {
          newSections.delete(section);
      } else {
          newSections.add(section);
      }
      setOpenSections(newSections);
  };

  const checklistTemplate = useMemo(() => getChecklistForReason(dispute.reason), [dispute.reason]);
  const addToast = useToast();
  
  const [checklist, setChecklist] = useState<(EvidenceChecklistItem & { status: ChecklistItemStatus })[]>(
    checklistTemplate.map(item => ({...item, status: item.type}))
  );

  useEffect(() => {
    const newChecklist = checklistTemplate.map(item => {
        let isProvided = false;
        const { pms, policy, proofOfStay, comms, paymentData, incidentReports } = evidence;
        
        switch(item.key) {
            case 'pms_data': 
                isProvided = pms.files.length > 0 || !!pms.stayDates || !!pms.room || !!pms.ratePlan; 
                break;
            case 'policy': 
                isProvided = policy.files.length > 0 || policy.selectedDocIds.length > 0; 
                break;
            case 'proof_of_stay': 
                isProvided = proofOfStay.files.length > 0; 
                break;
            case 'communications': 
                isProvided = comms.files.length > 0; 
                break;
            case 'payment_verification': 
                isProvided = !!paymentData.avs || !!paymentData.cvv || !!paymentData.deviceIp || !!paymentData.threeDS; 
                break;
            case 'incident_report': 
                isProvided = incidentReports.files.length > 0; 
                break;
        }

        const status: ChecklistItemStatus = isProvided ? 'provided' : item.type;
        return { ...item, status };
    });
    setChecklist(newChecklist);
  }, [evidence, checklistTemplate]);

  const handleTextChange = (section: 'pms' | 'paymentData', field: string, value: string) => {
    setEvidence(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };
  
  const handleFilesChange = (section: 'pms' | 'policy' | 'proofOfStay' | 'comms' | 'incidentReports', newFiles: File[]) => {
      setEvidence(prev => ({
          ...prev,
          [section]: { ...prev[section], files: newFiles },
      }));
  };

  const handlePolicyDocToggle = (docId: string) => {
      setEvidence(prev => {
          const selected = prev.policy.selectedDocIds;
          const newSelected = selected.includes(docId)
              ? selected.filter(id => id !== docId)
              : [...selected, docId];
          return { ...prev, policy: { ...prev.policy, selectedDocIds: newSelected } };
      });
  };

  const handleSubmitToPsp = () => {
    const newAuditStep = {
        timestamp: new Date(),
        title: 'Submitted to Payment Provider',
        description: 'Evidence package compiled and submitted for review.',
        status: 'success' as const
    };
    const newNote: Note = {
      id: `note_${new Date().getTime()}`,
      author: 'System',
      timestamp: new Date(),
      text: 'Evidence submitted to payment provider.'
    };

    updateDispute(dispute.id, {
        lifecycleStatus: 'submitted',
        automationStatus: 'submitted',
        auditTrail: [...dispute.auditTrail, newAuditStep],
        internalNotes: [...dispute.internalNotes, newNote]
    });
    addToast({ type: 'success', message: 'Evidence has been submitted.' });
    onClose();
  };
  
  const allRequiredProvided = checklist.every(item => item.type === 'optional' || item.status === 'provided');

  // Helper to check section completion status for visual checkmarks
  const isSectionComplete = (key: string) => {
      // Simplified logic based on files presence or text input
      switch(key) {
          case 'pms': return evidence.pms.files.length > 0 || !!evidence.pms.stayDates;
          case 'policy': return evidence.policy.files.length > 0 || evidence.policy.selectedDocIds.length > 0;
          case 'proof': return evidence.proofOfStay.files.length > 0;
          case 'comms': return evidence.comms.files.length > 0;
          default: return false;
      }
  }

  return (
    <div className="fixed z-50 inset-0 overflow-hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
        
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
             {/* Centered modal container, somewhat wider for the split view */}
             <div className="pointer-events-auto w-screen max-w-6xl flex flex-col h-[90vh] m-auto rounded-xl bg-slate-900 shadow-2xl ring-1 ring-slate-800 overflow-hidden relative top-[5vh]">
                
                {/* Header */}
                <div className="flex-shrink-0 px-4 py-5 sm:px-6 border-b border-slate-800 bg-slate-900 z-20 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-slate-50 font-heading tracking-tight">Gather Evidence</h2>
                        <p className="text-sm text-slate-400 font-mono mt-1">{dispute.stripeDisputeId} <span className="mx-2 text-slate-600">•</span> <span className="text-cyan-400 capitalize">{dispute.reason?.replace(/_/g, ' ')}</span></p>
                    </div>
                    <button
                        type="button"
                        className="rounded-md text-slate-400 hover:text-slate-200 focus:outline-none"
                        onClick={onClose}
                    >
                        <span className="sr-only">Close panel</span>
                        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content Split */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Column: Form Inputs */}
                    <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                        <div className="max-w-3xl mx-auto">
                             <p className="text-slate-400 mb-6">Upload documents and provide details to build your evidence package. The checklist on the right tracks your progress.</p>
                             
                             <EvidenceSection 
                                title="1. Property Management System (PMS)" 
                                isOpen={openSections.has('pms')} 
                                onToggle={() => toggleSection('pms')}
                                isComplete={isSectionComplete('pms')}
                            >
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <TextInput label="Stay Dates" name="stayDates" placeholder="e.g., Oct 1 - Oct 5, 2023" value={evidence.pms.stayDates} onChange={(e) => handleTextChange('pms', 'stayDates', e.target.value)} />
                                        <TextInput label="Room Number" name="room" placeholder="e.g., 402" value={evidence.pms.room} onChange={(e) => handleTextChange('pms', 'room', e.target.value)} />
                                    </div>
                                    <Dropzone files={evidence.pms.files} onFilesChange={(f) => handleFilesChange('pms', f)} multiple={true} label="Folio / Invoice / Registration Card"/>
                                </div>
                            </EvidenceSection>

                            <EvidenceSection 
                                title="2. Policy Documents" 
                                isOpen={openSections.has('policy')} 
                                onToggle={() => toggleSection('policy')}
                                isComplete={isSectionComplete('policy')}
                            >
                                {hotel.documents.length > 0 && (
                                    <div className="mb-6">
                                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Select property policies</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {hotel.documents.map(doc => (
                                            <label key={doc.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${evidence.policy.selectedDocIds.includes(doc.id) ? 'bg-cyan-900/20 border-cyan-500/50 ring-1 ring-cyan-500/20' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={evidence.policy.selectedDocIds.includes(doc.id)} 
                                                    onChange={() => handlePolicyDocToggle(doc.id)}
                                                    className="h-4 w-4 rounded border-slate-600 text-cyan-600 focus:ring-cyan-500 bg-slate-700"
                                                />
                                                <div className="ml-3 overflow-hidden">
                                                    <p className="text-sm font-medium text-slate-200 truncate">{doc.name}</p>
                                                    <p className="text-xs text-slate-500 truncate">{doc.fileName}</p>
                                                </div>
                                            </label>
                                        ))}
                                        </div>
                                    </div>
                                )}
                                <Dropzone files={evidence.policy.files} onFilesChange={(f) => handleFilesChange('policy', f)} label="Upload Additional Policy Document"/>
                            </EvidenceSection>

                            <EvidenceSection 
                                title="3. Proof of Stay / Usage" 
                                isOpen={openSections.has('proof')} 
                                onToggle={() => toggleSection('proof')}
                                isComplete={isSectionComplete('proof')}
                            >
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-400">Provide evidence that the guest was physically present (signed reg card) or used the service (wifi logs, door lock logs).</p>
                                    <Dropzone files={evidence.proofOfStay.files} onFilesChange={(f) => handleFilesChange('proofOfStay', f)} multiple={true} label="Signed Receipts / Logs"/>
                                </div>
                            </EvidenceSection>

                            <EvidenceSection 
                                title="4. Communications" 
                                isOpen={openSections.has('comms')} 
                                onToggle={() => toggleSection('comms')}
                                isComplete={isSectionComplete('comms')}
                            >
                                <p className="text-sm text-slate-400 mb-4">Upload screenshots of email threads or chat logs with the guest.</p>
                                <Dropzone files={evidence.comms.files} onFilesChange={(f) => handleFilesChange('comms', f)} multiple={true} label="Emails / Messages"/>
                            </EvidenceSection>
                        </div>
                    </div>

                    {/* Right Column: Checklist Sidebar */}
                    <div className="w-80 bg-slate-900 border-l border-slate-800 overflow-y-auto hidden lg:block">
                         <div className="p-6 sticky top-0">
                             <h3 className="text-sm font-bold text-slate-100 font-heading uppercase tracking-wider mb-4 flex items-center">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                     <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                 </svg>
                                 Evidence Checklist
                             </h3>
                             <div className="bg-slate-800/30 rounded-xl border border-slate-800 overflow-hidden">
                                 <div className="p-4 bg-slate-800/50 border-b border-slate-800">
                                     <p className="text-xs text-slate-400">Items needed for <strong>{dispute.reason?.replace(/_/g, ' ')}</strong> disputes:</p>
                                 </div>
                                 <ul className="px-4 py-2">
                                     {checklist.map(item => <ChecklistItem key={item.key} item={item} />)}
                                 </ul>
                             </div>

                             <div className="mt-8 p-4 bg-blue-900/10 border border-blue-900/30 rounded-xl">
                                 <h4 className="text-xs font-bold text-blue-400 uppercase mb-2">AI Tip</h4>
                                 <p className="text-xs text-blue-200 leading-relaxed">
                                     Including a signed registration card increases win probability by 40% for this dispute type.
                                 </p>
                             </div>
                         </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex-shrink-0 px-4 py-4 sm:px-6 border-t border-slate-800 bg-slate-900 z-20 flex justify-between items-center">
                     <p className="text-xs text-slate-500 hidden sm:block">
                        {allRequiredProvided ? <span className="text-green-500 flex items-center"><svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>Ready to submit</span> : 'Please complete required items'}
                     </p>
                     <div className="flex space-x-3 w-full sm:w-auto">
                        <button
                            type="button"
                            className="flex-1 sm:flex-none inline-flex justify-center px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500"
                            onClick={onClose}
                        >
                            Save Draft & Close
                        </button>
                        <button
                            type="button"
                            className="flex-1 sm:flex-none inline-flex justify-center px-6 py-2 text-sm font-medium text-white bg-cyan-600 border border-transparent rounded-lg shadow-sm hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleSubmitToPsp}
                            disabled={!allRequiredProvided}
                        >
                            Submit Evidence
                        </button>
                     </div>
                </div>

             </div>
        </div>
      </div>
    </div>
  );
};
