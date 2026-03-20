import React, { useState, useEffect } from 'react';
import type { ContactSalesSubmission } from '@realyn/shared';
import { getAllContactSalesSubmissions, deleteContactSalesSubmission, Spinner, useToast } from '@realyn/shared';
import { ConfirmationModal } from '../../components/shared/ConfirmationModal';

export const ContactSalesLeadsPage: React.FC = () => {
  const [submissions, setSubmissions] = useState<ContactSalesSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSalesSubmission | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<ContactSalesSubmission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const addToast = useToast();

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const data = await getAllContactSalesSubmissions();
      setSubmissions(data);
    } catch (error: any) {
      console.error('Error loading submissions:', error);
      const errorMessage = error?.message || error?.code || 'Unknown error';
      console.error('Full error details:', error);
      addToast({ type: 'error', message: `Failed to load contact sales submissions: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      new: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      contacted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      converted: 'bg-green-500/10 text-green-400 border-green-500/20',
      archived: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    return statusColors[status as keyof typeof statusColors] || statusColors.new;
  };

  const handleDeleteSubmission = async () => {
    if (!submissionToDelete || !submissionToDelete.id) return;

    setIsDeleting(true);
    try {
      await deleteContactSalesSubmission(submissionToDelete.id);
      addToast({ type: 'success', message: 'Submission deleted successfully' });
      setSubmissionToDelete(null);
      await loadSubmissions(); // Refresh the list
    } catch (error: any) {
      console.error('Error deleting submission:', error);
      addToast({ type: 'error', message: `Failed to delete submission: ${error?.message || 'Unknown error'}` });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Contact Sales Leads</h2>
          <p className="text-sm text-slate-400 mt-1">
            {submissions.length} total submission{submissions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-800">
          <p className="text-slate-400">No contact sales submissions yet.</p>
        </div>
      ) : (
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Industry
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-900/30 divide-y divide-slate-800">
                {submissions.map((submission) => (
                  <tr key={submission.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {formatDate(submission.submittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-200">
                        {submission.firstName} {submission.lastName}
                      </div>
                      <div className="text-sm text-slate-400">{submission.email}</div>
                      <div className="text-xs text-slate-500">{submission.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-200">{submission.company}</div>
                      <div className="text-xs text-slate-400">{submission.jobTitle}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {submission.industry === 'other'
                        ? submission.industryOther
                        : submission.industry || 'N/A'}
                      {submission.companySize && ` • ${submission.companySize}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusBadge(submission.status || 'new')}`}>
                        {submission.status || 'new'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedSubmission(submission)}
                          className="text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => setSubmissionToDelete(submission)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          disabled={isDeleting}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-50">Submission Details</h3>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Name</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.firstName} {selectedSubmission.lastName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Phone</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Submitted</p>
                    <p className="text-sm text-slate-200">{formatDate(selectedSubmission.submittedAt)}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Company Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Company</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.company}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Job Title</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.jobTitle}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Industry</p>
                    <p className="text-sm text-slate-200">
                      {selectedSubmission.industry === 'other'
                        ? selectedSubmission.industryOther
                        : selectedSubmission.industry || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Company Size</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.companySize || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Current Systems</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Business Platform</p>
                    <p className="text-sm text-slate-200">
                      {selectedSubmission.currentPlatform || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Payment Processor</p>
                    <p className="text-sm text-slate-200">
                      {selectedSubmission.currentPaymentProcessor === 'other'
                        ? selectedSubmission.currentPaymentProcessorOther
                        : selectedSubmission.currentPaymentProcessor || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Monthly Transaction Volume</p>
                    <p className="text-sm text-slate-200">{selectedSubmission.monthlyTransactionVolume || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">How They Heard</p>
                    <p className="text-sm text-slate-200">
                      {selectedSubmission.howDidYouHear === 'other'
                        ? selectedSubmission.howDidYouHearOther
                        : selectedSubmission.howDidYouHear || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {selectedSubmission.message && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Message</h4>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap bg-slate-800/50 p-4 rounded-lg">
                    {selectedSubmission.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {submissionToDelete && (
        <ConfirmationModal
          isOpen={!!submissionToDelete}
          onClose={() => setSubmissionToDelete(null)}
          onConfirm={handleDeleteSubmission}
          title="Delete Submission"
          message={`Are you sure you want to permanently delete the submission from ${submissionToDelete.firstName} ${submissionToDelete.lastName} (${submissionToDelete.email})? This action cannot be undone.`}
          confirmButtonText="Delete"
          confirmButtonVariant="danger"
        />
      )}
    </div>
  );
};

