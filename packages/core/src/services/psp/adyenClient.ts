/**
 * Adyen PSP API Client
 * Centralized client for all Adyen API operations
 */

import { Client, Config, EnvironmentEnum } from "@adyen/api-library";

export interface AdyenClientConfig {
  apiKey: string;
  merchantAccount: string | string[]; // Support both single and array (use first from array)
  liveEndpointPrefix?: string;
}

export interface AdyenDispute {
  disputeId: string;
  pspReference: string;
  originalReference: string;
  merchantAccount: string;
  amount: {
    value: number;
    currency: string;
  };
  status: string;
  reason?: string;
  eventDate?: string;
  defenseDeadline?: string;
  defenseReasonCode?: string;
}

export class AdyenClient {
  private client: Client;
  private config: Config;
  private credentials: AdyenClientConfig;

  /**
   * Detect environment from API key format
   * LIVE keys are typically: long (100+ chars), contain == and -, often start with AQE
   * TEST keys start with "test_"
   */
  private detectEnvironment(apiKey: string, liveEndpointPrefix?: string): EnvironmentEnum {
    if (apiKey.startsWith("test_")) {
      return EnvironmentEnum.TEST;
    }
    if (apiKey.startsWith("live_")) {
      return EnvironmentEnum.LIVE;
    }
    
    const isLikelyLiveKey = apiKey.length > 100 && 
                            apiKey.includes("==") && 
                            apiKey.includes("-");
    
    if (isLikelyLiveKey || liveEndpointPrefix) {
      return EnvironmentEnum.LIVE;
    }
    
    return EnvironmentEnum.TEST;
  }

  constructor(credentials: AdyenClientConfig) {
    this.credentials = credentials;
    const env = this.detectEnvironment(credentials.apiKey, credentials.liveEndpointPrefix);

    this.config = new Config({
      apiKey: credentials.apiKey,
      environment: env,
      liveEndpointUrlPrefix: (env === EnvironmentEnum.LIVE && credentials.liveEndpointPrefix)
        ? credentials.liveEndpointPrefix
        : undefined,
    });

    this.client = new Client(this.config);
  }

  /**
   * Get the base URL for the disputes API
   */
  private getDisputesApiUrl(): string {
    if (this.config.environment === EnvironmentEnum.LIVE) {
      const prefix = this.config.liveEndpointUrlPrefix || "pal-live";
      return `https://${prefix}.adyen.com/pal/servlet/DisputeService`;
    }
    return "https://pal-test.adyen.com/pal/servlet/DisputeService";
  }

  /**
   * Make a request to the Adyen Disputes API
   */
  private async makeDisputesRequest(action: string, requestBody: any): Promise<any> {
    const endpoint = `${this.getDisputesApiUrl()}/v1/${action}`;
    const jsonBody = JSON.stringify(requestBody);
    
    try {
      const response = await this.client.httpClient.request(
        endpoint,
        jsonBody,
        this.config,
        true // isApiKeyRequired
      );
      
      // httpClient.request returns a string (JSON) on success, or throws an exception
      if (typeof response === "string") {
        return JSON.parse(response);
      } else {
        // It's an exception
        const error: any = response;
        throw error;
      }
    } catch (error: any) {
      // Handle HTTP client exceptions
      if (error.statusCode) {
        const apiError: any = new Error(`Adyen API request failed: ${error.statusCode}`);
        apiError.response = {
          status: error.statusCode,
          data: error.message ? JSON.parse(error.message) : {},
        };
        throw apiError;
      }
      throw error;
    }
  }

  /**
   * Test connection to Adyen API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const merchantAccount = Array.isArray(this.credentials.merchantAccount) 
      ? this.credentials.merchantAccount[0] 
      : this.credentials.merchantAccount;
    
    try {
      // Use Disputes API instead of Checkout API - only requires "API dispute management" permission
      // Test by trying to list disputes with minimal page size
      await this.makeDisputesRequest("listDisputes", {
        merchantAccount: merchantAccount,
        pageSize: 1,
      });
      
      return {
        success: true,
        message: `Adyen connection successful (${this.config.environment} environment)`,
      };
    } catch (error: any) {
      // Extract error details
      const errorMsg = error.message || "";
      const errorStatus = error.response?.status;
      const is401 = errorStatus === 401 || errorMsg.includes("401") || errorMsg.includes("Unauthorized");
      
      // If we got a 401 and we're not using liveEndpointPrefix, try opposite environment
      // This handles cases where key format detection might be wrong
      if (is401 && !this.credentials.liveEndpointPrefix) {
        const detectedEnv = this.detectEnvironment(this.credentials.apiKey, this.credentials.liveEndpointPrefix);
        const currentEnv = this.config.environment;
        
        // If detected environment differs from current, retry with detected environment
        if (detectedEnv !== currentEnv) {
          console.log(`Adyen connection: Retrying with ${detectedEnv} environment (was ${currentEnv})`);
          
          // Create new config with detected environment
          const retryConfig = new Config({
            apiKey: this.credentials.apiKey,
            environment: detectedEnv,
            liveEndpointUrlPrefix: (detectedEnv === EnvironmentEnum.LIVE && this.credentials.liveEndpointPrefix)
              ? this.credentials.liveEndpointPrefix
              : undefined,
          });
          
          const retryClient = new Client(retryConfig);
          
          try {
            const retryEndpoint = detectedEnv === EnvironmentEnum.LIVE 
              ? `https://${retryConfig.liveEndpointUrlPrefix || "pal-live"}.adyen.com/pal/servlet/DisputeService/v1/listDisputes`
              : "https://pal-test.adyen.com/pal/servlet/DisputeService/v1/listDisputes";
            
            const retryResponse = await retryClient.httpClient.request(
              retryEndpoint,
              JSON.stringify({
                merchantAccount: merchantAccount,
                pageSize: 1,
              }),
              retryConfig,
              true // isApiKeyRequired
            );

            if (typeof retryResponse === "string") {
              // Success - update our config to match successful environment
              this.config.environment = detectedEnv;
              this.client = retryClient;
              
              return {
                success: true,
                message: `Adyen connection successful (${detectedEnv} environment - auto-detected)`,
              };
            }
          } catch (retryError: any) {
            // Fall through to error handling below with original error
            console.log(`Adyen connection: Retry with ${detectedEnv} also failed`);
          }
        }
      }
      
      // Standard error handling
      let errorMessage = "Connection failed";
      
      // Check for 401 errors - check both response status and error message
      if (is401) {
        errorMessage = `Invalid API key or merchant account (tried ${this.config.environment} environment). Please verify: 1) Your API key is correct and copied completely (including all characters), 2) The API key has 'API dispute management' permission enabled in Adyen Customer Area, 3) The merchant account code matches exactly (case-sensitive), 4) Your Adyen account is activated and ready for API access.`;
      } else if (errorStatus === 403 || errorMsg.includes("403") || errorMsg.includes("Forbidden")) {
        errorMessage = "API key does not have required permissions";
      } else if (
        errorMsg.includes("live url prefix") ||
        errorMsg.includes("liveEndpointUrlPrefix") ||
        errorMsg.includes("checkoutEndpoint")
      ) {
        errorMessage = "Live endpoint prefix is required after your account goes live with Adyen. Please provide your unique live URL prefix from Adyen Customer Area → Developers → API URLs. This is only needed after completing the go-live process.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Fetch all disputes for the merchant account
   */
  async getDisputes(limit: number = 100): Promise<AdyenDispute[]> {
    try {
      const merchantAccount = Array.isArray(this.credentials.merchantAccount) 
        ? this.credentials.merchantAccount[0] 
        : this.credentials.merchantAccount;
      const response = await this.makeDisputesRequest("listDisputes", {
        merchantAccount: merchantAccount,
      });
      
      // Transform Adyen dispute format to our interface
      const disputes: AdyenDispute[] = (response.disputes || []).map((dispute: any) => ({
        disputeId: dispute.disputeId || dispute.pspReference,
        pspReference: dispute.pspReference,
        originalReference: dispute.originalReference || dispute.pspReference,
        merchantAccount: dispute.merchantAccount || (Array.isArray(this.credentials.merchantAccount) ? this.credentials.merchantAccount[0] : this.credentials.merchantAccount),
        amount: dispute.amount || { value: 0, currency: "USD" },
        status: dispute.status || "OPEN",
        reason: dispute.reason,
        eventDate: dispute.eventDate,
        defenseDeadline: dispute.defenseDeadline,
        defenseReasonCode: dispute.defenseReasonCode,
      }));
      
      return disputes.slice(0, limit);
    } catch (error: any) {
      throw new Error(`Failed to fetch disputes: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * Get a specific dispute by ID
   */
  async getDispute(disputeId: string): Promise<AdyenDispute> {
    try {
      const merchantAccount = Array.isArray(this.credentials.merchantAccount) 
        ? this.credentials.merchantAccount[0] 
        : this.credentials.merchantAccount;
      const response = await this.makeDisputesRequest("retrieveDispute", {
        merchantAccount: merchantAccount,
        disputeId,
      });
      
      return {
        disputeId: response.disputeId || disputeId,
        pspReference: response.pspReference || disputeId,
        originalReference: response.originalReference || response.pspReference || disputeId,
        merchantAccount: response.merchantAccount || (Array.isArray(this.credentials.merchantAccount) ? this.credentials.merchantAccount[0] : this.credentials.merchantAccount),
        amount: response.amount || { value: 0, currency: "USD" },
        status: response.status || "OPEN",
        reason: response.reason,
        eventDate: response.eventDate,
        defenseDeadline: response.defenseDeadline,
        defenseReasonCode: response.defenseReasonCode,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch dispute ${disputeId}: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * Submit defense for a dispute
   */
  async defendDispute(
    disputeId: string,
    defenseRequest: {
      documents?: Array<{
        documentType: string;
        content: string;
        filename: string;
      }>;
      comment?: string;
      defenseReasonCode?: string;
    }
  ): Promise<any> {
    try {
      const merchantAccount = Array.isArray(this.credentials.merchantAccount) 
        ? this.credentials.merchantAccount[0] 
        : this.credentials.merchantAccount;
      const response = await this.makeDisputesRequest("defendDispute", {
        merchantAccount: merchantAccount,
        disputeId,
        defenseDocument: {
          documents: defenseRequest.documents,
          comment: defenseRequest.comment,
          defenseReasonCode: defenseRequest.defenseReasonCode,
        },
      });
      
      return response;
    } catch (error: any) {
      throw new Error(`Failed to defend dispute: ${error.message || "Unknown error"}`);
    }
  }

  /**
   * Accept a dispute (not contesting)
   */
  async acceptDispute(disputeId: string): Promise<any> {
    try {
      const merchantAccount = Array.isArray(this.credentials.merchantAccount) 
        ? this.credentials.merchantAccount[0] 
        : this.credentials.merchantAccount;
      const response = await this.makeDisputesRequest("acceptDispute", {
        merchantAccount: merchantAccount,
        disputeId,
      });
      
      return response;
    } catch (error: any) {
      throw new Error(`Failed to accept dispute: ${error.message || "Unknown error"}`);
    }
  }
}

