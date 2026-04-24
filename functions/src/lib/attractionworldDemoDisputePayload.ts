/**
 * Shared Attraction World Group demo dispute definitions and Firestore payloads
 * for seedAttractionworldDemo script + seedAttractionworldDemoHandler.
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
      "Reseller claims Universal Orlando park e-tickets delivered via the AWG API never appeared in their agent portal",
    amount: 42800,
    state: "new",
  },
  {
    reason: "credit_not_processed",
    description:
      "Customer claims refund for a cancelled London Eye experience booked through an AWG-connected OTA was never processed",
    amount: 18900,
    state: "ai_plan_generated",
  },
  {
    reason: "general",
    description:
      "Customer disputes the bundled fast-track upgrade line item on a Disneyland Paris booking fulfilled through AWG distribution",
    amount: 35600,
    state: "evidence_uploaded",
  },
  {
    reason: "duplicate",
    description:
      "Cardholder claims they were charged twice for a single Alton Towers family bundle purchased via a white-label AWG checkout",
    amount: 21200,
    state: "argument_ready",
  },
  {
    reason: "product_unacceptable",
    description:
      "Customer says the Thorpe Park date on their confirmation does not match the slot they selected at checkout on the partner site",
    amount: 16400,
    state: "submitted",
  },
  {
    reason: "product_not_received",
    description:
      "Guest claimed LEGOLAND Windsor mobile QR was invalid at entry — resolved in our favour with turnstile scan and API issuance logs",
    amount: 19800,
    state: "won",
  },
  {
    reason: "fraudulent",
    description:
      "Cardholder claims the transaction for Warner Bros. Studio Tour London tickets distributed through AWG was unauthorised",
    amount: 27900,
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
      summary: `${claim}. Attraction distribution: present API issuance timestamps, barcode delivery to the partner channel, and venue turnstile scan data.`,
      recommendation: "fight",
      winnability: "high",
      winnabilityReason:
        "AWG's real-time connectivity and scan logs usually disprove 'invalid ticket' claims when the barcode was issued and redeemed at the attraction.",
      requirements: [
        {
          id: "awg_pnr_won_scan",
          category: "delivery",
          label: "Venue turnstile or gate scan evidence",
          tag: "Fulfillment",
          description:
            "Export proof the experience ticket or barcode was scanned at attraction entry (timestamp, gate ID, or access control log).",
          example: "CSV of scan events from the attraction's access system for this AWG booking reference.",
          required: true,
          priority: 1,
        },
        {
          id: "awg_pnr_won_policy",
          category: "policy",
          label: "AWG distribution and fulfilment terms",
          tag: "Policy",
          description:
            "Terms covering barcode validity, non-transferable experiences, and chargeback responsibilities for API-distributed inventory.",
          example: "PDF of partner/distribution T&Cs the booking channel agreed to, with final-sale clauses highlighted.",
          required: true,
          priority: 2,
        },
        {
          id: "awg_pnr_won_comm",
          category: "communications",
          label: "Partner or guest communications",
          tag: "Comms",
          description:
            "Correspondence about delivery, access issues, or support steps offered via the reseller or AWG support.",
          example: "Email thread showing the guest declined re-send of the mobile ticket or troubleshooting steps.",
          required: false,
          priority: 3,
        },
      ],
      commsNaNote:
        "Resolution relied on scan and issuance data; no extended support thread was filed before the chargeback.",
      uploadedEvidence: [
        { requirementId: "awg_pnr_won_scan", fileName: "awg_legoland_turnstile_log.pdf" },
        { requirementId: "awg_pnr_won_policy", fileName: "awg_distribution_terms.pdf" },
      ],
    };
  }

  switch (d.reason) {
    case "product_not_received":
      return {
        summary: `${claim}. Focus on API webhook delivery, booking confirmation payload, reseller portal audit trail, and AWG connectivity logs.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "B2B distribution wins often hinge on proving the partner API acknowledged ticket issuance and the inventory was committed in real time.",
        requirements: [
          {
            id: "awg_pnr_delivery",
            category: "delivery",
            label: "Proof of ticket issuance to partner",
            tag: "Fulfillment",
            description:
              "API response, webhook delivery log, or portal export showing barcodes/vouchers were generated and exposed to the reseller.",
            example: "AWG Connect API transaction log with HTTP 200 and voucher IDs for the disputed order.",
            required: true,
            priority: 1,
          },
          {
            id: "awg_pnr_policy",
            category: "policy",
            label: "Fulfilment and delivery policy",
            tag: "Policy",
            description:
              "Published terms for API partners on ticket delivery, retries, and liability when confirmation is returned successfully.",
            example: "Partner agreement clause stating fulfilment is complete upon successful API confirmation.",
            required: true,
            priority: 2,
          },
          {
            id: "awg_pnr_comm",
            category: "communications",
            label: "Partner communications",
            tag: "Comms",
            description:
              "Support tickets or emails between AWG and the reseller about portal sync or delivery issues.",
            example: "Thread where the partner confirmed receipt of the booking payload before the chargeback.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No escalated partner ticket on file; fulfilment completed via standard API response only.",
        uploadedEvidence: [
          { requirementId: "awg_pnr_delivery", fileName: "awg_api_issuance_log.pdf" },
          { requirementId: "awg_pnr_policy", fileName: "awg_partner_fulfilment_policy.pdf" },
        ],
      };

    case "credit_not_processed":
      return {
        summary: `${claim}. Trace cancellation eligibility, refund routing through the OTA partner, and PSP credit timing for the experience booking.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Ledger exports showing refund initiation or partner responsibility under AWG cancellation rules are persuasive for experience chargebacks.",
        requirements: [
          {
            id: "awg_cnp_ledger",
            category: "payment_data",
            label: "Refund / credit ledger",
            tag: "Payments",
            description:
              "PSP or finance export showing refund initiation, processing status, or pass-through to the selling partner.",
            example: "Stripe balance transactions filtered to this payment intent and linked refunds.",
            required: true,
            priority: 1,
          },
          {
            id: "awg_cnp_policy",
            category: "policy",
            label: "Experience cancellation rules",
            tag: "Policy",
            description:
              "Attraction-specific cancellation windows and whether refunds flow via AWG or the reseller of record.",
            example: "London Eye cancellation policy plus AWG distribution clause on refund responsibility.",
            required: true,
            priority: 2,
          },
          {
            id: "awg_cnp_comm",
            category: "communications",
            label: "Refund communications",
            tag: "Comms",
            description:
              "Messages to the buyer or partner explaining refund status, delays, or ineligibility.",
            example: "Email confirming refund processed to the original payment method on a specific date.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Refund status was communicated through the OTA's automated cancellation email only.",
        uploadedEvidence: [
          { requirementId: "awg_cnp_ledger", fileName: "awg_refund_ledger.pdf" },
          { requirementId: "awg_cnp_policy", fileName: "awg_experience_cancellation_policy.pdf" },
        ],
      };

    case "general":
      return {
        summary: `${claim}. Tie the fast-track bundle line item to checkout itemisation, partner white-label flow, and the experience product master data from AWG.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Bundled add-ons in omnichannel distribution usually have explicit SKU mapping and price breakdown in the API basket response.",
        requirements: [
          {
            id: "awg_gen_order",
            category: "pms_data",
            label: "Basket and line-item breakdown",
            tag: "Order",
            description:
              "Itemised confirmation showing base admission, fast-track upgrade, fees, and currency from the AWG booking snapshot.",
            example: "API basket export with product IDs and EUR amounts for Disneyland Paris components.",
            required: true,
            priority: 1,
          },
          {
            id: "awg_gen_policy",
            category: "policy",
            label: "Add-on and checkout terms",
            tag: "Policy",
            description:
              "Terms covering optional extras, bundled products, and acknowledgement before payment on the partner checkout.",
            example: "Screenshot of checkout step listing the fast-track fee with buyer confirmation.",
            required: true,
            priority: 2,
          },
          {
            id: "awg_gen_comm",
            category: "communications",
            label: "Booking communications",
            tag: "Comms",
            description:
              "Confirmation email or app notification listing the fast-track product the customer purchased.",
            example: "OTA confirmation PDF mirroring the AWG product description for the upgrade.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "The upgrade appeared in the same confirmation as base tickets; no separate email thread exists.",
        uploadedEvidence: [
          { requirementId: "awg_gen_order", fileName: "awg_basket_line_items.pdf" },
          { requirementId: "awg_gen_policy", fileName: "awg_checkout_terms.pdf" },
        ],
      };

    case "duplicate":
      return {
        summary: `${claim}. Show two distinct authorisations or separate basket checkouts rather than a retry duplicate for one family bundle.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Unique payment intents and booking references for each checkout typically defeat duplicate disputes in API-driven sales.",
        requirements: [
          {
            id: "awg_dup_charges",
            category: "payment_data",
            label: "Authorisation and settlement detail",
            tag: "Payments",
            description:
              "PSP view of each charge with auth code, amount, timestamp, and descriptor proving they are not identical retries.",
            example: "Side-by-side payment intents with different IDs for two AWG-fulfilled orders.",
            required: true,
            priority: 1,
          },
          {
            id: "awg_dup_orders",
            category: "pms_data",
            label: "Matching booking records",
            tag: "Orders",
            description:
              "Two booking confirmations or distinct product instances proving the cardholder consented to both transactions.",
            example: "AWG order export for the buyer email in the dispute window showing two Alton Towers bundles.",
            required: true,
            priority: 2,
          },
          {
            id: "awg_dup_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Messages showing awareness of both charges (e.g. two confirmation emails for different visit dates).",
            example: "Partner-branded confirmations for Order A and Order B to the same address.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Both confirmations were issued automatically; the buyer did not query duplicate billing before the chargeback.",
        uploadedEvidence: [
          { requirementId: "awg_dup_charges", fileName: "awg_both_payment_intents.pdf" },
          { requirementId: "awg_dup_orders", fileName: "awg_two_booking_refs.pdf" },
        ],
      };

    case "product_unacceptable":
      return {
        summary: `${claim}. Show the selected experience date/time in the checkout session, API payload immutability after confirmation, and attraction calendar rules.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Date disputes turn on whether the partner UI and AWG API transmitted the same slot the customer confirmed; session logs help.",
        requirements: [
          {
            id: "awg_pu_session",
            category: "pms_data",
            label: "Checkout session and API payload",
            tag: "Fulfillment",
            description:
              "Export of the slot ID and visit date submitted in the final booking request versus the confirmation returned.",
            example: "AWG API request/response pair showing 10 June Thorpe Park slot locked at purchase.",
            required: true,
            priority: 1,
          },
          {
            id: "awg_pu_policy",
            category: "policy",
            label: "Date change and accuracy terms",
            tag: "Policy",
            description:
              "Terms covering selected dates, non-refundable experience windows, and buyer responsibility to verify confirmation.",
            example: "Partner checkout terms requiring the customer to confirm the visit date before payment.",
            required: true,
            priority: 2,
          },
          {
            id: "awg_pu_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Support correspondence about date changes, rebooking offers, or complaints before the chargeback.",
            example: "Email where support explained the confirmed date matched the submitted basket.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Guest did not contact support before filing; no pre-dispute thread on record.",
        uploadedEvidence: [
          { requirementId: "awg_pu_session", fileName: "awg_thorpe_api_session.pdf" },
          { requirementId: "awg_pu_policy", fileName: "awg_date_selection_terms.pdf" },
        ],
      };

    case "fraudulent":
      return {
        summary: `${claim}. Provide fraud signals: device continuity, prior experience bookings, 3DS/SCA, and delivery to the account email.`,
        recommendation: "accept",
        winnability: "low",
        winnabilityReason:
          "Issuer fraud decisions can favour the cardholder even with strong merchant evidence; set expectations accordingly.",
        requirements: [
          {
            id: "awg_fr_risk",
            category: "payment_data",
            label: "Risk and authentication signals",
            tag: "Risk",
            description:
              "PSP risk score, 3DS/SCA result, AVS/CVC checks, device fingerprint, and IP consistency for checkout.",
            example: "Stripe Radar export for the disputed Studio Tour payment.",
            required: true,
            priority: 1,
          },
          {
            id: "awg_fr_history",
            category: "pms_data",
            label: "Account and booking history",
            tag: "History",
            description:
              "Evidence the same email, device, or card successfully booked experiences via AWG-connected channels before or after.",
            example: "List of prior settled AWG bookings for the profile within 12 months.",
            required: true,
            priority: 2,
          },
          {
            id: "awg_fr_comm",
            category: "communications",
            label: "Delivery channel proof",
            tag: "Comms",
            description:
              "Proof tickets or confirmations reached an address or device tied to the accountholder.",
            example: "Delivery log showing confirmation sent to the verified email on file.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No separate fraud investigation thread; signals from PSP and booking history only.",
        uploadedEvidence: [
          { requirementId: "awg_fr_risk", fileName: "awg_risk_and_3ds_export.pdf" },
          { requirementId: "awg_fr_history", fileName: "awg_account_booking_history.pdf" },
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
        `Attraction World Group is contesting this duplicate chargeback: ${d.description} ` +
        `The cardholder completed two separate checkouts; each has a distinct authorisation, amount, and booking reference in the AWG distribution platform. ` +
        `We submit payment and order evidence showing there was no erroneous double billing for a single transaction.`,
      timeline: [
        {
          date: iso(18),
          description: "First family bundle purchased via the partner white-label site; AWG API returned confirmation and barcodes.",
        },
        {
          date: iso(11),
          description: "Second purchase for an additional bundle or different visit window; separate payment authorised successfully.",
        },
        {
          date: iso(3),
          description: "Chargeback filed as duplicate; AWG compiled PSP and booking evidence for issuer review.",
        },
      ],
      paragraphs: [
        {
          heading: "Two valid charges",
          content:
            `The disputed amounts map to two consented checkouts, not a network retry of the same authorisation. ` +
            `The attached records show different payment intent IDs and timestamps.`,
          evidenceReferences: [refCharge],
        },
        {
          heading: "Booking records",
          content:
            `Each charge maps to its own AWG booking reference and product allocation. ` +
            `The buyer received separate confirmations, which undermines a duplicate claim for a single purchase.`,
          evidenceReferences: [refOrders],
        },
      ],
      customerClaimRebuttal:
        `The duplicate narrative does not match the two legitimate orders tied to this card on the AWG network.`,
      conclusion:
        `We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing booking records.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.reason === "product_unacceptable") {
    const parts = planPartsForDispute(d);
    const refSession = (parts.requirements[0] as { id: string }).id;
    const refTerms = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `Attraction World Group responds to a visit-date dispute: ${d.description} ` +
        `The date and slot in the confirmation match the payload the partner checkout submitted to the AWG API at payment time. ` +
        `We provide the session/API evidence and terms governing date selection.`,
      timeline: [
        {
          date: iso(25),
          description: "Customer completed checkout; AWG API locked the Thorpe Park date included in the confirmation email.",
        },
        {
          date: iso(12),
          description: "Experience window approached; no date-change request logged in partner or AWG support before the chargeback.",
        },
        {
          date: iso(5),
          description: "Chargeback filed citing wrong date; AWG compiled API session and policy evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "API session integrity",
          content:
            `The AWG booking platform records the final slot submitted by the partner checkout. ` +
            `The confirmation returned to the customer reflects that same slot — there was no silent alteration after payment.`,
          evidenceReferences: [refSession],
        },
        {
          heading: "Terms and buyer verification",
          content:
            `Published terms require the customer to verify the visit date before completing payment. ` +
            `The buyer proceeded through checkout with the displayed date visible.`,
          evidenceReferences: [refTerms],
        },
      ],
      customerClaimRebuttal:
        `The operational record shows the customer confirmed the date that was fulfilled; the product matched the contracted API payload.`,
      conclusion:
        `We respectfully request that the issuer find in favour of the merchant. The visit date was transparently locked at purchase.`,
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
        `This case concerned an invalid-barcode chargeback: ${d.description} ` +
        `AWG showed correct issuance via API, successful turnstile redemption at LEGOLAND Windsor, and distribution terms covering the scenario. ` +
        `The issuer resolved in the merchant's favour.`,
      timeline: [
        {
          date: iso(22),
          description: "Booking fulfilled through AWG; mobile QR delivered via the selling channel.",
        },
        {
          date: iso(9),
          description: "Turnstile logs confirm barcode scan at park entry for the disputed visit date.",
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
            `The payment corresponds to tickets that were issued and used as designed. ` +
            `Gate scan data ties the guest to entry, contradicting an invalid-ticket narrative.`,
          evidenceReferences: [refScan],
        },
        {
          heading: "Terms and partner obligations",
          content:
            `AWG distribution terms describe barcode validity, non-transferability, and when chargebacks may not apply. ` +
            `Partners and guests are bound to these rules as part of the booking flow.`,
          evidenceReferences: [refPolicy],
        },
      ],
      customerClaimRebuttal:
        `The record shows legitimate issuance and successful park entry; the invalid-barcode claim is not supported by access data.`,
      conclusion:
        `This outcome reflects strong omnichannel evidence: API issuance, venue connectivity, and contract terms aligned with the charge.`,
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
        `AWG submitted PSP risk data, authentication outcomes, and prior booking history for the same profile. ` +
        `Issuer fraud rules still favoured the cardholder; this row preserves the evidence package for internal review.`,
      timeline: [
        {
          date: iso(16),
          description: "Payment authorised; risk checks and ticket delivery to the account email completed.",
        },
        {
          date: iso(5),
          description: "Chargeback received as fraudulent; AWG compiled risk export and booking history.",
        },
        {
          date: iso(1),
          description: "Issuer resolved dispute for the cardholder despite merchant submission.",
        },
      ],
      paragraphs: [
        {
          heading: "Risk and authentication",
          content:
            `We documented the session's risk score, 3DS/SCA result where applicable, and AVS/CVC alignment. ` +
            `These indicated a consistent, customer-initiated checkout on an AWG-connected channel.`,
          evidenceReferences: [refRisk],
        },
        {
          heading: "Account continuity",
          content:
            `The same profile and payment method had prior successful experience bookings, supporting that this charge was not an isolated spoof.`,
          evidenceReferences: [refHistory],
        },
      ],
      customerClaimRebuttal:
        `While the cardholder disputes authorisation, the account and delivery trail show a pattern of legitimate use on AWG-distributed inventory.`,
      conclusion:
        `We respect the issuer's final decision. This closed case helps calibrate fraud narratives for similar attraction disputes.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  return null;
}

export function buildAttractionworldDisputeFirestoreData(
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
    pspDisputeId: `du_awg_${d.reason}_${ts}`,
    pspPaymentId: `pi_awg_${ts}`,
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
