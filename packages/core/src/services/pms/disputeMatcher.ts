/**
 * Dispute-to-PMS-Reservation Matcher
 *
 * Pure matching logic that scores how well a PMS reservation matches an
 * incoming PSP dispute. Uses multiple weighted signals (card last4, amount,
 * date overlap, guest name) to produce a confidence score.
 */

import type {PMSReservation, PMSFolio} from "../../types/pmsData";

// ============================================================
// Types
// ============================================================

export interface DisputeMatchInput {
  amount: number; // In cents
  currency: string;
  transactionDate?: string; // ISO date
  cardLast4?: string;
  guestName?: string;
  confirmationNumber?: string;
}

export interface MatchSignal {
  field: string;
  weight: number;
  matched: boolean;
  details: string;
}

export interface MatchCandidate {
  reservation: PMSReservation;
  folio?: PMSFolio;
  confidence: number; // 0–100
  signals: MatchSignal[];
}

// ============================================================
// Weights
// ============================================================

const WEIGHT_CONFIRMATION = 50;
const WEIGHT_CARD_LAST4 = 35;
const WEIGHT_AMOUNT = 30;
const WEIGHT_DATE = 20;
const WEIGHT_NAME = 15;

// ============================================================
// Confidence thresholds
// ============================================================

const CONFIDENCE_HIGH = 75;
const CONFIDENCE_MEDIUM = 50;
const CONFIDENCE_LOW = 25;

type ConfidenceLevel = "high" | "medium" | "low" | "none";

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH) return "high";
  if (score >= CONFIDENCE_MEDIUM) return "medium";
  if (score >= CONFIDENCE_LOW) return "low";
  return "none";
}

// ============================================================
// Signal matchers
// ============================================================

function matchConfirmationNumber(
    disputeConfirmation?: string,
    reservationConfirmation?: string,
): MatchSignal {
  if (!disputeConfirmation || !reservationConfirmation) {
    return {field: "confirmationNumber", weight: 0, matched: false, details: "No confirmation number available"};
  }
  const matched = disputeConfirmation.trim().toLowerCase() === reservationConfirmation.trim().toLowerCase();
  return {
    field: "confirmationNumber",
    weight: matched ? WEIGHT_CONFIRMATION : 0,
    matched,
    details: matched ?
      `Confirmation number match: ${disputeConfirmation}` :
      `Confirmation number mismatch: dispute=${disputeConfirmation}, reservation=${reservationConfirmation}`,
  };
}

function matchCardLast4(disputeLast4?: string, reservationLast4?: string): MatchSignal {
  if (!disputeLast4 || !reservationLast4) {
    return {field: "cardLast4", weight: 0, matched: false, details: "No card data available"};
  }
  const matched = disputeLast4 === reservationLast4;
  return {
    field: "cardLast4",
    weight: matched ? WEIGHT_CARD_LAST4 : 0,
    matched,
    details: matched ?
      `Card last4 match: ${disputeLast4}` :
      `Card last4 mismatch: dispute=${disputeLast4}, reservation=${reservationLast4}`,
  };
}

/**
 * Match amount with 2% tolerance for tax rounding differences.
 */
function matchAmount(
    disputeAmount: number,
    reservationAmount: number,
    folio?: PMSFolio,
): MatchSignal {
  const targetAmount = folio ? folio.totalCharges : reservationAmount;
  if (targetAmount === 0 && disputeAmount === 0) {
    return {field: "amount", weight: WEIGHT_AMOUNT, matched: true, details: "Both zero"};
  }

  if (targetAmount === 0) {
    return {field: "amount", weight: 0, matched: false, details: "No reservation amount available"};
  }

  const diff = Math.abs(disputeAmount - targetAmount);
  const tolerance = Math.max(targetAmount, disputeAmount) * 0.02;
  const matched = diff <= tolerance;

  return {
    field: "amount",
    weight: matched ? WEIGHT_AMOUNT : 0,
    matched,
    details: matched ?
      `Amount match: dispute=${disputeAmount}, reservation=${targetAmount} (within 2%)` :
      `Amount mismatch: dispute=${disputeAmount}, reservation=${targetAmount} (diff=${diff})`,
  };
}

/**
 * Check if the transaction date falls within (or near) the stay dates.
 * Allows 1 day buffer on either side for settlement timing.
 */
function matchDate(transactionDate?: string, checkIn?: string, checkOut?: string): MatchSignal {
  if (!transactionDate || !checkIn || !checkOut) {
    return {field: "date", weight: 0, matched: false, details: "Insufficient date data"};
  }

  try {
    const txDate = new Date(transactionDate).getTime();
    const arrival = new Date(checkIn).getTime() - 86400000; // 1 day before
    const departure = new Date(checkOut).getTime() + 86400000; // 1 day after

    const matched = txDate >= arrival && txDate <= departure;
    return {
      field: "date",
      weight: matched ? WEIGHT_DATE : 0,
      matched,
      details: matched ?
        `Transaction date ${transactionDate} within stay ${checkIn} to ${checkOut}` :
        `Transaction date ${transactionDate} outside stay ${checkIn} to ${checkOut}`,
    };
  } catch {
    return {field: "date", weight: 0, matched: false, details: "Date parse error"};
  }
}

/**
 * Fuzzy guest name matching using token overlap.
 * Handles "Smith, John" vs "John Smith", accented characters, hyphens, etc.
 */
function matchGuestName(disputeName?: string, reservationName?: string): MatchSignal {
  if (!disputeName || !reservationName) {
    return {field: "guestName", weight: 0, matched: false, details: "No guest name available"};
  }

  const normalize = (name: string): string[] =>
    name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Strip accents
        .replace(/[^a-z\s]/g, " ") // Remove non-alpha except spaces
        .split(/\s+/)
        .filter((t) => t.length > 1); // Drop single-char tokens

  const disputeTokens = normalize(disputeName);
  const reservationTokens = normalize(reservationName);

  if (disputeTokens.length === 0 || reservationTokens.length === 0) {
    return {field: "guestName", weight: 0, matched: false, details: "Name tokens empty"};
  }

  const commonTokens = disputeTokens.filter((t) => reservationTokens.includes(t));
  const overlapRatio = commonTokens.length / Math.max(disputeTokens.length, reservationTokens.length);

  // At least 50% token overlap = match
  const matched = overlapRatio >= 0.5;

  return {
    field: "guestName",
    weight: matched ? WEIGHT_NAME : 0,
    matched,
    details: matched ?
      `Name match (${Math.round(overlapRatio * 100)}% overlap): [${commonTokens.join(", ")}]` :
      `Name mismatch: dispute="${disputeName}", reservation="${reservationName}"`,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Score how well a single reservation matches a dispute.
 */
export function scoreMatch(
    dispute: DisputeMatchInput,
    reservation: PMSReservation,
    folio?: PMSFolio,
): MatchCandidate {
  const confirmationSignal = matchConfirmationNumber(
      dispute.confirmationNumber,
      reservation.confirmationNumber,
  );
  if (confirmationSignal.matched) {
    return {
      reservation,
      folio,
      confidence: confirmationSignal.weight,
      signals: [confirmationSignal],
    };
  }

  const signals: MatchSignal[] = [
    matchCardLast4(dispute.cardLast4, reservation.paymentMethodLast4),
    matchAmount(dispute.amount, reservation.totalAmount, folio),
    matchDate(dispute.transactionDate, reservation.checkIn, reservation.checkOut),
    matchGuestName(dispute.guestName, reservation.guestName),
  ];

  const confidence = signals.reduce((sum, s) => sum + s.weight, 0);

  return {reservation, folio, confidence, signals};
}

/**
 * Find the best matching reservations for a dispute, ranked by confidence.
 * Only returns matches above the LOW threshold.
 */
export function findBestMatches(
    dispute: DisputeMatchInput,
    reservations: PMSReservation[],
    folios: PMSFolio[],
): MatchCandidate[] {
  const folioMap = new Map<string, PMSFolio>();
  for (const f of folios) {
    folioMap.set(f.confirmationNumber, f);
  }

  const candidates: MatchCandidate[] = reservations.map((r) =>
    scoreMatch(dispute, r, folioMap.get(r.confirmationNumber)),
  );

  return candidates
      .filter((c) => c.confidence >= CONFIDENCE_LOW)
      .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Detect ambiguous matches: top 2 candidates both above MEDIUM threshold
 * and within 10 points of each other.
 */
export function isAmbiguousMatch(candidates: MatchCandidate[]): boolean {
  if (candidates.length < 2) return false;
  const [first, second] = candidates;
  return (
    first.confidence >= CONFIDENCE_MEDIUM &&
    second.confidence >= CONFIDENCE_MEDIUM &&
    first.confidence - second.confidence <= 10
  );
}
