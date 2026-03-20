import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

const db = admin.firestore();

const ORG_NAME = "The Kensington Grand Hotel & Spa";
const IMPORT_ID = "pitch_demo_opera_import_001";

// ============================================================================
// Date helpers — all dates are relative to "now" so the demo always looks fresh
// ============================================================================

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ts(d: Date) {
  return admin.firestore.Timestamp.fromDate(d);
}

// ============================================================================
// Organisation
// ============================================================================

function buildOrganization() {
  return {
    name: ORG_NAME,
    location: "London, United Kingdom",
    isDemo: true,
    teams: [
      { name: "Finance", email: "finance@kensingtongrand.co.uk" },
      { name: "Front Desk", email: "frontdesk@kensingtongrand.co.uk" },
      { name: "Revenue Management", email: "revenue@kensingtongrand.co.uk" },
      { name: "Guest Relations", email: "guestrelations@kensingtongrand.co.uk" },
      { name: "Night Audit", email: "nightaudit@kensingtongrand.co.uk" },
    ],
    documents: [
      { id: "doc_kg_1", name: "Cancellation & No-Show Policy", category: "Cancellation Policy", fileName: "kg_cancellation_policy_2025.pdf", fileSize: 142_000 },
      { id: "doc_kg_2", name: "Terms & Conditions of Stay", category: "Terms of Service", fileName: "kg_terms_conditions_v3.pdf", fileSize: 298_000 },
      { id: "doc_kg_3", name: "House Rules", category: "House Rules", fileName: "kg_house_rules.pdf", fileSize: 86_000 },
      { id: "doc_kg_4", name: "Conference & Events Terms", category: "Other", fileName: "kg_conference_terms.pdf", fileSize: 174_000 },
      { id: "doc_kg_5", name: "Spa Treatment Policy", category: "Other", fileName: "kg_spa_policy.pdf", fileSize: 64_000 },
    ],
    users: [
      { id: "user_kg_1", name: "Eleanor Hughes", email: "e.hughes@kensingtongrand.co.uk", role: "Manager" },
      { id: "user_kg_2", name: "David Chen", email: "d.chen@kensingtongrand.co.uk", role: "Manager" },
      { id: "user_kg_3", name: "Sarah Mitchell", email: "s.mitchell@kensingtongrand.co.uk", role: "Staff" },
      { id: "user_kg_4", name: "Priya Sharma", email: "p.sharma@kensingtongrand.co.uk", role: "Staff" },
      { id: "user_kg_5", name: "Tom Richards", email: "t.richards@kensingtongrand.co.uk", role: "Staff" },
    ],
    pspIntegrations: {
      stripe: {
        secretKey: "rk_test_pitch_demo_key",
        webhookSecret: "whsec_pitch_demo_secret",
        status: "connected",
      },
      adyen: {
        apiKey: "AQEyhmfxK....pitch_demo",
        merchantAccounts: ["KensingtonGrandHotelGBP"],
        webhookUsername: "pitch_demo_webhook",
        webhookPassword: "pitch_demo_hmac",
        status: "connected",
      },
    },
    pmsIntegration: {
      type: "opera_xml",
      lastImportAt: admin.firestore.Timestamp.fromDate(daysAgo(1)),
      lastImportId: IMPORT_ID,
      reservationCount: 15,
    },
    automationSettings: {
      autoSubmissionEnabled: false,
      autoSubmissionMinAmount: 0,
      autoMarkNotContested: false,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ============================================================================
// Dispute definitions
// ============================================================================

interface DisputeSeed {
  guestName: string;
  scenario: string;
  reason: string;
  amountPence: number;
  psp: "stripe" | "adyen";
  last4: string;
  lifecycleStatus: string;
  status: string;
  internalStatus: string;
  daysAgoCreated: number;
  respondByDays: number;
  customerExplanation: string;
}

const DISPUTES: DisputeSeed[] = [
  {
    guestName: "James Whitfield",
    scenario: "Room not as advertised on Booking.com",
    reason: "product_not_received",
    amountPence: 64500,
    psp: "stripe",
    last4: "4242",
    lifecycleStatus: "new",
    status: "needs_response",
    internalStatus: "needs_review",
    daysAgoCreated: 2,
    respondByDays: 12,
    customerExplanation: "The room I received was nothing like the photos on Booking.com. The carpet was stained, the bathroom had mould, and the view was of a brick wall, not the garden as advertised. I asked to change rooms but was told the hotel was fully booked. I want a full refund.",
  },
  {
    guestName: "Charlotte Pemberton",
    scenario: "Double-charged for conference room",
    reason: "duplicate",
    amountPence: 128000,
    psp: "stripe",
    last4: "1881",
    lifecycleStatus: "new",
    status: "needs_response",
    internalStatus: "needs_review",
    daysAgoCreated: 3,
    respondByDays: 11,
    customerExplanation: "I was charged twice for our company's conference room booking on 15th January. The original charge of £1,280 appeared on my corporate Visa, and then an identical charge appeared two days later. I have contacted the hotel but received no response.",
  },
  {
    guestName: "Raj Patel",
    scenario: "Hen party cancelled, non-refundable rate disputed",
    reason: "credit_not_processed",
    amountPence: 235000,
    psp: "adyen",
    last4: "9034",
    lifecycleStatus: "evidence_in_progress",
    status: "needs_response",
    internalStatus: "awaiting_docs",
    daysAgoCreated: 8,
    respondByDays: 6,
    customerExplanation: "I booked three rooms for a hen party but had to cancel due to a family emergency. The hotel refused to refund despite the circumstances. The booking was made through Hotels.com and I was not made aware of the non-refundable policy at the time of booking.",
  },
  {
    guestName: "Sophie Laurent",
    scenario: "OTA booking, claims never checked in",
    reason: "fraudulent",
    amountPence: 89000,
    psp: "stripe",
    last4: "7621",
    lifecycleStatus: "evidence_in_progress",
    status: "needs_response",
    internalStatus: "awaiting_docs",
    daysAgoCreated: 12,
    respondByDays: 3,
    customerExplanation: "I did not make this booking and I have never stayed at this hotel. Someone must have used my card details without my knowledge. I do not recognise this transaction at all.",
  },
  {
    guestName: "William Ashford-Clarke",
    scenario: "Wedding block no-show charge",
    reason: "general",
    amountPence: 375000,
    psp: "adyen",
    last4: "3356",
    lifecycleStatus: "evidence_in_progress",
    status: "needs_response",
    internalStatus: "awaiting_docs",
    daysAgoCreated: 15,
    respondByDays: 2,
    customerExplanation: "I reserved a block of five rooms for wedding guests. Two of the guests did not attend and I am being charged the full rate for those rooms. The hotel should have released the rooms when the guests did not check in by 6pm as is standard practice.",
  },
  {
    guestName: "Emma Thornton",
    scenario: "Minibar charges disputed after checkout",
    reason: "general",
    amountPence: 8700,
    psp: "stripe",
    last4: "5519",
    lifecycleStatus: "evidence_in_progress",
    status: "needs_response",
    internalStatus: "awaiting_docs",
    daysAgoCreated: 5,
    respondByDays: 9,
    customerExplanation: "I was charged £87 for minibar items that I did not consume. I only had the complimentary water. The other items must have been consumed by previous guests and not restocked properly.",
  },
  {
    guestName: "Oliver Blackwood",
    scenario: "Stolen card used for online booking",
    reason: "fraudulent",
    amountPence: 112000,
    psp: "stripe",
    last4: "8844",
    lifecycleStatus: "lost",
    status: "lost",
    internalStatus: "resolved",
    daysAgoCreated: 38,
    respondByDays: -14,
    customerExplanation: "This is a fraudulent transaction. My card was reported stolen on 5th December and this charge appeared afterwards. I have filed a police report.",
  },
  {
    guestName: "Aisha Khan",
    scenario: "Spa treatment — claims poor service",
    reason: "product_not_received",
    amountPence: 19500,
    psp: "adyen",
    last4: "2207",
    lifecycleStatus: "submitted",
    status: "under_review",
    internalStatus: "ready_to_submit",
    daysAgoCreated: 22,
    respondByDays: -3,
    customerExplanation: "I booked a 90-minute deep tissue massage but the therapist was 20 minutes late and rushed through the treatment. The quality was far below what I expected from a five-star hotel spa. I raised this at reception but was only offered a 10% discount on my next visit.",
  },
  {
    guestName: "George Hartley",
    scenario: "Claims cancelled within policy window",
    reason: "credit_not_processed",
    amountPence: 156000,
    psp: "stripe",
    last4: "6673",
    lifecycleStatus: "won",
    status: "won",
    internalStatus: "resolved",
    daysAgoCreated: 35,
    respondByDays: -18,
    customerExplanation: "I cancelled my reservation more than 48 hours before check-in, which is within the hotel's cancellation policy. Despite this, I was charged the full amount of £1,560 for a three-night stay. I have the cancellation confirmation email.",
  },
  {
    guestName: "Fiona MacGregor",
    scenario: "Late checkout fee dispute",
    reason: "general",
    amountPence: 7500,
    psp: "stripe",
    last4: "0091",
    lifecycleStatus: "new",
    status: "needs_response",
    internalStatus: "needs_review",
    daysAgoCreated: 1,
    respondByDays: 13,
    customerExplanation: "I was charged a £75 late checkout fee but I was never informed of this charge when I requested late checkout. The front desk simply said 'no problem' when I asked to stay until 1pm. There was no mention of any fee.",
  },
  {
    guestName: "Marcus Chen-Williams",
    scenario: "Group booking deposit — event cancelled by hotel",
    reason: "credit_not_processed",
    amountPence: 420000,
    psp: "adyen",
    last4: "4417",
    lifecycleStatus: "draft_ready",
    status: "needs_response",
    internalStatus: "ready_to_submit",
    daysAgoCreated: 18,
    respondByDays: 1,
    customerExplanation: "The hotel cancelled our company's annual gala dinner booking due to 'renovation works' with only two weeks' notice. I paid a £4,200 deposit which has not been returned. The hotel offered to reschedule but the alternative dates were not suitable.",
  },
  {
    guestName: "Isabelle Dumont",
    scenario: "Parking charge disputed as unauthorised",
    reason: "duplicate",
    amountPence: 4800,
    psp: "stripe",
    last4: "3190",
    lifecycleStatus: "won",
    status: "won",
    internalStatus: "resolved",
    daysAgoCreated: 40,
    respondByDays: -22,
    customerExplanation: "I was charged £48 for parking but I used my own parking pass. I believe this charge was meant for another guest.",
  },
  {
    guestName: "Daniel Okonkwo",
    scenario: "Fraudulent card at restaurant",
    reason: "fraudulent",
    amountPence: 31200,
    psp: "stripe",
    last4: "7788",
    lifecycleStatus: "submitted",
    status: "under_review",
    internalStatus: "ready_to_submit",
    daysAgoCreated: 25,
    respondByDays: -6,
    customerExplanation: "I did not dine at this hotel's restaurant. This charge is fraudulent. I was abroad on the date this transaction took place and can provide travel documentation.",
  },
  {
    guestName: "Victoria Harrington",
    scenario: "Suite upgrade charge — claims it was complimentary",
    reason: "product_not_received",
    amountPence: 42500,
    psp: "adyen",
    last4: "6102",
    lifecycleStatus: "evidence_in_progress",
    status: "needs_response",
    internalStatus: "awaiting_docs",
    daysAgoCreated: 10,
    respondByDays: 5,
    customerExplanation: "I was told at check-in that I was being upgraded to a Junior Suite as a complimentary gesture because my original room was not ready. I then found an additional £425 charge on my bill for the upgrade. This was never communicated as a paid upgrade.",
  },
  {
    guestName: "Robert Pemberton-Hall",
    scenario: "Long-stay recurring weekly charge",
    reason: "subscription_canceled",
    amountPence: 280000,
    psp: "stripe",
    last4: "9955",
    lifecycleStatus: "lost",
    status: "lost",
    internalStatus: "resolved",
    daysAgoCreated: 42,
    respondByDays: -20,
    customerExplanation: "I was on an extended stay agreement that I terminated on 1st December. Despite this, I was charged £2,800 for an additional week. I informed the front desk and sent an email confirming my departure date.",
  },
];

// ============================================================================
// PMS Reservation data — one per dispute, matched by last4
// ============================================================================

function buildReservations(orgId: string) {
  return DISPUTES.map((d, i) => {
    const checkIn = daysAgo(d.daysAgoCreated + 5);
    const nights = d.amountPence > 100000 ? 3 : d.amountPence > 50000 ? 2 : 1;
    const checkOut = new Date(checkIn.getTime() + nights * 86_400_000);
    const confirmationNumber = `KG${String(240000 + i).padStart(6, "0")}`;

    const roomTypes = ["Superior Double", "Deluxe King", "Junior Suite", "Premier Suite", "Classic Twin", "Executive King", "Penthouse Suite"];
    const ratePlans = ["Best Available Rate", "Non-Refundable Rate", "Corporate Rate", "Advance Purchase", "OTA Rate"];
    const sources = ["Direct", "Booking.com", "Expedia", "Hotels.com", "Direct", "Corporate Portal", "Direct"];
    const statuses = ["checked_out", "checked_out", "cancelled", "checked_out", "no_show", "checked_out", "checked_out", "checked_out", "cancelled", "checked_out", "cancelled", "checked_out", "checked_out", "checked_out", "checked_out"] as const;

    const roomNumber = String(100 + Math.floor(i * 23 + 7) % 400);

    const reservation = {
      confirmationNumber,
      guestName: d.guestName,
      guestEmail: d.guestName.toLowerCase().replace(/[^a-z]/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/, "") + "@email.co.uk",
      guestPhone: `+4477${String(10000000 + i * 1234567).slice(0, 8)}`,
      checkIn: isoDate(checkIn),
      checkOut: isoDate(checkOut),
      roomNumber,
      roomType: roomTypes[i % roomTypes.length],
      ratePlan: ratePlans[i % ratePlans.length],
      totalAmount: d.amountPence,
      currency: "gbp",
      status: statuses[i],
      bookingSource: sources[i % sources.length],
      paymentMethodLast4: d.last4,
      adults: i === 2 ? 6 : i === 4 ? 2 : i === 10 ? 1 : 2,
      children: 0,
    };

    const folioLines = buildFolioLines(d, checkIn, nights, confirmationNumber);
    const totalCharges = folioLines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const totalPayments = Math.abs(folioLines.filter(l => l.amount < 0).reduce((s, l) => s + l.amount, 0));

    const folio = {
      confirmationNumber,
      lines: folioLines,
      totalCharges,
      totalPayments,
      balance: totalCharges - totalPayments,
      currency: "gbp",
    };

    const activityLogs = buildActivityLogs(checkIn, checkOut, roomNumber, statuses[i]);

    return {
      docId: confirmationNumber,
      data: {
        reservation,
        folio,
        activityLogs,
        sourceImportId: IMPORT_ID,
        importedAt: daysAgo(1),
        organizationId: orgId,
      },
    };
  });
}

function buildFolioLines(d: DisputeSeed, checkIn: Date, nights: number, confNo: string) {
  const lines: Array<{ date: string; description: string; amount: number; category: string; reference?: string }> = [];
  const nightRate = Math.round(d.amountPence * 0.75 / nights);
  const vatRate = Math.round(nightRate * 0.2);

  for (let n = 0; n < nights; n++) {
    const date = new Date(checkIn.getTime() + n * 86_400_000);
    lines.push({ date: isoDate(date), description: "Room & Breakfast", amount: nightRate, category: "room", reference: confNo });
    lines.push({ date: isoDate(date), description: "VAT @ 20%", amount: vatRate, category: "tax" });
  }

  if (d.reason === "general" && d.amountPence === 8700) {
    lines.push({ date: isoDate(checkIn), description: "Minibar — Premium Gin (Sipsmith)", amount: 1400, category: "food_beverage" });
    lines.push({ date: isoDate(checkIn), description: "Minibar — Tonic Water x2", amount: 600, category: "food_beverage" });
    lines.push({ date: isoDate(checkIn), description: "Minibar — Salted Almonds", amount: 550, category: "food_beverage" });
    lines.push({ date: isoDate(checkIn), description: "Minibar — Chocolate Selection", amount: 850, category: "food_beverage" });
  } else if (d.amountPence > 100000) {
    lines.push({ date: isoDate(checkIn), description: "Restaurant — Dinner", amount: Math.round(d.amountPence * 0.08), category: "food_beverage" });
    lines.push({ date: isoDate(new Date(checkIn.getTime() + 86_400_000)), description: "Bar — Drinks", amount: Math.round(d.amountPence * 0.04), category: "food_beverage" });
  }

  if (d.scenario.toLowerCase().includes("spa")) {
    lines.push({ date: isoDate(checkIn), description: "Spa — Deep Tissue Massage 90min", amount: 19500, category: "other_charge" });
  }
  if (d.scenario.toLowerCase().includes("parking")) {
    lines.push({ date: isoDate(checkIn), description: "Valet Parking — 1 Night", amount: 4800, category: "other_charge" });
  }
  if (d.scenario.toLowerCase().includes("conference")) {
    lines.push({ date: isoDate(checkIn), description: "Boardroom Hire — Full Day", amount: 128000, category: "other_charge" });
  }
  if (d.scenario.toLowerCase().includes("late checkout")) {
    lines.push({ date: isoDate(new Date(checkIn.getTime() + 86_400_000)), description: "Late Checkout Fee (until 13:00)", amount: 7500, category: "other_charge" });
  }

  const chargeTotal = lines.reduce((s, l) => s + l.amount, 0);
  lines.push({ date: isoDate(checkIn), description: `Payment — Card ending ${d.last4}`, amount: -chargeTotal, category: "payment" });

  return lines;
}

function buildActivityLogs(checkIn: Date, checkOut: Date, room: string, status: string) {
  const logs: Array<{ timestamp: string; action: string; details?: string; performedBy?: string }> = [];
  if (status !== "cancelled" && status !== "no_show") {
    logs.push({ timestamp: new Date(checkIn.getTime() + 15 * 3600_000).toISOString(), action: "check_in", details: `Checked into room ${room}`, performedBy: "Sarah Mitchell" });
    logs.push({ timestamp: new Date(checkIn.getTime() + 15.1 * 3600_000).toISOString(), action: "key_encoded", details: `2 keys encoded for room ${room}`, performedBy: "Sarah Mitchell" });
    logs.push({ timestamp: new Date(checkOut.getTime() + 11 * 3600_000).toISOString(), action: "check_out", details: `Checked out of room ${room}`, performedBy: "Priya Sharma" });
  }
  if (status === "no_show") {
    logs.push({ timestamp: new Date(checkIn.getTime() + 23 * 3600_000).toISOString(), action: "no_show", details: "Guest did not arrive — marked as no-show by Night Audit", performedBy: "Priya Sharma" });
  }
  if (status === "cancelled") {
    logs.push({ timestamp: new Date(checkIn.getTime() - 2 * 86_400_000).toISOString(), action: "cancellation", details: "Reservation cancelled by guest", performedBy: "System" });
  }
  return logs;
}

// ============================================================================
// Hardcoded evidence plans — for disputes past "new" state
// ============================================================================

function makeEvidencePlan(d: DisputeSeed): any | null {
  if (d.lifecycleStatus === "new") return null;

  const plans: Record<string, any> = {
    credit_not_processed_evidence_in_progress: {
      disputeCategory: "Cancellation / Refund Dispute",
      disputeSubtype: "Non-refundable rate challenged",
      network: "visa",
      recommendation: "fight",
      winnability: "high",
      winnabilityReason: "Guest booked a non-refundable rate and the cancellation policy was clearly disclosed at time of booking. OTA confirmations typically include this policy.",
      requirements: [
        { id: "req_1", category: "policy", label: "Cancellation & No-Show Policy", tag: "cancellation_policy", description: "Upload the hotel's cancellation policy showing non-refundable terms", required: true, priority: 1 },
        { id: "req_2", category: "pms_data", label: "Reservation Folio", tag: "folio", description: "PMS folio showing the booking as non-refundable rate", required: true, priority: 2 },
        { id: "req_3", category: "communications", label: "Booking Confirmation", tag: "booking_confirmation", description: "OTA or direct booking confirmation showing non-refundable policy was disclosed", required: true, priority: 3 },
        { id: "req_4", category: "communications", label: "Cancellation Request Correspondence", tag: "cancellation_comms", description: "Any emails or messages from the guest requesting cancellation", required: false, priority: 4 },
      ],
      summary: "The guest booked three rooms at a non-refundable rate and is disputing the charge after cancellation. Strong evidence exists: the rate was clearly marked as non-refundable in the booking confirmation.",
      generatedAt: daysAgo(d.daysAgoCreated - 1).toISOString(),
      model: "gpt-4o",
    },
    fraudulent_evidence_in_progress: {
      disputeCategory: "Fraud — Card Not Present",
      disputeSubtype: "Guest claims no knowledge of booking",
      network: "visa",
      recommendation: "fight",
      winnability: "medium",
      winnabilityReason: "PMS records show the guest checked in and used hotel services. Activity logs provide proof of stay which contradicts the fraud claim.",
      requirements: [
        { id: "req_1", category: "proof_of_stay", label: "Check-in Record", tag: "registration_card", description: "Registration card or digital check-in record with guest signature", required: true, priority: 1 },
        { id: "req_2", category: "pms_data", label: "Reservation Folio", tag: "folio", description: "Full folio with itemised charges during the stay", required: true, priority: 2 },
        { id: "req_3", category: "proof_of_stay", label: "Keycard Access Logs", tag: "keycard_logs", description: "Logs showing room key was used during the stay dates", required: true, priority: 3 },
        { id: "req_4", category: "payment_data", label: "AVS / CVV Match Data", tag: "avs_cvv", description: "Address verification and CVV match results from the payment processor", required: true, priority: 4 },
        { id: "req_5", category: "communications", label: "Booking Confirmation Email", tag: "booking_confirmation", description: "Confirmation sent to the guest's email address", required: false, priority: 5 },
      ],
      summary: "The cardholder claims this is a fraudulent transaction. However, PMS records confirm a guest checked in under this name, used the room, and consumed services. Keycard logs and check-in records can disprove the fraud claim.",
      generatedAt: daysAgo(d.daysAgoCreated - 1).toISOString(),
      model: "gpt-4o",
    },
    general_evidence_in_progress: {
      disputeCategory: "Service Dispute",
      disputeSubtype: d.amountPence === 8700 ? "Minibar charges contested" : d.amountPence === 375000 ? "No-show policy challenged" : "General charge dispute",
      network: "mastercard",
      recommendation: "fight",
      winnability: d.amountPence === 375000 ? "high" : "medium",
      winnabilityReason: d.amountPence === 375000
        ? "Wedding block terms were signed by the guest. No-show policy was clearly communicated in the group booking contract."
        : "Minibar consumption logs and housekeeping records can demonstrate the items were present and consumed during this guest's stay.",
      requirements: [
        { id: "req_1", category: "pms_data", label: "Reservation Folio", tag: "folio", description: "Itemised folio showing the disputed charges", required: true, priority: 1 },
        { id: "req_2", category: "proof_of_stay", label: "Check-in / Check-out Records", tag: "registration_card", description: "Proof the guest stayed and used the room", required: true, priority: 2 },
        ...(d.amountPence === 375000 ? [
          { id: "req_3", category: "policy", label: "Group Booking Contract", tag: "group_contract", description: "Signed group booking agreement with no-show terms", required: true, priority: 3 },
          { id: "req_4", category: "communications", label: "Wedding Block Correspondence", tag: "wedding_comms", description: "Email trail confirming room block and terms", required: true, priority: 4 },
        ] : [
          { id: "req_3", category: "proof_of_stay", label: "Minibar Consumption Log", tag: "minibar_log", description: "Housekeeping log showing minibar was restocked before check-in and items consumed during stay", required: true, priority: 3 },
          { id: "req_4", category: "proof_of_stay", label: "Housekeeping Record", tag: "housekeeping", description: "Record showing room was prepared and minibar fully stocked before guest check-in", required: false, priority: 4 },
        ]),
      ],
      summary: d.amountPence === 375000
        ? "Guest reserved a wedding block of five rooms. Two guests did not arrive. The signed group contract includes a clear no-show clause. Strong case for the hotel."
        : "Guest disputes minibar charges totalling £87. Housekeeping records can confirm the minibar was freshly stocked before this guest's check-in.",
      generatedAt: daysAgo(d.daysAgoCreated - 1).toISOString(),
      model: "gpt-4o",
    },
    product_not_received_evidence_in_progress: {
      disputeCategory: "Service / Product Dispute",
      disputeSubtype: "Paid upgrade claimed as complimentary",
      network: "amex",
      recommendation: "fight",
      winnability: "medium",
      winnabilityReason: "If the front desk documented the upgrade as a paid upsell and obtained guest acknowledgement, the case is strong. Without documentation, it becomes word-against-word.",
      requirements: [
        { id: "req_1", category: "pms_data", label: "Reservation Folio", tag: "folio", description: "Folio showing the upgrade charge and room rate difference", required: true, priority: 1 },
        { id: "req_2", category: "communications", label: "Upgrade Acknowledgement", tag: "upgrade_ack", description: "Any signed or emailed confirmation that the guest accepted a paid upgrade", required: true, priority: 2 },
        { id: "req_3", category: "proof_of_stay", label: "Check-in Record", tag: "registration_card", description: "Registration showing the Junior Suite assignment", required: true, priority: 3 },
        { id: "req_4", category: "policy", label: "Terms & Conditions", tag: "terms", description: "Hotel terms covering room changes and pricing", required: false, priority: 4 },
      ],
      summary: "Guest was upgraded from a Deluxe King to a Junior Suite and disputes the £425 charge, claiming it was offered as complimentary. Key evidence is whether the upgrade was documented as paid at check-in.",
      generatedAt: daysAgo(d.daysAgoCreated - 1).toISOString(),
      model: "gpt-4o",
    },
  };

  const key = `${d.reason}_${d.lifecycleStatus}`;

  if (plans[key]) return plans[key];

  if (["submitted", "won", "lost", "draft_ready"].includes(d.lifecycleStatus)) {
    return buildTerminalStatePlan(d);
  }

  return null;
}

function buildTerminalStatePlan(d: DisputeSeed): any {
  const categoryMap: Record<string, string> = {
    credit_not_processed: "Cancellation / Refund Dispute",
    fraudulent: "Fraud Dispute",
    product_not_received: "Service / Product Dispute",
    duplicate: "Duplicate Charge",
    general: "General Dispute",
    subscription_canceled: "Recurring Charge Dispute",
  };

  return {
    disputeCategory: categoryMap[d.reason] || "General Dispute",
    network: d.psp === "stripe" ? "visa" : "mastercard",
    recommendation: d.lifecycleStatus === "lost" ? "accept" : "fight",
    winnability: d.lifecycleStatus === "won" ? "high" : d.lifecycleStatus === "lost" ? "low" : "medium",
    winnabilityReason: d.lifecycleStatus === "won"
      ? "Strong documentary evidence supports the hotel's position."
      : d.lifecycleStatus === "lost"
        ? "Insufficient evidence to disprove the cardholder's claim."
        : "Evidence supports the hotel's position but outcome depends on bank review.",
    requirements: [
      { id: "req_1", category: "pms_data", label: "Reservation Folio", tag: "folio", description: "Full itemised guest folio", required: true, priority: 1 },
      { id: "req_2", category: "proof_of_stay", label: "Check-in / Check-out Records", tag: "registration_card", description: "Proof of guest stay", required: true, priority: 2 },
      { id: "req_3", category: "policy", label: "Relevant Hotel Policy", tag: "policy", description: "Applicable policy document", required: true, priority: 3 },
      { id: "req_4", category: "communications", label: "Guest Communications", tag: "comms", description: "Email or message trail with the guest", required: false, priority: 4 },
    ],
    summary: `Evidence plan for ${d.scenario.toLowerCase()}. ${d.customerExplanation.slice(0, 80)}...`,
    generatedAt: daysAgo(d.daysAgoCreated - 2).toISOString(),
    model: "gpt-4o",
  };
}

// ============================================================================
// Hardcoded evidence items
// ============================================================================

function makeEvidenceItems(d: DisputeSeed, plan: any): any[] | null {
  if (!plan || d.lifecycleStatus === "new") return null;

  const reqs = plan.requirements || [];
  return reqs.map((r: any, idx: number) => {
    let status = "pending";
    if (["won", "lost", "submitted", "draft_ready"].includes(d.lifecycleStatus)) {
      status = "uploaded";
    } else if (d.lifecycleStatus === "evidence_in_progress") {
      status = idx < 2 ? "uploaded" : "pending";
    }

    const base: any = { requirementId: r.id, status };
    if (status === "uploaded") {
      base.fileId = `file_pitch_${d.last4}_${r.id}`;
      base.fileName = `${r.tag || r.label.toLowerCase().replace(/\s+/g, "_")}.pdf`;
      base.uploadedAt = daysAgo(d.daysAgoCreated - 2).toISOString();
      base.uploadedBy = "user_kg_3";
    }
    return base;
  });
}

// ============================================================================
// Hardcoded argument drafts — for draft_ready, submitted, won, lost
// ============================================================================

function makeArgumentDraft(d: DisputeSeed): any | null {
  if (!["draft_ready", "submitted", "won", "lost"].includes(d.lifecycleStatus)) return null;

  const checkIn = daysAgo(d.daysAgoCreated + 5);
  const nights = d.amountPence > 100000 ? 3 : d.amountPence > 50000 ? 2 : 1;
  const checkOut = new Date(checkIn.getTime() + nights * 86_400_000);
  const amountGBP = `£${(d.amountPence / 100).toFixed(2)}`;

  const args: Record<string, any> = {
    "Marcus Chen-Williams": {
      executiveSummary: `The Kensington Grand Hotel & Spa refutes the dispute of ${amountGBP} raised by Marcus Chen-Williams regarding a group booking deposit for a corporate gala dinner. The hotel was forced to cancel the event due to essential fire safety renovation works mandated by the London Fire Brigade. The signed Events Contract (clause 7.2) explicitly states that deposits are non-refundable when cancellation is due to force majeure or regulatory requirements. The guest was offered alternative dates and a 15% discount, which was declined.`,
      timeline: [
        { date: daysAgo(d.daysAgoCreated + 60).toISOString(), description: "Guest signed Events Contract and paid £4,200 deposit" },
        { date: daysAgo(d.daysAgoCreated + 30).toISOString(), description: "London Fire Brigade issued remediation notice for the Grand Ballroom" },
        { date: daysAgo(d.daysAgoCreated + 16).toISOString(), description: "Hotel notified guest of cancellation and offered alternative dates" },
        { date: daysAgo(d.daysAgoCreated + 14).toISOString(), description: "Guest declined alternative dates and requested full refund" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Chargeback filed by guest" },
      ],
      paragraphs: [
        { heading: "Contractual Terms", content: "The Events Contract signed by Mr Chen-Williams on the booking date contains a clear force majeure clause (Section 7.2) stating: 'In the event of cancellation due to regulatory action, building works mandated by authorities, or force majeure, the deposit shall be retained by the Hotel and the Client shall be offered alternative dates at no additional cost.' This clause was initialled by the guest.", evidenceReferences: ["req_3"] },
        { heading: "Regulatory Requirement", content: "The cancellation was necessitated by a formal remediation notice from the London Fire Brigade (reference LFB/2025/KG/0892) requiring immediate works to the Grand Ballroom's fire suppression system. This constitutes a regulatory requirement under the Regulatory Reform (Fire Safety) Order 2005. The hotel had no discretion to delay these works.", evidenceReferences: ["req_4"] },
        { heading: "Mitigation Offered", content: "The hotel proactively contacted Mr Chen-Williams two weeks before the original event date and offered three alternative dates within the following eight weeks, plus a 15% discount on the total event cost. This offer was declined. The hotel acted in good faith to minimise disruption.", evidenceReferences: ["req_4"] },
      ],
      customerClaimRebuttal: "The guest claims the deposit should be refunded because the hotel initiated the cancellation. However, the signed contract explicitly covers this scenario under the force majeure clause, and the hotel offered reasonable alternatives.",
      conclusion: "The hotel was contractually entitled to retain the deposit under the signed Events Contract. The cancellation was caused by a mandatory regulatory requirement, not a commercial decision. Alternative dates and a discount were offered in good faith.",
      cancellationPolicy: "Events Contract Section 7.2: Deposits are non-refundable when cancellation results from regulatory action or force majeure. Alternative dates offered at no additional charge.",
      serviceDates: `Event originally scheduled for ${isoDate(daysAgo(d.daysAgoCreated + 5))}`,
      customerName: "Marcus Chen-Williams",
      customerEmail: "marcus.chen.williams@email.co.uk",
      generatedAt: daysAgo(d.daysAgoCreated - 3).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
    "Aisha Khan": {
      executiveSummary: `The Kensington Grand Hotel & Spa contests the dispute of ${amountGBP} for a 90-minute deep tissue massage. The spa's CCTV timestamped records show the therapist entered the treatment room at 14:03 and the session concluded at 15:28, providing 85 minutes of treatment time. The guest's claim of a 20-minute delay is not supported by the evidence. A 10% discount on a future visit was offered as a goodwill gesture.`,
      timeline: [
        { date: isoDate(checkIn), description: "Guest booked and received spa treatment (14:03–15:28)" },
        { date: isoDate(checkIn), description: "Guest complained at reception about treatment quality" },
        { date: isoDate(checkIn), description: "Duty Manager offered 10% discount on next visit" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Chargeback filed" },
      ],
      paragraphs: [
        { heading: "Service Delivery", content: "Spa appointment logs and CCTV corridor timestamps confirm the therapist (Licence #MT-4821) entered Treatment Room 3 at 14:03 and the guest exited at 15:28. This represents 85 minutes of treatment time for a 90-minute booking, which is within industry norms as 5 minutes is allocated for preparation.", evidenceReferences: ["req_1", "req_2"] },
        { heading: "Complaint Handling", content: "The guest raised concerns at reception immediately after the treatment. The Duty Manager offered a 10% discount on a future spa booking as a goodwill gesture. The guest did not request a refund at this time and left the property without further complaint.", evidenceReferences: ["req_4"] },
      ],
      customerClaimRebuttal: "The guest claims a 20-minute delay, but timestamped records show only a 3-minute variance from the scheduled start. The treatment was substantially delivered as booked.",
      conclusion: "The spa treatment was delivered in full as evidenced by appointment logs and CCTV timestamps. The minor scheduling variance does not constitute grounds for a full refund.",
      productDescription: "90-minute deep tissue massage at The Kensington Grand Spa",
      serviceDates: isoDate(checkIn),
      customerName: "Aisha Khan",
      customerEmail: "aisha.khan@email.co.uk",
      generatedAt: daysAgo(d.daysAgoCreated - 4).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
    "George Hartley": {
      executiveSummary: `The Kensington Grand Hotel & Spa successfully defended the dispute of ${amountGBP} raised by George Hartley. The guest claimed to have cancelled within the 48-hour policy window. However, our records demonstrate that the cancellation was received 23 hours before check-in — outside the 48-hour free cancellation window. The booking confirmation email clearly stated the cancellation deadline, and the guest's own cancellation confirmation email is timestamped outside the policy window.`,
      timeline: [
        { date: daysAgo(d.daysAgoCreated + 14).toISOString(), description: "Reservation booked via hotel website — confirmation sent with cancellation policy" },
        { date: daysAgo(d.daysAgoCreated + 6).toISOString(), description: `Guest cancelled reservation (23 hours before check-in on ${isoDate(checkIn)})` },
        { date: daysAgo(d.daysAgoCreated + 5).toISOString(), description: "No-show charge applied per policy" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Chargeback filed" },
        { date: daysAgo(5).toISOString(), description: "Bank ruled in favour of the hotel" },
      ],
      paragraphs: [
        { heading: "Cancellation Policy Disclosure", content: "The booking confirmation email sent on the reservation date explicitly stated: 'Free cancellation up to 48 hours before check-in. Cancellations within 48 hours will be charged the full stay amount.' The guest's email address received this confirmation (delivery confirmed).", evidenceReferences: ["req_3"] },
        { heading: "Cancellation Timing", content: "The guest's cancellation was processed at 15:42 on the day before check-in, which is 23 hours before the 14:00 check-in time — well outside the 48-hour free cancellation window. The system timestamp is authoritative.", evidenceReferences: ["req_1", "req_4"] },
      ],
      customerClaimRebuttal: "The guest claims they cancelled within the 48-hour window, but the cancellation timestamp proves otherwise. The policy was clearly communicated at time of booking.",
      conclusion: "The cancellation was made outside the free cancellation window. The policy was disclosed at booking. The charge is valid.",
      cancellationPolicy: "Free cancellation up to 48 hours before check-in (14:00). Late cancellations and no-shows are charged the full stay amount.",
      cancellationPolicyDisclosure: "Included in booking confirmation email and displayed on the hotel website during the booking process.",
      serviceDates: `${isoDate(checkIn)} to ${isoDate(checkOut)}`,
      customerName: "George Hartley",
      customerEmail: "george.hartley@email.co.uk",
      generatedAt: daysAgo(d.daysAgoCreated - 5).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
    "Oliver Blackwood": {
      executiveSummary: `The Kensington Grand Hotel & Spa was unable to successfully defend the dispute of ${amountGBP}. The cardholder reported their card as stolen and filed a police report. The booking was made online without 3D Secure authentication. While the hotel provided booking records, the lack of in-person verification (the booking was a no-show) and absence of 3DS meant insufficient evidence to counter the fraud claim.`,
      timeline: [
        { date: daysAgo(d.daysAgoCreated + 10).toISOString(), description: "Online booking made with stolen card details" },
        { date: daysAgo(d.daysAgoCreated + 5).toISOString(), description: "No-show — guest never arrived" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Fraud dispute filed by cardholder" },
        { date: daysAgo(10).toISOString(), description: "Bank ruled in favour of cardholder" },
      ],
      paragraphs: [
        { heading: "Transaction Details", content: "The booking was made online via the hotel's website. The card passed AVS (partial match — postcode only) but 3D Secure was not enforced for this transaction. No physical card was presented as the guest never checked in.", evidenceReferences: ["req_1"] },
        { heading: "Lack of Physical Verification", content: "As the guest never arrived, no ID verification, registration card, or keycard logs exist. The hotel cannot provide proof that the legitimate cardholder made or benefited from this booking.", evidenceReferences: ["req_2"] },
      ],
      customerClaimRebuttal: "The cardholder's fraud claim is supported by a police report and the absence of any in-person verification at the hotel.",
      conclusion: "Without 3D Secure authentication or physical presence of the cardholder, the hotel could not provide sufficient evidence to counter the fraud claim. Liability shifted to the merchant.",
      customerName: "Oliver Blackwood",
      generatedAt: daysAgo(d.daysAgoCreated - 8).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
    "Isabelle Dumont": {
      executiveSummary: `The Kensington Grand Hotel & Spa successfully defended the dispute of ${amountGBP} for a valet parking charge. The hotel provided the signed valet ticket, CCTV footage of the guest handing over car keys, and the PMS folio showing the charge was correctly applied to this guest's room. The guest's claim that the charge belonged to another guest was disproven.`,
      timeline: [
        { date: isoDate(checkIn), description: "Guest arrived and used valet parking service" },
        { date: isoDate(checkIn), description: "Signed valet ticket received" },
        { date: isoDate(checkOut), description: "Guest checked out — parking charge on folio" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Dispute filed" },
        { date: daysAgo(8).toISOString(), description: "Bank ruled in favour of hotel" },
      ],
      paragraphs: [
        { heading: "Proof of Service", content: "The signed valet parking ticket (ticket #VP-2847) shows the guest's name, vehicle registration, and room number. CCTV footage from the hotel entrance confirms the guest handed car keys to the valet attendant at 15:22 on the check-in date.", evidenceReferences: ["req_1", "req_2"] },
        { heading: "Folio Accuracy", content: "The £48 valet parking charge was posted to the guest's room folio at 15:25, consistent with the CCTV timestamp. No other guest was checked into this room during the relevant period.", evidenceReferences: ["req_1"] },
      ],
      customerClaimRebuttal: "The guest claimed the charge was meant for another guest, but the signed valet ticket and CCTV footage conclusively prove the charge was correctly applied.",
      conclusion: "Documentary evidence clearly demonstrates the guest used and was correctly charged for valet parking.",
      customerName: "Isabelle Dumont",
      customerEmail: "isabelle.dumont@email.co.uk",
      serviceDates: isoDate(checkIn),
      generatedAt: daysAgo(d.daysAgoCreated - 10).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
    "Daniel Okonkwo": {
      executiveSummary: `The Kensington Grand Hotel & Spa contests the fraud dispute of ${amountGBP} for a restaurant charge. The hotel's restaurant EPOS system records a chip-and-PIN transaction at 20:17, meaning the physical card was present. CCTV footage from the restaurant entrance shows a guest matching the cardholder's name on the reservation. The cardholder's claim of being abroad is contradicted by this evidence.`,
      timeline: [
        { date: isoDate(checkIn), description: "Restaurant reservation under 'Okonkwo' for 20:00" },
        { date: isoDate(checkIn), description: "Chip-and-PIN payment processed at 20:17" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Fraud dispute filed — cardholder claims to have been abroad" },
      ],
      paragraphs: [
        { heading: "Physical Card Present", content: "The restaurant's EPOS terminal recorded a chip-and-PIN (EMV) transaction at 20:17. This means the physical card was inserted into the terminal and the correct PIN was entered. Chip-and-PIN transactions provide strong authentication that the legitimate cardholder was present.", evidenceReferences: ["req_1"] },
        { heading: "CCTV Evidence", content: "Restaurant entrance CCTV shows a party of two arriving at 19:58 under the reservation name 'Okonkwo'. The individual presented a card at the till at approximately 20:15.", evidenceReferences: ["req_2"] },
        { heading: "Reservation Records", content: "The restaurant booking was made by phone earlier that day. The caller provided the name 'Okonkwo' and a mobile number ending in 447.", evidenceReferences: ["req_4"] },
      ],
      customerClaimRebuttal: "The cardholder claims to have been abroad, but a chip-and-PIN transaction requires the physical card and correct PIN. The hotel has CCTV corroboration.",
      conclusion: "The chip-and-PIN transaction and CCTV footage provide compelling evidence that the cardholder or an authorised user was physically present. The fraud claim should be rejected.",
      customerName: "Daniel Okonkwo",
      generatedAt: daysAgo(d.daysAgoCreated - 5).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
    "Robert Pemberton-Hall": {
      executiveSummary: `The Kensington Grand Hotel & Spa was unable to defend the dispute of ${amountGBP} for a recurring weekly charge. The guest was on an extended stay agreement billed weekly. The guest notified the hotel of departure on 1st December. However, the hotel's internal communication failure meant the billing system was not updated, and an additional week's charge was processed on 3rd December. The hotel acknowledges this was an error.`,
      timeline: [
        { date: daysAgo(d.daysAgoCreated + 30).toISOString(), description: "Extended stay agreement commenced — weekly billing" },
        { date: daysAgo(d.daysAgoCreated + 7).toISOString(), description: "Guest informed Front Desk of departure on 1 December" },
        { date: daysAgo(d.daysAgoCreated + 5).toISOString(), description: "Guest checked out" },
        { date: daysAgo(d.daysAgoCreated + 3).toISOString(), description: "Erroneous weekly charge of £2,800 processed" },
        { date: daysAgo(d.daysAgoCreated).toISOString(), description: "Dispute filed" },
      ],
      paragraphs: [
        { heading: "Billing Error", content: "The guest's extended stay was billed on a recurring weekly basis every Monday. The guest notified the Front Desk of departure on 1st December (a Friday). The Night Audit team was not informed of the departure, and the automated billing processed the next weekly charge on the following Monday.", evidenceReferences: ["req_1"] },
        { heading: "Internal Communication Failure", content: "The Front Desk team did not update the PMS departure date when the guest gave notice. This is an acknowledged process failure. The guest's email notification was found in the Front Desk inbox but was not actioned.", evidenceReferences: ["req_4"] },
      ],
      customerClaimRebuttal: "The guest's claim is valid. The hotel acknowledges the charge was processed in error due to an internal communication failure.",
      conclusion: "The hotel accepts this dispute. The charge was made in error after the guest had given proper notice of departure. Internal processes have been updated to prevent recurrence.",
      customerName: "Robert Pemberton-Hall",
      customerEmail: "robert.ph@email.co.uk",
      serviceDates: `Extended stay ending ${isoDate(checkOut)}`,
      generatedAt: daysAgo(d.daysAgoCreated - 8).toISOString(),
      model: "gpt-4o",
      version: 1,
    },
  };

  return args[d.guestName] || null;
}

// ============================================================================
// Cleanup helper
// ============================================================================

async function cleanupExistingDemo() {
  const orgsSnap = await db.collection("organizations")
    .where("name", "==", ORG_NAME)
    .get();

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;

    const disputesSnap = await db.collection("disputes")
      .where("organizationId", "==", orgId)
      .get();
    const batch1 = db.batch();
    disputesSnap.docs.forEach(d => batch1.delete(d.ref));
    if (disputesSnap.docs.length > 0) await batch1.commit();

    const resSnap = await db.collection("organizations").doc(orgId)
      .collection("pmsReservations").get();
    const batch2 = db.batch();
    resSnap.docs.forEach(d => batch2.delete(d.ref));
    if (resSnap.docs.length > 0) await batch2.commit();

    const impSnap = await db.collection("organizations").doc(orgId)
      .collection("pmsImports").get();
    const batch3 = db.batch();
    impSnap.docs.forEach(d => batch3.delete(d.ref));
    if (impSnap.docs.length > 0) await batch3.commit();

    const usersSnap = await db.collection("users")
      .where("organizationId", "==", orgId)
      .get();
    const batch4 = db.batch();
    usersSnap.docs.forEach(d => batch4.delete(d.ref));
    if (usersSnap.docs.length > 0) await batch4.commit();

    await orgDoc.ref.delete();
    console.log(`Cleaned up previous demo org: ${orgId}`);
  }
}

// ============================================================================
// Main handler
// ============================================================================

export const seedPitchDemo = onRequest(
  { cors: true },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    try {
      console.log("=== Pitch Demo Seed: starting ===");

      // 1. Cleanup
      await cleanupExistingDemo();

      // 2. Create organisation
      const orgRef = await db.collection("organizations").add(buildOrganization());
      const orgId = orgRef.id;
      console.log(`Created organisation: ${orgId}`);

      // 3. Create disputes
      const createdDisputes: string[] = [];

      for (let i = 0; i < DISPUTES.length; i++) {
        const d = DISPUTES[i];
        const plan = makeEvidencePlan(d);
        const evidenceItems = makeEvidenceItems(d, plan);
        const argumentDraft = makeArgumentDraft(d);

        const disputeData: Record<string, any> = {
          organizationId: orgId,
          pspProvider: d.psp,
          pspDisputeId: `${d.psp === "stripe" ? "du" : "adyen"}_pitch_${d.last4}_${Date.now() + i}`,
          pspPaymentId: `${d.psp === "stripe" ? "pi" : "psp"}_pitch_${Date.now() + i}`,
          pspTransactionDate: ts(daysAgo(d.daysAgoCreated + 5)),
          pspLast4Digits: d.last4,
          amount: d.amountPence,
          currency: "gbp",
          reason: d.reason,
          status: d.status,
          customerExplanation: d.customerExplanation,
          createdAt: ts(daysAgo(d.daysAgoCreated)),
          updatedAt: ts(daysAgo(Math.max(0, d.daysAgoCreated - 2))),
          respondBy: ts(daysFromNow(d.respondByDays)),
          lifecycleStatus: d.lifecycleStatus,
          internalStatus: d.internalStatus,
          automationStatus: "manual_review",
          useAIPlan: true,
          evidencePlan: plan,
          evidenceItems: evidenceItems || [],
          argumentDraft: argumentDraft,
          auditTrail: buildAuditTrail(d),
        };

        if (d.lifecycleStatus === "submitted" || d.lifecycleStatus === "won" || d.lifecycleStatus === "lost") {
          disputeData.argumentSubmittedAt = ts(daysAgo(Math.max(1, d.daysAgoCreated - 4)));
        }
        if (d.lifecycleStatus === "won" || d.lifecycleStatus === "lost") {
          disputeData.argumentDraftGeneratedAt = daysAgo(d.daysAgoCreated - 3);
        }

        const docRef = await db.collection("disputes").add(disputeData);
        createdDisputes.push(`${d.guestName} (${d.reason}/${d.lifecycleStatus}): ${docRef.id}`);
        console.log(`  Dispute ${i + 1}/15: ${d.guestName} — ${d.lifecycleStatus}`);
      }

      // 4. Create PMS reservations
      const reservations = buildReservations(orgId);
      for (const r of reservations) {
        await db.collection("organizations").doc(orgId)
          .collection("pmsReservations").doc(r.docId)
          .set(r.data);
      }
      console.log(`Created ${reservations.length} PMS reservations`);

      // 5. Create PMS import record
      await db.collection("organizations").doc(orgId)
        .collection("pmsImports").doc(IMPORT_ID)
        .set({
          id: IMPORT_ID,
          source: { type: "opera_xml", fileName: "KensingtonGrand_Reservations_Export.xml" },
          fileHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          importedAt: daysAgo(1),
          importedBy: "user_kg_2",
          reservationCount: 15,
          folioCount: 15,
          activityLogCount: reservations.reduce((s, r) => s + r.data.activityLogs.length, 0),
          warnings: [],
          rowsParsed: 15,
          rowsSkipped: 0,
        });
      console.log("Created PMS import record");

      // 6. Create demo user
      await db.collection("users").doc("pitch_demo_user").set({
        name: "Eleanor Hughes",
        email: "e.hughes@kensingtongrand.co.uk",
        role: "user",
        organizationId: orgId,
        hotelName: ORG_NAME,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Created demo user");

      console.log("=== Pitch Demo Seed: complete ===");

      res.status(200).json({
        success: true,
        organizationId: orgId,
        message: `Created ${ORG_NAME} with ${createdDisputes.length} disputes, ${reservations.length} PMS reservations, and 1 user`,
        disputes: createdDisputes,
      });
    } catch (error: any) {
      console.error("Pitch demo seed failed:", error);
      res.status(500).json({ error: "Failed to seed pitch demo", details: error.message });
    }
  }
);

// ============================================================================
// Audit trail builder
// ============================================================================

function buildAuditTrail(d: DisputeSeed) {
  const trail: any[] = [
    {
      timestamp: ts(daysAgo(d.daysAgoCreated)),
      title: "Dispute Received",
      description: `${d.psp === "stripe" ? "Stripe" : "Adyen"} dispute for £${(d.amountPence / 100).toFixed(2)} — ${d.reason.replace(/_/g, " ")}`,
      status: "success",
      category: "dispute_received",
    },
  ];

  if (d.lifecycleStatus !== "new") {
    trail.push({
      timestamp: ts(daysAgo(d.daysAgoCreated - 1)),
      title: "PMS Data Matched",
      description: `Reservation matched via card ending ${d.last4}`,
      status: "success",
      category: "pms_matching",
    });
    trail.push({
      timestamp: ts(daysAgo(d.daysAgoCreated - 1)),
      title: "Evidence Plan Generated",
      description: "AI analysed the dispute and created an evidence collection plan",
      status: "success",
      category: "evidence_planning",
    });
  }

  if (["evidence_in_progress", "draft_ready", "submitted", "won", "lost"].includes(d.lifecycleStatus)) {
    trail.push({
      timestamp: ts(daysAgo(d.daysAgoCreated - 2)),
      title: "Evidence Uploaded",
      description: "Team uploaded supporting documents",
      status: "success",
      category: "evidence_upload",
    });
  }

  if (["draft_ready", "submitted", "won", "lost"].includes(d.lifecycleStatus)) {
    trail.push({
      timestamp: ts(daysAgo(d.daysAgoCreated - 3)),
      title: "Argument Draft Generated",
      description: "AI generated a dispute response argument based on collected evidence",
      status: "success",
      category: "argument_generation",
    });
  }

  if (["submitted", "won", "lost"].includes(d.lifecycleStatus)) {
    trail.push({
      timestamp: ts(daysAgo(d.daysAgoCreated - 4)),
      title: "Response Submitted",
      description: `Dispute response submitted to ${d.psp === "stripe" ? "Stripe" : "Adyen"}`,
      status: "success",
      category: "submission",
    });
  }

  if (d.lifecycleStatus === "won") {
    trail.push({
      timestamp: ts(daysAgo(5)),
      title: "Dispute Won",
      description: `Bank ruled in favour of the hotel — £${(d.amountPence / 100).toFixed(2)} recovered`,
      status: "success",
      category: "status_change",
    });
  }

  if (d.lifecycleStatus === "lost") {
    trail.push({
      timestamp: ts(daysAgo(5)),
      title: "Dispute Lost",
      description: `Bank ruled in favour of the cardholder — £${(d.amountPence / 100).toFixed(2)} lost`,
      status: "failure",
      category: "status_change",
    });
  }

  return trail;
}
