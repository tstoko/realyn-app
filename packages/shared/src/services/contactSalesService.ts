import { collection, addDoc, getDocs, query, orderBy, Timestamp, doc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface ContactSalesSubmission {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  industry: string;
  industryOther: string;
  companySize: string;
  currentPlatform: string;
  currentPaymentProcessor: string;
  currentPaymentProcessorOther: string;
  monthlyTransactionVolume: string;
  howDidYouHear: string;
  howDidYouHearOther: string;
  message: string;
  submittedAt: Date;
  status?: 'new' | 'contacted' | 'converted' | 'archived';
}

/**
 * Submit a contact sales form
 */
export async function submitContactSalesForm(data: Omit<ContactSalesSubmission, 'id' | 'submittedAt' | 'status'>): Promise<string> {
  const submissionsRef = collection(db, 'contactSalesSubmissions');
  const docRef = await addDoc(submissionsRef, {
    ...data,
    submittedAt: Timestamp.now(),
    status: 'new',
  });
  return docRef.id;
}

/**
 * Get all contact sales submissions
 */
export async function getAllContactSalesSubmissions(): Promise<ContactSalesSubmission[]> {
  const submissionsRef = collection(db, 'contactSalesSubmissions');
  
  // Try with orderBy first, fallback to unsorted if index not ready
  let snapshot;
  try {
    const q = query(submissionsRef, orderBy('submittedAt', 'desc'));
    snapshot = await getDocs(q);
  } catch (error: any) {
    // If orderBy fails (e.g., index not ready), get all docs and sort in JS
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('Index not ready, fetching without orderBy and sorting in JavaScript');
      snapshot = await getDocs(submissionsRef);
    } else {
      throw error;
    }
  }
  
  const submissions = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      email: data.email || '',
      phone: data.phone || '',
      company: data.company || '',
      jobTitle: data.jobTitle || '',
      industry: data.industry || '',
      industryOther: data.industryOther || '',
      companySize: data.companySize || '',
      currentPlatform: data.currentPlatform || '',
      currentPaymentProcessor: data.currentPaymentProcessor || '',
      currentPaymentProcessorOther: data.currentPaymentProcessorOther || '',
      monthlyTransactionVolume: data.monthlyTransactionVolume || '',
      howDidYouHear: data.howDidYouHear || '',
      howDidYouHearOther: data.howDidYouHearOther || '',
      message: data.message || '',
      submittedAt: data.submittedAt?.toDate() || new Date(),
      status: data.status || 'new',
    } as ContactSalesSubmission;
  });
  
  // Sort by submittedAt descending if we didn't use orderBy
  if (submissions.length > 0 && submissions[0].submittedAt) {
    submissions.sort((a, b) => {
      const aTime = a.submittedAt.getTime();
      const bTime = b.submittedAt.getTime();
      return bTime - aTime; // Descending order
    });
  }
  
  return submissions;
}

/**
 * Delete a contact sales submission
 */
export async function deleteContactSalesSubmission(submissionId: string): Promise<void> {
  if (!submissionId) {
    throw new Error('Submission ID is required');
  }
  const submissionRef = doc(db, 'contactSalesSubmissions', submissionId);
  await deleteDoc(submissionRef);
}

