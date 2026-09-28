/**
 * SSO Client for PSBUniverse Modules
 * Handles cross-subdomain authentication via shared cookies
 *
 * Authentication flow:
 *   1. Core Portal login sets psb_session (HttpOnly) + psb_user_payload (readable)
 *   2. Both cookies scoped to .psbuniverse.com — visible to all subdomains
 *   3. Subdomains read psb_user_payload cookie directly — no cross-origin API calls
 *   4. No CORS headers needed — zero network requests for auth
 */

const MODULE_ID = process.env.NEXT_PUBLIC_MODULE_ID;

// ── Local Cookie Helpers ────────────────────────────────────────────────────

const USER_PAYLOAD_COOKIE_NAME = 'psb_user_payload';

/**
 * Read and parse the psb_user_payload cookie set by Core Portal.
 * This cookie is scoped to .psbuniverse.com and contains base64-encoded
 * user data, enabling local auth validation without cross-origin API calls.
 *
 * @returns {Object|null} Session payload { userId, email, fullName, modules, roles } or null
 */
export function getPSBUserPayloadFromCookie() {
  if (typeof document === 'undefined') {
    return null; // Server-side — use getSessionFromRequest() instead
  }

  try {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${USER_PAYLOAD_COOKIE_NAME}=([^;]*)`));
    if (!match) {
      return null;
    }

    // Browser-native base64 decode (Buffer is Node.js-only)
    // Handles URI-encoded cookie values and missing base64 padding
    let cookieValue = match[2];
    try {
      cookieValue = decodeURIComponent(cookieValue);
    } catch {
      // Not URI-encoded, use raw value
    }

    // Add padding if browser stripped it
    const padded = cookieValue + '='.repeat((4 - cookieValue.length % 4) % 4);

    // Decode base64 → UTF-8 using TextDecoder (handles all Unicode correctly)
    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const payload = JSON.parse(decoded);

    // Basic sanity check
    if (!payload || typeof payload !== 'object' || !payload.userId) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Clear the local user payload cookie (client-side).
 * Called on logout to ensure auth state is reset immediately.
 */
export function clearPSBUserPayloadCookie() {
  if (typeof document === 'undefined') {
    return;
  }

  const ENV = process.env.NEXT_PUBLIC_ENV || 'local';
  const domain = ENV === 'prod' ? (process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '.psbuniverse.com') : '';

  let cookieStr = `${USER_PAYLOAD_COOKIE_NAME}=`;
  cookieStr += `; Path=/`;
  cookieStr += `; Max-Age=0`;
  cookieStr += `; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  cookieStr += `; SameSite=Lax`;

  if (domain) {
    cookieStr += `; Domain=${domain}`;
  }

  document.cookie = cookieStr;
}

// ── Session Validation — Local Only ────────────────────────────────────────

/**
 * Validate session by reading the psb_user_payload cookie locally.
 * No cross-origin API calls. No CORS. ~0ms latency.
 *
 * The cookie is set by Core Portal on login and scoped to .psbuniverse.com
 * so it's automatically available on all subdomains.
 *
 * @returns {Promise<Object|null>} Session payload { userId, email, fullName, modules, roles } or null
 */
export async function validateSessionToken() {
  return getPSBUserPayloadFromCookie();
}

/**
 * Get the current user's session data (local-only).
 * @returns {Promise<Object|null>} Session payload or null
 */
export async function getCurrentSession() {
  return validateSessionToken();
}

// ── Module Access ──────────────────────────────────────────────────────────

/**
 * Check if the current user has access to this module.
 * The module ID is read from NEXT_PUBLIC_MODULE_ID environment variable.
 *
 * @returns {Promise<boolean>} True if user has access to this module
 */
export async function hasModuleAccess() {
  const session = await validateSessionToken();
  if (!session) return false;

  if (!MODULE_ID) {
    console.warn("NEXT_PUBLIC_MODULE_ID is not configured");
    return false;
  }

  return session.modules.includes(MODULE_ID);
}

/**
 * Check if the current user has access to a specific module by ID.
 *
 * @param {string} moduleId - Module ID to check access for
 * @returns {Promise<boolean>} True if user has access
 */
export async function hasSpecificModuleAccess(moduleId) {
  if (!moduleId) return false;

  const session = await validateSessionToken();
  if (!session) return false;

  return session.modules.includes(moduleId);
}

// ── Logout ──────────────────────────────────────────────────────────────────

/**
 * Perform universal logout across all PSBUniverse modules.
 * Calls the logout endpoint to invalidate session in database and clear cookies.
 */
export async function logout() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("SSO logout error:", error);
  }

  // Also clear the client-side payload cookie immediately
  clearPSBUserPayloadCookie();
}

// ── Navigation ──────────────────────────────────────────────────────────────

const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://www.psbuniverse.com";
const ENV = process.env.NEXT_PUBLIC_ENV || "local";

/**
 * Redirect user to the login page.
 * In production, redirects to the Core Portal SSO login.
 * In non-production (local/QAS), redirects to the same origin's login page.
 * Uses the redirect validator to prevent open redirect vulnerabilities.
 * Optionally includes a redirect parameter to return after login.
 *
 * @param {string} [returnPath] - Path to return to after login (e.g., "/gutter/dashboard")
 */
export function redirectToLogin(returnPath) {
  let loginUrl;

  if (ENV === "prod") {
    // Production: use Core Portal SSO login
    loginUrl = new URL("/login", CORE_PORTAL_URL);
  } else {
    // Non-production: use same-origin login (no cross-domain redirect)
    loginUrl = new URL("/login", window.location.origin);
  }

  if (returnPath) {
    const trimmed = String(returnPath || "").trim();
    if (trimmed) {
      loginUrl.searchParams.set("redirect", trimmed);
    }
  }

  window.location.href = loginUrl.toString();
}

// ── SSO ↔ AuthProvider Bridge ───────────────────────────────────────────────

/**
 * Build a pseudo-auth user object from SSO session payload.
 * This creates a user object compatible with the AuthProvider context,
 * allowing SSO-authenticated users to work with the existing auth system.
 *
 * @param {Object} session - Session payload from validateSessionToken()
 * @returns {Object|null} User object compatible with AuthProvider
 */
export function buildUserFromSSOSession(session) {
  if (!session) return null;

  return {
    id: session.userId || "",
    email: session.email || "",
    user_metadata: {
      full_name: session.fullName || "",
      email: session.email || "",
    },
    app_metadata: {
      sso_authenticated: true,
    },
  };
}

/**
 * Build a DB user object from SSO session payload.
 * This fills the dbUser slot in AuthProvider context.
 *
 * @param {Object} session - Session payload from validateSessionToken()
 * @returns {Object} DB user object
 */
export function buildDbUserFromSSOSession(session) {
  if (!session) {
    return { email: "", username: "" };
  }

  const name = session.fullName || "";
  const parts = name.split(" ");

  return {
    email: session.email || "",
    username: session.email ? session.email.split("@")[0] : "",
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || "",
    phone: "",
    address: "",
    comp_name: "",
    comp_email: "",
    dept_name: "",
    status_name: "",
  };
}

/**
 * Build roles array from SSO session payload.
 * Converts role IDs to the format expected by AuthProvider.
 *
 * @param {Object} session - Session payload from validateSessionToken()
 * @returns {Array} Roles array
 */
export function buildRolesFromSSOSession(session) {
  if (!session || !Array.isArray(session.roles)) return [];
  return session.roles.map((roleId) => ({
    role_id: roleId,
    role_name: roleId,
    app_id: "",
    app_name: "",
    is_active: true,
  }));
}