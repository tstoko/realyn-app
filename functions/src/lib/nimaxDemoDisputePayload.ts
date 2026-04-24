/**
 * Shared Nimax Theatres demo dispute definitions and Firestore payloads
 * for seedNimaxDemo script + seedNimaxDemoHandler.
 */

import * as admin from "firebase-admin";

export interface DemoDispute {
  reason: string;
  description: string;
  amount: number;
  state: string;
}

export const DEMO_DISPUTES: DemoDispute[] = [
  {
    reason: "product_not_received",
    description:
      "Customer claims e-tickets for Harry Potter and the Cursed Child at the Palace Theatre were never delivered",
    amount: 19500,
    state: "new",
  },
  {
    reason: "credit_not_processed",
    description:
      "Customer claims refund for cancelled performance of The Producers at the Garrick Theatre was not processed",
    amount: 14000,
    state: "ai_plan_generated",
  },
  {
    reason: "general",
    description:
      "Customer disputes premium stalls seat upgrade charge for Hadestown at the Lyric Theatre",
    amount: 32000,
    state: "evidence_uploaded",
  },
  {
    reason: "duplicate",
    description:
      "Customer claims they were charged twice for a SIX group booking at the Vaudeville Theatre",
    amount: 28500,
    state: "argument_ready",
  },
  {
    reason: "product_unacceptable",
    description:
      "Customer claims restricted-view seats for The Play That Goes Wrong at the Duchess Theatre were misrepresented at booking",
    amount: 11000,
    state: "submitted",
  },
  {
    reason: "product_not_received",
    description:
      "Customer claimed e-tickets for Who's Afraid of Virginia Woolf? were invalid — resolved in our favour with venue scan logs",
    amount: 15500,
    state: "won",
  },
  {
    reason: "fraudulent",
    description:
      "Cardholder claims transaction for 4x stalls tickets to I'm Sorry, Prime Minister at the Apollo Theatre was unauthorised",
    amount: 22000,
    state: "lost",
  },
];

export function stripeStatusFor(state: string): string {
  if (state === "won") return "won";
  if (state === "lost") return "lost";
  if (state === "submitted") return "under_review";
  return "needs_response";
}

export function internalStatusFor(state: string): string {
  switch (state) {
    case "new":
      return "needs_review";
    case "ai_plan_generated":
    case "evidence_uploaded":
      return "awaiting_docs";
    case "argument_ready":
      return "ready_to_submit";
    case "submitted":
      return "submitted";
    case "won":
    case "lost":
      return "resolved";
    default:
      return "needs_review";
  }
}

export function lifecycleStatusFor(state: string): string {
  switch (state) {
    case "new":
      return "new";
    case "ai_plan_generated":
      return "plan_ready";
    case "evidence_uploaded":
      return "evidence_in_progress";
    case "argument_ready":
      return "draft_ready";
    case "submitted":
      return "submitted";
    case "won":
      return "won";
    case "lost":
      return "lost";
    default:
      return "new";
  }
}

function humanReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    product_not_received: "Product not received",
    credit_not_processed: "Credit not processed",
    general: "General",
    duplicate: "Duplicate",
    product_unacceptable: "Product unacceptable",
    fraudulent: "Fraudulent",
  };
  return labels[reason] ?? reason.replace(/_/g, " ");
}

interface PlanParts {
  summary: string;
  recommendation: "fight" | "accept";
  winnability: "high" | "medium" | "low";
  winnabilityReason: string;
  requirements: Record<string, unknown>[];
  commsNaNote: string;
  uploadedEvidence: { requirementId: string; fileName: string }[];
}

function planPartsForDispute(d: DemoDispute): PlanParts {
  const claim = d.description;

  if (d.reason === "product_not_received" && d.state === "won") {
    return {
      summary: `${claim}. Theatre ticketing: present valid ticket issuance, venue door-scan data, and Nimax T&Cs covering invalid-ticket claims.`,
      recommendation: "fight",
      winnability: "high",
      winnabilityReason:
        "Venue door-scan logs and box office order metadata usually disprove 'invalid ticket' claims when the buyer completed checkout on nimaxtheatres.com.",
      requirements: [
        {
          id: "nimax_pnr_won_scan",
          category: "delivery",
          label: "Venue scan or door-entry evidence",
          tag: "Fulfillment",
          description:
            "Export proof the ticket was scanned at the theatre entrance (QR scan timestamp, door-entry log, or front-of-house confirmation).",
          example: "CSV of scan events from the venue system for this booking reference.",
          required: true,
          priority: 1,
        },
        {
          id: "nimax_pnr_won_policy",
          category: "policy",
          label: "Nimax ticketing terms and chargeback clause",
          tag: "Policy",
          description:
            "Checkout terms and show-specific rules describing when tickets are void, non-transferable, or subject to dispute.",
          example: "PDF of Nimax Ticketing Terms & Conditions the email address agreed to at purchase, with final-sale clauses highlighted.",
          required: true,
          priority: 2,
        },
        {
          id: "nimax_pnr_won_comm",
          category: "communications",
          label: "Customer communications",
          tag: "Comms",
          description:
            "Box office or email correspondence about delivery, access issues, or refund offers tied to this booking.",
          example: "Email thread showing the buyer acknowledged receipt or declined support steps offered by box office staff.",
          required: false,
          priority: 3,
        },
      ],
      commsNaNote:
        "Support history is attached under the policy pack; no separate correspondence thread was required for this closure.",
      uploadedEvidence: [
        { requirementId: "nimax_pnr_won_scan", fileName: "nimax_venue_scan_log.pdf" },
        { requirementId: "nimax_pnr_won_policy", fileName: "nimax_ticketing_terms.pdf" },
      ],
    };
  }

  switch (d.reason) {
    case "product_not_received":
      return {
        summary: `${claim}. Focus on e-ticket delivery proof (email confirmation, box office system), venue access logs, and Nimax T&Cs accepted at checkout.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Theatre box offices often win when they can tie the buyer email to a delivered e-ticket and show venue access was available.",
        requirements: [
          {
            id: "nimax_pnr_delivery",
            category: "delivery",
            label: "Proof of e-ticket delivery",
            tag: "Fulfillment",
            description:
              "Show the customer received e-tickets or could access the booking (confirmation email, mobile ticket link, box office collection record).",
            example: "Order confirmation email with barcode plus delivery timestamp from the Nimax booking system.",
            required: true,
            priority: 1,
          },
          {
            id: "nimax_pnr_policy",
            category: "policy",
            label: "Refund and exchange policy",
            tag: "Policy",
            description:
              "Published Nimax terms for refunds, exchanges, and chargebacks that apply to this ticket purchase.",
            example: "Checkout terms PDF with no-refund clause for West End performances agreed at purchase.",
            required: true,
            priority: 2,
          },
          {
            id: "nimax_pnr_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Emails or box office correspondence about ticket delivery, show changes, or support resolution.",
            example: "Thread confirming the buyer opened the e-ticket link or collected tickets at the box office.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No long-form support thread on file for this booking; outreach was limited to the automated confirmation email.",
        uploadedEvidence: [
          { requirementId: "nimax_pnr_delivery", fileName: "nimax_booking_confirmation.pdf" },
          { requirementId: "nimax_pnr_policy", fileName: "nimax_refund_policy.pdf" },
        ],
      };

    case "credit_not_processed":
      return {
        summary: `${claim}. Evidence should trace refund eligibility, payout timing, and any customer communications about the credit for the cancelled show.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Box office ledgers showing the refund was initiated (or not owed under Nimax policy) are persuasive to issuers for cancelled performances.",
        requirements: [
          {
            id: "nimax_cnp_ledger",
            category: "payment_data",
            label: "Refund / credit ledger",
            tag: "Payments",
            description:
              "Box office or PSP export showing refund initiation, processing status, or ineligibility for this booking.",
            example: "Stripe balance transaction list filtered to this payment intent and any linked refunds.",
            required: true,
            priority: 1,
          },
          {
            id: "nimax_cnp_policy",
            category: "policy",
            label: "Cancellation and refund rules",
            tag: "Policy",
            description:
              "Nimax terms covering cancelled performances, processing windows, and chargeback responsibilities.",
            example: "Performance cancellation notice plus policy clause on refund timelines for West End shows.",
            required: true,
            priority: 2,
          },
          {
            id: "nimax_cnp_comm",
            category: "communications",
            label: "Refund communications",
            tag: "Comms",
            description:
              "Messages to the buyer explaining refund status, processing delays, or eligibility decisions.",
            example: "Email from Nimax box office stating the refund was processed on a specific date.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Refund status was communicated through the automated cancellation email from Nimax box office only.",
        uploadedEvidence: [
          { requirementId: "nimax_cnp_ledger", fileName: "nimax_refund_ledger.pdf" },
          { requirementId: "nimax_cnp_policy", fileName: "nimax_cancellation_policy.pdf" },
        ],
      };

    case "general":
      return {
        summary: `${claim}. Tie the premium seat upgrade line item to checkout consent on nimaxtheatres.com, the booking receipt, and fulfilment of the upgraded seating.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Seat upgrades at West End theatres usually have a clear line item, price difference, and acknowledgement step that supports the merchant.",
        requirements: [
          {
            id: "nimax_gen_order",
            category: "pms_data",
            label: "Booking and upgrade breakdown",
            tag: "Order",
            description:
              "Itemised receipt showing the base ticket, premium stalls upgrade, booking fee, and buyer email used at checkout.",
            example: "Nimax booking export including seat section, row, and upgrade tier for this transaction.",
            required: true,
            priority: 1,
          },
          {
            id: "nimax_gen_policy",
            category: "policy",
            label: "Upgrade and checkout terms",
            tag: "Policy",
            description:
              "Terms covering seat upgrades, add-ons, and final-sale language shown before payment on nimaxtheatres.com.",
            example: "Screenshot of the checkout step where the upgrade fee is itemised and confirmed by the buyer.",
            required: true,
            priority: 2,
          },
          {
            id: "nimax_gen_comm",
            category: "communications",
            label: "Upgrade-related communications",
            tag: "Comms",
            description:
              "Emails or notifications confirming the seat upgrade purchase and updated seating details.",
            example: "Confirmation email listing the upgraded stalls seats sent immediately after purchase.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Upgrade confirmation was included in the same booking email; no separate correspondence thread exists.",
        uploadedEvidence: [
          { requirementId: "nimax_gen_order", fileName: "nimax_upgrade_receipt.pdf" },
          { requirementId: "nimax_gen_policy", fileName: "nimax_checkout_terms.pdf" },
        ],
      };

    case "duplicate":
      return {
        summary: `${claim}. Demonstrate separate authorisations or distinct bookings rather than a mistaken double charge for a single group booking.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Two legitimate charges with unique booking references, amounts, or timestamps typically defeat duplicate disputes for theatre tickets.",
        requirements: [
          {
            id: "nimax_dup_charges",
            category: "payment_data",
            label: "Authorisation and settlement detail",
            tag: "Payments",
            description:
              "PSP view of each charge with auth code, amount, timestamp, and descriptor to prove they are not identical retries.",
            example: "Side-by-side payment intents with different IDs for two separate Nimax bookings.",
            required: true,
            priority: 1,
          },
          {
            id: "nimax_dup_orders",
            category: "pms_data",
            label: "Matching booking records",
            tag: "Orders",
            description:
              "Two booking confirmations (or one group booking plus an additional date) proving the cardholder consented to both transactions.",
            example: "Nimax box office export of bookings for the buyer email in the dispute date range.",
            required: true,
            priority: 2,
          },
          {
            id: "nimax_dup_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Messages showing the buyer knew about both charges (e.g. separate booking confirmations for different show dates).",
            example: "Confirmation emails for Booking A and Booking B delivered to the same email address.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Both booking confirmations were issued automatically; the buyer did not query the duplicate before filing the chargeback.",
        uploadedEvidence: [
          { requirementId: "nimax_dup_charges", fileName: "nimax_both_charges.pdf" },
          { requirementId: "nimax_dup_orders", fileName: "nimax_two_booking_confirmations.pdf" },
        ],
      };

    case "product_unacceptable":
      return {
        summary: `${claim}. Show seat map accuracy, booking flow transparency, and published restricted-view disclaimers accepted at checkout.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Restricted-view disputes hinge on whether the theatre disclosed the limitation before purchase; Nimax seat maps and disclaimers usually cover this.",
        requirements: [
          {
            id: "nimax_pu_seatmap",
            category: "pms_data",
            label: "Seat map and restricted-view disclosure",
            tag: "Fulfillment",
            description:
              "Screenshot or export of the seat selection page showing the restricted-view indicator for the purchased seats.",
            example: "Nimax seat map for the Duchess Theatre with restricted-view markers on the selected seats.",
            required: true,
            priority: 1,
          },
          {
            id: "nimax_pu_policy",
            category: "policy",
            label: "Restricted-view and booking terms",
            tag: "Policy",
            description:
              "Published terms covering restricted-view seats, seat descriptions, and the non-refundable nature of discounted restricted-view tickets.",
            example: "Nimax Ticketing Terms & Conditions section on restricted-view seats and buyer acknowledgement at checkout.",
            required: true,
            priority: 2,
          },
          {
            id: "nimax_pu_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Box office emails or correspondence about the seat complaint, exchange offers, or resolution attempts.",
            example: "Email thread where box office offered alternative seats or a future credit that the buyer declined.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Buyer did not contact the box office before filing the chargeback; no support thread on record.",
        uploadedEvidence: [
          { requirementId: "nimax_pu_seatmap", fileName: "nimax_seatmap_restricted_view.pdf" },
          { requirementId: "nimax_pu_policy", fileName: "nimax_restricted_view_terms.pdf" },
        ],
      };

    case "fraudulent":
      return {
        summary: `${claim}. Provide fraud signals evaluated: device continuity, prior bookings, e-ticket delivery channel, and 3DS/SCA if used.`,
        recommendation: "accept",
        winnability: "low",
        winnabilityReason:
          "Issuer fraud decisions can go against the merchant even with strong authentication logs; set expectations accordingly.",
        requirements: [
          {
            id: "nimax_fr_risk",
            category: "payment_data",
            label: "Risk and authentication signals",
            tag: "Risk",
            description:
              "PSP risk score, 3DS/SCA result, AVS/CVC checks, device fingerprint, and IP consistency for the checkout session.",
            example: "Stripe Radar or equivalent export for the disputed payment on nimaxtheatres.com.",
            required: true,
            priority: 1,
          },
          {
            id: "nimax_fr_history",
            category: "pms_data",
            label: "Account and booking history",
            tag: "History",
            description:
              "Evidence the same email, device, or card successfully booked West End shows before or after this transaction.",
            example: "List of prior settled Nimax bookings for the customer account within 12 months.",
            required: true,
            priority: 2,
          },
          {
            id: "nimax_fr_comm",
            category: "communications",
            label: "Delivery channel proof",
            tag: "Comms",
            description:
              "Proof e-tickets or booking confirmations went to an address or device controlled by the accountholder.",
            example: "E-ticket delivery log showing confirmation sent to the verified email on file.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No separate fraud investigation thread; signals pulled from PSP and Nimax booking history.",
        uploadedEvidence: [
          { requirementId: "nimax_fr_risk", fileName: "nimax_risk_and_3ds_export.pdf" },
          { requirementId: "nimax_fr_history", fileName: "nimax_account_booking_history.pdf" },
        ],
      };

    default:
      return planPartsForDispute({
        ...d,
        reason: "product_not_received",
        description: claim,
      });
  }
}

function buildEvidencePlanForDispute(d: DemoDispute): Record<string, unknown> {
  const parts = planPartsForDispute(d);
  return {
    disputeCategory: "Ticketing",
    disputeSubtype: humanReasonLabel(d.reason),
    reasonCode: d.reason,
    network: "visa",
    recommendation: parts.recommendation,
    winnability: parts.winnability,
    winnabilityReason: parts.winnabilityReason,
    requirements: parts.requirements,
    summary: parts.summary,
    generatedAt: new Date().toISOString(),
  };
}

function buildEvidenceItemsUploaded(d: DemoDispute): Record<string, unknown>[] {
  const parts = planPartsForDispute(d);
  const optionalComm = parts.requirements.find(
    (r) => (r as { category?: string }).category === "communications",
  ) as { id: string } | undefined;

  const items: Record<string, unknown>[] = parts.uploadedEvidence.map((u) => ({
    requirementId: u.requirementId,
    status: "uploaded",
    fileName: u.fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: "System",
  }));

  if (optionalComm) {
    items.push({
      requirementId: optionalComm.id,
      status: "not_applicable",
      notes: parts.commsNaNote,
    });
  }

  return items;
}

function buildArgumentDraftForDispute(d: DemoDispute): Record<string, unknown> | null {
  const iso = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

  if (d.reason === "duplicate") {
    const parts = planPartsForDispute(d);
    const refCharge = (parts.requirements[0] as { id: string }).id;
    const refOrders = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `Nimax Theatres is contesting this duplicate chargeback: ${d.description} ` +
        `The cardholder completed two separate bookings; each has a distinct authorisation, amount, and booking record in the Nimax box office system. ` +
        `We are submitting payment and booking evidence showing there was no erroneous double billing for a single transaction.`,
      timeline: [
        {
          date: iso(18),
          description: "Buyer placed the first group booking via nimaxtheatres.com; confirmation and e-tickets delivered.",
        },
        {
          date: iso(11),
          description: "Buyer placed a second booking for additional tickets or a different performance date; separate payment succeeded.",
        },
        {
          date: iso(3),
          description: "Chargeback filed as duplicate; Nimax box office compiled PSP and booking evidence for submission.",
        },
      ],
      paragraphs: [
        {
          heading: "Two valid charges",
          content:
            `The amounts in dispute correspond to two consented checkouts on nimaxtheatres.com, not a retry of the same payment. ` +
            `The attached authorisation records show different network transaction IDs and timestamps.`,
          evidenceReferences: [refCharge],
        },
        {
          heading: "Booking records",
          content:
            `Each charge maps to its own booking reference and seat allocation in the Nimax system. ` +
            `The buyer received separate booking confirmations, which undermines a duplicate-billing claim for a single purchase.`,
          evidenceReferences: [refOrders],
        },
      ],
      customerClaimRebuttal:
        `The cardholder's duplicate claim does not match the two legitimate bookings tied to this account and card on the Nimax platform.`,
      conclusion:
        `We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing booking records.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.reason === "product_unacceptable") {
    const parts = planPartsForDispute(d);
    const refSeatmap = (parts.requirements[0] as { id: string }).id;
    const refTerms = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `Nimax Theatres is responding to a dispute about restricted-view seats: ${d.description} ` +
        `The restricted-view status was clearly disclosed during seat selection on nimaxtheatres.com, and the buyer acknowledged the terms before completing payment. ` +
        `We provide the seat map disclosure and booking terms that govern restricted-view ticket purchases.`,
      timeline: [
        {
          date: iso(25),
          description: "Buyer selected restricted-view seats on nimaxtheatres.com; seat map displayed restricted-view indicator before checkout.",
        },
        {
          date: iso(20),
          description: "Show attended at the Duchess Theatre; no complaint raised to front-of-house staff during the performance.",
        },
        {
          date: iso(5),
          description: "Chargeback filed citing product not as described; Nimax compiled seat map and policy evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "Seat map disclosure",
          content:
            `The Nimax online booking system marks restricted-view seats with a clear visual indicator on the interactive seat map. ` +
            `The buyer selected these seats with the restricted-view label visible and proceeded through checkout.`,
          evidenceReferences: [refSeatmap],
        },
        {
          heading: "Booking terms and acknowledgement",
          content:
            `Nimax Ticketing Terms & Conditions describe restricted-view seats and state they are non-refundable once purchased. ` +
            `The buyer accepted these terms as part of the checkout flow.`,
          evidenceReferences: [refTerms],
        },
      ],
      customerClaimRebuttal:
        `The restricted-view nature of the seats was disclosed before purchase. The product was delivered exactly as described in the booking.`,
      conclusion:
        `We respectfully request that the issuer find in favour of the merchant. The restricted-view status was transparently disclosed and accepted at checkout.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.state === "won" && d.reason === "product_not_received") {
    const parts = planPartsForDispute(d);
    const refScan = (parts.requirements[0] as { id: string }).id;
    const refPolicy = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `This case concerned an "invalid ticket" chargeback: ${d.description} ` +
        `Nimax showed the ticket was issued correctly, scanned at the theatre entrance, and that checkout terms covered the scenario. ` +
        `The issuer resolved the dispute in the merchant's favour based on fulfilment and policy evidence.`,
      timeline: [
        {
          date: iso(22),
          description: "Booking completed on nimaxtheatres.com; e-tickets delivered to the verified email address.",
        },
        {
          date: iso(9),
          description: "Venue door-scan logs confirm ticket redemption at the theatre for the disputed performance.",
        },
        {
          date: iso(1),
          description: "Issuer closed the dispute as merchant prevailed after reviewing the attached evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "Valid fulfilment",
          content:
            `The disputed payment corresponds to tickets that were fulfilled and used as designed. ` +
            `Door-scan data from the theatre ties the buyer to attendance, contradicting an "invalid ticket" narrative.`,
          evidenceReferences: [refScan],
        },
        {
          heading: "Terms and buyer acknowledgement",
          content:
            `Published Nimax terms describe when tickets are void, non-transferable, or ineligible for chargebacks. ` +
            `The buyer accepted those terms at checkout on nimaxtheatres.com.`,
          evidenceReferences: [refPolicy],
        },
      ],
      customerClaimRebuttal:
        `The record shows a legitimate purchase and successful venue entry; the invalid-ticket claim is not supported by operational data.`,
      conclusion:
        `This outcome reflects strong ticketing evidence: clear e-ticket delivery, venue scan validation, and contract terms aligned with the charge.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.state === "lost" && d.reason === "fraudulent") {
    const parts = planPartsForDispute(d);
    const refRisk = (parts.requirements[0] as { id: string }).id;
    const refHistory = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `Unauthorised transaction claim: ${d.description} ` +
        `Nimax submitted PSP risk data, authentication outcomes, and prior booking history for the same account. ` +
        `Issuer fraud rules still favoured the cardholder; this row reflects that terminal outcome while preserving the evidence package for review.`,
      timeline: [
        {
          date: iso(16),
          description: "Payment authorised on nimaxtheatres.com; risk checks and e-ticket delivery to account email completed.",
        },
        {
          date: iso(5),
          description: "Chargeback received as fraudulent; Nimax compiled risk export and booking history.",
        },
        {
          date: iso(1),
          description: "Issuer resolved dispute for cardholder despite merchant submission.",
        },
      ],
      paragraphs: [
        {
          heading: "Risk and authentication",
          content:
            `We documented the session's risk score, 3DS/SCA result where applicable, and AVS/CVC alignment. ` +
            `These signals indicated a consistent, customer-initiated checkout on nimaxtheatres.com.`,
          evidenceReferences: [refRisk],
        },
        {
          heading: "Account continuity",
          content:
            `The same profile and payment method had prior successful West End ticket purchases through Nimax, supporting that this charge was not an isolated spoof.`,
          evidenceReferences: [refHistory],
        },
      ],
      customerClaimRebuttal:
        `While the cardholder disputes authorisation, the account and delivery trail show a pattern of legitimate use on the Nimax platform.`,
      conclusion:
        `We respect the issuer's final decision. This closed case remains useful internally to calibrate fraud narratives and evidence depth for similar disputes.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  return null;
}

export function buildNimaxDisputeFirestoreData(
  d: DemoDispute,
  index: number,
  organizationId: string,
  tsNow: admin.firestore.Timestamp,
  respondByDate: Date,
): Record<string, unknown> {
  const dateNow = new Date();
  const ts = Date.now() + index;
  const staggerMs = index * 125_000;
  const createdAt = admin.firestore.Timestamp.fromMillis(tsNow.toMillis() - staggerMs);
  const updatedAt = admin.firestore.Timestamp.fromMillis(createdAt.toMillis() + 60_000 + index * 30_000);
  const respondByStaggered = admin.firestore.Timestamp.fromDate(
    new Date(respondByDate.getTime() + index * 4 * 60 * 60 * 1000),
  );

  const base: Record<string, unknown> = {
    organizationId,
    pspProvider: "stripe",
    pspDisputeId: `du_nimax_${d.reason}_${ts}`,
    pspPaymentId: `pi_nimax_${ts}`,
    pspTransactionDate: admin.firestore.Timestamp.fromDate(
      new Date(dateNow.getTime() - (14 + index) * 24 * 60 * 60 * 1000),
    ),
    pspLast4Digits: String(4000 + index).slice(-4),

    amount: d.amount,
    currency: "gbp",
    reason: d.reason,
    status: stripeStatusFor(d.state),
    customerExplanation: d.description,

    createdAt,
    updatedAt,
    respondBy: respondByStaggered,

    internalStatus: internalStatusFor(d.state),
    lifecycleStatus: lifecycleStatusFor(d.state),
    automationStatus: "manual_review",
    useAIPlan: true,
    merchantVertical: "ticketing",

    auditTrail: [
      {
        timestamp: createdAt,
        title: "Dispute Created",
        description: `${d.reason} dispute — ${d.description}`,
        status: "success",
      },
    ],
  };

  const plan = buildEvidencePlanForDispute(d);
  const items = buildEvidenceItemsUploaded(d);
  const draft = buildArgumentDraftForDispute(d);

  const withAi = (state: string): Record<string, unknown> => {
    if (state === "ai_plan_generated") {
      return {
        ...base,
        evidencePlan: plan,
        evidencePlanGeneratedAt: createdAt,
        evidenceItems: [],
        argumentDraft: null,
      };
    }
    if (state === "evidence_uploaded") {
      return {
        ...base,
        evidencePlan: plan,
        evidencePlanGeneratedAt: createdAt,
        evidenceItems: items,
        argumentDraft: null,
      };
    }
    if (state === "argument_ready") {
      return {
        ...base,
        evidencePlan: plan,
        evidencePlanGeneratedAt: createdAt,
        evidenceItems: items,
        argumentDraft: draft,
        argumentDraftGeneratedAt: createdAt,
      };
    }
    if (state === "submitted") {
      const submittedAt = admin.firestore.Timestamp.fromMillis(
        createdAt.toMillis() - 2 * 24 * 60 * 60 * 1000,
      );
      return {
        ...base,
        evidencePlan: plan,
        evidencePlanGeneratedAt: createdAt,
        evidenceItems: items,
        argumentDraft: draft,
        argumentDraftGeneratedAt: draft ? createdAt : null,
        argumentSubmittedAt: draft ? submittedAt : null,
      };
    }
    if (state === "won" || state === "lost") {
      const closedDraft = buildArgumentDraftForDispute(d);
      const submittedAt = admin.firestore.Timestamp.fromMillis(
        createdAt.toMillis() - 3 * 24 * 60 * 60 * 1000,
      );
      return {
        ...base,
        evidencePlan: plan,
        evidencePlanGeneratedAt: createdAt,
        evidenceItems: items,
        argumentDraft: closedDraft,
        argumentDraftGeneratedAt: closedDraft ? createdAt : null,
        argumentSubmittedAt: closedDraft ? submittedAt : null,
      };
    }
    return {
      ...base,
      evidencePlan: null,
      evidenceItems: [],
      argumentDraft: null,
    };
  };

  return withAi(d.state);
}
