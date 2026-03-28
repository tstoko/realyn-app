/**
 * Shared DICE demo dispute definitions and Firestore payloads for seedDiceDemo script + seedDiceDemoHandler.
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
    description: "Customer claims ticket was never delivered",
    amount: 8500,
    state: "new",
  },
  {
    reason: "credit_not_processed",
    description: "Customer claims refund for cancelled event was not processed",
    amount: 12000,
    state: "ai_plan_generated",
  },
  {
    reason: "general",
    description: "Customer disputes charge for VIP upgrade",
    amount: 25000,
    state: "evidence_uploaded",
  },
  {
    reason: "duplicate",
    description: "Customer claims they were charged twice for the same event",
    amount: 15000,
    state: "argument_ready",
  },
  {
    reason: "subscription_canceled",
    description:
      "Customer claims DICE+ membership charged after they turned off auto-renew before the renewal date",
    amount: 2999,
    state: "submitted",
  },
  {
    reason: "product_not_received",
    description: "Customer claimed ticket was invalid — resolved in our favor",
    amount: 9500,
    state: "won",
  },
  {
    reason: "fraudulent",
    description: "Cardholder claims transaction was unauthorized",
    amount: 17500,
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
    subscription_canceled: "Subscription cancelled",
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
      summary: `${claim}. Ticketing: show valid ticket issuance, redemption or scan data, and terms covering invalid claims.`,
      recommendation: "fight",
      winnability: "high",
      winnabilityReason:
        "Venue redemption logs and order metadata usually disprove ‘invalid ticket’ claims when the buyer completed checkout.",
      requirements: [
        {
          id: "dice_pnr_won_redemption",
          category: "delivery",
          label: "Redemption or scan evidence",
          tag: "Fulfillment",
          description:
            "Export proof the ticket was valid at the event (QR scan time, door entry log, or partner venue confirmation).",
          example: "CSV of scan events for this order ID alongside the ticket token.",
          required: true,
          priority: 1,
        },
        {
          id: "dice_pnr_won_policy",
          category: "policy",
          label: "Terms for invalid ticket and chargeback claims",
          tag: "Policy",
          description:
            "Checkout terms and event-specific rules describing when tickets are void, transferred, or disputed.",
          example: "PDF of checkout terms the email address agreed to, with highlight on final-sale clauses.",
          required: true,
          priority: 2,
        },
        {
          id: "dice_pnr_won_comm",
          category: "communications",
          label: "Buyer communications",
          tag: "Comms",
          description:
            "Support or in-app messages about delivery, access issues, or refund offers tied to this order.",
          example: "Zendesk export or inbox thread showing the buyer acknowledged receipt or declined support steps.",
          required: false,
          priority: 3,
        },
      ],
      commsNaNote:
        "Support history is attached under policy pack; no separate thread was required for this closure.",
      uploadedEvidence: [
        { requirementId: "dice_pnr_won_redemption", fileName: "dice_venue_scan_log_order.pdf" },
        { requirementId: "dice_pnr_won_policy", fileName: "dice_invalid_ticket_terms.pdf" },
      ],
    };
  }

  switch (d.reason) {
    case "product_not_received":
      return {
        summary: `${claim}. Focus on delivery proof (email/app), access logs, and terms the buyer accepted at checkout.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Ticket platforms often win when they can tie the buyer email to a delivered ticket and show access was available.",
        requirements: [
          {
            id: "dice_pnr_delivery",
            category: "delivery",
            label: "Proof of ticket delivery or access",
            tag: "Fulfillment",
            description:
              "Show the customer received tickets or could access the event (confirmation email, in-app wallet, QR redemption log).",
            example: "Order confirmation with barcode plus delivery timestamp from your messaging provider.",
            required: true,
            priority: 1,
          },
          {
            id: "dice_pnr_policy",
            category: "policy",
            label: "Refund and cancellation policy",
            tag: "Policy",
            description:
              "Published terms for refunds, exchanges, and chargebacks that apply to this ticket purchase.",
            example: "Checkout terms PDF and event-specific no-refund clause agreed at purchase.",
            required: true,
            priority: 2,
          },
          {
            id: "dice_pnr_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Emails or in-app messages about delivery, event changes, or support resolution.",
            example: "Thread confirming the buyer opened the ticket link or collected wristbands.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No long-form support thread on file for this order; outreach was limited to automated delivery emails.",
        uploadedEvidence: [
          { requirementId: "dice_pnr_delivery", fileName: "dice_ticket_confirmation_demo.pdf" },
          { requirementId: "dice_pnr_policy", fileName: "dice_terms_checkout_demo.pdf" },
        ],
      };

    case "credit_not_processed":
      return {
        summary: `${claim}. Evidence should trace refund eligibility, payout timing, and any customer comms about the credit.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Ledgers showing the refund or credit was initiated (or not owed) under your policy are persuasive to issuers.",
        requirements: [
          {
            id: "dice_cnp_ledger",
            category: "payment_data",
            label: "Refund / credit ledger",
            tag: "Payments",
            description:
              "Accounting or PSP export showing refund initiation, failure, or ineligibility for this order.",
            example: "Stripe balance transaction list filtered to this payment intent and any linked refunds.",
            required: true,
            priority: 1,
          },
          {
            id: "dice_cnp_policy",
            category: "policy",
            label: "Cancellation and refund rules",
            tag: "Policy",
            description:
              "Terms covering cancelled events, processing windows, and chargeback responsibilities.",
            example: "Event cancellation email plus policy clause on refund timelines.",
            required: true,
            priority: 2,
          },
          {
            id: "dice_cnp_comm",
            category: "communications",
            label: "Refund communications",
            tag: "Comms",
            description:
              "Messages to the buyer explaining refund status, delays, or eligibility decisions.",
            example: "Email stating the refund was processed on a specific date or that the event was non-refundable.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Refund status was communicated through the automated cancellation email only.",
        uploadedEvidence: [
          { requirementId: "dice_cnp_ledger", fileName: "dice_refund_ledger_export.pdf" },
          { requirementId: "dice_cnp_policy", fileName: "dice_event_cancellation_policy.pdf" },
        ],
      };

    case "general":
      return {
        summary: `${claim}. Tie the upgrade line item to checkout consent, order receipt, and fulfilment of the upsell.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "VIP upgrades usually have a clear cart line, price, and acknowledgement step that supports the merchant.",
        requirements: [
          {
            id: "dice_gen_order",
            category: "pms_data",
            label: "Order and upgrade breakdown",
            tag: "Order",
            description:
              "Itemised receipt showing base ticket, VIP upgrade, taxes, and buyer email used at checkout.",
            example: "Order export including SKU or tier name for the upgrade.",
            required: true,
            priority: 1,
          },
          {
            id: "dice_gen_policy",
            category: "policy",
            label: "Upsell and checkout terms",
            tag: "Policy",
            description:
              "Terms covering add-ons, upgrades, and final sale language shown before payment.",
            example: "Screenshot of checkout step where the upgrade fee is itemised and confirmed.",
            required: true,
            priority: 2,
          },
          {
            id: "dice_gen_comm",
            category: "communications",
            label: "Upgrade-related communications",
            tag: "Comms",
            description:
              "Emails or push notifications confirming the upgrade purchase or perks unlocked.",
            example: "Message listing VIP perks sent immediately after purchase.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Upgrade confirmation was delivered in the same order email; no separate thread exists.",
        uploadedEvidence: [
          { requirementId: "dice_gen_order", fileName: "dice_vip_upgrade_receipt.pdf" },
          { requirementId: "dice_gen_policy", fileName: "dice_checkout_terms_vip.pdf" },
        ],
      };

    case "duplicate":
      return {
        summary: `${claim}. Demonstrate separate authorisations or distinct purchases rather than a mistaken double charge.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Two legitimate charges with unique IDs, amounts, or timestamps typically defeat duplicate disputes.",
        requirements: [
          {
            id: "dice_dup_charges",
            category: "payment_data",
            label: "Authorisation and settlement detail",
            tag: "Payments",
            description:
              "PSP view of each charge with auth code, amount, timestamp, and descriptor to prove they are not identical retries.",
            example: "Side-by-side screenshots of two payment intents with different IDs for two ticket orders.",
            required: true,
            priority: 1,
          },
          {
            id: "dice_dup_orders",
            category: "pms_data",
            label: "Matching order records",
            tag: "Orders",
            description:
              "Two order confirmations (or one order plus an add-on) proving the cardholder consented twice.",
            example: "CSV of orders for the buyer email on the dispute date range.",
            required: true,
            priority: 2,
          },
          {
            id: "dice_dup_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Messages showing the buyer knew about both charges (e.g. receipts for two separate events or orders).",
            example: "Emails for Order A and Order B delivered to the same address.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Both receipts were issued automatically; buyer did not raise duplicate query before chargeback.",
        uploadedEvidence: [
          { requirementId: "dice_dup_charges", fileName: "dice_statement_both_charges.pdf" },
          { requirementId: "dice_dup_orders", fileName: "dice_two_order_confirmations.pdf" },
        ],
      };

    case "subscription_canceled":
      return {
        summary: `${claim}. Show DICE+ renewal terms, billing cycle cut-off, and when auto-renew was toggled.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Membership renewals often hinge on whether cancellation met the stated notice window before the billing date.",
        requirements: [
          {
            id: "dice_sub_billing",
            category: "payment_data",
            label: "Membership billing timeline",
            tag: "Billing",
            description:
              "Invoices or subscription events showing renewal date, charge amount, and when auto-renew changed.",
            example: "Stripe subscription timeline export with cancel-at-period-end flag timestamps.",
            required: true,
            priority: 1,
          },
          {
            id: "dice_sub_terms",
            category: "policy",
            label: "DICE+ membership terms",
            tag: "Policy",
            description:
              "Published rules for renewal, cancellation windows, and refunds for membership fees.",
            example: "Membership terms PDF highlighting when changes take effect.",
            required: true,
            priority: 2,
          },
          {
            id: "dice_sub_comm",
            category: "communications",
            label: "Renewal and cancellation emails",
            tag: "Comms",
            description:
              "Emails confirming upcoming renewal, successful charge, or acknowledgement of cancellation request.",
            example: "Email sent before renewal summarising next billing date and how to cancel.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Renewal notice was sent to the account email; no additional ticket support thread applies.",
        uploadedEvidence: [
          { requirementId: "dice_sub_billing", fileName: "dice_plus_subscription_timeline.pdf" },
          { requirementId: "dice_sub_terms", fileName: "dice_plus_membership_terms.pdf" },
        ],
      };

    case "fraudulent":
      return {
        summary: `${claim}. Provide fraud signals you evaluated: device continuity, prior purchases, delivery channel, and 3DS if used.`,
        recommendation: "accept",
        winnability: "low",
        winnabilityReason:
          "Issuer fraud decisions can go against the merchant even with good logs; set expectations accordingly.",
        requirements: [
          {
            id: "dice_fr_risk",
            category: "payment_data",
            label: "Risk and authentication signals",
            tag: "Risk",
            description:
              "PSP risk score, 3DS result, AVS/CVC checks, device fingerprint, and IP consistency for the session.",
            example: "Stripe Radar or equivalent export for the disputed payment.",
            required: true,
            priority: 1,
          },
          {
            id: "dice_fr_history",
            category: "pms_data",
            label: "Account and purchase history",
            tag: "History",
            description:
              "Evidence the same email, device, or card successfully bought tickets before or after this order.",
            example: "List of prior settled orders for the customer account within 12 months.",
            required: true,
            priority: 2,
          },
          {
            id: "dice_fr_comm",
            category: "communications",
            label: "Delivery channel proof",
            tag: "Comms",
            description:
              "Proof tickets or receipts went to an address or device controlled by the accountholder.",
            example: "Delivery log for order confirmation to the verified email.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No separate fraud investigation thread; signals pulled from PSP and account history.",
        uploadedEvidence: [
          { requirementId: "dice_fr_risk", fileName: "dice_risk_and_3ds_export.pdf" },
          { requirementId: "dice_fr_history", fileName: "dice_account_order_history.pdf" },
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
        `DICE is contesting this duplicate chargeback: ${d.description} ` +
        `The cardholder completed two separate purchases; each has a distinct authorisation, amount, and order record. ` +
        `We are submitting payment and order evidence showing there was no erroneous double billing for a single transaction.`,
      timeline: [
        {
          date: iso(18),
          description: "Buyer placed first order for the earlier show date; confirmation and receipt delivered.",
        },
        {
          date: iso(11),
          description: "Buyer placed a second order for a different event or add-on; separate payment succeeded.",
        },
        {
          date: iso(3),
          description: "Chargeback filed as duplicate; DICE compiled PSP and order evidence for submission.",
        },
      ],
      paragraphs: [
        {
          heading: "Two valid charges",
          content:
            `The amounts in dispute correspond to two consented checkouts, not a retry of the same payment. ` +
            `The attached authorisation records show different network transaction IDs and timestamps.`,
          evidenceReferences: [refCharge],
        },
        {
          heading: "Order records",
          content:
            `Each charge maps to its own order ID and ticket package. ` +
            `The buyer received separate confirmations, which undermines a duplicate-billing claim for a single purchase.`,
          evidenceReferences: [refOrders],
        },
      ],
      customerClaimRebuttal:
        `The cardholder’s duplicate claim does not match the two legitimate orders tied to this account and card.`,
      conclusion:
        `We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing records.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.reason === "subscription_canceled") {
    const parts = planPartsForDispute(d);
    const refBill = (parts.requirements[0] as { id: string }).id;
    const refTerms = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `DICE is responding to a dispute on a DICE+ membership renewal: ${d.description} ` +
        `The renewal charge applied under the membership terms and the billing cycle in effect when the subscriber turned off auto-renew. ` +
        `We provide the subscription timeline and terms that govern effective cancellation dates.`,
      timeline: [
        {
          date: iso(35),
          description: "Customer subscribed to DICE+; terms presented renewal and cancellation rules.",
        },
        {
          date: iso(8),
          description: "Customer disabled auto-renew; change logged after the cut-off for the current renewal period.",
        },
        {
          date: iso(2),
          description: "Scheduled renewal charge posted per membership agreement; dispute opened thereafter.",
        },
      ],
      paragraphs: [
        {
          heading: "Billing and cancellation timing",
          content:
            `The disputed charge is the scheduled membership renewal. ` +
            `The subscriber’s change to auto-renew took effect under the terms for the following period, not retroactively for the cycle already in progress.`,
          evidenceReferences: [refBill],
        },
        {
          heading: "Membership terms",
          content:
            `DICE+ terms describe renewal dates, notice windows, and how charges apply when auto-renew is switched off. ` +
            `Those terms were available and accepted when the membership began.`,
          evidenceReferences: [refTerms],
        },
      ],
      customerClaimRebuttal:
        `The cardholder’s expectation does not override the agreed renewal schedule and cut-off communicated in the membership terms.`,
      conclusion:
        `We respectfully request that the issuer find in favour of the merchant. The renewal was valid and disclosed under DICE+ terms.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.state === "won" && d.reason === "product_not_received") {
    const parts = planPartsForDispute(d);
    const refRedemption = (parts.requirements[0] as { id: string }).id;
    const refPolicy = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `This case concerned an “invalid ticket” chargeback: ${d.description} ` +
        `DICE showed the ticket was issued correctly, redeemed or scanned at the venue, and that checkout terms covered the scenario. ` +
        `The issuer resolved the dispute in the merchant’s favour based on fulfilment and policy evidence.`,
      timeline: [
        {
          date: iso(22),
          description: "Order completed; ticket delivered to verified email and wallet.",
        },
        {
          date: iso(9),
          description: "Venue scan logs show redemption at doors for the disputed event.",
        },
        {
          date: iso(1),
          description: "Issuer closed the dispute as merchant prevailed after review of attached evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "Valid fulfilment",
          content:
            `The disputed payment corresponds to a ticket that was fulfilled and used as designed. ` +
            `Redemption or scan data ties the buyer to attendance, contradicting an “invalid ticket” narrative.`,
          evidenceReferences: [refRedemption],
        },
        {
          heading: "Terms and buyer acknowledgement",
          content:
            `Published terms describe when tickets are void, transferable, or ineligible for chargebacks. ` +
            `The buyer accepted those terms at checkout.`,
          evidenceReferences: [refPolicy],
        },
      ],
      customerClaimRebuttal:
        `The record shows a legitimate purchase and successful access; the invalid-ticket claim is not supported by operational data.`,
      conclusion:
        `This outcome reflects strong ticketing evidence: clear delivery, venue validation, and contract terms aligned with the charge.`,
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
        `Unauthorized transaction claim: ${d.description} ` +
        `DICE submitted PSP risk data, authentication outcomes, and prior purchase history for the same account. ` +
        `Issuer fraud rules still favoured the cardholder; this row reflects that terminal outcome while preserving the evidence package for review.`,
      timeline: [
        {
          date: iso(16),
          description: "Payment authorised; Radar / risk checks and delivery to account email completed.",
        },
        {
          date: iso(5),
          description: "Chargeback received as fraudulent; merchant compiled risk export and order history.",
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
            `We documented the session’s risk score, 3DS or SCA result where applicable, and AVS/CVC alignment. ` +
            `These signals indicated a consistent, customer-initiated checkout.`,
          evidenceReferences: [refRisk],
        },
        {
          heading: "Account continuity",
          content:
            `The same profile and payment method had prior successful ticket purchases, supporting that this charge was not an isolated spoof.`,
          evidenceReferences: [refHistory],
        },
      ],
      customerClaimRebuttal:
        `While the cardholder disputes authorisation, the account and delivery trail show a pattern of legitimate use on this platform.`,
      conclusion:
        `We respect the issuer’s final decision. This closed case remains useful internally to calibrate fraud narratives and evidence depth for similar disputes.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  return null;
}

export function buildDiceDisputeFirestoreData(
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
    pspDisputeId: `du_dice_${d.reason}_${ts}`,
    pspPaymentId: `pi_dice_${ts}`,
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
