import React, { useState, useCallback, useEffect } from 'react';
import type { Dispute, Hotel, User, EvidencePlan, EvidenceItem, EvidenceRequirement, EvidenceCategory, Note, DisputeArgument, AutomationStep } from '@realyn/shared';
import { Dropzone } from './Dropzone';
import { useToast } from '@realyn/shared';
import { useAuth } from '@realyn/shared';
import { generateEvidencePlan, updateEvidenceItemStatus, initializeEvidenceItems } from '../../services/aiDisputeService';
import { uploadEvidenceFileWithTracking, getEvidenceFiles, deleteEvidenceFile, type EvidenceFile } from '../../services/evidenceService';
import ArgumentDraftModal from './ArgumentDraftModal';
import { EvidencePlanSkeleton } from './EvidencePlanSkeleton';

// =============================================================================
// Props and Types
// =============================================================================

interface EvidenceDashboardProps {
  dispute: Dispute;
  onClose: () => void;
  updateDispute: (disputeId: string, updates: Partial<Dispute>) => void;
  hotel: Hotel;
  user?: User;
}

// Map of category to display info
const CATEGORY_INFO: Record<EvidenceCategory, { label: string; icon: string; description: string }> = {
  pms_data: { 
    label: 'Property Management Data', 
    icon: '🏨', 
    description: 'Folios, registration cards, booking records from your PMS' 
  },
  policy: { 
    label: 'Policies & Terms', 
    icon: '📋', 
    description: 'Cancellation, refund, and terms policies' 
  },
  proof_of_stay: { 
    label: 'Proof of Stay', 
    icon: '🔑', 
    description: 'Check-in/out records, keycard logs, housekeeping records' 
  },
  communications: { 
    label: 'Guest Communications', 
    icon: '💬', 
    description: 'Email, chat, phone logs, and confirmations' 
  },
  payment_data: { 
    label: 'Payment Verification', 
    icon: '💳', 
    description: 'Authorization codes, AVS/CVV results, 3D Secure' 
  },
  incident_reports: { 
    label: 'Incident Reports', 
    icon: '⚠️', 
    description: 'Damage reports, complaints, incident logs' 
  },
  delivery: { 
    label: 'Delivery Proof', 
    icon: '📦', 
    description: 'Shipping and tracking information' 
  },
  other: { 
    label: 'Other Evidence', 
    icon: '📁', 
    description: 'Any other relevant documentation' 
  },
};

// All categories for manual mode
const ALL_CATEGORIES: EvidenceCategory[] = [
  'pms_data', 'policy', 'proof_of_stay', 'communications', 
  'payment_data', 'incident_reports', 'delivery', 'other'
];

// =============================================================================
// Sub-Components
// =============================================================================

const WinnabilityBadge: React.FC<{ winnability: 'high' | 'medium' | 'low' }> = ({ winnability }) => {
  return null;
};

const RecommendationBadge: React.FC<{ recommendation: 'fight' | 'accept' }> = ({ recommendation }) => {
  return null;
};

const RequirementStatusBadge: React.FC<{ status: EvidenceItem['status']; required: boolean }> = ({ status, required }) => {
  const styles = {
    pending: required ? 'bg-amber-900/20 text-amber-400 border-amber-900/30' : 'bg-slate-800 text-slate-400 border-slate-700',
    uploaded: 'bg-green-900/20 text-green-400 border-green-900/30',
    not_available: 'bg-yellow-900/20 text-yellow-400 border-yellow-900/30',
    not_applicable: 'bg-slate-800 text-slate-500 border-slate-700',
  };
  const labels = {
    pending: required ? 'Highly Recommended' : 'Helpful',
    uploaded: 'Uploaded',
    not_available: 'N/A',
    not_applicable: 'Skip',
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

const ProgressBar: React.FC<{ completed: number; total: number; requiredCompleted: number; requiredTotal: number }> = ({
  completed, total, requiredCompleted, requiredTotal
}) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const requiredPercentage = requiredTotal > 0 ? Math.round((requiredCompleted / requiredTotal) * 100) : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">Evidence Progress</span>
        <span className="text-cyan-400">{completed}/{total} items</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Priority items</span>
        <span className={requiredCompleted >= requiredTotal ? 'text-green-400' : 'text-amber-400'}>
          {requiredCompleted}/{requiredTotal} complete
        </span>
      </div>
    </div>
  );
};

// =============================================================================
// Requirement Item Component
// =============================================================================

interface RequirementItemProps {
  requirement: EvidenceRequirement;
  item: EvidenceItem;
  index: number;
  files: File[];
  uploadedFiles?: EvidenceFile[];
  onFilesChange: (files: File[]) => void;
  onStatusChange: (status: EvidenceItem['status']) => void;
  onFileDelete?: (file: EvidenceFile) => void;
}

const RequirementItem: React.FC<RequirementItemProps> = ({
  requirement, item, index, files, uploadedFiles = [], onFilesChange, onStatusChange, onFileDelete
}) => {
  const [isExpanded, setIsExpanded] = useState(item.status === 'pending' && requirement.required);
  
  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50 mb-3">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            item.status === 'uploaded' ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-400'
          }`}>
            {item.status === 'uploaded' ? '✓' : index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`font-medium text-sm ${item.status === 'uploaded' ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
              {requirement.label}
            </p>
            {requirement.sourceHint && (
              <p className="text-xs text-slate-500 truncate">Source: {requirement.sourceHint}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 ml-3">
          <RequirementStatusBadge status={item.status} required={requirement.required} />
          <svg 
            className={`w-5 h-5 text-slate-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-slate-800 bg-slate-900/30">
          <p className="text-sm text-slate-400 mb-3">{requirement.description}</p>
          
          {requirement.instructions && (
            <div className="mb-4 p-3 bg-cyan-900/20 border border-cyan-700/50 rounded-lg">
              <div className="flex items-start space-x-2">
                <span className="text-cyan-400 text-lg">📋</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-cyan-300 mb-1">How to Gather:</p>
                  <p className="text-sm text-cyan-100 whitespace-pre-line">{requirement.instructions}</p>
                </div>
              </div>
            </div>
          )}
          
          {requirement.example && (
            <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-500 mb-1">Example:</p>
              <p className="text-sm text-slate-300 italic">"{requirement.example}"</p>
            </div>
          )}
          
          {/* Display uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Uploaded Files ({uploadedFiles.length})
              </p>
              <div className="space-y-2">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="text-green-400 flex-shrink-0">✓</span>
                      <span className="text-sm text-slate-300 truncate">{file.fileName}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        ({(file.fileSize / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <a
                        href={file.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        View
                      </a>
                      {onFileDelete && (
                        <button
                          onClick={() => onFileDelete(file)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          title="Delete file"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Dropzone 
            files={files}
            onFilesChange={onFilesChange}
            multiple={true}
            label={`Upload ${requirement.label}`}
          />
          
          {/* Quick actions */}
          <div className="mt-3">
            {item.status !== 'not_applicable' && (
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange('not_applicable'); }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Skip
              </button>
            )}
            {item.status === 'not_applicable' && (
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange('pending'); }}
                className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                Reset Status
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Category Section Component (for manual mode)
// =============================================================================

interface CategorySectionProps {
  category: EvidenceCategory;
  files: File[];
  uploadedFiles?: EvidenceFile[];
  onFilesChange: (files: File[]) => void;
  isOpen: boolean;
  onToggle: () => void;
  hotel: Hotel;
  onFileDelete?: (file: EvidenceFile) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category, files, uploadedFiles = [], onFilesChange, isOpen, onToggle, hotel, onFileDelete
}) => {
  const info = CATEGORY_INFO[category];
  const totalFiles = files.length + uploadedFiles.length;
  const hasFiles = totalFiles > 0;
  
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden mb-4 bg-slate-900/30">
      <button 
        onClick={onToggle}
        className={`w-full p-4 flex justify-between items-center text-left transition-all duration-200 ${isOpen ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'}`}
      >
        <div className="flex items-center space-x-3">
          {hasFiles ? (
            <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-500">
              ✓
            </div>
          ) : (
            <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
              {info.icon}
            </div>
          )}
          <div>
            <span className={`font-semibold ${isOpen ? 'text-cyan-400' : 'text-slate-300'}`}>{info.label}</span>
            <p className="text-xs text-slate-500">{info.description}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {hasFiles && <span className="text-xs text-green-400">{totalFiles} file(s)</span>}
          <svg className={`h-5 w-5 text-slate-500 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {isOpen && (
        <div className="p-5 border-t border-slate-800 bg-slate-900/20">
          {/* Show hotel policy documents for policy category */}
          {category === 'policy' && hotel.documents.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Property Policies</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {hotel.documents.map(doc => (
                  <div key={doc.id} className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-sm font-medium text-slate-200">{doc.name}</p>
                    <p className="text-xs text-slate-500">{doc.category}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Display uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Uploaded Files ({uploadedFiles.length})
              </p>
              <div className="space-y-2">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="text-green-400 flex-shrink-0">✓</span>
                      <span className="text-sm text-slate-300 truncate">{file.fileName}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        ({(file.fileSize / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <a
                        href={file.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        View
                      </a>
                      {onFileDelete && (
                        <button
                          onClick={() => onFileDelete(file)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          title="Delete file"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Dropzone 
            files={files}
            onFilesChange={onFilesChange}
            multiple={true}
            label={`Upload ${info.label}`}
          />
        </div>
      )}
    </div>
  );
};

// =============================================================================
// AI Plan Sidebar
// =============================================================================

interface AIPlanSidebarProps {
  plan: EvidencePlan;
  evidenceItems: EvidenceItem[];
}

const AIPlanSidebar: React.FC<AIPlanSidebarProps> = ({ plan, evidenceItems }) => {
  const requiredReqs = plan.requirements.filter(r => r.required);
  const completedRequired = evidenceItems.filter(
    item => requiredReqs.some(r => r.id === item.requirementId) && 
            (item.status === 'uploaded' || item.status === 'not_applicable')
  ).length;
  
  const totalCompleted = evidenceItems.filter(
    item => item.status === 'uploaded' || item.status === 'not_applicable'
  ).length;
  
  return (
    <div className="p-6 space-y-6">
      {/* Classification */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dispute Type</h3>
        <p className="text-sm text-slate-200">{plan.disputeCategory}</p>
        {plan.disputeSubtype && (
          <p className="text-xs text-slate-500">{plan.disputeSubtype}</p>
        )}
      </div>
      
      {/* Progress */}
      <div>
        <ProgressBar 
          completed={totalCompleted}
          total={plan.requirements.length}
          requiredCompleted={completedRequired}
          requiredTotal={requiredReqs.length}
        />
      </div>
      
      {/* Summary */}
      <div className="p-4 bg-cyan-900/10 border border-cyan-900/30 rounded-xl">
        <h4 className="text-xs font-bold text-cyan-400 uppercase mb-2">AI Analysis</h4>
        <p className="text-xs text-cyan-200 leading-relaxed">{plan.summary}</p>
      </div>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const EvidenceDashboard: React.FC<EvidenceDashboardProps> = ({
  dispute, onClose, updateDispute, hotel, user
}) => {
  const { user: authUser } = useAuth();
  const currentUser = user || authUser;
  const addToast = useToast();
  
  // Mode toggle: AI-guided vs Manual
  const [useAIMode, setUseAIMode] = useState(dispute.useAIPlan !== false);
  
  // Files state - keyed by requirement ID (AI mode) or category (manual mode)
  const [filesByKey, setFilesByKey] = useState<Record<string, File[]>>({});
  
  // Uploaded files state - files already in Firestore
  const [uploadedFilesByKey, setUploadedFilesByKey] = useState<Record<string, EvidenceFile[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  
  // Open sections (for manual mode)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['pms_data']));
  
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planGenerationError, setPlanGenerationError] = useState<string | null>(null);
  const [localPlan, setLocalPlan] = useState<EvidencePlan | undefined>(dispute.evidencePlan);
  const [localEvidenceItems, setLocalEvidenceItems] = useState<EvidenceItem[]>(
    dispute.evidenceItems || []
  );
  const [showArgumentModal, setShowArgumentModal] = useState(false);
  
  // Evidence items state (for AI mode) - use local state that syncs with dispute
  // Now that localEvidenceItems is declared, we can use it
  const evidenceItems = localEvidenceItems.length > 0 ? localEvidenceItems : (dispute.evidenceItems || []);
  
  const plan = localPlan || dispute.evidencePlan;
  
  // Sync localPlan with dispute.evidencePlan when dispute changes or on initial load
  useEffect(() => {
    if (dispute.evidencePlan) {
      setLocalPlan(dispute.evidencePlan);
    }
  }, [dispute.id, dispute.evidencePlan]);

  // Sync localEvidenceItems with dispute.evidenceItems when dispute changes or on initial load
  useEffect(() => {
    if (dispute.evidenceItems && dispute.evidenceItems.length > 0) {
      setLocalEvidenceItems(dispute.evidenceItems);
    }
  }, [dispute.id, dispute.evidenceItems]);

  // Watch for async evidence plan generation completion/error
  // This handles the async pattern where backend returns immediately and updates Firestore when done
  useEffect(() => {
    const status = dispute.evidencePlanStatus;
    
    if (status === 'complete') {
      // Plan generation completed successfully
      if (isGeneratingPlan) {
        setIsGeneratingPlan(false);
        setPlanGenerationError(null);
        addToast({ type: 'success', message: 'Evidence plan generated successfully!' });
      }
    } else if (status === 'error') {
      // Plan generation failed
      if (isGeneratingPlan) {
        setIsGeneratingPlan(false);
        const errorMsg = dispute.evidencePlanError || 'Evidence plan generation failed';
        setPlanGenerationError(errorMsg);
        addToast({ type: 'error', message: errorMsg });
      }
    } else if (status === 'generating') {
      // Plan is being generated - ensure spinner is showing
      if (!isGeneratingPlan) {
        setIsGeneratingPlan(true);
      }
    }
  }, [dispute.evidencePlanStatus, dispute.evidencePlanError, isGeneratingPlan, addToast]);
  
  // Toggle section
  const toggleSection = (section: string) => {
    const newSections = new Set(openSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setOpenSections(newSections);
  };
  
  // Handle files change
  const handleFilesChange = useCallback((key: string, files: File[]) => {
    setFilesByKey(prev => ({ ...prev, [key]: files }));
    
    // Update evidence item status if files were added (optimistic update)
    if (files.length > 0 && plan) {
      setLocalEvidenceItems(prev => {
        const existing = prev.find(i => i.requirementId === key);
        if (existing) {
          return prev.map(item => 
            item.requirementId === key ? { ...item, status: 'uploaded' as const } : item
          );
        } else {
          // Create new evidence item if it doesn't exist
          return [...prev, { requirementId: key, status: 'uploaded' as const }];
        }
      });
    }
  }, [plan]);
  
  // Handle status change for requirement - sync with backend
  const handleStatusChange = useCallback(async (requirementId: string, status: EvidenceItem['status']) => {
    // Get current items - use localEvidenceItems directly to avoid circular reference
    const currentItems = localEvidenceItems.length > 0 ? localEvidenceItems : (dispute.evidenceItems || []);
    
    // Optimistically update UI
    const updatedItems = currentItems.map(item =>
      item.requirementId === requirementId ? { ...item, status } : item
    );
    setLocalEvidenceItems(updatedItems);
    
    // Call backend API to sync
    try {
      const result = await updateEvidenceItemStatus(
        dispute.id,
        dispute.organizationId!,
        requirementId,
        status,
        undefined, // fileId
        undefined, // fileName
        currentUser?.id,
        undefined  // notes
      );
      
      if (!result.success) {
        // Revert on error
        setLocalEvidenceItems(currentItems);
        addToast({ type: 'error', message: `Failed to update status: ${result.error}` });
      } else if (result.progress) {
        // Update with latest progress from backend
        // The backend already updated Firestore, so we just need to refresh
        addToast({ type: 'success', message: 'Status updated successfully' });
      }
    } catch (error: any) {
      // Revert on error
      setLocalEvidenceItems(currentItems);
      addToast({ type: 'error', message: `Failed to update status: ${error.message}` });
    }
  }, [dispute.id, dispute.organizationId!, dispute.evidenceItems, localEvidenceItems, currentUser?.id, addToast]);
  
  // Handle file deletion
  const handleFileDelete = useCallback(async (file: EvidenceFile) => {
    try {
      // Delete from Storage and Firestore
      await deleteEvidenceFile(dispute.id, file);
      
      // Update local state - remove from uploadedFilesByKey
      setUploadedFilesByKey(prev => {
        const updated = { ...prev };
        for (const key in updated) {
          const index = updated[key].findIndex(f => f.id === file.id);
          if (index !== -1) {
            updated[key] = updated[key].filter(f => f.id !== file.id);
            if (updated[key].length === 0) {
              delete updated[key];
            }
            break;
          }
        }
        return updated;
      });

      // Update evidence items if in AI mode
      if (useAIMode && plan) {
        setLocalEvidenceItems(prev => {
          return prev.map(item => {
            if (item.fileId === file.id) {
              return { ...item, status: 'pending' as const, fileId: undefined, fileName: undefined };
            }
            return item;
          });
        });
      }

      addToast({ type: 'success', message: 'File deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting file:', error);
      addToast({ type: 'error', message: `Failed to delete file: ${error.message}` });
    }
  }, [dispute.id, useAIMode, plan, addToast]);
  
  // Calculate progress
  const calculateProgress = useCallback(() => {
    const items = localEvidenceItems.length > 0 ? localEvidenceItems : (dispute.evidenceItems || []);
    if (!plan || items.length === 0) {
      return { completed: 0, total: 0, requiredCompleted: 0, requiredTotal: 0, isComplete: false };
    }
    
    const requiredReqs = plan.requirements.filter(r => r.required);
    const requiredIds = requiredReqs.map(r => r.id);
    
    const completed = items.filter(
      i => i.status === 'uploaded' || i.status === 'not_applicable'
    ).length;
    
    const requiredCompleted = items.filter(
      i => requiredIds.includes(i.requirementId) &&
           (i.status === 'uploaded' || i.status === 'not_applicable')
    ).length;
    
    return {
      completed,
      total: plan.requirements.length,
      requiredCompleted,
      requiredTotal: requiredReqs.length,
      isComplete: requiredCompleted >= requiredReqs.length,
    };
  }, [plan, localEvidenceItems, dispute.evidenceItems]);
  
  // Fetch existing evidence files on component mount
  useEffect(() => {
    let isMounted = true;
    
    const loadExistingFiles = async () => {
      try {
        setIsLoadingFiles(true);
        const existingFiles = await getEvidenceFiles(dispute.id);
        
        // Don't update state if component unmounted
        if (!isMounted) return;
        
        // Group files by requirement ID (for AI mode) or category (for manual mode)
        const grouped: Record<string, EvidenceFile[]> = {};
        
        // Use dispute.evidenceItems directly (synced from Firestore)
        const currentEvidenceItems = dispute.evidenceItems || [];
        
        for (const file of existingFiles) {
          // Priority 1: Use requirementId stored directly on the file (new robust way)
          if (file.requirementId) {
            const key = file.requirementId;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(file);
            continue;
          }

          // Priority 2: In AI mode, try to match by fileId in evidenceItems (legacy way)
          if (plan && useAIMode) {
            const item = currentEvidenceItems.find(i => i.fileId === file.id);
            if (item) {
              const key = item.requirementId;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(file);
              continue;
            }
          }
          
          // Priority 3: Fall back to category-based grouping (manual mode or if requirement match fails)
          const category = file.category;
          // Map legacy category names to new category names
          const mappedCategory = category === 'pms' ? 'pms_data' :
            category === 'proofOfStay' ? 'proof_of_stay' :
            category === 'comms' ? 'communications' :
            category === 'incidentReports' ? 'incident_reports' :
            category;
          
          if (!grouped[mappedCategory]) grouped[mappedCategory] = [];
          grouped[mappedCategory].push(file);
        }
        
        setUploadedFilesByKey(grouped);
      } catch (error: any) {
        // Only show error for actual errors, not empty collections or not found
        const errorMessage = error?.message || String(error);
        const errorCode = error?.code || '';
        
        const isNotFoundError = errorCode.includes('not-found') || 
                             errorCode.includes('permission-denied') ||
                             errorMessage.toLowerCase().includes('not found') || 
                             errorMessage.toLowerCase().includes('permission');
        
        if (!isNotFoundError) {
          console.error('Error loading existing evidence files:', error);
          if (isMounted) {
            addToast({ type: 'error', message: 'Failed to load existing files' });
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingFiles(false);
        }
      }
    };

    loadExistingFiles();
    
    return () => {
      isMounted = false;
    };
  }, [dispute.id, dispute.evidenceItems, plan, useAIMode, addToast]); // Re-fetch when dispute data or mode changes
  
  const progress = calculateProgress();
  
  // Generate evidence plan (async - returns immediately, completion detected via Firestore listener)
  const handleGeneratePlan = async () => {
    setIsGeneratingPlan(true);
    setPlanGenerationError(null);
    
    try {
      const result = await generateEvidencePlan(
        dispute.id,
        dispute.organizationId!,
        false // don't regenerate if exists
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start evidence plan generation');
      }
      
      // Show info toast - plan is generating in background
      // isGeneratingPlan stays true until we detect completion via Firestore listener
      addToast({ type: 'info', message: 'Generating evidence plan... This may take a minute.' });
      
      // Note: We don't set isGeneratingPlan to false here.
      // The useEffect watching dispute.evidencePlanStatus will handle that.
      
    } catch (error: any) {
      console.error('Error starting plan generation:', error);
      let errorMessage = error.message || 'Failed to start evidence plan generation';
      if (errorMessage.includes('OPENAI') || errorMessage.includes('model provider')) {
        errorMessage = 'AI service temporarily unavailable. Please try again or use Manual Mode.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      setPlanGenerationError(errorMessage);
      addToast({ type: 'error', message: errorMessage });
      setIsGeneratingPlan(false);
    }
  };
  
  // Regenerate evidence plan (async - returns immediately, completion detected via Firestore listener)
  const handleRegeneratePlan = async () => {
    setIsGeneratingPlan(true);
    setPlanGenerationError(null);
    
    try {
      const result = await generateEvidencePlan(
        dispute.id,
        dispute.organizationId!,
        true // regenerate existing plan
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start evidence plan regeneration');
      }
      
      // Show info toast - plan is generating in background
      // isGeneratingPlan stays true until we detect completion via Firestore listener
      addToast({ type: 'info', message: 'Regenerating evidence plan... This may take a minute.' });
      
      // Note: We don't set isGeneratingPlan to false here.
      // The useEffect watching dispute.evidencePlanStatus will handle that.
      
    } catch (error: any) {
      console.error('Error starting plan regeneration:', error);
      let errorMessage = error.message || 'Failed to start evidence plan regeneration';
      if (errorMessage.includes('OPENAI') || errorMessage.includes('model provider')) {
        errorMessage = 'AI service temporarily unavailable. Please try again or use Manual Mode.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      setPlanGenerationError(errorMessage);
      addToast({ type: 'error', message: errorMessage });
      setIsGeneratingPlan(false);
    }
  };
  
  // Submit evidence
  const handleSubmit = async () => {
    setIsUploading(true);
    
    try {
      const uploadedFiles: Array<{ requirementId?: string; category: string; fileId: string; fileName: string }> = [];
      
      // Upload all files
      for (const [key, files] of Object.entries(filesByKey)) {
        if (files.length > 0) {
          // Determine category and requirement ID
          let category: string = key;
          let requirementId: string | undefined = undefined;
          
          if (plan && useAIMode) {
            // In AI mode, key is requirement ID
            const req = plan.requirements.find(r => r.id === key);
            if (req) {
              category = req.category;
              requirementId = req.id;
            }
          } else {
            // In manual mode, key is category name
            category = key;
          }
          
          // Upload each file
          for (const file of files) {
            if (useAIMode && requirementId) {
              // Use tracking function for AI mode
              const evidenceFile = await uploadEvidenceFileWithTracking(
                dispute.id,
                dispute.organizationId!,
                file,
                category,
                currentUser?.id || 'system',
                requirementId
              );
              uploadedFiles.push({ requirementId, category, fileId: evidenceFile.id, fileName: evidenceFile.fileName });
            } else {
              // Use regular upload for manual mode
              const { uploadEvidenceFile } = await import('../../services/evidenceService');
              const evidenceFile = await uploadEvidenceFile(
                dispute.id,
                dispute.organizationId!,
                file,
                category as any,
                currentUser?.id || 'system'
              );
              uploadedFiles.push({ category, fileId: evidenceFile.id, fileName: evidenceFile.fileName });
            }
          }
        }
      }
      
      // Fetch latest evidence items from Firestore (they may have been updated by uploadEvidenceFileWithTracking)
      let finalEvidenceItems = localEvidenceItems.length > 0 ? localEvidenceItems : (dispute.evidenceItems || []);
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@realyn/shared');
        const disputeRef = doc(db, 'disputes', dispute.id);
        const disputeSnap = await getDoc(disputeRef);
        if (disputeSnap.exists()) {
          const data = disputeSnap.data();
          const updatedItems = data.evidenceItems || [];
          // Always use updated items if available, even if empty (they might have been cleared)
          finalEvidenceItems = updatedItems;
          setLocalEvidenceItems(updatedItems);
        }
      } catch (error) {
        console.error('Error fetching updated evidence items:', error);
        // Continue with existing items if fetch fails
      }
      
      // Add a short delay for Firestore subcollection indexing to catch up
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh uploaded files list after successful upload
      try {
        const existingFiles = await getEvidenceFiles(dispute.id);
        
        // Re-group files (same logic as in useEffect)
        const grouped: Record<string, EvidenceFile[]> = {};
        
        for (const file of existingFiles) {
          // Priority 1: Use requirementId stored directly on the file
          if (file.requirementId) {
            const key = file.requirementId;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(file);
            continue;
          }

          // Priority 2: Legacy matching in AI mode
          if (plan && useAIMode) {
            const item = finalEvidenceItems.find(i => i.fileId === file.id);
            if (item) {
              const key = item.requirementId;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(file);
              continue;
            }
          }
          
          // Priority 3: Fall back to category-based grouping
          const category = file.category;
          const mappedCategory = category === 'pms' ? 'pms_data' :
            category === 'proofOfStay' ? 'proof_of_stay' :
            category === 'comms' ? 'communications' :
            category === 'incidentReports' ? 'incident_reports' :
            category;
          
          if (!grouped[mappedCategory]) grouped[mappedCategory] = [];
          grouped[mappedCategory].push(file);
        }
        
        setUploadedFilesByKey(grouped);
      } catch (error) {
        console.error('Error refreshing uploaded files:', error);
        // Don't fail the whole operation if refresh fails
      }
      
      // Clear newly selected files since they're now uploaded
      setFilesByKey({});
      
      const newNote: Note = {
        id: `note_${Date.now()}`,
        author: currentUser?.name || 'System',
        timestamp: new Date(),
        text: `${uploadedFiles.length} evidence file(s) uploaded successfully.`,
      };
      
      // Update lifecycle status based on progress
      const finalProgress = calculateProgress();
      let newLifecycleStatus: string;
      let newInternalStatus: string;
      let newAutomationStatus: string;
      
      if (finalProgress.isComplete) {
        newLifecycleStatus = 'draft_ready';
        newInternalStatus = 'ready_to_submit';
        newAutomationStatus = 'responding';
      } else {
        newLifecycleStatus = 'evidence_in_progress';
        newInternalStatus = 'awaiting_docs';
        newAutomationStatus = dispute.automationStatus || 'auditing';
      }
      
      const updates: Partial<Dispute> = {
        evidenceItems: finalEvidenceItems,
        useAIPlan: useAIMode,
        internalNotes: [...(dispute.internalNotes || []), newNote],
        lifecycleStatus: newLifecycleStatus as any,
        internalStatus: newInternalStatus as any,
        automationStatus: newAutomationStatus as any,
      };
      
      updateDispute(dispute.id, updates);
      addToast({ type: 'success', message: 'Evidence uploaded successfully!' });
    } catch (error: any) {
      console.error('Error uploading evidence:', error);
      addToast({ type: 'error', message: `Failed to upload: ${error.message}` });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Check if any files have been added (newly selected or already uploaded)
  const totalNewFiles = Object.values(filesByKey).flat().length;
  const totalUploadedFiles = Object.values(uploadedFilesByKey).flat().length;
  const hasFiles = totalNewFiles > 0 || totalUploadedFiles > 0;
  
  // Check if there's enough evidence to generate an argument
  // Show button when evidence plan exists and any evidence items have been actioned
  const canGenerateArgument = useAIMode && plan && (
    progress.requiredCompleted > 0 || 
    localEvidenceItems.some(item => item.status === 'uploaded') ||
    localEvidenceItems.some(item => item.status !== 'pending')
  );
  
  // Determine PSP display name
  const pspDisplayName = dispute.pspProvider === 'adyen' ? 'Adyen' : 'Stripe';
  
  // Handle argument submission result from ArgumentDraftModal
  const handleArgumentSubmit = async (
    argument: DisputeArgument, 
    submissionResult?: { success: boolean; error?: string }
  ) => {
    try {
      if (submissionResult?.success) {
        // Submission to PSP succeeded - update local state and close
        updateDispute(dispute.id, {
          argumentDraft: argument,
          argumentSubmittedAt: new Date(),
          lifecycleStatus: 'submitted',
          internalStatus: 'resolved',
        });
        
        setShowArgumentModal(false);
        addToast({ 
          type: 'success', 
          message: `Argument and evidence submitted to ${pspDisplayName} successfully!` 
        });
        onClose();
      } else if (submissionResult?.error) {
        // Submission failed - show error but keep modal open for retry
        addToast({ 
          type: 'error', 
          message: `Failed to submit to ${pspDisplayName}: ${submissionResult.error}` 
        });
        // Don't close modal - let user see error and retry
      } else {
        // No submission result - just saving the argument draft (shouldn't happen with new flow)
        updateDispute(dispute.id, {
          argumentDraft: argument,
        });
        setShowArgumentModal(false);
      }
    } catch (error: any) {
      addToast({ type: 'error', message: `Error: ${error.message}` });
    }
  };
  
  return (
    <div className="fixed z-50 inset-0 overflow-hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
        
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10 md:pl-16">
          <div className="pointer-events-auto w-screen max-w-6xl flex flex-col h-full sm:h-[90vh] m-auto sm:rounded-xl bg-slate-900 shadow-2xl ring-1 ring-slate-800 overflow-hidden sm:relative sm:top-[5vh] animate-slide-in-right">
            
            {/* Header */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800 bg-slate-900">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-slate-50">Gather Evidence</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    <span className="font-mono">{dispute.pspDisputeId}</span>
                    <span className="mx-2 text-slate-600">•</span>
                    <span className="text-cyan-400 capitalize">{dispute.reason?.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                
                <div className="flex items-center space-x-4">
                  {/* Mode Toggle */}
                  <div className="flex items-center space-x-2 bg-slate-800 rounded-lg p-1">
                    <button
                      onClick={() => setUseAIMode(true)}
                      disabled={isGeneratingPlan}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        useAIMode 
                          ? 'bg-cyan-600 text-white' 
                          : 'text-slate-400 hover:text-slate-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      AI Guided
                    </button>
                    <button
                      onClick={() => setUseAIMode(false)}
                      disabled={isGeneratingPlan}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        !useAIMode 
                          ? 'bg-cyan-600 text-white' 
                          : 'text-slate-400 hover:text-slate-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Manual
                    </button>
                  </div>
                  
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Main Content Area */}
              <div className="flex-1 overflow-y-auto p-6">
                {useAIMode && !plan && !isGeneratingPlan && (
                  // No plan - show generate button
                  <div className="max-w-2xl mx-auto animate-fade-in">
                    <div className="p-8 bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-xl text-center relative overflow-hidden">
                      {/* Decorative gradient blob */}
                      <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>
                      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
                      
                      <div className="relative z-10">
                        <div className="mb-6">
                          <div className="relative inline-block">
                            <svg className="mx-auto h-16 w-16 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl"></div>
                          </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-50 mb-2">Generate AI Evidence Plan</h3>
                        <p className="text-slate-400 mb-6 max-w-md mx-auto">
                          Our AI will analyze this dispute and create a customized evidence plan with specific requirements based on the dispute type.
                        </p>
                      {planGenerationError && (
                        <div className="mb-4 p-4 bg-red-900/20 border border-red-900/30 rounded-lg">
                          <p className="text-sm text-red-400 mb-3">{planGenerationError}</p>
                          <p className="text-xs text-slate-400 mb-3">
                            The AI service may be temporarily unavailable. You can try again or switch to Manual Mode to continue.
                          </p>
                          <button
                            onClick={() => {
                              setUseAIMode(false);
                              setPlanGenerationError(null);
                              addToast({ type: 'info', message: 'Switched to Manual Mode. You can upload evidence to any category.' });
                            }}
                            className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg font-medium hover:bg-slate-600 transition-colors text-sm"
                          >
                            Switch to Manual Mode
                          </button>
                        </div>
                      )}
                      <button
                        onClick={handleGeneratePlan}
                        disabled={isGeneratingPlan || !dispute.reason}
                        className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white rounded-lg font-semibold hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-600/20 hover:shadow-cyan-500/30"
                      >
                        {isGeneratingPlan ? 'Generating Plan...' : planGenerationError ? 'Retry Generate Plan' : 'Generate AI Plan'}
                      </button>
                      {!dispute.reason && (
                        <p className="mt-4 text-xs text-slate-500">
                          Cannot generate plan: Dispute reason is missing
                        </p>
                      )}
                      </div>
                    </div>
                  </div>
                )}
                
                {isGeneratingPlan && (
                  // Generating plan - show skeleton loading
                  <EvidencePlanSkeleton />
                )}
                
                {useAIMode && plan && !isGeneratingPlan && (
                  // AI-Guided Mode
                  <div className="max-w-3xl mx-auto space-y-4">
                    <div className="p-4 bg-cyan-900/10 border border-cyan-900/30 rounded-xl mb-6">
                      <p className="text-sm text-cyan-200">
                        <strong>AI-Guided Mode:</strong> Complete the requirements below based on our analysis of this dispute type.
                        Priority items are marked and ranked by importance. You can still submit even if some items are missing.
                      </p>
                    </div>
                    
                    {plan.requirements.map((req, index) => {
                      const item = evidenceItems.find(i => i.requirementId === req.id) || {
                        requirementId: req.id,
                        status: 'pending' as const,
                      };
                      
                      return (
                        <div 
                          key={req.id} 
                          className="opacity-0 animate-fade-in"
                          style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
                        >
                          <RequirementItem
                            requirement={req}
                            item={item}
                            index={index}
                            files={filesByKey[req.id] || []}
                            uploadedFiles={uploadedFilesByKey[req.id] || []}
                            onFilesChange={(files) => handleFilesChange(req.id, files)}
                            onStatusChange={(status) => handleStatusChange(req.id, status)}
                            onFileDelete={handleFileDelete}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {!useAIMode && (
                  // Manual Mode
                  <div className="max-w-3xl mx-auto">
                    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl mb-6">
                      <p className="text-sm text-slate-300">
                        <strong>Manual Mode:</strong> Upload evidence to any category. All possible evidence types are shown.
                      </p>
                    </div>
                    
                    {ALL_CATEGORIES.map((category, index) => (
                      <div 
                        key={category} 
                        className="opacity-0 animate-fade-in"
                        style={{ animationDelay: `${index * 0.04}s`, animationFillMode: 'forwards' }}
                      >
                        <CategorySection
                          category={category}
                          files={filesByKey[category] || []}
                          uploadedFiles={uploadedFilesByKey[category] || []}
                          onFilesChange={(files) => handleFilesChange(category, files)}
                          isOpen={openSections.has(category)}
                          onToggle={() => toggleSection(category)}
                          hotel={hotel}
                          onFileDelete={handleFileDelete}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Sidebar (AI mode only) */}
              {useAIMode && plan && (
                <div className="w-80 border-l border-slate-800 overflow-y-auto hidden lg:block bg-slate-900/50">
                  <AIPlanSidebar plan={plan} evidenceItems={evidenceItems} />
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="text-sm">
                {useAIMode && plan ? (
                  progress.isComplete ? (
                    <span className="text-green-400 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      All priority evidence ready!
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      {progress.requiredCompleted}/{progress.requiredTotal} priority items complete
                    </span>
                  )
                ) : (
                  <span className="text-slate-400">
                    {totalNewFiles > 0 && totalUploadedFiles > 0 
                      ? `${totalNewFiles} new, ${totalUploadedFiles} uploaded`
                      : totalNewFiles > 0
                      ? `${totalNewFiles} file(s) selected`
                      : totalUploadedFiles > 0
                      ? `${totalUploadedFiles} file(s) uploaded`
                      : 'No files'
                    }
                  </span>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Save & Close
                </button>
                {useAIMode && plan && (
                  <button
                    onClick={handleRegeneratePlan}
                    disabled={isGeneratingPlan || !dispute.reason}
                    className="px-4 py-2 text-sm font-medium text-cyan-300 bg-cyan-900/20 border border-cyan-700/50 rounded-lg hover:bg-cyan-900/30 hover:border-cyan-600/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    title="Regenerate evidence plan"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{isGeneratingPlan ? 'Regenerating...' : 'Regenerate Plan'}</span>
                  </button>
                )}
                {hasFiles && (
                  <button
                    onClick={handleSubmit}
                    disabled={isUploading}
                    className="px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-green-500 rounded-lg hover:from-emerald-500 hover:to-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 flex items-center space-x-2"
                  >
                    {isUploading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span>Upload Evidence</span>
                      </>
                    )}
                  </button>
                )}
                {canGenerateArgument && (
                  <button
                    onClick={() => setShowArgumentModal(true)}
                    className="px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-500 rounded-lg hover:from-violet-500 hover:to-purple-400 transition-all shadow-lg shadow-violet-600/20 hover:shadow-violet-500/30 flex items-center space-x-2"
                  >
                    {dispute.argumentDraft ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span>View Draft</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <span>Generate Argument</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>
      
      {/* Argument Draft Modal */}
      <ArgumentDraftModal
        dispute={dispute}
        isOpen={showArgumentModal}
        onClose={() => setShowArgumentModal(false)}
        onSubmit={handleArgumentSubmit}
      />
    </div>
  );
};

export default EvidenceDashboard;

