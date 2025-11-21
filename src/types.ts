import { Timestamp } from 'firebase/firestore';

export type DisputeStatus = 
  | 'needs_response' 
  | 'won' 
  | 'lost' 
  | 'under_review' 
  | 'warning_closed';

export interface Dispute {
  id: string;
  stripeDisputeId: string;
  stripePaymentIntentId?: string;
  status: DisputeStatus;
  reason?: string;
  amount: number;
  currency: string;
  createdAt: Timestamp | Date;
  respondBy?: Timestamp | Date;
}

export interface FilterState {
  status?: 'all' | DisputeStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface SortState {
  field: keyof Dispute;
  direction: 'asc' | 'desc';
}
