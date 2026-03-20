import axios from "axios";
import {decrypt} from "../../utils/encryption";
import {
  OperaCloudConfig,
  OperaAuthError,
  OHIPTokenResponse,
} from "./types";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

const REFRESH_BUFFER_MS = 60_000;

function cacheKey(config: OperaCloudConfig): string {
  return `${config.gatewayUrl}::${config.oauthClientId}`;
}

function parseJwtExp(jwt: string): number | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString(),
    );
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Obtain (or return cached) OHIP OAuth token.
 *
 * OHIP_VERIFY: token endpoint path — assumed {gatewayUrl}/oauth/v1/tokens
 * OHIP_VERIFY: OCIM uses client_credentials grant
 * OHIP_VERIFY: SSD uses password grant with integration user credentials
 */
export async function getOperaToken(
    config: OperaCloudConfig,
): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - REFRESH_BUFFER_MS > Date.now()) {
    return cached.token;
  }

  const tokenUrl = `${config.gatewayUrl}/oauth/v1/tokens`;
  const clientSecret = decrypt(config.oauthClientSecret);

  let body: Record<string, string>;

  if (config.authMode === "ocim") {
    body = {
      grant_type: "client_credentials",
      client_id: config.oauthClientId,
      client_secret: clientSecret,
    };
  } else {
    if (!config.integrationUsername || !config.integrationPassword) {
      throw new OperaAuthError(
          "SSD auth mode requires integrationUsername and integrationPassword",
      );
    }
    const integrationPassword = decrypt(config.integrationPassword);
    body = {
      grant_type: "password",
      client_id: config.oauthClientId,
      client_secret: clientSecret,
      username: config.integrationUsername,
      password: integrationPassword,
    };
  }

  try {
    console.log(
        `[OperaAuth] Requesting token for ${config.gatewayUrl} (mode=${config.authMode})`,
    );

    const response = await axios.post<OHIPTokenResponse>(tokenUrl, body, {
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      timeout: 15_000,
    });

    const accessToken = response.data?.access_token;
    if (!accessToken) {
      throw new OperaAuthError("Token response missing access_token");
    }

    const jwtExp = parseJwtExp(accessToken);
    const expiresAt =
      jwtExp ?? Date.now() + (response.data?.expires_in ?? 3600) * 1000;

    tokenCache.set(key, {token: accessToken, expiresAt});

    console.log(
        `[OperaAuth] Token acquired, expires at ${new Date(expiresAt).toISOString()}`,
    );

    return accessToken;
  } catch (error: any) {
    if (error instanceof OperaAuthError) throw error;

    const status = error.response?.status;
    const rawMsg =
      error.response?.data?.error_description ??
      error.response?.data?.message ??
      error.message ??
      "Unknown auth error";

    const msg = String(rawMsg).substring(0, 200);
    console.error(`[OperaAuth] Token request failed (${status}): ${msg}`);
    throw new OperaAuthError(msg, status);
  }
}

/** Clear cached tokens — used in tests and forced re-auth. */
export function clearTokenCache(): void {
  tokenCache.clear();
}
