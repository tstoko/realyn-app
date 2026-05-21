import { outcomeSchema, type Outcome } from "../outcome";

describe("outcomeSchema", () => {
  test("accepts a minimal won outcome (no amount)", () => {
    const o: Outcome = {
      disputeId: "disp_1",
      result: "won",
      decidedAt: "2026-05-20T00:00:00.000Z",
    };
    expect(outcomeSchema.parse(o)).toEqual(o);
  });

  test("accepts a won outcome with recovered amount + currency", () => {
    const o: Outcome = {
      disputeId: "disp_1",
      result: "won",
      decidedAt: "2026-05-20T00:00:00.000Z",
      recoveredAmount: 12500,
      currency: "USD",
      evidenceSnapshotRef: "snap_abc",
      notes: "PSP accepted compelling evidence rule citation.",
    };
    expect(outcomeSchema.parse(o)).toEqual(o);
  });

  test("accepts lost / withdrawn / expired outcomes without amount", () => {
    for (const result of ["lost", "withdrawn", "expired"] as const) {
      const o: Outcome = {
        disputeId: `disp_${result}`,
        result,
        decidedAt: "2026-05-20T00:00:00.000Z",
      };
      expect(outcomeSchema.parse(o)).toEqual(o);
    }
  });

  test("rejects recoveredAmount on non-won outcomes", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_2",
        result: "lost",
        decidedAt: "2026-05-20T00:00:00.000Z",
        recoveredAmount: 100,
        currency: "USD",
      }),
    ).toThrow(/only valid on `won`/i);
  });

  test("rejects recoveredAmount set without currency", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_3",
        result: "won",
        decidedAt: "2026-05-20T00:00:00.000Z",
        recoveredAmount: 100,
      }),
    ).toThrow(/currency is required/i);
  });

  test("rejects negative recoveredAmount", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_4",
        result: "won",
        decidedAt: "2026-05-20T00:00:00.000Z",
        recoveredAmount: -1,
        currency: "USD",
      }),
    ).toThrow();
  });

  test("rejects non-integer recoveredAmount (must be smallest currency unit)", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_5",
        result: "won",
        decidedAt: "2026-05-20T00:00:00.000Z",
        recoveredAmount: 12.5,
        currency: "USD",
      }),
    ).toThrow();
  });

  test("rejects currency that isn't 3 letters", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_6",
        result: "won",
        decidedAt: "2026-05-20T00:00:00.000Z",
        recoveredAmount: 100,
        currency: "DOLLARS",
      }),
    ).toThrow();
  });

  test("rejects unknown result enum", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_7",
        result: "settled",
        decidedAt: "2026-05-20T00:00:00.000Z",
      }),
    ).toThrow(/invalid_enum_value|invalid_value/i);
  });

  test("rejects unknown fields (strict mode)", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "disp_8",
        result: "won",
        decidedAt: "2026-05-20T00:00:00.000Z",
        unknownField: "x",
      }),
    ).toThrow(/unrecognized_keys/i);
  });

  test("rejects empty disputeId", () => {
    expect(() =>
      outcomeSchema.parse({
        disputeId: "",
        result: "won",
        decidedAt: "2026-05-20T00:00:00.000Z",
      }),
    ).toThrow();
  });

  test("round-trips through JSON without loss", () => {
    const o: Outcome = {
      disputeId: "disp_9",
      result: "won",
      decidedAt: "2026-05-20T00:00:00.000Z",
      recoveredAmount: 4999,
      currency: "GBP",
    };
    const reparsed = outcomeSchema.parse(JSON.parse(JSON.stringify(o)));
    expect(reparsed).toEqual(o);
  });
});
