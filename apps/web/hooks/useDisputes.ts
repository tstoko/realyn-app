
import { useState, useEffect, useCallback } from 'react';
import type { Dispute } from '../types';

const now = new Date();
const oneDay = 24 * 60 * 60 * 1000;
const sevenDays = 7 * oneDay;

const allDummyDisputes: Dispute[] = [
  // Org 1 Data
  {
    id: 'dp_dummy_1',
    organizationId: 'org_1',
    stripeDisputeId: 'dp_dummy_1',
    stripeChargeId: 'ch_dummy_1',
    stripePaymentIntentId: 'pi_dummy_1',
    amount: 1000,
    currency: 'usd',
    stripeStatus: 'needs_response',
    reason: 'fraudulent',
    respondBy: new Date(now.getTime() + 3 * oneDay),
    createdAt: new Date(now.getTime() - oneDay),
    updatedAt: new Date(now.getTime() - oneDay),
    customerExplanation: "I don't recognize this charge at all. I was not in San Francisco on this date and I believe my card was stolen or cloned. Please reverse this charge immediately.",
    automationStatus: 'awaiting_info',
    awaitingInfoFrom: 'Finance',
    missingEvidence: 'AVS/CVV match results and any prior undisputed payment history for this customer.',
    auditTrail: [
        { timestamp: new Date(now.getTime() - oneDay), title: 'Dispute Received', description: 'Reason: fraudulent. Amount: $10.00 USD', status: 'success' },
        { timestamp: new Date(now.getTime() - oneDay + 10000), title: 'AI Audit Started', description: 'Analyzing available evidence...', status: 'success' },
        { timestamp: new Date(now.getTime() - oneDay + 20000), title: 'Checked PMS Record', description: 'No stay record found for this guest card.', status: 'success' },
        { timestamp: new Date(now.getTime() - oneDay + 30000), title: 'Decision: Insufficient Evidence', description: 'Cannot build a response without payment verification data.', status: 'failure' },
        { timestamp: new Date(now.getTime() - oneDay + 40000), title: 'Action: Emailed Finance Team', description: 'Requesting AVS/CVV data and prior payment history.', status: 'in_progress' },
    ],
    lifecycleStatus: 'evidence_in_progress',
    aiSummary: 'This is a straightforward fraudulent claim where the cardholder denies participation. Key evidence will be payment verification data (AVS/CVV) and any matching IP/geolocation data from the booking.',
    aiDraftResponse: "The charge for $10.00 on [Date] was a legitimate transaction for a booking made through our website. The cardholder's IP address at the time of booking was [IP Address], which matches the billing address location. Furthermore, the AVS and CVV codes provided during the transaction were successfully verified by the card issuer, confirming that the physical card was present. We have attached the successful AVS/CVV verification logs.",
    isDraftApproved: false,
    internalNotes: [
      { id: 'note_1', author: 'AI Assistant', timestamp: new Date(now.getTime() - oneDay + 50000), text: 'Flagged for manual review due to missing AVS/CVV data in our system.'}
    ],
    assignedTeam: 'Finance',
    assigneeId: null,
    internalStatus: 'awaiting_docs',
  },
  {
    id: 'dp_dummy_2',
    organizationId: 'org_1',
    stripeDisputeId: 'dp_dummy_2',
    stripeChargeId: 'ch_dummy_2',
    stripePaymentIntentId: 'pi_dummy_2',
    amount: 2550,
    currency: 'gbp',
    stripeStatus: 'won',
    reason: 'product_not_received',
    respondBy: null,
    createdAt: new Date(now.getTime() - (3 * oneDay)),
    updatedAt: new Date(now.getTime() - (2 * oneDay)),
    customerExplanation: "We booked a stay for our anniversary, but we never received a confirmation email. When we called the hotel, they had no record of our booking under my name or email. We had to book elsewhere.",
    automationStatus: 'complete',
    auditTrail: [
        { timestamp: new Date(now.getTime() - (3 * oneDay)), title: 'Dispute Received', description: 'Reason: product_not_received.', status: 'success' },
        { timestamp: new Date(now.getTime() - (3 * oneDay) + 10000), title: 'AI Audit Started', description: 'Analyzing available evidence...', status: 'success' },
        { timestamp: new Date(now.getTime() - (3 * oneDay) + 20000), title: 'Found Communication Logs', description: 'Located guest communication thread confirming cancellation.', status: 'success' },
        { timestamp: new Date(now.getTime() - (3 * oneDay) + 30000), title: 'Response Submitted', description: 'Sent evidence of cancellation to Stripe.', status: 'success' },
        { timestamp: new Date(now.getTime() - (2 * oneDay)), title: 'Dispute Won', description: 'Bank ruled in our favor.', status: 'success' },
    ],
    lifecycleStatus: 'won',
    aiSummary: 'Dispute won. The AI located communication logs proving the guest had cancelled their booking and was aware of the policy.',
    aiDraftResponse: 'The guest cancelled this booking on [Date] via email, as per the attached communication logs. Our cancellation policy, also attached, was clearly stated at the time of booking.',
    isDraftApproved: true,
    internalNotes: [],
    assigneeId: 'user_001',
    internalStatus: 'resolved',
  },
  {
    id: 'dp_dummy_4',
    organizationId: 'org_1',
    stripeDisputeId: 'dp_dummy_4',
    stripeChargeId: 'ch_dummy_4',
    stripePaymentIntentId: 'pi_dummy_4',
    amount: 12345,
    currency: 'eur',
    stripeStatus: 'under_review',
    reason: 'general',
    respondBy: new Date(now.getTime() + (18 * oneDay)),
    createdAt: new Date(now.getTime() - (4 * oneDay)),
    updatedAt: new Date(now.getTime() - (4 * oneDay)),
    customerExplanation: "The room was unacceptable. It was not the room type I booked, the air conditioning was broken, and there was loud construction noise from the floor above starting at 6 AM. The hotel staff was unhelpful and refused to move us to a different room.",
    automationStatus: 'submitted',
    auditTrail: [
        { timestamp: new Date(now.getTime() - (4 * oneDay)), title: 'Dispute Received', description: 'Reason: general.', status: 'success' },
        { timestamp: new Date(now.getTime() - (4 * oneDay) + 10000), title: 'AI Audit Started', description: 'Analyzing evidence...', status: 'success' },
        { timestamp: new Date(now.getTime() - (4 * oneDay) + 20000), title: 'Evidence Sufficient', description: 'Found signed registration and T&Cs.', status: 'success' },
        { timestamp: new Date(now.getTime() - (4 * oneDay) + 30000), title: 'Response Submitted', description: 'Sent evidence to Stripe. Now under review.', status: 'success' },
    ],
    lifecycleStatus: 'submitted',
    aiSummary: 'This is a service quality dispute. The guest claims the room was not as booked and had maintenance issues. Our primary evidence is the signed registration card and the Terms of Service acknowledging our room assignment policies.',
    aiDraftResponse: 'The guest, [Guest Name], checked in on [Date] and signed the registration card, acknowledging the room type and accepting our terms and conditions. Our terms state that room types are subject to availability. We have no record of a maintenance request regarding the air conditioning from this guest during their stay. We consider the charge to be valid as services were rendered per the agreement.',
    isDraftApproved: true,
    internalNotes: [],
    assigneeId: 'user_001',
    internalStatus: 'resolved',
  },
  // Org 2 Data
  {
    id: 'dp_dummy_5',
    organizationId: 'org_2',
    stripeDisputeId: 'dp_dummy_5',
    stripeChargeId: 'ch_dummy_5',
    stripePaymentIntentId: 'pi_dummy_5',
    amount: 85000,
    currency: 'usd',
    stripeStatus: 'needs_response',
    reason: 'product_not_received',
    respondBy: new Date(now.getTime() + (10 * oneDay)),
    createdAt: new Date(now.getTime() - (2 * oneDay)),
    updatedAt: new Date(now.getTime() - (2 * oneDay)),
    customerExplanation: "I paid for a 'Lake View Suite' but was given a standard room with a view of the parking lot. The hotel claimed they were overbooked and this was all they had. This is not what I paid for.",
    automationStatus: 'responding',
    auditTrail: [
        { timestamp: new Date(now.getTime() - (2 * oneDay)), title: 'Dispute Received', description: 'Reason: product_not_received.', status: 'success' },
        { timestamp: new Date(now.getTime() - (2 * oneDay) + 10000), title: 'AI Audit Started', description: 'Analyzing evidence...', status: 'success' },
        { timestamp: new Date(now.getTime() - (2 * oneDay) + 20000), title: 'Evidence Sufficient', description: 'Found booking confirmation and room assignment log.', status: 'success' },
        { timestamp: new Date(now.getTime() - (2 * oneDay) + 30000), title: 'Building Response', description: 'Compiling evidence packet to submit.', status: 'in_progress' },
    ],
    lifecycleStatus: 'draft_ready',
    aiSummary: 'Guest claims they did not receive the specific room category they booked. Evidence should focus on the booking confirmation which specifies the room type, and our terms of service which may state that room views are requests and not guaranteed.',
    aiDraftResponse: "The guest's booking was for a 'Suite' category room, which was provided. While the guest's preference for a lake view was noted, our booking terms, which the guest agreed to, state that specific views are subject to availability and not guaranteed. We have attached the guest's booking confirmation and the relevant section of our terms of service. The service was rendered as per the booking agreement.",
    isDraftApproved: false,
    internalNotes: [],
    assignedTeam: 'Front Desk',
    assigneeId: null,
    internalStatus: 'ready_to_submit',
  },
  {
    id: 'dp_dummy_6',
    organizationId: 'org_2',
    stripeDisputeId: 'dp_dummy_6',
    stripeChargeId: 'ch_dummy_6',
    stripePaymentIntentId: 'pi_dummy_6',
    amount: 1500,
    currency: 'eur',
    stripeStatus: 'lost',
    reason: 'fraudulent',
    respondBy: null,
    createdAt: new Date(now.getTime() - (20 * oneDay)),
    updatedAt: new Date(now.getTime() - (15 * oneDay)),
    customerExplanation: "This charge appeared on my card after I checked out. I did not authorize any additional charges, and my final bill at checkout did not include this amount. I suspect fraudulent activity.",
    automationStatus: 'manual_review',
    missingEvidence: 'The AI could not automatically verify the source of the incidental charge. Manual investigation of the folio is required.',
    auditTrail: [
        { timestamp: new Date(now.getTime() - (20 * oneDay)), title: 'Dispute Received', description: 'Reason: fraudulent.', status: 'success' },
        { timestamp: new Date(now.getTime() - (20 * oneDay) + 10000), title: 'AI Audit Started', description: 'Analyzing evidence...', status: 'success' },
        { timestamp: new Date(now.getTime() - (20 * oneDay) + 20000), title: 'Decision: Manual Review Required', description: 'Unrecognized incidental charge requires human verification.', status: 'failure' },
    ],
    lifecycleStatus: 'lost',
    aiSummary: 'Post-checkout charge disputed as fraudulent. The system could not find a corresponding authorized incidental on the guest folio. This requires manual review of the signed registration and folio.',
    aiDraftResponse: '',
    isDraftApproved: false,
    internalNotes: [
        { id: 'note_2', author: 'Casey Manager', timestamp: new Date(now.getTime() - (19 * oneDay)), text: 'Looked into this. It was a minibar charge that was added late. We dont have a signed receipt for it. Probably a lost cause.' },
    ],
    assigneeId: 'user_002',
    internalStatus: 'resolved',
  },
  {
    id: 'dp_dummy_7',
    organizationId: 'org_3',
    stripeDisputeId: 'dp_dummy_7',
    stripePaymentIntentId: 'pi_dummy_7',
    amount: 4999,
    currency: 'usd',
    stripeStatus: 'needs_response',
    reason: 'credit_not_processed',
    respondBy: new Date(now.getTime() + 14 * oneDay),
    createdAt: new Date(now.getTime() - 5 * oneDay),
    updatedAt: new Date(),
    customerExplanation: "I cancelled my booking but never got my refund.",
    automationStatus: 'auditing',
    auditTrail: [
        { timestamp: new Date(now.getTime() - 5 * oneDay), title: 'Dispute Received', description: 'New dispute from Stripe.', status: 'success'},
        { timestamp: new Date(), title: 'AI Audit In Progress', description: 'AI is currently analyzing PMS and payment data.', status: 'in_progress'},
    ],
    lifecycleStatus: 'new',
    aiSummary: 'AI is currently analyzing this "credit not processed" dispute to determine if the cancellation was within policy and if a refund was already issued.',
    aiDraftResponse: '',
    isDraftApproved: false,
    internalNotes: [],
    assignedTeam: 'Reservations',
    assigneeId: null,
    internalStatus: 'needs_review',
  },
];

export const useDisputes = (organizationId?: string | null) => {
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        // Simulate async fetch with a short delay to show the spinner
        setTimeout(() => {
            let data = [...allDummyDisputes];
            if (organizationId) {
              data = data.filter(d => d.organizationId === organizationId);
            }
            setDisputes(data);
            setLoading(false);
        }, 500);
        
    }, [organizationId]);

    const updateDispute = useCallback((disputeId: string, updates: Partial<Dispute>) => {
        setDisputes(currentDisputes => {
            const index = currentDisputes.findIndex(d => d.id === disputeId);
            if (index === -1) return currentDisputes;

            const updatedDisputes = [...currentDisputes];
            const updatedDispute = { ...updatedDisputes[index], ...updates, updatedAt: new Date() };
            updatedDisputes[index] = updatedDispute;
            
            return updatedDisputes;
        });
    }, []);
    
    const updateMultipleDisputes = useCallback((disputeIds: string[], updates: Partial<Dispute>) => {
        setDisputes(currentDisputes => {
            const updatedDisputes = [...currentDisputes];
            let changed = false;
            disputeIds.forEach(disputeId => {
                const index = updatedDisputes.findIndex(d => d.id === disputeId);
                if (index !== -1) {
                    updatedDisputes[index] = { ...updatedDisputes[index], ...updates, updatedAt: new Date() };
                    changed = true;
                }
            });
            return changed ? updatedDisputes : currentDisputes;
        });
    }, []);

    return { disputes, loading, error, updateDispute, updateMultipleDisputes };
};
