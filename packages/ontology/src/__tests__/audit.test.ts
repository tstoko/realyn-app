import { auditEventSchema, type AuditEvent } from "../audit";

const baseEvent: AuditEvent = {
  id: "evt_1",
  ts: "2026-05-20T14:00:00.000Z",
  actor: { type: "system" },
  entity: { type: "Dispute", id: "disp_123", organizationId: "org_1" },
  action: "dispute.markSubmitted",
};

describe("auditEventSchema", () => {
  test("accepts a minimal system actor event", () => {
    expect(auditEventSchema.parse(baseEvent)).toEqual(baseEvent);
  });

  test("accepts a user actor with userName", () => {
    const e: AuditEvent = {
      ...baseEvent,
      id: "evt_2",
      actor: { type: "user", userId: "u_42", userName: "Ada Lovelace" },
    };
    expect(auditEventSchema.parse(e)).toEqual(e);
  });

  test("accepts an automation actor with component", () => {
    const e: AuditEvent = {
      ...baseEvent,
      id: "evt_3",
      actor: { type: "automation", component: "onEvidencePlanQueued" },
    };
    expect(auditEventSchema.parse(e)).toEqual(e);
  });

  test("accepts an event with full before/after diff + requestId + mode", () => {
    const e: AuditEvent = {
      ...baseEvent,
      id: "evt_4",
      actionVersion: "v1",
      input: { force: true },
      before: { status: "draft" },
      after: { status: "submitted" },
      requestId: "req_xyz",
      mode: "sandbox",
    };
    expect(auditEventSchema.parse(e)).toEqual(e);
  });

  test("accepts before/after explicitly null (create / delete events)", () => {
    const createEvent: AuditEvent = {
      ...baseEvent,
      id: "evt_5",
      before: null,
      after: { id: "disp_123" },
    };
    expect(auditEventSchema.parse(createEvent).before).toBeNull();

    const deleteEvent: AuditEvent = {
      ...baseEvent,
      id: "evt_6",
      before: { id: "disp_123" },
      after: null,
    };
    expect(auditEventSchema.parse(deleteEvent).after).toBeNull();
  });

  test("rejects unknown actor variant (discriminated union)", () => {
    expect(() =>
      auditEventSchema.parse({
        ...baseEvent,
        actor: { type: "ghost" },
      }),
    ).toThrow(/invalid_union|invalid_discriminator|invalid_value/i);
  });

  test("rejects user actor missing userId", () => {
    expect(() =>
      auditEventSchema.parse({
        ...baseEvent,
        actor: { type: "user" },
      }),
    ).toThrow();
  });

  test("rejects automation actor missing component", () => {
    expect(() =>
      auditEventSchema.parse({
        ...baseEvent,
        actor: { type: "automation" },
      }),
    ).toThrow();
  });

  test("rejects unknown top-level fields (strict mode)", () => {
    expect(() =>
      auditEventSchema.parse({ ...baseEvent, hackerField: 1 }),
    ).toThrow(/unrecognized_keys/i);
  });

  test("rejects unknown entity fields (strict mode)", () => {
    expect(() =>
      auditEventSchema.parse({
        ...baseEvent,
        entity: { ...baseEvent.entity, extra: "x" },
      }),
    ).toThrow(/unrecognized_keys/i);
  });

  test("rejects empty action string", () => {
    expect(() =>
      auditEventSchema.parse({ ...baseEvent, action: "" }),
    ).toThrow();
  });

  test("rejects unknown mode value", () => {
    expect(() =>
      auditEventSchema.parse({ ...baseEvent, mode: "preview" }),
    ).toThrow(/invalid_enum_value|invalid_value/i);
  });

  test("round-trips through JSON without loss (with Date → ISO string)", () => {
    const e: AuditEvent = {
      ...baseEvent,
      id: "evt_rt",
      requestId: "req_xyz",
      mode: "live",
      input: { foo: "bar" },
    };
    const json = JSON.stringify(e);
    const reparsed = auditEventSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(e);
  });
});
