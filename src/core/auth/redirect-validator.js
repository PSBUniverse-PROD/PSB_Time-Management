/**
 * Redirect URL Validator for PSBUniverse SSO
 * Prevents open redirect vulnerabilities by validating redirect URLs
 * against a whitelist of allowed subdomains and patterns.
 */

const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://www.psbuniverse.com";

// ── Configuration ───────────────────────────────────────────
const ALLOWED_HOST_SUFFIXES = [
  ".psbuniverse.com",
  ".vercel.app", // All Vercel deployments (dev, preview, CI, etc.)
];

// ── Public API ──────────────────────────────────────────────

/**
 * Validate a redirect URL to prevent open redirect vulnerabilities.
 *
 * Rules:
 * 1. URL must be parseable
 * 2. Only HTTP/HTTPS schemes allowed
 * 3. Host must be on the whitelist (end with .psbuniverse.com or be explicitly allowed)
 * 4. Relative paths are allowed (e.g., "/dashboard", "/gutter")
 * 5. Empty / null / undefined returns the default fallback URL
 *
 * @param {string} redirectUrl - The URL to validate
 * @param {string} [fallbackUrl="/dashboard"] - Default redirect if validation fails
 * @returns {string} Safe redirect URL
 */
export function validateRedirectUrl(redirectUrl, fallbackUrl = "/dashboard") {
  // If no redirect specified, return fallback
  if (!redirectUrl || typeof redirectUrl !== "string" || !redirectUrl.trim()) {
    return fallbackUrl;
  }

  const trimmed = redirectUrl.trim();

  // Allow relative paths (e.g., "/dashboard", "/gutter/dashboard")
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  // Only allow HTTP/HTTPS
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return fallbackUrl;
  }

  try {
    const url = new URL(trimmed);

    // Allow localhost on any port (for local development)
    if (url.hostname === "localhost") {
      return trimmed;
    }

    // Check host suffix whitelist
    const isAllowedSuffix = ALLOWED_HOST_SUFFIXES.some((suffix) =>
      url.host.endsWith(suffix),
    );

    if (isAllowedSuffix) {
      return trimmed;
    }

    // Not whitelisted — reject
    console.warn(`Redirect URL rejected (not whitelisted): ${trimmed}`);
    return fallbackUrl;
  } catch {
    // Invalid URL — reject
    console.warn(`Redirect URL rejected (invalid URL): ${trimmed}`);
    return fallbackUrl;
  }
}

/**
 * Build a safe login redirect URL.
 * If the return path is valid, appends it as a query parameter.
 *
 * @param {string} returnPath - The path/URL to return to after login
 * @returns {string} Login URL with optional redirect parameter
 */
export function buildLoginUrl(returnPath) {
  const loginUrl = new URL("/login", CORE_PORTAL_URL);

  if (returnPath) {
    const safeRedirect = validateRedirectUrl(returnPath);
    if (safeRedirect) {
      loginUrl.searchParams.set("redirect", safeRedirect);
    }
  }

  return loginUrl.toString();
}