import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  RefreshCw, 
  Save, 
  Send, 
  Clock, 
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Edit3,
  Loader2
} from 'lucide-react';
import { Dispute, DisputeArgument, TimelineEvent, ArgumentParagraph } from '@realyn/shared';
import { generateArgument, saveArgumentDraft, submitArgumentToPsp } from '../../services/argumentService';
import { ArgumentDraftSkeleton } from './ArgumentDraftSkeleton';

interface SubmissionResult {
  success: boolean;
  error?: string;
}

interface ArgumentDraftModalProps {
  dispute: Dispute;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (argument: DisputeArgument, submissionResult?: SubmissionResult) => void;
  readOnly?: boolean;
}

export const ArgumentDraftModal: React.FC<ArgumentDraftModalProps> = ({
  dispute,
  isOpen,
  onClose,
  onSubmit,
  readOnly = false,
}) => {
  const [argument, setArgument] = useState<DisputeArgument | null>(dispute.argumentDraft || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    timeline: true,
    paragraphs: true,
    rebuttal: true,
    conclusion: true,
    stripeFields: false,
  });
  
  // Determine PSP provider (default to stripe for backward compatibility)
  const pspProvider = (dispute.pspProvider === 'adyen' ? 'adyen' : 'stripe') as 'stripe' | 'adyen';
  const pspDisplayName = pspProvider === 'adyen' ? 'Adyen' : 'Stripe';

  useEffect(() => {
    if (dispute.argumentDraft) {
      setArgument(dispute.argumentDraft);
    }
  }, [dispute.argumentDraft]);

  if (!isOpen) return null;

  const handleGenerate = async (regenerate: boolean = false) => {
    if (readOnly) return;
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateArgument(
        dispute.id,
        dispute.organizationId!,
        regenerate
      );

      if (result.success && result.argument) {
        setArgument(result.argument);
        setHasUnsavedChanges(false);
      } else {
        setError(result.error || 'Failed to generate argument');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!argument) return;
    
    setIsSaving(true);
    setError(null);

    try {
      const result = await saveArgumentDraft(dispute.id, argument, dispute.organizationId!);
      if (result.success) {
        setHasUnsavedChanges(false);
      } else {
        setError(result.error || 'Failed to save draft');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitClick = () => {
    if (!argument) return;
    // Show confirmation dialog before submitting
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    if (!argument) return;
    
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    setError(null);

    try {
      // First save the current argument to ensure latest changes are stored
      if (hasUnsavedChanges) {
        const saveResult = await saveArgumentDraft(dispute.id, argument, dispute.organizationId!);
        if (!saveResult.success) {
          throw new Error(saveResult.error || 'Failed to save argument before submission');
        }
        setHasUnsavedChanges(false);
      }
      
      // Submit to PSP
      const result = await submitArgumentToPsp(
        dispute.id,
        dispute.organizationId!,
        pspProvider
      );

      if (result.success) {
        onSubmit(argument, { success: true });
      } else {
        setError(result.error || `Failed to submit to ${pspDisplayName}`);
        onSubmit(argument, { success: false, error: result.error });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onSubmit(argument, { success: false, error: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const updateField = <K extends keyof DisputeArgument>(field: K, value: DisputeArgument[K]) => {
    if (!argument || readOnly) return;
    setArgument({ ...argument, [field]: value });
    setHasUnsavedChanges(true);
  };

  const updateTimelineEvent = (index: number, event: TimelineEvent) => {
    if (!argument) return;
    const newTimeline = [...(argument.timeline || [])];
    newTimeline[index] = event;
    updateField('timeline', newTimeline);
  };

  const updateParagraph = (index: number, paragraph: ArgumentParagraph) => {
    if (!argument) return;
    const newParagraphs = [...(argument.paragraphs || [])];
    newParagraphs[index] = paragraph;
    updateField('paragraphs', newParagraphs);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={onClose} 
        />

        {/* Modal */}
        <div className="relative w-full max-w-4xl bg-slate-900 rounded-xl shadow-2xl border border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/20 rounded-lg">
                <FileText className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {readOnly ? 'Dispute argument (read-only)' : 'Dispute Argument'}
                </h2>
                <p className="text-sm text-slate-400">
                  {formatCurrency(dispute.amount, dispute.currency)} • {dispute.reason || 'No reason'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Status Banner */}
            {hasUnsavedChanges && !readOnly && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-300">You have unsaved changes</span>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            )}

            {/* No Argument Yet */}
            {!argument && !isGenerating && readOnly && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-slate-400 max-w-md">No argument draft on file for this dispute.</p>
              </div>
            )}

            {!argument && !isGenerating && !readOnly && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="p-4 bg-violet-500/20 rounded-full mb-4">
                  <Sparkles className="w-8 h-8 text-violet-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Generate Your Argument</h3>
                <p className="text-slate-400 text-center max-w-md mb-6">
                  Our AI will analyze your evidence and create a compelling argument for this dispute.
                </p>
                <button
                  type="button"
                  onClick={() => handleGenerate(false)}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Argument
                </button>
              </div>
            )}

            {/* Loading State */}
            {isGenerating && (
              <ArgumentDraftSkeleton />
            )}

            {/* Argument Editor */}
            {argument && !isGenerating && (
              <div className="space-y-6">
                {/* Executive Summary */}
                <Section
                  title="Executive Summary"
                  icon={<FileText className="w-4 h-4" />}
                  expanded={expandedSections.summary}
                  onToggle={() => toggleSection('summary')}
                >
                  <textarea
                    value={argument.executiveSummary}
                    onChange={(e) => updateField('executiveSummary', e.target.value)}
                    readOnly={readOnly}
                    className="w-full h-32 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:bg-slate-800/80 read-only:cursor-default"
                    placeholder="Brief summary of why this dispute should be reversed..."
                  />
                </Section>

                {/* Timeline */}
                <Section
                  title="Timeline of Events"
                  icon={<Clock className="w-4 h-4" />}
                  expanded={expandedSections.timeline}
                  onToggle={() => toggleSection('timeline')}
                >
                  <div className="space-y-3">
                    {(argument.timeline || []).map((event, index) => (
                      <div key={index} className="flex gap-3 items-start">
                        <input
                          type="date"
                          value={event.date}
                          onChange={(e) => updateTimelineEvent(index, { ...event, date: e.target.value })}
                          readOnly={readOnly}
                          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 read-only:cursor-default"
                        />
                        <input
                          type="text"
                          value={event.description}
                          onChange={(e) => updateTimelineEvent(index, { ...event, description: e.target.value })}
                          readOnly={readOnly}
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 read-only:cursor-default"
                          placeholder="Event description..."
                        />
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Argument Paragraphs */}
                <Section
                  title="Argument Sections"
                  icon={<Edit3 className="w-4 h-4" />}
                  expanded={expandedSections.paragraphs}
                  onToggle={() => toggleSection('paragraphs')}
                >
                  <div className="space-y-4">
                    {(argument.paragraphs || []).map((para, index) => (
                      <div key={index} className="border border-slate-700 rounded-lg p-4 space-y-3">
                        <input
                          type="text"
                          value={para.heading}
                          onChange={(e) => updateParagraph(index, { ...para, heading: e.target.value })}
                          readOnly={readOnly}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white font-medium placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 read-only:cursor-default"
                          placeholder="Section heading..."
                        />
                        <textarea
                          value={para.content}
                          onChange={(e) => updateParagraph(index, { ...para, content: e.target.value })}
                          readOnly={readOnly}
                          className="w-full h-24 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:cursor-default"
                          placeholder="Section content..."
                        />
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Customer Claim Rebuttal */}
                <Section
                  title="Customer Claim Rebuttal"
                  icon={<AlertCircle className="w-4 h-4" />}
                  expanded={expandedSections.rebuttal}
                  onToggle={() => toggleSection('rebuttal')}
                >
                  <textarea
                    value={argument.customerClaimRebuttal}
                    onChange={(e) => updateField('customerClaimRebuttal', e.target.value)}
                    readOnly={readOnly}
                    className="w-full h-24 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:cursor-default"
                    placeholder="Direct response to the customer's stated claim..."
                  />
                </Section>

                {/* Conclusion */}
                <Section
                  title="Conclusion"
                  icon={<CheckCircle className="w-4 h-4" />}
                  expanded={expandedSections.conclusion}
                  onToggle={() => toggleSection('conclusion')}
                >
                  <textarea
                    value={argument.conclusion}
                    onChange={(e) => updateField('conclusion', e.target.value)}
                    readOnly={readOnly}
                    className="w-full h-24 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:cursor-default"
                    placeholder="Strong closing statement..."
                  />
                </Section>

                {/* Stripe-Specific Fields */}
                <Section
                  title="Stripe Evidence Fields"
                  icon={<FileText className="w-4 h-4" />}
                  expanded={expandedSections.stripeFields}
                  onToggle={() => toggleSection('stripeFields')}
                  badge="Advanced"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Product Description
                      </label>
                      <input
                        type="text"
                        value={argument.productDescription || ''}
                        onChange={(e) => updateField('productDescription', e.target.value)}
                        readOnly={readOnly}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 read-only:cursor-default"
                        placeholder="Description of service provided..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Service Dates
                      </label>
                      <input
                        type="text"
                        value={argument.serviceDates || ''}
                        onChange={(e) => updateField('serviceDates', e.target.value)}
                        readOnly={readOnly}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 read-only:cursor-default"
                        placeholder="Service or event dates..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Cancellation Policy
                      </label>
                      <textarea
                        value={argument.cancellationPolicy || ''}
                        onChange={(e) => updateField('cancellationPolicy', e.target.value)}
                        readOnly={readOnly}
                        className="w-full h-20 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:cursor-default"
                        placeholder="Your cancellation policy..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Refund Policy
                      </label>
                      <textarea
                        value={argument.refundPolicy || ''}
                        onChange={(e) => updateField('refundPolicy', e.target.value)}
                        readOnly={readOnly}
                        className="w-full h-20 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:cursor-default"
                        placeholder="Your refund policy..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Customer Communication
                      </label>
                      <textarea
                        value={argument.customerCommunication || ''}
                        onChange={(e) => updateField('customerCommunication', e.target.value)}
                        readOnly={readOnly}
                        className="w-full h-20 bg-slate-800 border border-slate-600 rounded-lg p-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none read-only:cursor-default"
                        placeholder="Summary of communications with customer..."
                      />
                    </div>
                  </div>
                </Section>

                {/* Metadata */}
                {argument.generatedAt && (
                  <div className="text-xs text-slate-500 text-right">
                    Generated: {new Date(argument.generatedAt).toLocaleString()}
                    {argument.model &&
                      !/^demo-/i.test(argument.model) &&
                      ` • Model: ${argument.model}`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-slate-700 bg-slate-800/50">
            <div className="flex gap-2">
              {argument && !readOnly && (
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {argument && !readOnly && (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || !hasUnsavedChanges}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Save className={`w-4 h-4 ${isSaving ? 'animate-pulse' : ''}`} />
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitClick}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit to {pspDisplayName}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70" 
            onClick={() => setShowConfirmDialog(false)} 
          />
          <div className="relative bg-slate-800 rounded-xl p-6 max-w-md border border-slate-700 shadow-2xl mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Confirm Submission</h3>
            </div>
            <p className="text-slate-300 mb-4">
              This will submit your argument and all uploaded evidence to {pspDisplayName}. 
              This action cannot be undone.
            </p>
            {dispute.respondBy && (
              <p className="text-sm text-amber-400 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Response deadline: {(typeof (dispute.respondBy as any)?.toDate === 'function' ? (dispute.respondBy as any).toDate() : new Date(dispute.respondBy as any)).toLocaleDateString()}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" />
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Collapsible Section Component
interface SectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}

const Section: React.FC<SectionProps> = ({ title, icon, expanded, onToggle, children, badge }) => (
  <div className="border border-slate-700 rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-violet-400">{icon}</span>
        <span className="font-medium text-white">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full">
            {badge}
          </span>
        )}
      </div>
      {expanded ? (
        <ChevronUp className="w-4 h-4 text-slate-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-slate-400" />
      )}
    </button>
    {expanded && (
      <div className="p-4 bg-slate-900/50">
        {children}
      </div>
    )}
  </div>
);

export default ArgumentDraftModal;


