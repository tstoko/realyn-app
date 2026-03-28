import axios from "axios";
import {getOperaToken, clearTokenCache} from "../operaAuth";
import {OperaCloudConfig, OperaAuthError} from "../types";

jest.mock("axios");
jest.mock("../../../utils/encryption", () => ({
  decrypt: jest.fn((v: string) => `decrypted_${v}`),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(overrides?: Partial<OperaCloudConfig>): OperaCloudConfig {
  return {
    gatewayUrl: "https://opera.example.com/oh/v1",
    authMode: "ocim",
    oauthClientId: "client-id",
    oauthClientSecret: "enc_secret",
    appKey: "enc_app_key",
    hotelCodes: ["HOTEL1"],
    status: "not_connected",
    ...overrides,
  };
}

function fakeJwt(expUnix: number): string {
  const header = Buffer.from(JSON.stringify({alg: "RS256"})).toString(
      "base64url",
  );
  const payload = Buffer.from(JSON.stringify({exp: expUnix})).toString(
      "base64url",
  );
  return `${header}.${payload}.signature`;
}

describe("getOperaToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTokenCache();
  });

  it("should acquire OCIM token with client_credentials", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    mockedAxios.post.mockResolvedValueOnce({
      data: {access_token: token, expires_in: 3600},
    });

    const result = await getOperaToken(makeConfig());

    expect(result).toBe(token);
    expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://opera.example.com/oh/v1/oauth/v1/tokens",
        expect.objectContaining({grant_type: "client_credentials"}),
        expect.any(Object),
    );
  });

  it("should acquire SSD token with password grant", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    mockedAxios.post.mockResolvedValueOnce({
      data: {access_token: token},
    });

    const config = makeConfig({
      authMode: "ssd",
      integrationUsername: "user",
      integrationPassword: "enc_pass",
    });

    const result = await getOperaToken(config);

    expect(result).toBe(token);
    expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          grant_type: "password",
          username: "user",
          password: "decrypted_enc_pass",
        }),
        expect.any(Object),
    );
  });

  it("should return cached token on second call", async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
    mockedAxios.post.mockResolvedValueOnce({
      data: {access_token: token},
    });

    const config = makeConfig();
    await getOperaToken(config);
    const second = await getOperaToken(config);

    expect(second).toBe(token);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it("should refresh when token is expired", async () => {
    const expiredToken = fakeJwt(Math.floor(Date.now() / 1000) - 10);
    const freshToken = fakeJwt(Math.floor(Date.now() / 1000) + 3600);

    mockedAxios.post
        .mockResolvedValueOnce({data: {access_token: expiredToken}})
        .mockResolvedValueOnce({data: {access_token: freshToken}});

    const config = makeConfig();
    await getOperaToken(config);
    const result = await getOperaToken(config);

    expect(result).toBe(freshToken);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it("should throw OperaAuthError on 401", async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {error_description: "Invalid client"},
      },
      message: "Request failed",
    });

    await expect(getOperaToken(makeConfig())).rejects.toThrow(OperaAuthError);
  });

  it("should throw OperaAuthError on network error", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(getOperaToken(makeConfig())).rejects.toThrow(OperaAuthError);
  });

  it("should throw OperaAuthError for SSD mode without credentials", async () => {
    const config = makeConfig({authMode: "ssd"});
    await expect(getOperaToken(config)).rejects.toThrow(OperaAuthError);
  });
});
