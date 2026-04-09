import {sanitizeRowValues, sanitizePAN} from "../sanitizer";

describe("PMS Sanitizer", () => {
  describe("sanitizePAN", () => {
    it("should strip a 16-digit card number to last 4", () => {
      expect(sanitizePAN("4111111111111111")).toBe("1111");
    });

    it("should strip a 15-digit card number (Amex) to last 4", () => {
      expect(sanitizePAN("378282246310005")).toBe("0005");
    });

    it("should strip a 13-digit card number to last 4", () => {
      expect(sanitizePAN("4222222222225")).toBe("2225");
    });

    it("should strip a 19-digit card number to last 4", () => {
      expect(sanitizePAN("4111111111111111234")).toBe("1234");
    });

    it("should strip card numbers with spaces", () => {
      expect(sanitizePAN("4111 1111 1111 1111")).toBe("1111");
    });

    it("should strip card numbers with dashes", () => {
      expect(sanitizePAN("4111-1111-1111-1111")).toBe("1111");
    });

    it("should NOT strip 4-digit values (last4 is fine)", () => {
      expect(sanitizePAN("4242")).toBe("4242");
    });

    it("should NOT strip 12-digit values (too short for PAN)", () => {
      expect(sanitizePAN("123456789012")).toBe("123456789012");
    });

    it("should NOT strip amounts that look numeric", () => {
      expect(sanitizePAN("45000")).toBe("45000");
    });

    it("should NOT strip reservation IDs", () => {
      expect(sanitizePAN("100001")).toBe("100001");
    });

    it("should handle empty string", () => {
      expect(sanitizePAN("")).toBe("");
    });

    it("should handle non-numeric text", () => {
      expect(sanitizePAN("John Smith")).toBe("John Smith");
    });
  });

  describe("sanitizeRowValues", () => {
    it("should sanitize PAN values in a row", () => {
      const row: Record<string, string> = {
        CONFIRMATION_NO: "100001",
        GUEST_NAME: "Smith, John",
        CARD_NUMBER: "4111111111111111",
        AMOUNT: "45000",
      };
      const result = sanitizeRowValues(row);
      expect(result.CARD_NUMBER).toBe("1111");
      expect(result.CONFIRMATION_NO).toBe("100001");
      expect(result.GUEST_NAME).toBe("Smith, John");
      expect(result.AMOUNT).toBe("45000");
    });

    it("should sanitize card number with spaces in payment reference", () => {
      const row: Record<string, string> = {
        REFERENCE: "Payment - 4111 1111 1111 1111",
      };
      const result = sanitizeRowValues(row);
      expect(result.REFERENCE).not.toContain("4111 1111 1111 1111");
    });

    it("should not modify rows without PAN data", () => {
      const row: Record<string, string> = {
        CONFIRMATION_NO: "200001",
        GUEST_NAME: "Brown, Alice",
        TOTAL_REVENUE: "120050",
      };
      const result = sanitizeRowValues(row);
      expect(result).toEqual(row);
    });
  });
});
