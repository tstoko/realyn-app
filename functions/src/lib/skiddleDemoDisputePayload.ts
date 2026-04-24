/**
 * Shared Skiddle demo dispute definitions and Firestore payloads
 * for seedSkiddleDemo script + seedSkiddleDemoHandler.
 *
 * All scenarios are ticketing-industry disputes (e-tickets, refunds, seat maps, gate scans).
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
      "Customer claims mobile tickets for a Parklife weekend pass purchased on Skiddle were never delivered to their account or email",
    amount: 18900,
    state: "new",
  },
  {
    reason: "credit_not_processed",
    description:
      "Customer claims refund for a postponed Warehouse Project club night at Depot Mayfield was not processed after using Cool:Off",
    amount: 4250,
    state: "ai_plan_generated",
  },
  {
    reason: "general",
    description:
      "Customer disputes a premium 'Fast Track' queue-jump add-on for a Saturday session at Fabric London shown as a separate line item",
    amount: 1850,
    state: "evidence_uploaded",
  },
  {
    reason: "duplicate",
    description:
      "Customer claims they were charged twice for a single group booking to a comedy show at Manchester Academy via Skiddle",
    amount: 9600,
    state: "argument_ready",
  },
  {
    reason: "product_unacceptable",
    description:
      "Customer claims 'restricted view' balcony seats for a gig at O2 Academy Leeds were misrepresented in the Skiddle seat map at checkout",
    amount: 7800,
    state: "submitted",
  },
  {
    reason: "product_not_received",
    description:
      "Customer claimed festival e-tickets were invalid at the gate — resolved in Skiddle's favour with Skiddle Access / venue scan data",
    amount: 13200,
    state: "won",
  },
  {
    reason: "fraudulent",
    description:
      "Cardholder claims the purchase of four Creamfields weekend camping tickets on Skiddle was unauthorised",
    amount: 89600,
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
      summary: `${claim}. Festival / club ticketing: show ticket issuance, Skiddle Access or venue scan redemption, and Skiddle T&Cs for invalid-ticket claims.`,
      recommendation: "fight",
      winnability: "high",
      winnabilityReason:
        "Scan logs and order metadata from Skiddle's platform usually disprove 'invalid ticket' claims when checkout completed on skiddle.com.",
      requirements: [
        {
          id: "skiddle_pnr_won_scan",
          category: "delivery",
          label: "Venue or gate scan evidence",
          tag: "Fulfillment",
          description:
            "Export proof the ticket was scanned at entry (QR scan timestamp, access control log, or promoter door-list confirmation).",
          example: "Skiddle Access scan export or venue CSV for this order reference.",
          required: true,
          priority: 1,
        },
        {
          id: "skiddle_pnr_won_policy",
          category: "policy",
          label: "Skiddle terms and chargeback clause",
          tag: "Policy",
          description:
            "Checkout terms covering e-ticket delivery, resale (Re:Sell), Cool:Off, and when tickets are void or non-transferable.",
          example: "PDF of Skiddle purchase terms agreed at checkout with final-sale / festival clauses highlighted.",
          required: true,
          priority: 2,
        },
        {
          id: "skiddle_pnr_won_comm",
          category: "communications",
          label: "Customer communications",
          tag: "Comms",
          description:
            "Skiddle or promoter messages about delivery, app login, or support offered before the dispute.",
          example: "Email or in-app notification showing the buyer accessed tickets or declined support steps.",
          required: false,
          priority: 3,
        },
      ],
      commsNaNote:
        "Support was limited to automated ticket delivery and help-centre links; no extended thread was required for closure.",
      uploadedEvidence: [
        { requirementId: "skiddle_pnr_won_scan", fileName: "skiddle_access_scan_log.pdf" },
        { requirementId: "skiddle_pnr_won_policy", fileName: "skiddle_terms_checkout.pdf" },
      ],
    };
  }

  switch (d.reason) {
    case "product_not_received":
      return {
        summary: `${claim}. Focus on mobile ticket delivery (Skiddle account, email, SMS), order confirmation, and fulfilment logs from skiddle.com.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Ticketing platforms often win when they tie the buyer to a delivered mobile ticket and show the order was fulfilled before the event.",
        requirements: [
          {
            id: "skiddle_pnr_delivery",
            category: "delivery",
            label: "Proof of ticket delivery",
            tag: "Fulfillment",
            description:
              "Show the customer received tickets in-app, by email, or could collect at box office (delivery timestamps, open events).",
            example: "Skiddle order export with ticket generation time and email/SMS delivery status.",
            required: true,
            priority: 1,
          },
          {
            id: "skiddle_pnr_policy",
            category: "policy",
            label: "Refund, Cool:Off, and delivery policy",
            tag: "Policy",
            description:
              "Published Skiddle terms for e-tickets, refunds, Cool:Off windows, and chargebacks that apply to this purchase.",
            example: "Help-centre or checkout terms PDF with delivery and dispute language for festival tickets.",
            required: true,
            priority: 2,
          },
          {
            id: "skiddle_pnr_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Messages about ticket access, event changes, or support before the chargeback.",
            example: "Thread showing the buyer opened the Skiddle ticket link or contacted help before disputing.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No long-form support thread; buyer received standard order confirmation and pre-event reminders only.",
        uploadedEvidence: [
          { requirementId: "skiddle_pnr_delivery", fileName: "skiddle_order_delivery_log.pdf" },
          { requirementId: "skiddle_pnr_policy", fileName: "skiddle_refund_cooloff_policy.pdf" },
        ],
      };

    case "credit_not_processed":
      return {
        summary: `${claim}. Evidence should trace Cool:Off / refund eligibility, payout timing, and Skiddle–promoter settlement for the postponed event.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Ledgers showing refund initiation or policy-based ineligibility (e.g. outside Cool:Off) are persuasive for postponed club nights.",
        requirements: [
          {
            id: "skiddle_cnp_ledger",
            category: "payment_data",
            label: "Refund / credit ledger",
            tag: "Payments",
            description:
              "PSP or Skiddle finance export showing refund status, partial refund, or no refund owed under terms.",
            example: "Stripe balance transactions for this payment intent and linked refunds.",
            required: true,
            priority: 1,
          },
          {
            id: "skiddle_cnp_policy",
            category: "policy",
            label: "Postponement and Cool:Off rules",
            tag: "Policy",
            description:
              "Skiddle terms for postponed events, customer refund windows, and promoter-led decisions.",
            example: "Policy excerpt on Cool:Off eligibility and processing time for club events.",
            required: true,
            priority: 2,
          },
          {
            id: "skiddle_cnp_comm",
            category: "communications",
            label: "Refund communications",
            tag: "Comms",
            description:
              "Emails or in-app messages explaining refund status, delays, or eligibility.",
            example: "Skiddle email stating refund processed or that Cool:Off had expired.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Refund status was communicated via Skiddle's automated postponement notification only.",
        uploadedEvidence: [
          { requirementId: "skiddle_cnp_ledger", fileName: "skiddle_refund_ledger.pdf" },
          { requirementId: "skiddle_cnp_policy", fileName: "skiddle_postponement_policy.pdf" },
        ],
      };

    case "general":
      return {
        summary: `${claim}. Tie the add-on line item to checkout consent on skiddle.com, the itemised receipt, and fulfilment of the queue-jump product.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Named add-ons at checkout usually have a clear price, label, and acknowledgement step that supports the merchant.",
        requirements: [
          {
            id: "skiddle_gen_order",
            category: "pms_data",
            label: "Order and add-on breakdown",
            tag: "Order",
            description:
              "Itemised receipt showing base ticket, Fast Track add-on, booking fee, and buyer email.",
            example: "Skiddle order export with add-on SKU and price for this transaction.",
            required: true,
            priority: 1,
          },
          {
            id: "skiddle_gen_policy",
            category: "policy",
            label: "Add-on and checkout terms",
            tag: "Policy",
            description:
              "Terms covering optional extras, fees, and final-sale language before payment.",
            example: "Screenshot of checkout step where Fast Track is listed and confirmed.",
            required: true,
            priority: 2,
          },
          {
            id: "skiddle_gen_comm",
            category: "communications",
            label: "Add-on related communications",
            tag: "Comms",
            description:
              "Confirmation email or app notification listing the purchased add-on.",
            example: "Order confirmation listing Fast Track for Fabric London.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Add-on was listed in the same confirmation email as the main ticket; no separate thread.",
        uploadedEvidence: [
          { requirementId: "skiddle_gen_order", fileName: "skiddle_addon_receipt.pdf" },
          { requirementId: "skiddle_gen_policy", fileName: "skiddle_checkout_terms.pdf" },
        ],
      };

    case "duplicate":
      return {
        summary: `${claim}. Demonstrate separate authorisations or distinct orders rather than a double capture for one booking.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Two charges with unique Skiddle order IDs, amounts, or timestamps typically defeat duplicate disputes.",
        requirements: [
          {
            id: "skiddle_dup_charges",
            category: "payment_data",
            label: "Authorisation and settlement detail",
            tag: "Payments",
            description:
              "PSP view of each charge with auth code, amount, timestamp, and descriptor.",
            example: "Side-by-side payment intents with different IDs for two Skiddle checkouts.",
            required: true,
            priority: 1,
          },
          {
            id: "skiddle_dup_orders",
            category: "pms_data",
            label: "Matching order records",
            tag: "Orders",
            description:
              "Two order confirmations proving the cardholder consented to both transactions.",
            example: "Skiddle export of orders for the buyer email in the dispute window.",
            required: true,
            priority: 2,
          },
          {
            id: "skiddle_dup_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Messages showing awareness of both charges (e.g. two confirmations for different dates or group sizes).",
            example: "Two Skiddle confirmation emails to the same address.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Both confirmations were automated; the buyer did not query duplicate charges before the chargeback.",
        uploadedEvidence: [
          { requirementId: "skiddle_dup_charges", fileName: "skiddle_both_payments.pdf" },
          { requirementId: "skiddle_dup_orders", fileName: "skiddle_two_orders.pdf" },
        ],
      };

    case "product_unacceptable":
      return {
        summary: `${claim}. Show seat map / tier accuracy, restricted-view labelling, and checkout transparency on skiddle.com.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Restricted-view disputes hinge on disclosure before purchase; Skiddle seat maps and tier copy usually address this.",
        requirements: [
          {
            id: "skiddle_pu_seatmap",
            category: "pms_data",
            label: "Seat map or tier disclosure",
            tag: "Fulfillment",
            description:
              "Screenshot or export of the booking flow showing restricted view or balcony tier description for the seats sold.",
            example: "Skiddle seat selection with 'restricted view' label on the chosen balcony block.",
            required: true,
            priority: 1,
          },
          {
            id: "skiddle_pu_policy",
            category: "policy",
            label: "Viewing experience and refund terms",
            tag: "Policy",
            description:
              "Published terms for seat descriptions, sightlines, and non-refundable discounted tiers.",
            example: "Skiddle / event terms section on restricted-view seating.",
            required: true,
            priority: 2,
          },
          {
            id: "skiddle_pu_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Support or promoter correspondence about the seat complaint before chargeback.",
            example: "Thread where Skiddle support explained tier description or offered a goodwill option.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Buyer did not contact Skiddle support before filing the chargeback.",
        uploadedEvidence: [
          { requirementId: "skiddle_pu_seatmap", fileName: "skiddle_seatmap_restricted.pdf" },
          { requirementId: "skiddle_pu_policy", fileName: "skiddle_viewing_terms.pdf" },
        ],
      };

    case "fraudulent":
      return {
        summary: `${claim}. Provide fraud signals: device continuity, prior Skiddle orders, ticket delivery channel, and 3DS/SCA if used.`,
        recommendation: "accept",
        winnability: "low",
        winnabilityReason:
          "Issuer fraud outcomes can favour the cardholder even with strong authentication data.",
        requirements: [
          {
            id: "skiddle_fr_risk",
            category: "payment_data",
            label: "Risk and authentication signals",
            tag: "Risk",
            description:
              "PSP risk score, 3DS/SCA result, AVS/CVC, device fingerprint, IP consistency.",
            example: "Stripe Radar export for the disputed skiddle.com checkout.",
            required: true,
            priority: 1,
          },
          {
            id: "skiddle_fr_history",
            category: "pms_data",
            label: "Account and order history",
            tag: "History",
            description:
              "Same email, device, or card used for other successful Skiddle purchases.",
            example: "List of prior settled orders for the Skiddle account within 12 months.",
            required: true,
            priority: 2,
          },
          {
            id: "skiddle_fr_comm",
            category: "communications",
            label: "Delivery channel proof",
            tag: "Comms",
            description:
              "Proof tickets or confirmations went to an address or device tied to the accountholder.",
            example: "Delivery log showing confirmation to verified email.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No separate fraud case file; data pulled from PSP and Skiddle order history.",
        uploadedEvidence: [
          { requirementId: "skiddle_fr_risk", fileName: "skiddle_risk_3ds_export.pdf" },
          { requirementId: "skiddle_fr_history", fileName: "skiddle_account_history.pdf" },
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
        `Skiddle is contesting this duplicate chargeback: ${d.description} ` +
        `The cardholder completed two separate orders; each has a distinct authorisation, amount, and order record in Skiddle's system. ` +
        `We submit payment and order evidence showing there was no erroneous double billing for a single checkout.`,
      timeline: [
        {
          date: iso(18),
          description: "Buyer placed the first group order on skiddle.com; confirmation and mobile tickets issued.",
        },
        {
          date: iso(11),
          description: "Buyer placed a second order (additional tickets or different performance); separate payment succeeded.",
        },
        {
          date: iso(3),
          description: "Chargeback filed as duplicate; Skiddle compiled PSP and order evidence for submission.",
        },
      ],
      paragraphs: [
        {
          heading: "Two valid charges",
          content:
            `The disputed amounts correspond to two consented checkouts on skiddle.com, not a retry of the same payment. ` +
            `Authorisation records show different network transaction IDs and timestamps.`,
          evidenceReferences: [refCharge],
        },
        {
          heading: "Order records",
          content:
            `Each charge maps to its own Skiddle order reference. ` +
            `The buyer received separate confirmations, which undermines a duplicate-billing claim for one purchase.`,
          evidenceReferences: [refOrders],
        },
      ],
      customerClaimRebuttal:
        `The duplicate claim does not match the two legitimate orders tied to this account and card on Skiddle.`,
      conclusion:
        `We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing order records.`,
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
        `Skiddle is responding to a dispute about seat / viewing claims: ${d.description} ` +
        `The restricted-view or balcony tier was disclosed during selection on skiddle.com, and the buyer acknowledged the terms before payment. ` +
        `We provide the booking-flow disclosure and terms governing viewing experience.`,
      timeline: [
        {
          date: iso(25),
          description: "Buyer selected seats on skiddle.com; tier or restricted-view label shown before checkout.",
        },
        {
          date: iso(20),
          description: "Event attended at O2 Academy Leeds; no front-of-house complaint logged during the show.",
        },
        {
          date: iso(5),
          description: "Chargeback filed; Skiddle compiled seat map and policy evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "Booking flow disclosure",
          content:
            `Skiddle's checkout surfaces seat tier and viewing information before payment. ` +
            `The buyer proceeded with full visibility of the balcony / restricted-view designation.`,
          evidenceReferences: [refSeatmap],
        },
        {
          heading: "Terms and acknowledgement",
          content:
            `Skiddle terms describe seat categories, sightlines, and when tickets are non-refundable. ` +
            `The buyer accepted those terms as part of checkout.`,
          evidenceReferences: [refTerms],
        },
      ],
      customerClaimRebuttal:
        `The viewing tier was disclosed before purchase. The tickets matched the described product.`,
      conclusion:
        `We request that the issuer find in favour of the merchant. Disclosure and acceptance at checkout support Skiddle's position.`,
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
        `Skiddle showed correct ticket issuance, redemption via Skiddle Access / venue scans, and terms covering the scenario. ` +
        `The issuer resolved in the merchant's favour.`,
      timeline: [
        {
          date: iso(22),
          description: "Order completed on skiddle.com; mobile tickets delivered to the verified account.",
        },
        {
          date: iso(9),
          description: "Scan logs confirm ticket redemption at the festival gate for the disputed order.",
        },
        {
          date: iso(1),
          description: "Issuer closed the dispute as merchant prevailed after reviewing fulfilment evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "Valid fulfilment",
          content:
            `The payment corresponds to tickets that were issued and redeemed as designed. ` +
            `Scan data ties the buyer to entry, contradicting an "invalid ticket" narrative.`,
          evidenceReferences: [refScan],
        },
        {
          heading: "Terms and buyer acknowledgement",
          content:
            `Published Skiddle terms describe delivery, resale, and when chargebacks are not permitted. ` +
            `The buyer accepted those terms at checkout on skiddle.com.`,
          evidenceReferences: [refPolicy],
        },
      ],
      customerClaimRebuttal:
        `The record shows a legitimate purchase and successful entry; the invalid-ticket claim is not supported by operational data.`,
      conclusion:
        `This outcome reflects strong ticketing evidence: delivery, scan validation, and contract terms aligned with the charge.`,
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
        `Skiddle submitted PSP risk data, authentication outcomes, and prior order history for the same account. ` +
        `The issuer still favoured the cardholder; this row preserves the evidence package for internal review.`,
      timeline: [
        {
          date: iso(16),
          description: "Payment authorised on skiddle.com; risk checks and ticket delivery to account email completed.",
        },
        {
          date: iso(5),
          description: "Chargeback received as fraudulent; Skiddle compiled risk export and order history.",
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
            `We documented the session's risk score, 3DS/SCA where applicable, and AVS/CVC alignment. ` +
            `These indicated a customer-initiated checkout on skiddle.com.`,
          evidenceReferences: [refRisk],
        },
        {
          heading: "Account continuity",
          content:
            `The same profile and payment method had prior successful Skiddle purchases, supporting that this charge was not an isolated spoof.`,
          evidenceReferences: [refHistory],
        },
      ],
      customerClaimRebuttal:
        `While the cardholder disputes authorisation, the account and delivery trail show legitimate use on Skiddle.`,
      conclusion:
        `We respect the issuer's final decision. This closed case helps calibrate fraud narratives for similar festival and high-value orders.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  return null;
}

export function buildSkiddleDisputeFirestoreData(
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
    pspDisputeId: `du_skiddle_${d.reason}_${ts}`,
    pspPaymentId: `pi_skiddle_${ts}`,
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
