/**
 * Environment Configuration for Cloud Functions
 * 
 * Provides helpers to determine the current environment and
 * conditionally enable/disable features based on environment.
 */

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Check if running in production environment
 * 
 * In Firebase Functions, we check:
 * 1. REALYN_ENV - explicit override (set to "staging" on staging Cloud Run)
 * 2. FUNCTIONS_EMULATOR - set when running in emulator
 * 3. K_SERVICE - set in Cloud Run (production unless REALYN_ENV says otherwise)
 * 4. NODE_ENV - traditional environment variable
 */
export function isProduction(): boolean {
  if (process.env.REALYN_ENV === "staging") return false;
  if (process.env.FUNCTIONS_EMULATOR === "true") return false;
  if (process.env.K_SERVICE) return true;
  return process.env.NODE_ENV === "production";
}

/**
 * Check if running in staging environment
 */
export function isStaging(): boolean {
  return process.env.REALYN_ENV === "staging";
}

/**
 * Check if running in development/emulator environment
 */
export function isDevelopment(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" || 
         process.env.NODE_ENV === "development";
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

/**
 * Get the current environment name
 */
export function getEnvironment(): "production" | "staging" | "development" | "test" {
  if (isTest()) return "test";
  if (isProduction()) return "production";
  if (isStaging()) return "staging";
  return "development";
}

// =============================================================================
// Feature Flags
// =============================================================================

/**
 * Check if test/seed handlers should be enabled
 * These should ONLY be available in development/test environments
 */
export function shouldEnableTestHandlers(): boolean {
  return !isProduction();
}

/**
 * Check if debug logging should be enabled
 */
export function shouldEnableDebugLogging(): boolean {
  return !isProduction() || process.env.DEBUG_LOGGING === "true";
}

// =============================================================================
// Configuration Values
// =============================================================================

/**
 * Get the Firebase project ID.
 * Throws if no env var is set -- prevents silent fallback to production.
 */
export function getProjectId(): string {
  const projectId = process.env.GCLOUD_PROJECT || 
         process.env.GCP_PROJECT || 
         process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing Firebase project ID. Set GCLOUD_PROJECT, GCP_PROJECT, or FIREBASE_PROJECT_ID."
    );
  }
  return projectId;
}

/**
 * Get the region for Cloud Functions
 */
export function getRegion(): string {
  return process.env.FUNCTION_REGION || "us-central1";
}
