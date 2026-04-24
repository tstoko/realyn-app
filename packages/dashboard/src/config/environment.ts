/**
 * Environment Configuration
 * 
 * Centralized configuration for environment-specific settings.
 * Uses VITE_* environment variables (Vite convention).
 */

// =============================================================================
// Environment Detection
// =============================================================================

export function getEnvironment(): "production" | "staging" | "development" {
  const env = import.meta.env.VITE_ENVIRONMENT;
  if (env === "production") return "production";
  if (env === "staging") return "staging";
  return "development";
}

export function isProduction(): boolean {
  return getEnvironment() === "production";
}

export function isStaging(): boolean {
  return getEnvironment() === "staging";
}

export function isDevelopment(): boolean {
  return getEnvironment() === "development";
}

// =============================================================================
// Firebase Functions Configuration
// =============================================================================

export function getFunctionsBaseUrl(): string {
  const url = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL;
  if (!url) {
    throw new Error(
      "Missing VITE_FIREBASE_FUNCTIONS_URL. Set it in your .env file."
    );
  }
  return url;
}

export const FUNCTIONS_BASE_URL = getFunctionsBaseUrl();

// =============================================================================
// Firebase Project Configuration
// =============================================================================

export function getProjectId(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing VITE_FIREBASE_PROJECT_ID. Set it in your .env file."
    );
  }
  return projectId;
}

export function getRegion(): string {
  return import.meta.env.VITE_FIREBASE_REGION || "us-central1";
}

// =============================================================================
// Feature Flags
// =============================================================================

export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === "true";
}

export function isDebugEnabled(): boolean {
  return import.meta.env.VITE_DEBUG === "true" || isDevelopment();
}
