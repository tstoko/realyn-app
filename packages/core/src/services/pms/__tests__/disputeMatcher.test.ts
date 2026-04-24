import {
  scoreMatch,
  findBestMatches,
  isAmbiguousMatch,
  confidenceLevel,
  type DisputeMatchInput,
  type MatchCandidate,
} from "../disputeMatcher";
import type {PMSReservation, PMSFolio} from "../../../types/pmsData";

function makeReservation(overrides: Partial<PMSReservation> = {}): PMSReservation {
  return {
    confirmationNumber: "100001",
    guestName: "Smith, John",
    checkIn: "2026-01-15",
    checkOut: "2026-01-18",
    roomNumber: "405",
    roomType: "DLX",
    ratePlan: "BAR",
    totalAmount: 45000,
    currency: "USD",
    status: "checked_out",
    paymentMethodLast4: "4242",
    ...overrides,
  };
}

function makeFolio(overrides: Partial<PMSFolio> = {}): PMSFolio {
  return {
    confirmationNumber: "100001",
    lines: [],
    totalCharges: 45000,
    totalPayments: 45000,
    balance: 0,
    currency: "USD",
    ...overrides,
  };
}

function makeDispute(overrides: Partial<DisputeMatchInput> = {}): DisputeMatchInput {
  return {
    amount: 45000,
    currency: "USD",
    transactionDate: "2026-01-18",
    cardLast4: "4242",
    guestName: "John Smith",
    ...overrides,
  };
}

describe("disputeMatcher", () => {
  describe("scoreMatch", () => {
    it("should score high confidence when all signals match", () => {
      const result = scoreMatch(makeDispute(), makeReservation(), makeFolio());
      expect(result.confidence).toBe(100);
      expect(confidenceLevel(result.confidence)).toBe("high");
      expect(result.signals.every((s) => s.matched)).toBe(true);
    });

    it("should score 0 when nothing matches", () => {
      const dispute = makeDispute({
        amount: 99999,
        cardLast4: "0000",
        guestName: "Completely Different",
        transactionDate: "2020-01-01",
      });
      const result = scoreMatch(dispute, makeReservation());
      expect(result.confidence).toBe(0);
    });

    it("should score amount within 2% tolerance", () => {
      const dispute = makeDispute({amount: 45500}); // ~1.1% over
      const result = scoreMatch(dispute, makeReservation());
      const amountSignal = result.signals.find((s) => s.field === "amount");
      expect(amountSignal?.matched).toBe(true);
    });

    it("should NOT match amount outside 2% tolerance", () => {
      const dispute = makeDispute({amount: 50000}); // ~11% over
      const result = scoreMatch(dispute, makeReservation());
      const amountSignal = result.signals.find((s) => s.field === "amount");
      expect(amountSignal?.matched).toBe(false);
    });

    it("should match card last4 exactly", () => {
      const result = scoreMatch(
          makeDispute({cardLast4: "4242"}),
          makeReservation({paymentMethodLast4: "4242"}),
      );
      const cardSignal = result.signals.find((s) => s.field === "cardLast4");
      expect(cardSignal?.matched).toBe(true);
      expect(cardSignal?.weight).toBe(35);
    });

    it("should handle missing card data gracefully", () => {
      const result = scoreMatch(
          makeDispute({cardLast4: undefined}),
          makeReservation({paymentMethodLast4: undefined}),
      );
      const cardSignal = result.signals.find((s) => s.field === "cardLast4");
      expect(cardSignal?.matched).toBe(false);
      expect(cardSignal?.weight).toBe(0);
    });

    it("should match transaction date within stay dates", () => {
      const result = scoreMatch(
          makeDispute({transactionDate: "2026-01-16"}),
          makeReservation(),
      );
      const dateSignal = result.signals.find((s) => s.field === "date");
      expect(dateSignal?.matched).toBe(true);
    });

    it("should match transaction date 1 day after checkout (settlement buffer)", () => {
      const result = scoreMatch(
          makeDispute({transactionDate: "2026-01-19"}),
          makeReservation(),
      );
      const dateSignal = result.signals.find((s) => s.field === "date");
      expect(dateSignal?.matched).toBe(true);
    });

    it("should NOT match transaction date far outside stay", () => {
      const result = scoreMatch(
          makeDispute({transactionDate: "2026-06-01"}),
          makeReservation(),
      );
      const dateSignal = result.signals.find((s) => s.field === "date");
      expect(dateSignal?.matched).toBe(false);
    });

    it("should match guest name with reversed order (Smith, John vs John Smith)", () => {
      const result = scoreMatch(
          makeDispute({guestName: "John Smith"}),
          makeReservation({guestName: "Smith, John"}),
      );
      const nameSignal = result.signals.find((s) => s.field === "guestName");
      expect(nameSignal?.matched).toBe(true);
    });

    it("should match guest name with accented characters", () => {
      const result = scoreMatch(
          makeDispute({guestName: "Pierre Dubois"}),
          makeReservation({guestName: "Dubois, Piérre"}),
      );
      const nameSignal = result.signals.find((s) => s.field === "guestName");
      expect(nameSignal?.matched).toBe(true);
    });

    it("should match guest name with hyphens", () => {
      const result = scoreMatch(
          makeDispute({guestName: "Mary Jane OBrien"}),
          makeReservation({guestName: "O'Brien, Mary-Jane"}),
      );
      const nameSignal = result.signals.find((s) => s.field === "guestName");
      expect(nameSignal?.matched).toBe(true);
    });

    it("should prefer folio totalCharges over reservation totalAmount", () => {
      const reservation = makeReservation({totalAmount: 40000});
      const folio = makeFolio({totalCharges: 45000});
      const result = scoreMatch(makeDispute({amount: 45000}), reservation, folio);
      const amountSignal = result.signals.find((s) => s.field === "amount");
      expect(amountSignal?.matched).toBe(true);
    });

    it("should give weight 50 on confirmation number match and skip other signals", () => {
      const result = scoreMatch(
          makeDispute({confirmationNumber: "100001"}),
          makeReservation({confirmationNumber: "100001"}),
      );
      expect(result.confidence).toBe(50);
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].field).toBe("confirmationNumber");
      expect(result.signals[0].matched).toBe(true);
    });

    it("should fall through to normal signals when confirmation number does not match", () => {
      const result = scoreMatch(
          makeDispute({confirmationNumber: "WRONG"}),
          makeReservation({confirmationNumber: "100001"}),
          makeFolio(),
      );
      expect(result.signals.length).toBe(4);
      expect(result.signals.every((s) => s.field !== "confirmationNumber")).toBe(true);
    });

    it("should fall through to normal signals when no confirmation number provided", () => {
      const result = scoreMatch(
          makeDispute(),
          makeReservation(),
          makeFolio(),
      );
      expect(result.confidence).toBe(100);
      expect(result.signals).toHaveLength(4);
    });
  });

  describe("findBestMatches", () => {
    it("should return matches ranked by confidence", () => {
      const reservations = [
        makeReservation({confirmationNumber: "A", paymentMethodLast4: "0000"}),
        makeReservation({confirmationNumber: "B", paymentMethodLast4: "4242"}),
      ];
      const matches = findBestMatches(makeDispute(), reservations, []);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].reservation.confirmationNumber).toBe("B");
    });

    it("should exclude matches below LOW threshold", () => {
      const reservations = [
        makeReservation({
          confirmationNumber: "X",
          totalAmount: 99999,
          paymentMethodLast4: "0000",
          guestName: "Completely Unrelated",
          checkIn: "2020-01-01",
          checkOut: "2020-01-02",
        }),
      ];
      const matches = findBestMatches(makeDispute(), reservations, []);
      expect(matches).toHaveLength(0);
    });

    it("should attach folio to matching reservation", () => {
      const reservations = [makeReservation()];
      const folios = [makeFolio()];
      const matches = findBestMatches(makeDispute(), reservations, folios);
      expect(matches[0].folio).toBeDefined();
      expect(matches[0].folio?.confirmationNumber).toBe("100001");
    });

    it("should handle empty reservation list", () => {
      const matches = findBestMatches(makeDispute(), [], []);
      expect(matches).toHaveLength(0);
    });
  });

  describe("isAmbiguousMatch", () => {
    function makeCandidate(confidence: number): MatchCandidate {
      return {
        reservation: makeReservation(),
        confidence,
        signals: [],
      };
    }

    it("should return true when top 2 candidates are within 10 points and both above MEDIUM", () => {
      const candidates = [makeCandidate(70), makeCandidate(65)];
      expect(isAmbiguousMatch(candidates)).toBe(true);
    });

    it("should return false when clear winner (gap > 10)", () => {
      const candidates = [makeCandidate(80), makeCandidate(55)];
      expect(isAmbiguousMatch(candidates)).toBe(false);
    });

    it("should return false with a single candidate", () => {
      const candidates = [makeCandidate(80)];
      expect(isAmbiguousMatch(candidates)).toBe(false);
    });

    it("should return false when both below MEDIUM threshold", () => {
      const candidates = [makeCandidate(40), makeCandidate(35)];
      expect(isAmbiguousMatch(candidates)).toBe(false);
    });

    it("should return false with empty candidates", () => {
      expect(isAmbiguousMatch([])).toBe(false);
    });

    it("should return true when candidates are exactly equal above MEDIUM", () => {
      const candidates = [makeCandidate(60), makeCandidate(60)];
      expect(isAmbiguousMatch(candidates)).toBe(true);
    });
  });

  describe("confidenceLevel", () => {
    it("should classify high confidence", () => {
      expect(confidenceLevel(85)).toBe("high");
    });
    it("should classify medium confidence", () => {
      expect(confidenceLevel(60)).toBe("medium");
    });
    it("should classify low confidence", () => {
      expect(confidenceLevel(30)).toBe("low");
    });
    it("should classify none", () => {
      expect(confidenceLevel(10)).toBe("none");
    });
  });
});
