/**
 * PMS File Import Cloud Function Handler
 *
 * HTTP endpoint for uploading and processing PMS exports (CSV, XML, delimited).
 * Accepts base64-encoded file data in JSON body with organizationId.
 */

import * as functions from "firebase-functions/v2";
import { processCSVImport } from "../services/pms/pmsImportService";
import { applyRateLimit, RATE_LIMIT_CONFIGS, getClientIP } from "../utils/rateLimiter";
import { verifyUserInOrganization, sendAuthError } from "../utils/authMiddleware";
import { assertFeatureEnabled, PlanLimitError, sendPlanLimitError } from "../utils/planEnforcement";
import { ALLOWED_ORIGINS } from "../config/environment";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const processCSVImportHandler = functions.https.onRequest(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { organizationId, uploadedBy } = req.body || {};

    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId" });
      return;
    }

    const authResult = await verifyUserInOrganization(req, organizationId);
    if (!authResult.success) {
      sendAuthError(res, authResult);
      return;
    }

    try {
      await assertFeatureEnabled(organizationId, "pmsIntegration");
    } catch (err) {
      if (err instanceof PlanLimitError) { sendPlanLimitError(res, err); return; }
      throw err;
    }

    const rateLimitKey = organizationId || getClientIP(req);
    const allowed = await applyRateLimit(req, res, rateLimitKey, RATE_LIMIT_CONFIGS.ai);
    if (!allowed) return;

    try {

      // Extract file data from the request
      // Support both base64-encoded body and raw text
      let fileBuffer: Buffer;
      let fileName: string;

      if (req.body?.csvData) {
        fileBuffer = Buffer.from(req.body.csvData, "base64");
        fileName = req.body.fileName || "import.dat";
      } else if (req.body?.csvText) {
        fileBuffer = Buffer.from(req.body.csvText, "utf-8");
        fileName = req.body.fileName || "import.dat";
      } else {
        res.status(400).json({ error: "Missing file data. Provide csvData (base64) or csvText in request body." });
        return;
      }

      if (fileBuffer.length > MAX_FILE_SIZE) {
        res.status(400).json({ error: `File too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). Maximum is 10MB.` });
        return;
      }

      if (fileBuffer.length === 0) {
        res.status(400).json({ error: "File is empty" });
        return;
      }

      console.log(`[PMSImport] Processing ${fileName} (${fileBuffer.length} bytes) for org ${organizationId}`);

      const result = await processCSVImport(
        organizationId,
        fileBuffer,
        fileName,
        uploadedBy || "system"
      );

      console.log(
        `[PMSImport] Complete: ${result.reservationCount} reservations, ` +
        `${result.folioCount} folios, ${result.warnings.length} warnings`
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("[PMSImport] Error:", error.message);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to process file import",
      });
    }
  }
);
