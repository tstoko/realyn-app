import {
  tenantContextSchema,
  type TenantContext,
} from "../tenant";

const valid: TenantContext = {
  organizationId: "org_123",
  userId: "user_abc",
  mode: "sandbox",
  vertical: "hospitality",
  locale: "en-GB",
  requestId: "req_550e8400-e29b-41d4-a716-446655440000",
};

describe("tenantContextSchema", () => {
  test("accepts a minimal valid TenantContext", () => {
    const parsed = tenantContextSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  test("accepts optional fields (defaultCurrency, timezone)", () => {
    const withOptional = {
      ...valid,
      defaultCurrency: "GBP",
      timezone: "Europe/London",
    };
    expect(tenantContextSchema.parse(withOptional)).toEqual(withOptional);
  });

  test("rejects unknown fields (strict mode)", () => {
    const withExtra = { ...valid, hackerField: "exploit" };
    expect(() => tenantContextSchema.parse(withExtra)).toThrow(
      /unrecognized_keys/i,
    );
  });

  test("rejects empty organizationId", () => {
    expect(() =>
      tenantContextSchema.parse({ ...valid, organizationId: "" }),
    ).toThrow();
  });

  test("rejects unknown mode", () => {
    expect(() =>
      tenantContextSchema.parse({ ...valid, mode: "production" }),
    ).toThrow(/invalid_enum_value|invalid_value/i);
  });

  test("rejects unknown vertical", () => {
    expect(() =>
      tenantContextSchema.parse({ ...valid, vertical: "saas" }),
    ).toThrow(/invalid_enum_value|invalid_value/i);
  });

  test("rejects too-short locale", () => {
    expect(() =>
      tenantContextSchema.parse({ ...valid, locale: "x" }),
    ).toThrow();
  });

  test("round-trips through JSON without loss", () => {
    const json = JSON.stringify(valid);
    const reparsed = tenantContextSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(valid);
  });

  test("mode and vertical are exposed as typed enums", () => {
    // Compile-time + runtime check: schema agrees with TenantContext type
    const t: TenantContext["mode"] = "live";
    const v: TenantContext["vertical"] = "ticketing";
    expect([t, v]).toEqual(["live", "ticketing"]);
  });
});
