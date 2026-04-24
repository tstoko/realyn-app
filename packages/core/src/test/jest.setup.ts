/**
 * Global Jest setup: mocks that must apply before handlers read secrets or hit Firestore for rate limits.
 */
jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name: string) => ({
    value: () => {
      const map: Record<string, string> = {
        STRIPE_SECRET_KEY: "sk_test_key",
        STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
        STRIPE_BILLING_SECRET_KEY: "sk_test_billing_jest",
        STRIPE_BILLING_WEBHOOK_SECRET: "whsec_billing_jest",
      };
      return map[name] || `mock_secret_${name}`;
    },
  })),
}));

jest.mock("../utils/rateLimiter", () => {
  const actual = jest.requireActual("../utils/rateLimiter") as Record<string, unknown>;
  return {
    ...actual,
    applyRateLimit: jest.fn().mockResolvedValue(true),
  };
});
