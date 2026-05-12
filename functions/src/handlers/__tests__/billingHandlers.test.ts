/**
 * Tests for billingHandlers — the money path for the org subscription model.
 *
 * Coverage focus (per docs/post-hardening-plan.md §B4):
 *   1. Stripe webhook signature verification.
 *   2. Idempotency contract: processing the same event ID twice writes to
 *      `_processedWebhookEvents` once and applies the side effect once.
 *   3. Internal-error path returns the generic `{ error, errorId }` shape
 *      from `sendInternalError`.
 *   4. Checkout / billing-portal: redirect URL builder uses `DASHBOARD_URL`
 *      (via `getDashboardBaseUrl`) so staging Checkouts return to staging.
 */

// Stripe SDK mock — a single shared instance whose method jest.fns can be
// re-stubbed per test. Defined inside the factory to avoid Jest hoisting
// issues when the handler imports Stripe at module top.
jest.mock("stripe", () => {
  const instance = {
    webhooks: { constructEvent: jest.fn() },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { retrieve: jest.fn() },
    billingPortal: { sessions: { create: jest.fn() } },
  };
  const MockStripe = jest.fn().mockImplementation(() => instance);
  (MockStripe as any).__instance = instance;
  return { __esModule: true, default: MockStripe, __instance: instance };
});

function getStripeInstance(): any {
  return require("stripe").__instance;
}

// In-memory Firestore double scoped to a single describe block so we can
// assert idempotency by counting writes to `_processedWebhookEvents`.
const eventStore = new Map<string, any>();
const orgStore = new Map<string, any>();
const userStore = new Map<string, any>();
const orgUpdates: Array<{ orgId: string; update: any }> = [];

function makeDocRef(collectionName: string, id: string) {
  return {
    id,
    get: jest.fn(async () => {
      if (collectionName === "_processedWebhookEvents") {
        const v = eventStore.get(id);
        return { exists: !!v, data: () => v };
      }
      if (collectionName === "organizations") {
        const v = orgStore.get(id);
        return { exists: !!v, data: () => v };
      }
      if (collectionName === "users") {
        const v = userStore.get(id);
        return { exists: !!v, data: () => v };
      }
      return { exists: false, data: () => undefined };
    }),
    set: jest.fn(async (data: any) => {
      if (collectionName === "_processedWebhookEvents") eventStore.set(id, data);
    }),
    update: jest.fn(async (update: any) => {
      if (collectionName === "organizations") {
        orgUpdates.push({ orgId: id, update });
        const existing = orgStore.get(id) || {};
        orgStore.set(id, { ...existing, ...update });
      }
    }),
  };
}

jest.mock("firebase-admin", () => {
  const collection = jest.fn((name: string) => ({
    doc: jest.fn((id: string) => makeDocRef(name, id)),
  }));
  const firestoreInstance = {
    collection,
    runTransaction: jest.fn(async (fn: any) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        set: async (ref: any, data: any) => ref.set(data),
        update: async (ref: any, data: any) => ref.update(data),
      };
      return fn(tx);
    }),
  };
  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => firestoreInstance),
    auth: jest.fn(() => ({
      verifyIdToken: jest.fn(async (token: string) => {
        if (token === "valid-token") return { uid: "user_1", email: "user@example.com" };
        throw new Error("invalid");
      }),
    })),
    apps: [],
    FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TS") },
  };
});

// Now load the handler module — its module-init code runs against the mocks.
import {
  billingWebhook,
  createCheckoutSession,
  createBillingPortalSession,
} from "../billingHandlers";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildReq(overrides: Record<string, any> = {}): any {
  const headers: Record<string, string> = {
    origin: "http://localhost",
    "content-type": "application/json",
    ...(overrides.headers || {}),
  };
  return {
    method: "POST",
    query: {},
    body: {},
    ...overrides,
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    header: (name: string) => headers[name.toLowerCase()],
  };
}

function buildRes(): any {
  const res: any = {
    headersSent: false,
    statusCode: 200,
    status: jest.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res;
}

beforeEach(() => {
  eventStore.clear();
  orgStore.clear();
  userStore.clear();
  orgUpdates.length = 0;

  const stripe = getStripeInstance();
  stripe.webhooks.constructEvent.mockReset();
  stripe.customers.create.mockReset();
  stripe.checkout.sessions.create.mockReset();
  stripe.subscriptions.retrieve.mockReset();
  stripe.billingPortal.sessions.create.mockReset();

  // Quiet expected error logs.
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.DASHBOARD_URL;
});

// ---------------------------------------------------------------------------
// billingWebhook
// ---------------------------------------------------------------------------

describe("billingWebhook", () => {
  test("returns 400 when stripe-signature header is missing", async () => {
    const req = buildReq({ headers: {} });
    const res = buildRes();

    await (billingWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing signature" });
  });

  test("returns 400 when raw body is missing (signature cannot be verified)", async () => {
    const req = buildReq({ headers: { "stripe-signature": "sig_x" } });
    const res = buildRes();

    await (billingWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Unable to verify webhook signature" });
  });

  test("returns 400 when Stripe rejects the signature", async () => {
    const req = buildReq({ headers: { "stripe-signature": "sig_x" } });
    (req as any).rawBody = Buffer.from("{}");
    const res = buildRes();

    const stripe = getStripeInstance();
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("Bad signature");
    });

    await (billingWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid signature" });
  });

  test("processes a checkout.session.completed event and updates org subscription", async () => {
    const req = buildReq({ headers: { "stripe-signature": "sig_x" } });
    (req as any).rawBody = Buffer.from("{}");
    const res = buildRes();

    const stripe = getStripeInstance();
    stripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { organizationId: "org_1", planId: "pro" },
          subscription: "sub_test_1",
          customer: "cus_test_1",
        },
      },
    });
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: "sub_test_1",
      status: "trialing",
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [{ price: { lookup_key: "pro_monthly", id: "price_test" } }] },
      metadata: { organizationId: "org_1", planId: "pro" },
    });

    await (billingWebhook as any)(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(orgUpdates).toHaveLength(1);
    expect(orgUpdates[0].orgId).toBe("org_1");
    expect(orgUpdates[0].update["subscription.status"]).toBe("trialing");
    expect(orgUpdates[0].update["subscription.stripeCustomerId"]).toBe("cus_test_1");
  });

  test("idempotency: same event id processed twice updates org once", async () => {
    const buildEvent = () => ({
      id: "evt_dup_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { organizationId: "org_1", planId: "pro" },
          subscription: "sub_test_1",
          customer: "cus_test_1",
        },
      },
    });

    const stripe = getStripeInstance();
    stripe.webhooks.constructEvent.mockReturnValueOnce(buildEvent());
    stripe.webhooks.constructEvent.mockReturnValueOnce(buildEvent());
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: "sub_test_1",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [{ price: { lookup_key: "pro_monthly", id: "price_test" } }] },
      metadata: { organizationId: "org_1", planId: "pro" },
    });

    const req1 = buildReq({ headers: { "stripe-signature": "sig_x" } });
    (req1 as any).rawBody = Buffer.from("{}");
    const res1 = buildRes();
    await (billingWebhook as any)(req1, res1);

    const req2 = buildReq({ headers: { "stripe-signature": "sig_x" } });
    (req2 as any).rawBody = Buffer.from("{}");
    const res2 = buildRes();
    await (billingWebhook as any)(req2, res2);

    // First call processes the event, second is recognised as duplicate.
    expect(res1.json).toHaveBeenCalledWith({ received: true });
    expect(res2.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    // Only one event is recorded in _processedWebhookEvents.
    expect(eventStore.size).toBe(1);
    expect(eventStore.has("stripe_billing_evt_dup_1")).toBe(true);
    // Side effect runs once: only one org update.
    expect(orgUpdates).toHaveLength(1);
    // subscriptions.retrieve only called for the first invocation.
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  });

  test("internal error path returns generic 500 + errorId (does not leak message)", async () => {
    const req = buildReq({ headers: { "stripe-signature": "sig_x" } });
    (req as any).rawBody = Buffer.from("{}");
    const res = buildRes();

    const stripe = getStripeInstance();
    stripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_boom_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { organizationId: "org_1", planId: "pro" },
          subscription: "sub_test_boom",
          customer: "cus_test_boom",
        },
      },
    });
    stripe.subscriptions.retrieve.mockRejectedValue(
      new Error("super-secret stripe internal error: db creds <REDACTED>"),
    );

    await (billingWebhook as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArgs = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonArgs.error).toBe("Internal server error");
    expect(jsonArgs.errorId).toMatch(/^[0-9a-f]{8}$/);
    // Critically, the secret error message must NOT be in the response.
    const serialized = JSON.stringify(jsonArgs);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("REDACTED");
  });
});

// ---------------------------------------------------------------------------
// createCheckoutSession + createBillingPortalSession redirect URL builder
// ---------------------------------------------------------------------------

describe("Checkout & Portal redirect URLs use DASHBOARD_URL", () => {
  test("createCheckoutSession uses DASHBOARD_URL for success/cancel URLs", async () => {
    process.env.DASHBOARD_URL = "https://realyn-app-staging-dashboard.web.app";

    userStore.set("user_1", { organizationId: "org_1" });
    orgStore.set("org_1", { name: "Acme Hotels" });

    const stripe = getStripeInstance();
    stripe.customers.create.mockResolvedValue({ id: "cus_new_1" });
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

    const req = buildReq({
      headers: { authorization: "Bearer valid-token" },
      body: { priceId: "price_pro", planId: "pro" },
    });
    const res = buildRes();

    await (createCheckoutSession as any)(req, res);

    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.success_url).toBe(
      "https://realyn-app-staging-dashboard.web.app/billing?success=true",
    );
    expect(params.cancel_url).toBe(
      "https://realyn-app-staging-dashboard.web.app/billing?canceled=true",
    );
    expect(res.json).toHaveBeenCalledWith({ url: "https://checkout.stripe.com/x" });
  });

  test("createCheckoutSession falls back to production URL when DASHBOARD_URL is unset", async () => {
    delete process.env.DASHBOARD_URL;

    userStore.set("user_1", { organizationId: "org_1" });
    orgStore.set("org_1", { name: "Acme Hotels" });

    const stripe = getStripeInstance();
    stripe.customers.create.mockResolvedValue({ id: "cus_new_2" });
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/y" });

    const req = buildReq({
      headers: { authorization: "Bearer valid-token" },
      body: { priceId: "price_pro" },
    });
    const res = buildRes();

    await (createCheckoutSession as any)(req, res);

    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.success_url).toBe("https://dashboard.realyn.app/billing?success=true");
    expect(params.cancel_url).toBe("https://dashboard.realyn.app/billing?canceled=true");
  });

  test("createCheckoutSession returns 401 when auth token is invalid", async () => {
    const req = buildReq({
      headers: { authorization: "Bearer NOT_VALID" },
      body: { priceId: "price_pro" },
    });
    const res = buildRes();

    await (createCheckoutSession as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  test("createCheckoutSession returns 400 when priceId is missing", async () => {
    userStore.set("user_1", { organizationId: "org_1" });
    orgStore.set("org_1", { name: "Acme" });
    const req = buildReq({
      headers: { authorization: "Bearer valid-token" },
      body: {},
    });
    const res = buildRes();

    await (createCheckoutSession as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing priceId" });
  });

  test("createBillingPortalSession uses DASHBOARD_URL for return_url", async () => {
    process.env.DASHBOARD_URL = "https://realyn-app-staging-dashboard.web.app";

    userStore.set("user_1", { organizationId: "org_1" });
    orgStore.set("org_1", { name: "Acme", subscription: { stripeCustomerId: "cus_test_1" } });

    const stripe = getStripeInstance();
    stripe.billingPortal.sessions.create.mockResolvedValue({
      url: "https://billing.stripe.com/x",
    });

    const req = buildReq({ headers: { authorization: "Bearer valid-token" } });
    const res = buildRes();

    await (createBillingPortalSession as any)(req, res);

    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledTimes(1);
    const params = stripe.billingPortal.sessions.create.mock.calls[0][0];
    expect(params.return_url).toBe("https://realyn-app-staging-dashboard.web.app/billing");
  });

  test("createBillingPortalSession returns 400 when org has no Stripe customer", async () => {
    userStore.set("user_1", { organizationId: "org_1" });
    orgStore.set("org_1", { name: "Acme" }); // no subscription.stripeCustomerId

    const req = buildReq({ headers: { authorization: "Bearer valid-token" } });
    const res = buildRes();

    await (createBillingPortalSession as any)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "No billing account found. Please subscribe first.",
    });
  });
});
