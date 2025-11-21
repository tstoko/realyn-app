
export type AutomationStatus = 'auditing' | 'awaiting_info' | 'responding' | 'submitted' | 'manual_review' | 'unwinnable' | 'complete';
export type AutomationStepStatus = 'pending' | 'success' | 'failure' | 'in_progress';

export interface AutomationStep {
  timestamp: Date;
  title: string;
  description: string;
  status: AutomationStepStatus;
}

export interface Note {
  id: string;
  author: string;
  timestamp: Date;
  text: string;
}

export type InternalStatus = 'needs_review' | 'awaiting_docs' | 'ready_to_submit' | 'resolved';

export interface Dispute {
  id: string; // The Firestore document ID (same as stripeDisputeId)
  organizationId: string;
  stripeDisputeId: string;
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
  amount: number;
  currency: string;
  stripeStatus: DisputeStatus; // Renamed from 'status'
  reason?: string | null;
  respondBy?: Date | null; 
  createdAt: Date;
  updatedAt: Date;
  customerExplanation: string;
  
  // AI-related fields
  automationStatus: AutomationStatus;
  awaitingInfoFrom?: string; // e.g., 'Front Desk' or 'Finance'
  missingEvidence?: string; // A descriptive string of what is needed.
  auditTrail: AutomationStep[];
  aiSummary: string;
  aiDraftResponse: string;
  isDraftApproved: boolean;

  // New lifecycle and assignment fields
  lifecycleStatus: DisputeLifecycleStatus;
  internalNotes: Note[];
  assignedTeam?: string;
  assigneeId?: string | null;
  internalStatus: InternalStatus; // Internal workflow status
}

export type DisputeStatus = 'needs_response' | 'under_review' | 'won' | 'lost' | 'warning_closed';

// New, more detailed lifecycle status
export type DisputeLifecycleStatus = 'new' | 'evidence_in_progress' | 'draft_ready' | 'submitted' | 'under_review' | 'won' | 'lost' | 'not_contested';


export interface FilterState {
    status: 'all' | DisputeStatus;
    startDate?: Date;
    endDate?: Date;
    reason?: 'all' | string;
    automationStatus?: 'all' | AutomationStatus;
    searchText?: string;
}

export interface SortState {
    field: keyof Dispute;
    direction: 'asc' | 'desc';
}

export interface DashboardStats {
  totalCount: number;
  needsResponseCount: number;
  inProgressByAI: number;
  awaitingActionCount: number;
  amountAtRisk: { [currency: string]: number };
}

export interface User {
  id: string;
  name: string;
  organizationId?: string;
  hotelName?: string;
  role: 'admin' | 'user';
}

export interface Team {
  name: string;
  email: string;
}

export type DocumentCategory = 'Cancellation Policy' | 'Terms of Service' | 'House Rules' | 'Other';

export interface HotelDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  fileName: string;
  fileSize: number;
}

export interface PSPIntegration {
    type: 'none' | 'stripe' | 'adyen' | 'worldpay';
    status: 'not_connected' | 'connected';
}

export interface PMSIntegration {
    type: 'none' | 'mews' | 'opera_cloud' | 'opera_5';
    status: 'not_connected' | 'connected' | 'error';
}

export interface AutomationSettings {
    autoSubmissionEnabled: boolean;
    autoSubmissionMinAmount: number;
    autoMarkNotContested: boolean;
}

export interface HotelUser {
    id: string;
    name: string;
    email: string;
    role: 'Manager' | 'Staff';
    password?: string;
}

export interface Hotel {
  id: string;
  name: string;
  location: string;
  teams: Team[];
  documents: HotelDocument[];
  integrations: {
    psp: PSPIntegration;
    pms: PMSIntegration;
  };
  automationSettings: AutomationSettings;
  users: HotelUser[];
}

export interface ActivityLogItem {
  id: string;
  user: {
    name: string;
    id: string;
  };
  action: string;
  target: {
    type: string;
    name: string;
  };
  timestamp: Date;
}