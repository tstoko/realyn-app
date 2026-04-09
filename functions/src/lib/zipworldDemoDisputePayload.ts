/**
 * Shared Zip World demo dispute definitions and Firestore payloads
 * for seedZipworldDemo script + seedZipworldDemoHandler.
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
      "Customer claims e-tickets for the Velocity zip line experience at Penrhyn Quarry were never delivered to their email",
    amount: 18400,
    state: "new",
  },
  {
    reason: "credit_not_processed",
    description:
      "Customer claims refund for a weather-cancelled Fforest Coaster session at Betws-y-Coed was not processed",
    amount: 10000,
    state: "ai_plan_generated",
  },
  {
    reason: "general",
    description:
      "Customer disputes VIP upgrade charge for the Caverns underground experience at Llechwedd",
    amount: 27600,
    state: "evidence_uploaded",
  },
  {
    reason: "duplicate",
    description:
      "Customer claims they were charged twice for a Bounce Below family booking at Llechwedd",
    amount: 20000,
    state: "argument_ready",
  },
  {
    reason: "product_unacceptable",
    description:
      "Customer claims the Phoenix zip line at Tower Colliery was cut short due to high winds without prior warning at booking",
    amount: 15900,
    state: "submitted",
  },
  {
    reason: "product_not_received",
    description:
      "Customer claimed Titan zip line tickets were invalid — resolved in our favour with venue QR scan logs",
    amount: 13800,
    state: "won",
  },
  {
    reason: "fraudulent",
    description:
      "Cardholder claims transaction for a family adventure pass (Velocity + Caverns bundle) at Zip World was unauthorised",
    amount: 34500,
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
      summary: `${claim}. Adventure booking: present valid ticket issuance, venue QR scan data, and Zip World T&Cs covering invalid-ticket claims.`,
      recommendation: "fight",
      winnability: "high",
      winnabilityReason:
        "Venue QR scan logs and booking system metadata usually disprove 'invalid ticket' claims when the buyer completed checkout on zipworld.co.uk.",
      requirements: [
        {
          id: "zw_pnr_won_scan",
          category: "delivery",
          label: "Venue scan or check-in evidence",
          tag: "Fulfillment",
          description:
            "Export proof the ticket was scanned at the adventure check-in desk (QR scan timestamp, wristband issuance log, or basecamp check-in confirmation).",
          example: "CSV of scan events from the Zip World booking system for this booking reference.",
          required: true,
          priority: 1,
        },
        {
          id: "zw_pnr_won_policy",
          category: "policy",
          label: "Zip World booking terms and chargeback clause",
          tag: "Policy",
          description:
            "Checkout terms and adventure-specific rules describing when tickets are void, non-transferable, or subject to dispute.",
          example: "PDF of Zip World Terms & Conditions the customer agreed to at purchase, with final-sale clauses highlighted.",
          required: true,
          priority: 2,
        },
        {
          id: "zw_pnr_won_comm",
          category: "communications",
          label: "Customer communications",
          tag: "Comms",
          description:
            "Booking support or email correspondence about delivery, access issues, or refund offers tied to this booking.",
          example: "Email thread showing the buyer acknowledged receipt or declined support steps offered by Zip World guest services.",
          required: false,
          priority: 3,
        },
      ],
      commsNaNote:
        "Support history is attached under the policy pack; no separate correspondence thread was required for this closure.",
      uploadedEvidence: [
        { requirementId: "zw_pnr_won_scan", fileName: "zipworld_venue_scan_log.pdf" },
        { requirementId: "zw_pnr_won_policy", fileName: "zipworld_booking_terms.pdf" },
      ],
    };
  }

  switch (d.reason) {
    case "product_not_received":
      return {
        summary: `${claim}. Focus on e-ticket delivery proof (email confirmation, booking system), venue check-in logs, and Zip World T&Cs accepted at checkout.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Adventure operators often win when they can tie the buyer email to a delivered e-ticket and show venue access was available via QR code or wristband issuance.",
        requirements: [
          {
            id: "zw_pnr_delivery",
            category: "delivery",
            label: "Proof of e-ticket delivery",
            tag: "Fulfillment",
            description:
              "Show the customer received e-tickets or could access the booking (confirmation email, mobile ticket link, QR code delivery record).",
            example: "Order confirmation email with QR code plus delivery timestamp from the Zip World booking system.",
            required: true,
            priority: 1,
          },
          {
            id: "zw_pnr_policy",
            category: "policy",
            label: "Refund and cancellation policy",
            tag: "Policy",
            description:
              "Published Zip World terms for refunds, cancellations, and chargebacks that apply to this adventure booking.",
            example: "Checkout terms PDF with cancellation clause for adventure experiences agreed at purchase.",
            required: true,
            priority: 2,
          },
          {
            id: "zw_pnr_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Emails or guest services correspondence about ticket delivery, booking changes, or support resolution.",
            example: "Thread confirming the buyer opened the e-ticket link or collected wristbands at the basecamp.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "No long-form support thread on file for this booking; outreach was limited to the automated confirmation email.",
        uploadedEvidence: [
          { requirementId: "zw_pnr_delivery", fileName: "zipworld_booking_confirmation.pdf" },
          { requirementId: "zw_pnr_policy", fileName: "zipworld_refund_policy.pdf" },
        ],
      };

    case "credit_not_processed":
      return {
        summary: `${claim}. Evidence should trace refund eligibility under weather cancellation policy, payout timing, and any customer communications about the credit.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Booking ledgers showing the refund was initiated (or rebooking offered under Zip World weather policy) are persuasive to issuers for weather-cancelled outdoor experiences.",
        requirements: [
          {
            id: "zw_cnp_ledger",
            category: "payment_data",
            label: "Refund / credit ledger",
            tag: "Payments",
            description:
              "Booking system or PSP export showing refund initiation, processing status, or ineligibility for this booking under the weather cancellation policy.",
            example: "Adyen balance transaction list filtered to this payment reference and any linked refunds.",
            required: true,
            priority: 1,
          },
          {
            id: "zw_cnp_policy",
            category: "policy",
            label: "Weather cancellation and refund rules",
            tag: "Policy",
            description:
              "Zip World terms covering weather-related cancellations, rebooking windows, and chargeback responsibilities for outdoor adventure experiences.",
            example: "Weather cancellation notice plus policy clause on refund timelines for Zip World adventures.",
            required: true,
            priority: 2,
          },
          {
            id: "zw_cnp_comm",
            category: "communications",
            label: "Refund communications",
            tag: "Comms",
            description:
              "Messages to the buyer explaining refund status, rebooking options, or weather cancellation details.",
            example: "Email from Zip World guest services stating the refund was processed or a rebooking voucher was issued.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Refund status was communicated through the automated weather cancellation email from Zip World only.",
        uploadedEvidence: [
          { requirementId: "zw_cnp_ledger", fileName: "zipworld_refund_ledger.pdf" },
          { requirementId: "zw_cnp_policy", fileName: "zipworld_weather_cancellation_policy.pdf" },
        ],
      };

    case "general":
      return {
        summary: `${claim}. Tie the VIP upgrade line item to checkout consent on zipworld.co.uk, the booking receipt, and fulfilment of the upgraded experience.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "VIP upgrades at adventure parks usually have a clear line item, price difference, and acknowledgement step that supports the merchant.",
        requirements: [
          {
            id: "zw_gen_order",
            category: "pms_data",
            label: "Booking and upgrade breakdown",
            tag: "Order",
            description:
              "Itemised receipt showing the base adventure ticket, VIP upgrade, booking fee, and buyer email used at checkout.",
            example: "Zip World booking export including experience type, participant count, and upgrade tier for this transaction.",
            required: true,
            priority: 1,
          },
          {
            id: "zw_gen_policy",
            category: "policy",
            label: "Upgrade and checkout terms",
            tag: "Policy",
            description:
              "Terms covering experience upgrades, add-ons, and final-sale language shown before payment on zipworld.co.uk.",
            example: "Screenshot of the checkout step where the VIP upgrade fee is itemised and confirmed by the buyer.",
            required: true,
            priority: 2,
          },
          {
            id: "zw_gen_comm",
            category: "communications",
            label: "Upgrade-related communications",
            tag: "Comms",
            description:
              "Emails or notifications confirming the VIP upgrade purchase and updated experience details.",
            example: "Confirmation email listing the VIP Caverns upgrade sent immediately after purchase.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Upgrade confirmation was included in the same booking email; no separate correspondence thread exists.",
        uploadedEvidence: [
          { requirementId: "zw_gen_order", fileName: "zipworld_upgrade_receipt.pdf" },
          { requirementId: "zw_gen_policy", fileName: "zipworld_checkout_terms.pdf" },
        ],
      };

    case "duplicate":
      return {
        summary: `${claim}. Demonstrate separate authorisations or distinct bookings rather than a mistaken double charge for a single family booking.`,
        recommendation: "fight",
        winnability: "high",
        winnabilityReason:
          "Two legitimate charges with unique booking references, amounts, or timestamps typically defeat duplicate disputes for adventure experience tickets.",
        requirements: [
          {
            id: "zw_dup_charges",
            category: "payment_data",
            label: "Authorisation and settlement detail",
            tag: "Payments",
            description:
              "PSP view of each charge with auth code, amount, timestamp, and descriptor to prove they are not identical retries.",
            example: "Side-by-side Adyen payment references with different IDs for two separate Zip World bookings.",
            required: true,
            priority: 1,
          },
          {
            id: "zw_dup_orders",
            category: "pms_data",
            label: "Matching booking records",
            tag: "Orders",
            description:
              "Two booking confirmations (or one family booking plus an additional date) proving the cardholder consented to both transactions.",
            example: "Zip World booking system export of bookings for the buyer email in the dispute date range.",
            required: true,
            priority: 2,
          },
          {
            id: "zw_dup_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Messages showing the buyer knew about both charges (e.g. separate booking confirmations for different adventure dates).",
            example: "Confirmation emails for Booking A and Booking B delivered to the same email address.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Both booking confirmations were issued automatically; the buyer did not query the duplicate before filing the chargeback.",
        uploadedEvidence: [
          { requirementId: "zw_dup_charges", fileName: "zipworld_both_charges.pdf" },
          { requirementId: "zw_dup_orders", fileName: "zipworld_two_booking_confirmations.pdf" },
        ],
      };

    case "product_unacceptable":
      return {
        summary: `${claim}. Show weather-monitoring procedures, wind-speed cut-off disclosures, and published safety T&Cs accepted at checkout.`,
        recommendation: "fight",
        winnability: "medium",
        winnabilityReason:
          "Weather-shortened experience disputes hinge on whether the operator disclosed safety restrictions before purchase; Zip World safety terms and acknowledgement of risk forms usually cover this.",
        requirements: [
          {
            id: "zw_pu_safety",
            category: "pms_data",
            label: "Safety restrictions and weather monitoring evidence",
            tag: "Fulfillment",
            description:
              "Wind-speed logs or weather monitoring data for the session date, plus documentation of the published safety cut-off thresholds.",
            example: "Zip World weather monitoring export for Tower Colliery on the disputed date showing wind speeds exceeded the safe operating threshold.",
            required: true,
            priority: 1,
          },
          {
            id: "zw_pu_policy",
            category: "policy",
            label: "Safety terms and acknowledgement of risk",
            tag: "Policy",
            description:
              "Published terms covering weather-related interruptions, safety closures, and the acknowledgement of risk form signed before participation.",
            example: "Zip World Terms & Conditions section on weather closures and the buyer's signed Acknowledgement of Risk form.",
            required: true,
            priority: 2,
          },
          {
            id: "zw_pu_comm",
            category: "communications",
            label: "Customer communications",
            tag: "Comms",
            description:
              "Guest services emails or correspondence about the shortened experience, rebooking offers, or resolution attempts.",
            example: "Email thread where guest services offered a rebooking voucher or partial credit that the buyer declined.",
            required: false,
            priority: 3,
          },
        ],
        commsNaNote:
          "Buyer did not contact guest services before filing the chargeback; no support thread on record.",
        uploadedEvidence: [
          { requirementId: "zw_pu_safety", fileName: "zipworld_weather_safety_log.pdf" },
          { requirementId: "zw_pu_policy", fileName: "zipworld_safety_terms_risk_form.pdf" },
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
            id: "zw_fr_risk",
            category: "payment_data",
            label: "Risk and authentication signals",
            tag: "Risk",
            description:
              "PSP risk score, 3DS/SCA result, AVS/CVC checks, device fingerprint, and IP consistency for the checkout session.",
            example: "Adyen risk or RevenueProtect export for the disputed payment on zipworld.co.uk.",
            required: true,
            priority: 1,
          },
          {
            id: "zw_fr_history",
            category: "pms_data",
            label: "Account and booking history",
            tag: "History",
            description:
              "Evidence the same email, device, or card successfully booked Zip World adventures before or after this transaction.",
            example: "List of prior settled Zip World bookings for the customer account within 12 months.",
            required: true,
            priority: 2,
          },
          {
            id: "zw_fr_comm",
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
          "No separate fraud investigation thread; signals pulled from PSP and Zip World booking history.",
        uploadedEvidence: [
          { requirementId: "zw_fr_risk", fileName: "zipworld_risk_and_3ds_export.pdf" },
          { requirementId: "zw_fr_history", fileName: "zipworld_account_booking_history.pdf" },
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
    disputeCategory: "Adventure & Experiences",
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
        `Zip World is contesting this duplicate chargeback: ${d.description} ` +
        `The cardholder completed two separate bookings; each has a distinct authorisation, amount, and booking record in the Zip World system. ` +
        `We are submitting payment and booking evidence showing there was no erroneous double billing for a single transaction.`,
      timeline: [
        {
          date: iso(18),
          description: "Buyer placed the first family Bounce Below booking via zipworld.co.uk; confirmation and e-tickets delivered.",
        },
        {
          date: iso(11),
          description: "Buyer placed a second booking for additional participants or a different adventure date; separate payment succeeded.",
        },
        {
          date: iso(3),
          description: "Chargeback filed as duplicate; Zip World compiled PSP and booking evidence for submission.",
        },
      ],
      paragraphs: [
        {
          heading: "Two valid charges",
          content:
            `The amounts in dispute correspond to two consented checkouts on zipworld.co.uk, not a retry of the same payment. ` +
            `The attached authorisation records show different network transaction IDs and timestamps.`,
          evidenceReferences: [refCharge],
        },
        {
          heading: "Booking records",
          content:
            `Each charge maps to its own booking reference and participant allocation in the Zip World system. ` +
            `The buyer received separate booking confirmations, which undermines a duplicate-billing claim for a single purchase.`,
          evidenceReferences: [refOrders],
        },
      ],
      customerClaimRebuttal:
        `The cardholder's duplicate claim does not match the two legitimate bookings tied to this account and card on the Zip World platform.`,
      conclusion:
        `We ask the issuer to reject the duplicate dispute. The evidence establishes two authorised purchases with clear customer-facing booking records.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  if (d.reason === "product_unacceptable") {
    const parts = planPartsForDispute(d);
    const refSafety = (parts.requirements[0] as { id: string }).id;
    const refTerms = (parts.requirements[1] as { id: string }).id;

    return {
      executiveSummary:
        `Zip World is responding to a dispute about a weather-shortened experience: ${d.description} ` +
        `Safety restrictions due to high winds are clearly documented in our Terms & Conditions and Acknowledgement of Risk form, both accepted by the buyer before checkout. ` +
        `We provide weather monitoring data and the safety terms governing outdoor adventure participation.`,
      timeline: [
        {
          date: iso(25),
          description: "Buyer booked the Phoenix zip line at Tower Colliery via zipworld.co.uk; safety terms and acknowledgement of risk accepted at checkout.",
        },
        {
          date: iso(20),
          description: "Adventure day: wind speeds exceeded the safe operating threshold mid-session; experience shortened per published safety protocols.",
        },
        {
          date: iso(5),
          description: "Chargeback filed citing product not as described; Zip World compiled weather data and safety policy evidence.",
        },
      ],
      paragraphs: [
        {
          heading: "Weather safety protocols",
          content:
            `Zip World monitors wind speed continuously at all outdoor adventure locations. ` +
            `On the disputed date, wind speeds at Tower Colliery exceeded the published safe operating threshold, triggering the standard safety protocol to shorten the experience.`,
          evidenceReferences: [refSafety],
        },
        {
          heading: "Safety terms and acknowledgement of risk",
          content:
            `Zip World Terms & Conditions and the mandatory Acknowledgement of Risk form describe weather-related interruptions and the operator's right to modify experiences for safety. ` +
            `The buyer accepted these terms at checkout and signed the risk form before participation.`,
          evidenceReferences: [refTerms],
        },
      ],
      customerClaimRebuttal:
        `The weather-shortened experience was a safety measure clearly covered by terms accepted before purchase. The product was delivered within the published safety constraints.`,
      conclusion:
        `We respectfully request that the issuer find in favour of the merchant. The safety restrictions were transparently disclosed and accepted at checkout, and weather monitoring data confirms the operational decision.`,
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
        `Zip World showed the ticket was issued correctly, scanned at the adventure check-in, and that checkout terms covered the scenario. ` +
        `The issuer resolved the dispute in the merchant's favour based on fulfilment and policy evidence.`,
      timeline: [
        {
          date: iso(22),
          description: "Booking completed on zipworld.co.uk; e-tickets with QR codes delivered to the verified email address.",
        },
        {
          date: iso(9),
          description: "Venue QR scan logs confirm ticket redemption at the Penrhyn Quarry basecamp for the Titan experience.",
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
            `The disputed payment corresponds to adventure tickets that were fulfilled and used as designed. ` +
            `QR scan data from the basecamp check-in ties the buyer to attendance, contradicting an "invalid ticket" narrative.`,
          evidenceReferences: [refScan],
        },
        {
          heading: "Terms and buyer acknowledgement",
          content:
            `Published Zip World terms describe when tickets are void, non-transferable, or ineligible for chargebacks. ` +
            `The buyer accepted those terms at checkout on zipworld.co.uk.`,
          evidenceReferences: [refPolicy],
        },
      ],
      customerClaimRebuttal:
        `The record shows a legitimate purchase and successful venue check-in; the invalid-ticket claim is not supported by operational data.`,
      conclusion:
        `This outcome reflects strong booking evidence: clear e-ticket delivery, venue QR scan validation, and contract terms aligned with the charge.`,
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
        `Zip World submitted PSP risk data, authentication outcomes, and prior booking history for the same account. ` +
        `Issuer fraud rules still favoured the cardholder; this row reflects that terminal outcome while preserving the evidence package for review.`,
      timeline: [
        {
          date: iso(16),
          description: "Payment authorised on zipworld.co.uk; risk checks and e-ticket delivery to account email completed.",
        },
        {
          date: iso(5),
          description: "Chargeback received as fraudulent; Zip World compiled risk export and booking history.",
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
            `These signals indicated a consistent, customer-initiated checkout on zipworld.co.uk.`,
          evidenceReferences: [refRisk],
        },
        {
          heading: "Account continuity",
          content:
            `The same profile and payment method had prior successful adventure bookings through Zip World, supporting that this charge was not an isolated spoof.`,
          evidenceReferences: [refHistory],
        },
      ],
      customerClaimRebuttal:
        `While the cardholder disputes authorisation, the account and delivery trail show a pattern of legitimate use on the Zip World platform.`,
      conclusion:
        `We respect the issuer's final decision. This closed case remains useful internally to calibrate fraud narratives and evidence depth for similar disputes.`,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  return null;
}

export function buildZipworldDisputeFirestoreData(
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
    pspProvider: "adyen",
    pspDisputeId: `du_zipworld_${d.reason}_${ts}`,
    pspPaymentId: `pi_zipworld_${ts}`,
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
    merchantVertical: "adventure_experiences",

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
