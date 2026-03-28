import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import {verifyUser, sendAuthError} from "../utils/authMiddleware";
import {encrypt} from "../utils/encryption";
import {OperaCloudClient} from "../services/pms/providers/operaCloud/operaClient";
import {getOperaToken} from "../services/pms/providers/operaCloud/operaAuth";
import {
  OperaCloudConfig,
  OHIPHotelDetailsResponse,
} from "../services/pms/providers/operaCloud/types";
import {logOrgAuditEvent} from "../utils/orgAuditLogger";

/**
 * Test OPERA Cloud connection.
 * Follows the same pattern as testStripeConnection / testAdyenConnection.
 *
 * Secrets arrive in plaintext from the UI during the test call. We encrypt
 * them before passing to getOperaToken / OperaCloudClient so that the
 * decrypt() calls inside those modules work correctly.
 */
export const testOperaCloudConnection = onRequest(
    {cors: true},
    async (req: Request, res: Response): Promise<void> => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const authResult = await verifyUser(req);
      if (!authResult.success) {
        sendAuthError(res, authResult);
        return;
      }

      const {
        organizationId,
        gatewayUrl,
        authMode,
        oauthClientId,
        oauthClientSecret,
        appKey,
        enterpriseId,
        hotelCodes,
        integrationUsername,
        integrationPassword,
      } = req.body;

      if (!gatewayUrl || !oauthClientId || !oauthClientSecret || !appKey) {
        res.status(400).json({
          success: false,
          message:
          "Missing required fields: gatewayUrl, oauthClientId, oauthClientSecret, appKey",
          error: "MISSING_CREDENTIALS",
        });
        return;
      }

      if (!hotelCodes || !Array.isArray(hotelCodes) || hotelCodes.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one hotel code is required",
          error: "MISSING_CREDENTIALS",
        });
        return;
      }

      // Encrypt plaintext secrets so decrypt() inside auth/client modules works
      const config: OperaCloudConfig = {
        gatewayUrl,
        authMode: authMode ?? "ocim",
        oauthClientId,
        oauthClientSecret: encrypt(oauthClientSecret),
        appKey: encrypt(appKey),
        enterpriseId,
        hotelCodes,
        integrationUsername,
        integrationPassword: integrationPassword ?
        encrypt(integrationPassword) :
        undefined,
        status: "not_connected",
      };

      try {
        await getOperaToken(config);

        const client = new OperaCloudClient(config);

        // OHIP_VERIFY: lightweight test call — assumed GET /hot/v1/hotels/{code}
        await client.get<OHIPHotelDetailsResponse>(
            `/hot/v1/hotels/${encodeURIComponent(hotelCodes[0])}`,
        );

        if (organizationId) {
          await logOrgAuditEvent(organizationId, {
            action: "opera_cloud_connection_test",
            actor: {type: "user", userId: authResult.uid},
            details: {hotelCode: hotelCodes[0], result: "success"},
            status: "success",
          });
        }

        res.status(200).json({
          success: true,
          message: `OPERA Cloud connection successful for ${hotelCodes[0]}.`,
        });
      } catch (error: any) {
        console.error("OPERA Cloud connection test failed:", error);

        let errorMessage = "Failed to connect to OPERA Cloud";
        if (error.statusCode === 401 || error.message?.includes("401")) {
          errorMessage =
          "Invalid credentials. Verify your OAuth client ID/secret and app key.";
        } else if (error.statusCode === 403) {
          errorMessage = "Credentials lack required permissions.";
        } else if (error.message) {
          errorMessage = error.message;
        }

        if (organizationId) {
          await logOrgAuditEvent(organizationId, {
            action: "opera_cloud_connection_test",
            actor: {type: "user", userId: authResult.uid},
            details: {hotelCode: hotelCodes?.[0], error: errorMessage},
            status: "failure",
          });
        }

        res.status(400).json({
          success: false,
          message: errorMessage,
          error:
          error.name === "OperaAuthError" ? "AUTH_ERROR" : "CONNECTION_ERROR",
        });
      }
    },
);
