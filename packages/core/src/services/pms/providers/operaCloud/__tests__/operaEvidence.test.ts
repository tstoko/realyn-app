import {
  fetchReservationEvidence,
  fetchFolioEvidence,
  fetchGuestProfile,
} from "../operaEvidence";
import {OperaCloudClient} from "../operaClient";

const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
} as unknown as jest.Mocked<OperaCloudClient>;

describe("fetchReservationEvidence", () => {
  beforeEach(() => jest.clearAllMocks());

  it("should map OHIP reservation response to PMSReservation", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      reservations: [
        {
          reservationGuests: [
            {givenName: "John", surname: "Smith", email: "john@test.com"},
          ],
          roomStay: {
            roomId: "405",
            roomType: "KING",
            ratePlanCode: "BAR",
            arrivalDate: "2026-03-01",
            departureDate: "2026-03-04",
            numberOfAdults: 2,
            numberOfChildren: 1,
            totalAmount: {amount: 450.0, currencyCode: "USD"},
          },
          reservationStatus: "CheckedOut",
          bookingChannel: "WEB",
          paymentMethods: [{paymentType: "CC", cardNumberLast4: "4242"}],
        },
      ],
    });

    const result = await fetchReservationEvidence(
        mockClient,
        "HOTEL1",
        "RES001",
    );

    expect(result.confirmationNumber).toBe("RES001");
    expect(result.guestName).toBe("Smith, John");
    expect(result.guestEmail).toBe("john@test.com");
    expect(result.checkIn).toBe("2026-03-01");
    expect(result.checkOut).toBe("2026-03-04");
    expect(result.roomNumber).toBe("405");
    expect(result.roomType).toBe("KING");
    expect(result.ratePlan).toBe("BAR");
    expect(result.totalAmount).toBe(45000);
    expect(result.currency).toBe("USD");
    expect(result.status).toBe("checked_out");
    expect(result.bookingSource).toBe("WEB");
    expect(result.paymentMethodLast4).toBe("4242");
    expect(result.adults).toBe(2);
    expect(result.children).toBe(1);
  });

  it("should handle no-show reservation", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      reservations: [
        {
          reservationGuests: [{givenName: "Jane", surname: "Doe"}],
          roomStay: {
            arrivalDate: "2026-03-01",
            departureDate: "2026-03-02",
            totalAmount: {amount: 100.0, currencyCode: "EUR"},
          },
          reservationStatus: "Reserved",
          noShow: true,
        },
      ],
    });

    const result = await fetchReservationEvidence(
        mockClient,
        "HOTEL1",
        "RES_NS",
    );

    expect(result.status).toBe("no_show");
  });

  it("should handle cancelled reservation", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      reservations: [
        {
          reservationGuests: [{surname: "Cancel"}],
          roomStay: {
            arrivalDate: "2026-04-01",
            departureDate: "2026-04-03",
          },
          cancellation: {cancellationDate: "2026-03-25"},
        },
      ],
    });

    const result = await fetchReservationEvidence(
        mockClient,
        "HOTEL1",
        "RES_CX",
    );

    expect(result.status).toBe("cancelled");
    expect(result.guestName).toBe("Cancel");
  });

  it("should handle missing fields without crashing (tolerant reader)", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      reservations: [{}],
    });

    const result = await fetchReservationEvidence(
        mockClient,
        "HOTEL1",
        "RES002",
    );

    expect(result.confirmationNumber).toBe("RES002");
    expect(result.guestName).toBe("Unknown");
    expect(result.totalAmount).toBe(0);
    expect(result.currency).toBe("USD");
    expect(result.status).toBe("confirmed");
    expect(result.checkIn).toBe("");
    expect(result.checkOut).toBe("");
  });

  it("should handle empty response gracefully", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({});

    const result = await fetchReservationEvidence(
        mockClient,
        "HOTEL1",
        "RES003",
    );

    expect(result.confirmationNumber).toBe("RES003");
    expect(result.guestName).toBe("Unknown");
    expect(result.checkIn).toBe("");
  });
});

describe("fetchFolioEvidence", () => {
  beforeEach(() => jest.clearAllMocks());

  it("should map OHIP folio response to PMSFolio", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      folios: [
        {
          folioWindows: [
            {
              postings: [
                {
                  transactionDate: "2026-03-01",
                  transactionCode: "ROOM",
                  description: "Room Charge",
                  amount: {amount: 150.0, currencyCode: "USD"},
                },
                {
                  transactionDate: "2026-03-01",
                  transactionCode: "TAX",
                  description: "City Tax",
                  amount: {amount: 15.0, currencyCode: "USD"},
                },
                {
                  transactionDate: "2026-03-01",
                  transactionCode: "CC_PAYMENT",
                  description: "Credit Card Payment",
                  amount: {amount: -165.0, currencyCode: "USD"},
                },
              ],
              balance: {amount: 0, currencyCode: "USD"},
            },
          ],
          totalCharges: {amount: 165.0, currencyCode: "USD"},
          totalPayments: {amount: 165.0, currencyCode: "USD"},
        },
      ],
    });

    const result = await fetchFolioEvidence(mockClient, "HOTEL1", "RES001");

    expect(result.confirmationNumber).toBe("RES001");
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0].category).toBe("room");
    expect(result.lines[0].amount).toBe(15000);
    expect(result.lines[0].description).toBe("Room Charge");
    expect(result.lines[1].category).toBe("tax");
    expect(result.lines[1].amount).toBe(1500);
    expect(result.lines[2].category).toBe("payment");
    expect(result.totalCharges).toBe(16500);
    expect(result.totalPayments).toBe(16500);
    expect(result.balance).toBe(0);
    expect(result.currency).toBe("USD");
  });

  it("should handle multiple folio windows", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      folios: [
        {
          folioWindows: [
            {
              postings: [
                {
                  transactionDate: "2026-03-01",
                  transactionCode: "ROOM",
                  description: "Room Night 1",
                  amount: {amount: 100.0, currencyCode: "GBP"},
                },
              ],
              balance: {amount: 50.0, currencyCode: "GBP"},
            },
            {
              postings: [
                {
                  transactionDate: "2026-03-02",
                  transactionCode: "FB_DINNER",
                  description: "Restaurant",
                  amount: {amount: 50.0, currencyCode: "GBP"},
                },
              ],
            },
          ],
          totalCharges: {amount: 150.0, currencyCode: "GBP"},
          totalPayments: {amount: 100.0, currencyCode: "GBP"},
        },
      ],
    });

    const result = await fetchFolioEvidence(mockClient, "HOTEL1", "RES_MW");

    expect(result.lines).toHaveLength(2);
    expect(result.lines[1].category).toBe("food_beverage");
    expect(result.balance).toBe(5000);
    expect(result.currency).toBe("GBP");
  });

  it("should handle empty folio response", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({});

    const result = await fetchFolioEvidence(mockClient, "HOTEL1", "RES002");

    expect(result.confirmationNumber).toBe("RES002");
    expect(result.lines).toHaveLength(0);
    expect(result.totalCharges).toBe(0);
    expect(result.totalPayments).toBe(0);
    expect(result.balance).toBe(0);
  });

  it("should fallback description to transactionCode when description missing", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      folios: [
        {
          folioWindows: [
            {
              postings: [
                {
                  transactionDate: "2026-03-01",
                  transactionCode: "LODGING",
                  amount: {amount: 200.0, currencyCode: "USD"},
                },
              ],
            },
          ],
          totalCharges: {amount: 200.0, currencyCode: "USD"},
          totalPayments: {amount: 0, currencyCode: "USD"},
        },
      ],
    });

    const result = await fetchFolioEvidence(mockClient, "HOTEL1", "RES_FB");

    expect(result.lines[0].description).toBe("LODGING");
    expect(result.lines[0].category).toBe("room");
  });
});

describe("fetchGuestProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("should extract guest name and primary email", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      profileInfo: {
        profile: {
          customer: {
            personName: [{givenName: "Jane", surname: "Doe"}],
          },
          emails: [
            {email: "alt@test.com", primary: false},
            {email: "jane@test.com", primary: true},
          ],
        },
      },
    });

    const result = await fetchGuestProfile(mockClient, "HOTEL1", "GUEST1");

    expect(result.name).toBe("Doe, Jane");
    expect(result.email).toBe("jane@test.com");
  });

  it("should use first email when no primary flagged", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      profileInfo: {
        profile: {
          customer: {
            personName: [{givenName: "Bob", surname: "Smith"}],
          },
          emails: [{email: "bob@test.com"}],
        },
      },
    });

    const result = await fetchGuestProfile(mockClient, "HOTEL1", "GUEST_NP");

    expect(result.name).toBe("Smith, Bob");
    expect(result.email).toBe("bob@test.com");
  });

  it("should handle missing profile data", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({});

    const result = await fetchGuestProfile(mockClient, "HOTEL1", "GUEST2");

    expect(result.name).toBe("Unknown");
    expect(result.email).toBeUndefined();
  });

  it("should handle profile with only surname", async () => {
    (mockClient.get as jest.Mock).mockResolvedValueOnce({
      profileInfo: {
        profile: {
          customer: {
            personName: [{surname: "OnlyLast"}],
          },
        },
      },
    });

    const result = await fetchGuestProfile(mockClient, "HOTEL1", "GUEST_SN");

    expect(result.name).toBe("OnlyLast");
    expect(result.email).toBeUndefined();
  });
});
