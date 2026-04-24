/* eslint-env jest */
/**
 * Global Jest setup: mocks before handlers read secrets or hit Firestore for rate limits.
 */
jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn((name) => ({
    value: () => {
      const map = {
        STRIPE_SECRET_KEY: "sk_test_key",
        STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
        STRIPE_BILLING_SECRET_KEY: "sk_test_billing_jest",
        STRIPE_BILLING_WEBHOOK_SECRET: "whsec_billing_jest",
      };
      return map[name] || `mock_secret_${name}`;
    },
  })),
}));

jest.mock("./src/utils/rateLimiter", () => {
  const actual = jest.requireActual("./src/utils/rateLimiter");
  return {
    ...actual,
    applyRateLimit: jest.fn().mockResolvedValue(true),
  };
});
