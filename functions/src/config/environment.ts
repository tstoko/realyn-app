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
 * 1. FUNCTIONS_EMULATOR - set when running in emulator
 * 2. K_SERVICE - set in Cloud Run (production)
 * 3. NODE_ENV - traditional environment variable
 */
export function isProduction(): boolean {
  // If running in emulator, definitely not production
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return false;
  }
  
  // If K_SERVICE is set, we're in Cloud Run (production)
  if (process.env.K_SERVICE) {
    return true;
  }
  
  // Fall back to NODE_ENV
  return process.env.NODE_ENV === "production";
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
export function getEnvironment(): "production" | "development" | "test" {
  if (isTest()) return "test";
  if (isProduction()) return "production";
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
 * Get the Firebase project ID
 */
export function getProjectId(): string {
  return process.env.GCLOUD_PROJECT || 
         process.env.GCP_PROJECT || 
         process.env.FIREBASE_PROJECT_ID ||
         "realyn-app";
}

/**
 * Get the region for Cloud Functions
 */
export function getRegion(): string {
  return process.env.FUNCTION_REGION || "us-central1";
}
