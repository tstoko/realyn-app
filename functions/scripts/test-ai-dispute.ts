/**
 * Test Script for AI Dispute Planning
 * 
 * This script tests the AI evidence planning workflow with mock data.
 * Run with: npx ts-node scripts/test-ai-dispute.ts
 */

import { DisputeCase, EvidencePlan, EvidencePlanSchema } from "../src/types/aiDispute";
import { getDisputeCodeInfo, mapStripeReasonToCode, detectNetworkFromCode } from "../src/config/disputeCodeMapping";

// Mock DisputeCase for testing
const mockNoShowDispute: DisputeCase = {
  disputeId: "test_dispute_001",
  organizationId: "test_org_001",
  pspProvider: "stripe",
  pspDisputeId: "dp_test_001",
  pspReasonCode: "product_not_received",
  amount: 35000, // $350.00
  currency: "USD",
  reason: "product_not_received",
  customerExplanation: "I never stayed at this hotel. I cancelled my reservation but was still charged.",
  transactionDate: "2024-12-01T14:30:00Z",
  respondByDate: "2024-12-25T23:59:59Z",
  hotelProfile: {
    name: "Test Hotel & Suites",
    location: "Miami, FL",
    policies: {
      cancellation: "Free cancellation up to 24 hours before check-in. Late cancellations and no-shows will be charged for one night.",
      refund: "Refunds processed within 5-7 business days.",
      noShow: "No-shows will be charged for the first night of the reservation.",
    },
  },
  booking: {
    checkIn: "2024-12-01T15:00:00Z",
    checkOut: "2024-12-03T11:00:00Z",
    roomNumber: "405",
    roomType: "King Suite",
    ratePlan: "Flexible Rate",
    totalAmount: 35000,
    currency: "USD",
    status: "no-show",
    guestName: "John Doe",
  },
  guest: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    phone: "+1-555-123-4567",
  },
  paymentData: {
    last4: "4242",
    authCode: "AUTH123",
    avsMatch: true,
    cvvMatch: true,
    threeDSecure: false,
  },
};

const mockFraudDispute: DisputeCase = {
  disputeId: "test_dispute_002",
  organizationId: "test_org_001",
  pspProvider: "stripe",
  pspDisputeId: "dp_test_002",
  pspReasonCode: "fraudulent",
  amount: 52500, // $525.00
  currency: "USD",
  reason: "fraudulent",
  customerExplanation: "I did not make this purchase. My card was stolen.",
  transactionDate: "2024-11-20T10:00:00Z",
  respondByDate: "2024-12-20T23:59:59Z",
  hotelProfile: {
    name: "Test Hotel & Suites",
    location: "Miami, FL",
  },
  booking: {
    checkIn: "2024-11-20T15:00:00Z",
    checkOut: "2024-11-23T11:00:00Z",
    roomNumber: "302",
    roomType: "Double Queen",
    ratePlan: "Non-Refundable",
    totalAmount: 52500,
    currency: "USD",
    status: "checked-out",
    guestName: "Jane Smith",
  },
  guest: {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@example.com",
  },
  paymentData: {
    last4: "1234",
    authCode: "AUTH456",
    avsMatch: true,
    cvvMatch: true,
    threeDSecure: true,
  },
};

const mockCreditNotProcessedDispute: DisputeCase = {
  disputeId: "test_dispute_003",
  organizationId: "test_org_001",
  pspProvider: "stripe",
  pspDisputeId: "dp_test_003",
  pspReasonCode: "credit_not_processed",
  amount: 15000, // $150.00
  currency: "USD",
  reason: "credit_not_processed",
  customerExplanation: "I cancelled this reservation and was told I would get a refund, but I never received it.",
  transactionDate: "2024-11-15T09:00:00Z",
  respondByDate: "2024-12-15T23:59:59Z",
  hotelProfile: {
    name: "Test Hotel & Suites",
    location: "Miami, FL",
    policies: {
      cancellation: "Full refund for cancellations made 48+ hours before check-in.",
      refund: "Refunds processed within 5-7 business days.",
    },
  },
  booking: {
    checkIn: "2024-11-20T15:00:00Z",
    checkOut: "2024-11-21T11:00:00Z",
    roomNumber: undefined,
    roomType: "Standard King",
    ratePlan: "Flexible Rate",
    totalAmount: 15000,
    currency: "USD",
    status: "cancelled",
    guestName: "Bob Johnson",
  },
  guest: {
    firstName: "Bob",
    lastName: "Johnson",
    email: "bob.johnson@example.com",
  },
};

// =============================================================================
// Test Functions
// =============================================================================

function testCodeMapping() {
  console.log("\n=== Testing Dispute Code Mapping ===\n");
  
  // Test Stripe reason mapping
  const stripeReasons = ["fraudulent", "product_not_received", "credit_not_processed", "duplicate", "subscription_canceled"];
  
  console.log("Stripe Reason to Code Mapping:");
  for (const reason of stripeReasons) {
    const code = mapStripeReasonToCode(reason);
    const network = code ? detectNetworkFromCode(code) : "unknown";
    const info = code ? getDisputeCodeInfo(code) : null;
    console.log(`  ${reason} -> ${code || "null"} (${network}) - ${info?.description || "N/A"}`);
  }
  
  // Test direct code lookups
  console.log("\nDirect Code Lookups:");
  const codes = ["10.4", "13.1", "13.6", "13.7", "4837", "4853", "C18", "F29", "AA", "RG"];
  
  for (const code of codes) {
    const info = getDisputeCodeInfo(code);
    if (info) {
      console.log(`  ${code} (${info.network}): ${info.category} - ${info.description}`);
      console.log(`    Required Evidence: ${info.requiredEvidence.join(", ")}`);
      console.log(`    Recommendation: ${info.defaultRecommendation}, Winnability: ${info.defaultWinnability}`);
    } else {
      console.log(`  ${code}: Not found`);
    }
  }
}

function testDisputeCaseValidation() {
  console.log("\n=== Testing DisputeCase Validation ===\n");
  
  const testCases = [
    { name: "No-Show Dispute", data: mockNoShowDispute },
    { name: "Fraud Dispute", data: mockFraudDispute },
    { name: "Credit Not Processed", data: mockCreditNotProcessedDispute },
  ];
  
  for (const { name, data } of testCases) {
    console.log(`Testing ${name}:`);
    console.log(`  Amount: ${data.currency} ${(data.amount / 100).toFixed(2)}`);
    console.log(`  Reason: ${data.reason}`);
    console.log(`  Customer: ${data.guest?.firstName} ${data.guest?.lastName}`);
    console.log(`  Has Booking: ${!!data.booking}`);
    console.log(`  Has Policies: ${!!data.hotelProfile?.policies}`);
    console.log(`  Has Payment Data: ${!!data.paymentData}`);
    console.log("");
  }
}

function generateMockEvidencePlan(disputeCase: DisputeCase): EvidencePlan {
  const reasonCode = disputeCase.pspReasonCode || disputeCase.reason || "";
  const mappedCode = mapStripeReasonToCode(reasonCode);
  const codeInfo = mappedCode ? getDisputeCodeInfo(mappedCode) : null;
  
  let plan: EvidencePlan;
  
  if (reasonCode === "product_not_received" || reasonCode === "13.1") {
    plan = {
      disputeCategory: "Consumer Disputes",
      disputeSubtype: "Merchandise/Services Not Received",
      reasonCode: mappedCode || undefined,
      network: "visa",
      recommendation: "fight",
      winnability: "high",
      winnabilityReason: "Booking data shows no-show status. With policy disclosure and PMS records, this dispute is very winnable.",
      summary: "The guest claims they never received the service (hotel stay), but booking records show this was a no-show with cancellation policy clearly disclosed. Focus on proving policy acceptance and no-show status.",
      requirements: [
        {
          id: "req-1",
          category: "pms_data",
          label: "Reservation Folio",
          description: "Complete folio showing the booking, no-show status, and charges applied per policy",
          example: "Folio export showing reservation dates Dec 1-3, no-show flag, one night charge",
          sourceHint: "Export from PMS (Mews, Opera, etc.)",
          required: true,
          priority: 1,
        },
        {
          id: "req-2",
          category: "policy",
          label: "Cancellation/No-Show Policy",
          description: "Your cancellation and no-show policy as shown to the guest at booking",
          example: "Policy stating 24-hour cancellation notice required, no-shows charged one night",
          sourceHint: "Website / Booking engine",
          required: true,
          priority: 1,
        },
        {
          id: "req-3",
          category: "communications",
          label: "Booking Confirmation",
          description: "Confirmation email sent to guest with reservation details and policy",
          example: "Email confirming reservation for Dec 1-3, non-refundable after 24 hours",
          sourceHint: "Email system / Booking engine",
          required: true,
          priority: 2,
        },
        {
          id: "req-4",
          category: "policy",
          label: "Terms Acceptance Proof",
          description: "Screenshot or log showing guest accepted terms during booking",
          example: "Checkbox confirmation from booking engine with timestamp",
          sourceHint: "Booking engine / OTA confirmation",
          required: false,
          priority: 3,
        },
      ],
      generatedAt: new Date().toISOString(),
      model: "gpt-4o",
    };
  } else if (reasonCode === "fraudulent" || reasonCode === "10.4") {
    plan = {
      disputeCategory: "Fraud",
      disputeSubtype: "Card-Not-Present Fraud",
      reasonCode: mappedCode || undefined,
      network: "visa",
      recommendation: "fight",
      winnability: "medium",
      winnabilityReason: "Guest checked out and used services. With proof of stay and 3D Secure authentication, this has reasonable win probability.",
      summary: "The cardholder claims fraud, but records show the guest checked in, stayed 3 nights, and checked out. Focus on proof of stay, 3D Secure authentication, and any compelling evidence linking the cardholder to the transaction.",
      requirements: [
        {
          id: "req-1",
          category: "proof_of_stay",
          label: "Check-in/Check-out Records",
          description: "System logs showing guest arrival and departure",
          example: "PMS log showing check-in at 3:15 PM Nov 20, check-out at 10:02 AM Nov 23",
          sourceHint: "PMS activity logs",
          required: true,
          priority: 1,
        },
        {
          id: "req-2",
          category: "pms_data",
          label: "Signed Registration Card",
          description: "Registration card with guest signature confirming stay details",
          example: "Signed card showing guest acknowledged policies and room details",
          sourceHint: "Front desk / PMS attachments",
          required: true,
          priority: 1,
        },
        {
          id: "req-3",
          category: "payment_data",
          label: "3D Secure Authentication",
          description: "Proof of successful 3D Secure (Verified by Visa/SecureCode) authentication",
          example: "3DS result showing successful cardholder authentication",
          sourceHint: "Payment gateway",
          required: true,
          priority: 2,
        },
        {
          id: "req-4",
          category: "proof_of_stay",
          label: "Keycard Access Logs",
          description: "Electronic door lock logs showing room entry during stay",
          example: "Room 302 accessed 15 times between Nov 20-23",
          sourceHint: "Door lock system",
          required: false,
          priority: 3,
        },
        {
          id: "req-5",
          category: "communications",
          label: "Guest Communications",
          description: "Any email or chat correspondence with the guest",
          example: "Email confirming booking, guest replies during stay",
          sourceHint: "Email / CRM",
          required: false,
          priority: 4,
        },
      ],
      generatedAt: new Date().toISOString(),
      model: "gpt-4o",
    };
  } else {
    // Default plan for credit not processed
    plan = {
      disputeCategory: "Consumer Disputes",
      disputeSubtype: "Credit Not Processed",
      reasonCode: mappedCode || undefined,
      network: "visa",
      recommendation: "fight",
      winnability: "high",
      winnabilityReason: "If a refund was processed, proof of the credit transaction should resolve this quickly. If no refund was due, policy documentation should support the case.",
      summary: "The guest claims they were promised a refund that was never processed. Need to show either proof the credit was issued, or documentation that no refund was due per policy.",
      requirements: [
        {
          id: "req-1",
          category: "payment_data",
          label: "Refund/Credit Transaction",
          description: "Proof that a refund was processed (if applicable)",
          example: "Credit transaction receipt showing refund on Nov 16",
          sourceHint: "Payment gateway / Processor portal",
          required: true,
          priority: 1,
        },
        {
          id: "req-2",
          category: "policy",
          label: "Refund Policy",
          description: "Your refund policy as disclosed to guests",
          example: "Policy stating 48-hour notice required for full refund",
          sourceHint: "Website / Booking engine",
          required: true,
          priority: 1,
        },
        {
          id: "req-3",
          category: "communications",
          label: "Cancellation Correspondence",
          description: "Email or chat showing cancellation request and response",
          example: "Guest email requesting cancellation, hotel response with refund confirmation",
          sourceHint: "Email / CRM",
          required: true,
          priority: 2,
        },
        {
          id: "req-4",
          category: "pms_data",
          label: "Booking Status History",
          description: "PMS logs showing booking status changes",
          example: "Status changed from 'confirmed' to 'cancelled' on Nov 14",
          sourceHint: "PMS activity logs",
          required: false,
          priority: 3,
        },
      ],
      generatedAt: new Date().toISOString(),
      model: "gpt-4o",
    };
  }
  
  return plan;
}

function testEvidencePlanGeneration() {
  console.log("\n=== Testing Evidence Plan Generation (Mock) ===\n");
  
  const testCases = [
    { name: "No-Show Dispute", data: mockNoShowDispute },
    { name: "Fraud Dispute", data: mockFraudDispute },
    { name: "Credit Not Processed", data: mockCreditNotProcessedDispute },
  ];
  
  for (const { name, data } of testCases) {
    console.log(`\n--- ${name} ---`);
    
    const plan = generateMockEvidencePlan(data);
    
    // Validate with Zod schema
    const validation = EvidencePlanSchema.safeParse(plan);
    
    if (validation.success) {
      console.log("✅ Schema validation passed");
      console.log(`Category: ${plan.disputeCategory} / ${plan.disputeSubtype}`);
      console.log(`Recommendation: ${plan.recommendation}`);
      console.log(`Winnability: ${plan.winnability}`);
      console.log(`Reason: ${plan.winnabilityReason}`);
      console.log(`Summary: ${plan.summary.substring(0, 100)}...`);
      console.log(`Requirements: ${plan.requirements.length} items`);
      for (const req of plan.requirements) {
        const statusIcon = req.required ? "🔴" : "⚪";
        console.log(`  ${statusIcon} [${req.category}] ${req.label} (Priority: ${req.priority})`);
      }
    } else {
      console.log("❌ Schema validation failed:");
      console.log(validation.error.errors);
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("========================================");
  console.log("  AI Dispute Planning Test Script");
  console.log("========================================");
  
  testCodeMapping();
  testDisputeCaseValidation();
  testEvidencePlanGeneration();
  
  console.log("\n========================================");
  console.log("  Tests Complete");
  console.log("========================================\n");
  
  console.log("To test with real OpenAI API, set OPENAI_API_KEY environment variable");
  console.log("and uncomment the live test section below.\n");
}

main().catch(console.error);

