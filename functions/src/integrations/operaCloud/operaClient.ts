import axios, {AxiosInstance, AxiosRequestConfig} from "axios";
import {decrypt} from "../../utils/encryption";
import {getOperaToken} from "./operaAuth";
import {OperaCloudConfig, OperaApiError} from "./types";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class OperaCloudClient {
  private readonly config: OperaCloudConfig;
  private readonly http: AxiosInstance;
  private readonly decryptedAppKey: string;

  constructor(config: OperaCloudConfig) {
    this.config = config;
    this.decryptedAppKey = decrypt(config.appKey);
    this.http = axios.create({
      baseURL: config.gatewayUrl,
      timeout: 30_000,
      headers: {"Content-Type": "application/json"},
    });
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({method: "GET", url: path, params});
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({method: "POST", url: path, data: body});
  }

  private async request<T>(reqConfig: AxiosRequestConfig): Promise<T> {
    const token = await getOperaToken(this.config);

    const headers = {
      ...reqConfig.headers,
      "Authorization": `Bearer ${token}`,
      "x-app-key": this.decryptedAppKey,
    };

    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.request<T>({
          ...reqConfig,
          headers,
        });
        return response.data;
      } catch (error: any) {
        lastError = error;
        const status: number | undefined = error.response?.status;

        if (status && isRetryable(status) && attempt < MAX_RETRIES) {
          const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.warn(
              `[OperaClient] ${reqConfig.method} ${reqConfig.url} returned ${status}, ` +
              `retry ${attempt}/${MAX_RETRIES} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }

    const status = lastError?.response?.status ?? 0;
    const responseData = lastError?.response?.data as
      | Record<string, any>
      | undefined;
    const ohipCode = responseData?.errorCode ?? responseData?.type;
    const message =
      responseData?.detail ??
      responseData?.title ??
      lastError?.message ??
      "OPERA Cloud request failed";

    throw new OperaApiError(message, status, ohipCode, responseData?.detail);
  }
}
