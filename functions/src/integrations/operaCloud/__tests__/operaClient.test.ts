import axios from "axios";
import {OperaCloudClient} from "../operaClient";
import {OperaCloudConfig, OperaApiError} from "../types";

jest.mock("axios");
jest.mock("../operaAuth", () => ({
  getOperaToken: jest.fn().mockResolvedValue("mock-bearer-token"),
}));
jest.mock("../../../utils/encryption", () => ({
  decrypt: jest.fn((v: string) => `decrypted_${v}`),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(): OperaCloudConfig {
  return {
    gatewayUrl: "https://opera.example.com/oh/v1",
    authMode: "ocim",
    oauthClientId: "client-id",
    oauthClientSecret: "enc_secret",
    appKey: "enc_app_key",
    hotelCodes: ["HOTEL1"],
    status: "not_connected",
  };
}

describe("OperaCloudClient", () => {
  let mockRequest: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = jest.fn();
    mockedAxios.create.mockReturnValue({
      request: mockRequest,
      defaults: {headers: {}},
    } as any);
  });

  it("should inject Authorization and x-app-key headers", async () => {
    mockRequest.mockResolvedValueOnce({data: {ok: true}});

    const client = new OperaCloudClient(makeConfig());
    await client.get("/test");

    expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            "Authorization": "Bearer mock-bearer-token",
            "x-app-key": "decrypted_enc_app_key",
          }),
        }),
    );
  });

  it("should retry on 429 and succeed on second attempt", async () => {
    mockRequest
        .mockRejectedValueOnce({
          response: {status: 429, data: {}},
          message: "Too Many Requests",
        })
        .mockResolvedValueOnce({data: {success: true}});

    const client = new OperaCloudClient(makeConfig());
    const result = await client.get<{ success: boolean }>("/test");

    expect(result).toEqual({success: true});
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("should retry on 500 and succeed on third attempt", async () => {
    mockRequest
        .mockRejectedValueOnce({
          response: {status: 500, data: {}},
          message: "Internal Server Error",
        })
        .mockRejectedValueOnce({
          response: {status: 502, data: {}},
          message: "Bad Gateway",
        })
        .mockResolvedValueOnce({data: {ok: true}});

    const client = new OperaCloudClient(makeConfig());
    const result = await client.get<{ ok: boolean }>("/test");

    expect(result).toEqual({ok: true});
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("should throw OperaApiError when max retries exceeded", async () => {
    mockRequest.mockRejectedValue({
      response: {status: 500, data: {title: "Server Error"}},
      message: "Internal Server Error",
    });

    const client = new OperaCloudClient(makeConfig());

    await expect(client.get("/test")).rejects.toThrow(OperaApiError);
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("should not retry on 400 errors", async () => {
    mockRequest.mockRejectedValueOnce({
      response: {status: 400, data: {title: "Bad Request"}},
      message: "Bad Request",
    });

    const client = new OperaCloudClient(makeConfig());

    await expect(client.get("/test")).rejects.toThrow(OperaApiError);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("should pass params for GET requests", async () => {
    mockRequest.mockResolvedValueOnce({data: {items: []}});

    const client = new OperaCloudClient(makeConfig());
    await client.get("/search", {limit: 10});

    expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "/search",
          params: {limit: 10},
        }),
    );
  });

  it("should pass body for POST requests", async () => {
    mockRequest.mockResolvedValueOnce({data: {created: true}});

    const client = new OperaCloudClient(makeConfig());
    await client.post("/create", {name: "test"});

    expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: "/create",
          data: {name: "test"},
        }),
    );
  });
});
