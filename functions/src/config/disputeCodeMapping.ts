import { EvidenceCategory, EvidenceRequirement } from "../types/aiDispute";

// ============================================================
// Dispute Code Mapping Configuration
// ============================================================

export type CardNetwork = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export interface DisputeCodeInfo {
  code: string;
  network: CardNetwork;
  category: string;
  subcategory?: string;
  description: string;
  hotelRelevance: "high" | "medium" | "low";
  commonInHotels: boolean;
  defaultRecommendation: "fight" | "evaluate" | "accept";
  defaultWinnability: "high" | "medium" | "low";
  requiredEvidence: EvidenceCategory[];
  optionalEvidence: EvidenceCategory[];
}

// ============================================================
// Visa Reason Codes
// ============================================================

const VISA_CODES: Record<string, DisputeCodeInfo> = {
  "10.1": {
    code: "10.1",
    network: "visa",
    category: "Fraud",
    subcategory: "EMV Liability Shift Counterfeit",
    description: "Cardholder claims an in-person transaction was fraudulent (counterfeit card)",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: ["proof_of_stay", "communications"],
  },
  "10.2": {
    code: "10.2",
    network: "visa",
    category: "Fraud",
    subcategory: "EMV Liability Shift Non-Counterfeit",
    description: "Fraudulent transaction with chip card (lost/stolen scenario)",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: ["proof_of_stay", "pms_data"],
  },
  "10.3": {
    code: "10.3",
    network: "visa",
    category: "Fraud",
    subcategory: "Card-Present Fraud",
    description: "Cardholder claims card-present transaction was unauthorized",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data"],
    optionalEvidence: ["proof_of_stay", "communications"],
  },
  "10.4": {
    code: "10.4",
    network: "visa",
    category: "Fraud",
    subcategory: "Card-Not-Present Fraud",
    description: "Cardholder claims CNP transaction (online booking) was unauthorized",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data", "communications"],
    optionalEvidence: ["proof_of_stay", "policy"],
  },
  "10.5": {
    code: "10.5",
    network: "visa",
    category: "Fraud",
    subcategory: "Visa Fraud Monitoring Program",
    description: "Dispute from Visa's fraud monitoring program",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: ["communications", "proof_of_stay"],
  },
  "11.1": {
    code: "11.1",
    network: "visa",
    category: "Authorization",
    subcategory: "Card Recovery Bulletin",
    description: "Transaction with card listed on stolen card bulletin",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "11.2": {
    code: "11.2",
    network: "visa",
    category: "Authorization",
    subcategory: "Declined Authorization",
    description: "Transaction processed after decline or without authorization",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "11.3": {
    code: "11.3",
    network: "visa",
    category: "Authorization",
    subcategory: "No Authorization / Late Presentment",
    description: "No authorization obtained or transaction submitted too late",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data"],
    optionalEvidence: ["pms_data"],
  },
  "12.2": {
    code: "12.2",
    network: "visa",
    category: "Processing Errors",
    subcategory: "Incorrect Transaction Code",
    description: "Transaction processed with incorrect transaction type code",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "12.3": {
    code: "12.3",
    network: "visa",
    category: "Processing Errors",
    subcategory: "Incorrect Currency",
    description: "Charge processed in wrong currency or with incorrect conversion",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data"],
    optionalEvidence: ["communications"],
  },
  "12.4": {
    code: "12.4",
    network: "visa",
    category: "Processing Errors",
    subcategory: "Incorrect Account Number",
    description: "Card number submitted was invalid or not intended by cardholder",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "12.5": {
    code: "12.5",
    network: "visa",
    category: "Processing Errors",
    subcategory: "Incorrect Amount",
    description: "Cardholder charged different amount than agreed",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications", "policy"],
  },
  "12.6": {
    code: "12.6",
    network: "visa",
    category: "Processing Errors",
    subcategory: "Duplicate Processing / Paid by Other Means",
    description: "Cardholder charged twice or paid via another method",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "12.7": {
    code: "12.7",
    network: "visa",
    category: "Processing Errors",
    subcategory: "Invalid Data",
    description: "Transaction data was invalid (expired card, CVV mismatch, etc.)",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "13.1": {
    code: "13.1",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Merchandise/Services Not Received",
    description: "Cardholder claims they never received the service/stay",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "proof_of_stay"],
    optionalEvidence: ["communications", "policy"],
  },
  "13.2": {
    code: "13.2",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Cancelled Recurring Transaction",
    description: "Cardholder claims charge after cancelling recurring payment",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["policy", "communications"],
    optionalEvidence: ["pms_data"],
  },
  "13.3": {
    code: "13.3",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Not as Described / Defective",
    description: "Cardholder claims product/service not as advertised or defective",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["pms_data", "communications"],
    optionalEvidence: ["policy", "incident_reports"],
  },
  "13.4": {
    code: "13.4",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Counterfeit Merchandise",
    description: "Cardholder claims goods received were counterfeit",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["other"],
    optionalEvidence: ["communications"],
  },
  "13.5": {
    code: "13.5",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Misrepresentation",
    description: "Cardholder claims merchant misrepresented terms or product",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["policy", "communications"],
    optionalEvidence: ["pms_data"],
  },
  "13.6": {
    code: "13.6",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Credit Not Processed",
    description: "Cardholder claims refund/credit was promised but not processed",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["payment_data", "communications"],
    optionalEvidence: ["policy", "pms_data"],
  },
  "13.7": {
    code: "13.7",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Cancelled Merchandise/Services",
    description: "Cardholder cancelled but was still charged (no-show, cancellation)",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["policy", "pms_data", "communications"],
    optionalEvidence: ["proof_of_stay"],
  },
  "13.8": {
    code: "13.8",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Original Credit Transaction Not Accepted",
    description: "Cardholder claims they never received a credit",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data"],
    optionalEvidence: ["communications"],
  },
  "13.9": {
    code: "13.9",
    network: "visa",
    category: "Consumer Disputes",
    subcategory: "Non-Receipt of Cash at ATM",
    description: "Cardholder claims they didn't receive cash from ATM",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: [],
    optionalEvidence: [],
  },
};

// ============================================================
// Mastercard Reason Codes
// ============================================================

const MASTERCARD_CODES: Record<string, DisputeCodeInfo> = {
  "4808": {
    code: "4808",
    network: "mastercard",
    category: "Authorization",
    subcategory: "No Valid Authorization",
    description: "Transaction not properly authorized",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data"],
    optionalEvidence: ["pms_data"],
  },
  "4834": {
    code: "4834",
    network: "mastercard",
    category: "Processing Errors",
    subcategory: "Point of Interaction Error",
    description: "Processing error: duplicate, wrong amount, wrong currency, etc.",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "4837": {
    code: "4837",
    network: "mastercard",
    category: "Fraud",
    subcategory: "No Cardholder Authorization",
    description: "Cardholder denies authorizing the transaction (fraud claim)",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data", "proof_of_stay"],
    optionalEvidence: ["communications"],
  },
  "4849": {
    code: "4849",
    network: "mastercard",
    category: "Fraud",
    subcategory: "Questionable Merchant Activity",
    description: "Excessive fraud or compliance issues with merchant",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data", "pms_data"],
    optionalEvidence: ["communications", "policy"],
  },
  "4853": {
    code: "4853",
    network: "mastercard",
    category: "Consumer Disputes",
    subcategory: "Cardholder Dispute (Generic)",
    description: "Generic consumer dispute: not received, not as described, cancelled, credit not processed",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["pms_data", "policy", "communications"],
    optionalEvidence: ["proof_of_stay", "payment_data"],
  },
  "4855": {
    code: "4855",
    network: "mastercard",
    category: "Processing Errors",
    subcategory: "Transaction Did Not Complete",
    description: "Transaction didn't finalize but card was charged",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data"],
    optionalEvidence: [],
  },
  "4860": {
    code: "4860",
    network: "mastercard",
    category: "Consumer Disputes",
    subcategory: "Credit Not Processed",
    description: "Cardholder claims credit/refund was not processed",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["payment_data", "communications"],
    optionalEvidence: ["policy", "pms_data"],
  },
  "4870": {
    code: "4870",
    network: "mastercard",
    category: "Fraud",
    subcategory: "Chip Liability Shift (Counterfeit)",
    description: "Counterfeit card used at non-EMV terminal",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "4871": {
    code: "4871",
    network: "mastercard",
    category: "Fraud",
    subcategory: "Chip Liability Shift (Lost/Stolen)",
    description: "Lost/stolen card used at non-chip terminal",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
};

// ============================================================
// American Express Reason Codes
// ============================================================

const AMEX_CODES: Record<string, DisputeCodeInfo> = {
  "A01": {
    code: "A01",
    network: "amex",
    category: "Authorization",
    subcategory: "Amount Exceeds Authorization",
    description: "Transaction amount higher than approved authorization",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data"],
    optionalEvidence: ["communications"],
  },
  "A02": {
    code: "A02",
    network: "amex",
    category: "Authorization",
    subcategory: "No Valid Authorization",
    description: "Amex has no record of authorization for the charge",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "A08": {
    code: "A08",
    network: "amex",
    category: "Authorization",
    subcategory: "Authorization Expired",
    description: "Authorization expired before transaction was submitted",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "C02": {
    code: "C02",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Credit Not Processed",
    description: "Cardmember claims refund/credit was promised but not processed",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["payment_data", "communications"],
    optionalEvidence: ["policy", "pms_data"],
  },
  "C04": {
    code: "C04",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Goods/Services Returned or Refused",
    description: "Cardmember returned merchandise but didn't get refund",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["policy", "communications"],
    optionalEvidence: ["pms_data"],
  },
  "C05": {
    code: "C05",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Goods/Services Canceled / Not Received",
    description: "Cardmember canceled or didn't receive goods/services",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "proof_of_stay", "policy"],
    optionalEvidence: ["communications"],
  },
  "C08": {
    code: "C08",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Goods/Services Not Received",
    description: "Cardmember claims they never received the service/stay",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "proof_of_stay"],
    optionalEvidence: ["communications", "policy"],
  },
  "C14": {
    code: "C14",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Paid by Other Means",
    description: "Cardmember claims they paid using another method",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "C18": {
    code: "C18",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "No-Show or Cancelled Reservation",
    description: "Cardmember charged for cancelled reservation or disputes no-show",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["policy", "pms_data", "communications"],
    optionalEvidence: ["proof_of_stay"],
  },
  "C28": {
    code: "C28",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Canceled Recurring Billing",
    description: "Cardmember canceled subscription but was still charged",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["policy", "communications"],
    optionalEvidence: ["pms_data"],
  },
  "C31": {
    code: "C31",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Goods/Services Not as Described",
    description: "Cardmember claims what they received is different from advertised",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["pms_data", "policy", "communications"],
    optionalEvidence: ["incident_reports"],
  },
  "C32": {
    code: "C32",
    network: "amex",
    category: "Consumer Disputes",
    subcategory: "Goods/Services Damaged or Defective",
    description: "Cardmember claims product was damaged or defective",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["incident_reports", "communications"],
    optionalEvidence: ["policy"],
  },
  "F29": {
    code: "F29",
    network: "amex",
    category: "Fraud",
    subcategory: "Card Not Present Fraud",
    description: "Cardmember claims fraud on online/phone transaction",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data", "communications"],
    optionalEvidence: ["proof_of_stay"],
  },
  "F30": {
    code: "F30",
    network: "amex",
    category: "Fraud",
    subcategory: "EMV Counterfeit Fraud",
    description: "Counterfeit card at non-chip terminal",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "F31": {
    code: "F31",
    network: "amex",
    category: "Fraud",
    subcategory: "EMV Lost/Stolen Fraud",
    description: "Lost/stolen card used at non-chip terminal",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "R03": {
    code: "R03",
    network: "amex",
    category: "Inquiry",
    subcategory: "Insufficient Reply",
    description: "Merchant's response to inquiry was insufficient or late",
    hotelRelevance: "medium",
    commonInHotels: false,
    defaultRecommendation: "fight",
    defaultWinnability: "low",
    requiredEvidence: ["other"],
    optionalEvidence: [],
  },
  "R13": {
    code: "R13",
    network: "amex",
    category: "Inquiry",
    subcategory: "No Reply to Inquiry",
    description: "Merchant did not respond to Amex inquiry",
    hotelRelevance: "medium",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: [],
    optionalEvidence: [],
  },
  "P01": {
    code: "P01",
    network: "amex",
    category: "Processing Errors",
    subcategory: "Unassigned Card Number",
    description: "Card number used was not actually issued",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: [],
    optionalEvidence: [],
  },
  "P03": {
    code: "P03",
    network: "amex",
    category: "Processing Errors",
    subcategory: "Credit Processed as Charge",
    description: "Refund was accidentally processed as a charge",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "P05": {
    code: "P05",
    network: "amex",
    category: "Processing Errors",
    subcategory: "Incorrect Charge Amount",
    description: "Amount charged is different from what was agreed",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "P07": {
    code: "P07",
    network: "amex",
    category: "Processing Errors",
    subcategory: "Late Submission",
    description: "Transaction submitted beyond allowed timeframe",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "P08": {
    code: "P08",
    network: "amex",
    category: "Processing Errors",
    subcategory: "Duplicate Charge",
    description: "Cardmember charged twice for the same transaction",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
};

// ============================================================
// Discover Reason Codes
// ============================================================

const DISCOVER_CODES: Record<string, DisputeCodeInfo> = {
  "AA": {
    code: "AA",
    network: "discover",
    category: "Consumer Disputes",
    subcategory: "Does Not Recognize",
    description: "Cardmember doesn't recognize the charge",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications", "proof_of_stay"],
  },
  "AP": {
    code: "AP",
    network: "discover",
    category: "Consumer Disputes",
    subcategory: "Canceled Recurring Transaction",
    description: "Cardmember claims they canceled recurring but was still charged",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "medium",
    requiredEvidence: ["policy", "communications"],
    optionalEvidence: ["pms_data"],
  },
  "AW": {
    code: "AW",
    network: "discover",
    category: "Processing Errors",
    subcategory: "Altered Amount",
    description: "Transaction amount was altered from what was agreed",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "DP": {
    code: "DP",
    network: "discover",
    category: "Processing Errors",
    subcategory: "Duplicate Processing",
    description: "Cardmember charged twice for the same transaction",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "RG": {
    code: "RG",
    network: "discover",
    category: "Consumer Disputes",
    subcategory: "Non-Receipt of Goods/Services",
    description: "Cardmember claims they never received service/stay",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "proof_of_stay"],
    optionalEvidence: ["communications", "policy"],
  },
  "RM": {
    code: "RM",
    network: "discover",
    category: "Consumer Disputes",
    subcategory: "Quality Discrepancy",
    description: "Cardmember claims product/service not as described or defective",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["pms_data", "communications"],
    optionalEvidence: ["policy", "incident_reports"],
  },
  "RN": {
    code: "RN",
    network: "discover",
    category: "Consumer Disputes",
    subcategory: "Credit Not Received",
    description: "Cardmember claims refund/credit was not received",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["payment_data", "communications"],
    optionalEvidence: ["policy", "pms_data"],
  },
  "PM": {
    code: "PM",
    network: "discover",
    category: "Consumer Disputes",
    subcategory: "Paid by Other Means",
    description: "Cardmember claims they paid using another method",
    hotelRelevance: "medium",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "high",
    requiredEvidence: ["pms_data", "payment_data"],
    optionalEvidence: ["communications"],
  },
  "AT": {
    code: "AT",
    network: "discover",
    category: "Authorization",
    subcategory: "Authorization Non-Compliance",
    description: "Merchant didn't follow proper authorization procedures",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "evaluate",
    defaultWinnability: "low",
    requiredEvidence: ["payment_data"],
    optionalEvidence: [],
  },
  "DC": {
    code: "DC",
    network: "discover",
    category: "Compliance",
    subcategory: "Dispute Compliance",
    description: "Merchant didn't comply with Discover rules or respond to notice",
    hotelRelevance: "low",
    commonInHotels: false,
    defaultRecommendation: "accept",
    defaultWinnability: "low",
    requiredEvidence: [],
    optionalEvidence: [],
  },
  "UA": {
    code: "UA",
    network: "discover",
    category: "Fraud",
    subcategory: "Unauthorized Transaction",
    description: "Cardmember claims they didn't authorize the transaction",
    hotelRelevance: "high",
    commonInHotels: true,
    defaultRecommendation: "fight",
    defaultWinnability: "medium",
    requiredEvidence: ["payment_data", "pms_data", "proof_of_stay"],
    optionalEvidence: ["communications"],
  },
};

// ============================================================
// Combined Mapping
// ============================================================

export const ALL_DISPUTE_CODES: Record<string, DisputeCodeInfo> = {
  ...VISA_CODES,
  ...MASTERCARD_CODES,
  ...AMEX_CODES,
  ...DISCOVER_CODES,
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Detect card network from reason code
 */
export function detectNetworkFromCode(code: string): CardNetwork {
  if (!code) return "unknown";
  
  const normalizedCode = code.trim().toUpperCase();
  
  // Visa: 10.x, 11.x, 12.x, 13.x
  if (/^1[0-3]\.\d+$/.test(normalizedCode)) {
    return "visa";
  }
  
  // Mastercard: 4xxx
  if (/^4[0-9]{3}$/.test(normalizedCode)) {
    return "mastercard";
  }
  
  // Amex: Letter + digits (A01, C02, F29, P08, R03, etc.)
  if (/^[ACFPR]\d{2}$/.test(normalizedCode)) {
    return "amex";
  }
  
  // Discover: Two letters (AA, AP, AW, DP, etc.)
  if (/^[A-Z]{2}$/.test(normalizedCode)) {
    return "discover";
  }
  
  return "unknown";
}

/**
 * Get dispute code info from code string
 */
export function getDisputeCodeInfo(code: string): DisputeCodeInfo | null {
  if (!code) return null;
  
  const normalizedCode = code.trim();
  return ALL_DISPUTE_CODES[normalizedCode] || null;
}

/**
 * Get common hotel dispute types
 */
export function getCommonHotelDisputeCodes(): DisputeCodeInfo[] {
  return Object.values(ALL_DISPUTE_CODES).filter((info) => info.commonInHotels);
}

/**
 * Normalize Stripe reason to a reason code
 * Stripe uses descriptive strings, we map them to network codes
 */
export function mapStripeReasonToCode(stripeReason: string | null | undefined): string | null {
  if (!stripeReason) return null;
  
  const mapping: Record<string, string> = {
    "fraudulent": "10.4",                     // Visa CNP fraud
    "product_not_received": "13.1",           // Visa non-receipt
    "product_unacceptable": "13.3",           // Visa not as described
    "credit_not_processed": "13.6",           // Visa credit not processed
    "duplicate": "12.6",                      // Visa duplicate
    "subscription_canceled": "13.2",          // Visa cancelled recurring
    "unrecognized": "AA",                     // Discover doesn't recognize
    "general": "13.7",                        // Visa cancelled/general
    "offline_chip_decline": "11.2",           // Visa authorization
  };
  
  return mapping[stripeReason] || null;
}

/**
 * Generate evidence requirements for a dispute code
 */
export function generateEvidenceRequirements(
  codeInfo: DisputeCodeInfo,
  hotelContext?: { hasBooking: boolean; hasGuest: boolean; hasPolicies: boolean; hasFolio?: boolean }
): EvidenceRequirement[] {
  const requirements: EvidenceRequirement[] = [];
  let idCounter = 1;
  
  const addRequirement = (
    category: EvidenceCategory,
    label: string,
    description: string,
    required: boolean,
    priority: number,
    example?: string,
    sourceHint?: string,
    instructions?: string
  ) => {
    requirements.push({
      id: `req-${idCounter++}`,
      category,
      label,
      description,
      example,
      sourceHint,
      instructions,
      required,
      priority,
    });
  };
  
  // Add requirements based on required evidence categories
  for (const category of codeInfo.requiredEvidence) {
    switch (category) {
      case "pms_data":
        // Always add folio requirement - if available, it will be marked as uploaded
        addRequirement(
          "pms_data",
          "Reservation Folio",
          hotelContext?.hasFolio
            ? "Complete folio showing all charges, room type, dates, and guest details (already available from booking)"
            : "Complete folio showing all charges, room type, dates, and guest details",
          true,
          1,
          "Folio #12345 showing check-in 12/15, check-out 12/18, Room 405",
          hotelContext?.hasFolio ? "Available from booking" : "Export from PMS (Mews, Opera, etc.)",
          hotelContext?.hasFolio
            ? "The folio is already available from the booking. No action needed."
            : "Export the complete reservation folio from your PMS system. Include all pages showing room charges, dates, guest name, and payment details. Ensure the folio clearly shows the check-in and check-out dates, room number, and total amount charged."
        );
        if (hotelContext?.hasGuest) {
          addRequirement(
            "pms_data",
            "Signed Registration Card",
            "Registration card with guest signature confirming stay details and policies",
            true,
            2,
            "Signed card showing guest acknowledged cancellation policy",
            "Front desk / PMS attachments",
            "Locate the signed registration card from the guest's stay. The card should show the guest's signature acknowledging the hotel policies, check-in/check-out dates, and room assignment. Scan or photograph the card clearly showing the signature and date."
          );
        }
        break;
        
      case "policy":
        addRequirement(
          "policy",
          "Cancellation Policy",
          "Your hotel's cancellation policy as shown to the guest at booking",
          true,
          1,
          "Policy stating 48-hour cancellation notice required",
          "Website / Booking engine / PMS",
          "Screenshot or export your hotel's cancellation policy as it appeared to the guest at the time of booking. Include the policy text from your website, booking engine, or PMS confirmation. Ensure the policy clearly states the cancellation terms and when they apply."
        );
        addRequirement(
          "policy",
          "Terms Acceptance Proof",
          "Screenshot or log showing guest accepted terms during booking",
          true,
          2,
          "Checkbox confirmation from booking engine",
          "Booking engine / OTA confirmation",
          "Export or screenshot the booking confirmation showing the guest accepted the terms and conditions. This should include a timestamp and show the checkbox or acceptance mechanism used during booking."
        );
        break;
        
      case "proof_of_stay":
        // Only add basic check-in/check-out records if folio is not available
        // (Folio already contains check-in/check-out dates)
        if (!hotelContext?.hasFolio) {
          addRequirement(
            "proof_of_stay",
            "Check-in/Check-out Records",
            "System logs showing guest arrival and departure",
            true,
            1,
            "PMS log showing check-in at 3:15 PM, check-out at 11:02 AM",
            "PMS activity logs",
            "Export check-in and check-out logs from your PMS system for the guest's stay dates. Include timestamps showing when the guest checked in and checked out. If available, also export any activity logs showing room access or guest interactions during the stay."
          );
        }
        // Keep keycard access logs regardless of folio status (provides additional proof beyond folio)
        addRequirement(
          "proof_of_stay",
          "Keycard Access Logs",
          "Electronic door lock logs showing room entry",
          false,
          3,
          "Room 405 accessed 12 times between Dec 15-18",
          "Door lock system",
          "Export keycard access logs from your electronic door lock system showing the room was accessed during the stay period. Include timestamps and the number of times the room was accessed. This provides strong evidence the guest physically stayed in the room."
        );
        break;
        
      case "communications":
        addRequirement(
          "communications",
          "Guest Communications",
          "Email or chat correspondence with the guest about the booking",
          true,
          2,
          "Email thread showing booking confirmation and guest responses",
          "Email / CRM / PMS notes",
          "Export all email correspondence with the guest regarding this booking. Include the booking confirmation email, any pre-arrival communications, and any responses from the guest. Ensure timestamps are visible and the guest's email address matches the dispute."
        );
        addRequirement(
          "communications",
          "Booking Confirmation",
          "Confirmation email sent to guest with reservation details",
          true,
          1,
          "Email confirming reservation for Dec 15-18, non-refundable rate",
          "Booking engine / Email system",
          "Export the booking confirmation email that was sent to the guest. This should show the reservation dates, room type, rate details, and any policies that were disclosed. Include the email headers showing when it was sent and to which email address."
        );
        break;
        
      case "payment_data":
        addRequirement(
          "payment_data",
          "Authorization Records",
          "Proof of authorization code and approval for the transaction",
          true,
          1,
          "Auth code ABC123 obtained on Dec 14 for $450.00",
          "Payment gateway / Processor portal",
          "Export authorization records from your payment gateway or processor portal. Include the authorization code, timestamp, amount authorized, and approval status. This proves the transaction was properly authorized before processing."
        );
        if (codeInfo.network !== "unknown") {
          addRequirement(
            "payment_data",
            "AVS/CVV Verification",
            "Results of address and CVV verification",
            false,
            2,
            "AVS match: Y, CVV match: M",
            "Payment gateway",
            "Export AVS (Address Verification System) and CVV verification results from your payment gateway. This shows the cardholder's billing address and CVV code were verified during the transaction, supporting that it was an authorized transaction."
          );
        }
        break;
        
      case "incident_reports":
        addRequirement(
          "incident_reports",
          "Incident Report",
          "Documentation of any incidents, complaints, or damage during stay",
          true,
          1,
          "Report #789 documenting smoking damage to Room 405",
          "Front desk / Security",
          "Export or photograph any incident reports, complaint logs, or documentation related to this guest's stay. Include dates, descriptions of incidents, and any actions taken. If there were no incidents, document that fact."
        );
        addRequirement(
          "incident_reports",
          "Photos/Evidence",
          "Photographic evidence supporting the incident report",
          false,
          2,
          "Photos of damage taken during checkout inspection",
          "Housekeeping / Security",
          "If applicable, take clear photographs of any damage, incidents, or conditions that are relevant to this dispute. Include timestamps and room numbers in the photos. Ensure photos are well-lit and clearly show the relevant details."
        );
        break;
        
      case "delivery":
        addRequirement(
          "delivery",
          "Delivery Confirmation",
          "Proof of delivery with tracking and signature",
          true,
          1,
          "FedEx tracking showing delivered and signed for",
          "Shipping carrier",
          "Export delivery confirmation from the shipping carrier showing the package was delivered, signed for, and the delivery address. Include tracking number and delivery timestamp."
        );
        break;
        
      case "other":
        addRequirement(
          "other",
          "Supporting Documentation",
          "Any additional documentation relevant to this dispute",
          true,
          3,
          "Any relevant documents not covered by other categories",
          "Various sources",
          "Gather any additional documentation that supports your case. This may include receipts, contracts, agreements, or other evidence specific to this dispute type. Ensure all documents are clear, dated, and relevant to the customer's claim."
        );
        break;
    }
  }
  
  // Add optional evidence
  for (const category of codeInfo.optionalEvidence) {
    switch (category) {
      case "proof_of_stay":
        if (!codeInfo.requiredEvidence.includes("proof_of_stay")) {
          addRequirement(
            "proof_of_stay",
            "Housekeeping Records",
            "Housekeeping logs showing room was occupied and serviced",
            false,
            4,
            "Room cleaned Dec 16, 17 - personal items noted",
            "Housekeeping system",
            "Export housekeeping service logs showing the room was cleaned and serviced during the stay dates. Include dates, times, and any notes about personal items or guest presence in the room."
          );
        }
        break;
        
      case "communications":
        if (!codeInfo.requiredEvidence.includes("communications")) {
          addRequirement(
            "communications",
            "Guest Correspondence",
            "Any email, chat, or phone log communications with the guest",
            false,
            4,
            "Guest emails discussing their stay",
            "Email / CRM",
            "Export any additional communications with the guest beyond the booking confirmation. This may include pre-arrival questions, during-stay communications, or post-checkout correspondence. Include timestamps and ensure the guest's contact information matches."
          );
        }
        break;
        
      case "incident_reports":
        if (!codeInfo.requiredEvidence.includes("incident_reports")) {
          addRequirement(
            "incident_reports",
            "Complaint Records",
            "Any documented complaints or issues raised during stay",
            false,
            5,
            "Guest complaint log (if any)",
            "Front desk notes",
            "Review front desk notes and logs for any complaints or issues raised by this guest during their stay. If complaints exist, export the documentation. If no complaints were recorded, note that fact."
          );
        }
        break;
        
      case "pms_data":
        if (!codeInfo.requiredEvidence.includes("pms_data")) {
          addRequirement(
            "pms_data",
            "Booking Details",
            "Reservation details from PMS",
            false,
            4,
            "Reservation confirmation showing dates and rate",
            "PMS",
            "Export reservation details from your PMS showing the booking confirmation, dates, room type, rate, and guest information. This provides context for the dispute."
          );
        }
        break;
        
      case "policy":
        if (!codeInfo.requiredEvidence.includes("policy")) {
          addRequirement(
            "policy",
            "Refund Policy",
            "Your refund policy as disclosed to guests",
            false,
            4,
            "Policy document or website screenshot",
            "Website / Terms",
            "Screenshot or export your hotel's refund policy as it appears on your website or in your terms and conditions. Ensure it shows the policy that was in effect at the time of booking."
          );
        }
        break;
        
      case "payment_data":
        if (!codeInfo.requiredEvidence.includes("payment_data")) {
          addRequirement(
            "payment_data",
            "Transaction Records",
            "Payment gateway transaction details",
            false,
            4,
            "Gateway log showing successful charge",
            "Payment gateway",
            "Export transaction records from your payment gateway showing the successful charge, including amount, date, time, and transaction status. This provides additional proof the transaction was processed correctly."
          );
        }
        break;
    }
  }
  
  // Sort by priority
  requirements.sort((a, b) => a.priority - b.priority);
  
  return requirements;
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: EvidenceCategory): string {
  const displayNames: Record<EvidenceCategory, string> = {
    pms_data: "Property Management Data",
    policy: "Policies & Terms",
    proof_of_stay: "Proof of Stay",
    communications: "Guest Communications",
    payment_data: "Payment Verification",
    incident_reports: "Incident Reports",
    delivery: "Delivery Proof",
    other: "Other Evidence",
  };
  return displayNames[category];
}

/**
 * Get category icon (for UI)
 */
export function getCategoryIcon(category: EvidenceCategory): string {
  const icons: Record<EvidenceCategory, string> = {
    pms_data: "building",
    policy: "document",
    proof_of_stay: "key",
    communications: "chat",
    payment_data: "credit-card",
    incident_reports: "alert",
    delivery: "truck",
    other: "folder",
  };
  return icons[category];
}

