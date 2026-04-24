import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import Stripe from "stripe";
import { AdyenClient } from "../services/psp/adyenClient";
import { verifyUser, sendAuthError } from "../utils/authMiddleware";
import { ALLOWED_ORIGINS } from "../config/environment";

/**
 * Test Stripe connection
 */
export const testStripeConnection = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Verify authentication
    const authResult = await verifyUser(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    const { secretKey } = req.body;

    if (!secretKey || (!secretKey.startsWith("sk_") && !secretKey.startsWith("rk_"))) {
      res.status(400).json({
        success: false,
        message: "Invalid Stripe secret key format (should start with sk_ or rk_)",
        error: "INVALID_FORMAT",
      });
      return;
    }

    try {
      // Initialize Stripe with provided key
      const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" });

      // Test connection by listing payment intents (lightweight operation that requires PaymentIntents:Read)
      await stripe.paymentIntents.list({ limit: 1 });

      res.status(200).json({
        success: true,
        message: `Stripe connection successful. Account accessible.`,
      });
    } catch (error: any) {
      console.error("Stripe connection test failed:", error);
      
      let errorMessage = "Failed to connect to Stripe";
      if (error.type === "StripeAuthenticationError") {
        errorMessage = "Invalid API key. Please check your Stripe secret key.";
      } else if (error.type === "StripePermissionError") {
        errorMessage = "API key does not have required permissions.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(400).json({
        success: false,
        message: errorMessage,
        error: error.type || "CONNECTION_ERROR",
      });
    }
  }
);

/**
 * Test Adyen connection
 */
export const testAdyenConnection = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req: Request, res: Response): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Verify authentication
    const authResult = await verifyUser(req);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    const { apiKey, merchantAccount, liveEndpointPrefix } = req.body;

    if (!apiKey || !merchantAccount) {
      res.status(400).json({
        success: false,
        message: "Missing API key or merchant account",
        error: "MISSING_CREDENTIALS",
      });
      return;
    }

    try {
      // Use Adyen client service
      const client = new AdyenClient({
        apiKey,
        merchantAccount,
        liveEndpointPrefix,
      });

      const result = await client.testConnection();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          error: "CONNECTION_ERROR",
        });
      }
    } catch (error: any) {
      console.error("Adyen connection test failed:", error);
      
      // Extract error details
      const errorMsg = error.message || "";
      const errorStatus = error.response?.status;
      
      let errorMessage = "Failed to connect to Adyen";
      
      // Check for 401 errors - check both response status and error message
      if (errorStatus === 401 || errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
        errorMessage = "Invalid API key or merchant account. Please verify: 1) Your API key is correct and copied completely (including all characters), 2) The API key has 'API dispute management' permission enabled in Adyen Customer Area, 3) The merchant account code matches exactly (case-sensitive), 4) Your Adyen account is activated and ready for API access.";
      } else if (errorStatus === 403 || errorMsg.includes("403") || errorMsg.includes("Forbidden")) {
        errorMessage = "API key does not have required permissions";
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(400).json({
        success: false,
        message: errorMessage,
        error: "CONNECTION_ERROR",
      });
    }
  }
);

