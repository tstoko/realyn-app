/**
 * PMS Data Sanitizer
 *
 * Strips PAN (Primary Account Number) and other sensitive card data from
 * raw CSV row values BEFORE they enter the typed PMS data structures.
 *
 * PCI DSS compliance: full card numbers must never be stored. This layer
 * ensures only the last 4 digits survive.
 */

/**
 * Regex matching 13-19 consecutive digits (with optional spaces/dashes),
 * which covers all major card network PAN lengths.
 */
const PAN_PATTERN = /\b(\d[\d\s-]{11,22}\d)\b/g;

/**
 * Check if a purely-numeric string (spaces/dashes stripped) is a plausible PAN.
 */
function isPlausiblePAN(digits: string): boolean {
  return digits.length >= 13 && digits.length <= 19;
}

/**
 * Sanitize a single string value.
 * If it contains or IS a full PAN, truncate to last 4 digits.
 * Otherwise return unchanged.
 */
export function sanitizePAN(value: string): string {
  if (!value) return value;

  const stripped = value.replace(/[\s-]/g, "");

  // Direct full-value check: the entire string is a PAN
  if (/^\d+$/.test(stripped) && isPlausiblePAN(stripped)) {
    return stripped.slice(-4);
  }

  // Inline PAN replacement: card number embedded in text
  return value.replace(PAN_PATTERN, (match) => {
    const digits = match.replace(/[\s-]/g, "");
    if (isPlausiblePAN(digits)) {
      return `****${digits.slice(-4)}`;
    }
    return match;
  });
}

/**
 * Sanitize all string values in a key-value row.
 * Returns a new object; does not mutate the input.
 */
export function sanitizeRowValues(
    row: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizePAN(value);
  }
  return sanitized;
}
