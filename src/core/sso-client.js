/**
 * SSO Client for PSBUniverse Modules
 * Handles cross-subdomain authentication via shared cookies
 *
 * Authentication flow:
 *   1. Core Portal login sets psb_session (HttpOnly) + psb_user_payload (readable)
 *   2. Both cookies are scoped to .psbuniverse.com — visible to all subdomains
 *   3. The browser sends psb_session to Core's /api/auth/introspect automatically
 *   4. Core verifies the signature with JWT_SECRET (which never leaves Core) and
 *      answers two questions: "who is this?" and "may they open the app I asked about?"
 *   5. The shell trusts that answer. It never verifies tokens itself and needs no
 *      numeric app id, no JWT secret, and no Supabase keys.
 *
 * Why the shell asks Core instead of reading its own cookie:
 *   psb_user_payload is a plain readable cookie, so anyone could edit it to claim
 *   access to any module. Introspection asks the one server that holds the signing
 *   key, so an edited or missing cookie changes nothing. The answer is cached for a
 *   few seconds (INTROSPECT_TTL_MS) so normal navigation costs one request rather
 *   than one per render.
 */

const MODULE_KEY = (process.env.NEXT_PUBLIC_MODULE_KEY || "").trim();
const INTROSPECT_CORE_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://www.psbuniverse.com";
// Core resolves introspection same-origin; a module (any non-core module_key)
// calls the core portal cross-origin with credentials.
// Core itself: leave NEXT_PUBLIC_MODULE_KEY unset so the question is simply
// "is this session valid?" rather than "is it valid for app X?".
export const IS_MODULE = Boolean(MODULE_KEY) && MODULE_KEY !== "psbuniverse";
const INTROSPECT_URL =
  (IS_MODULE ? INTROSPECT_CORE_URL : "") +
  "/api/auth/introspect" +
  (MODULE_KEY ? `?module=${encodeURIComponent(MODULE_KEY)}` : "");
const RENEW_SESSION_URL = (IS_MODULE ? INTROSPECT_CORE_URL : "") + "/api/auth/refresh-token";

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

// ── Verified Session via Core Introspection (single source of truth) ────────
// CORE alone holds JWT_SECRET and verifies the signed psb_session; this returns
// core's verified payload { userId, email, fullName, modules, roles,
// authorizedForApp, moduleKnown, appId }. A short cache keeps it to one request
// per navigation instead of one per render.
let introspectCache = { at: 0, data: null };
let introspectInFlight = null;
let introspectGeneration = 0;
const INTROSPECT_TTL_MS = 30_000;

async function fetchIntrospect() {
  const generation = introspectGeneration;
  try {
    const res = await fetch(INTROSPECT_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (generation !== introspectGeneration) return introspectCache.data ?? undefined;
    if (!res.ok) {
      if (res.status !== 401) {
        return introspectCache.data ?? undefined;
      }
      introspectCache = { at: Date.now(), data: null };
      return null;
    }
    const data = await res.json();
    if (generation !== introspectGeneration) return introspectCache.data ?? undefined;
    const payload = data && data.authenticated ? data : null;
    introspectCache = { at: Date.now(), data: payload };
    return payload;
  } catch {
    // Core unreachable / transient network error: keep the last known result
    // rather than hard-logging-out mid-session.
    return introspectCache.data ?? undefined;
  } finally {
    if (generation === introspectGeneration) introspectInFlight = null;
  }
}

/**
 * Return the current VERIFIED session payload from core, or null for an ended session.
 * Returns undefined when core is unavailable and no verified result is cached.
 * Shape: { userId, email, fullName, modules, roles, authorizedForApp, moduleKnown, appId }
 * @param {{forceRefresh?: boolean}} [options] Bypass the short-lived result cache.
 * @returns {Promise<Object|null|undefined>}
 */
export async function validateSessionToken({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && introspectCache.data && now - introspectCache.at < INTROSPECT_TTL_MS) {
    return introspectCache.data;
  }
  if (introspectInFlight) return introspectInFlight;
  introspectInFlight = fetchIntrospect();
  return introspectInFlight;
}

/**
 * Clear the cached introspection result (e.g. on logout).
 */
export function clearIntrospectCache() {
  introspectGeneration += 1;
  introspectCache = { at: 0, data: null };
  introspectInFlight = null;
}

export async function extendSession() {
  if (introspectInFlight) await introspectInFlight;
  const response = await fetch(RENEW_SESSION_URL, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to extend session. Please try again.");
    error.status = response.status;
    throw error;
  }
  if (!payload?.success || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
    throw new Error("Unable to confirm the new session expiry. Please try again.");
  }
  clearIntrospectCache();
  return payload;
}

/**
 * Get the current user's session data (verified via core).
 * @returns {Promise<Object|null>} Session payload or null
 */
export async function getCurrentSession() {
  return validateSessionToken();
}

// ── Module Access ──────────────────────────────────────────────────────────

/**
 * Check if the current user may open THIS deployment's module.
 * The decision is core's: hasModuleAccess() asks /api/auth/introspect with this
 * deployment's NEXT_PUBLIC_MODULE_KEY and returns core's verified
 * authorizedForApp, which core resolved against its own app registry.
 * @returns {Promise<boolean>} True if user has access to this module
 */
export async function hasModuleAccess() {
  const session = await validateSessionToken();
  // Core decides authorization for THIS deployment's module_key and returns it
  // as authorizedForApp. Never re-derive from appId/modules here — that would
  // let a caller probe a different app.
  return Boolean(session && session.authorizedForApp === true);
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
  if (!session || !Array.isArray(session.modules)) return false;

  return session.modules.map(String).includes(String(moduleId));
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

  // Also clear the client-side payload cookie + cached introspection immediately
  clearPSBUserPayloadCookie();
  clearIntrospectCache();
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

  if (IS_MODULE || ENV === "prod") {
    // Production: use Core Portal SSO login
    loginUrl = new URL("/login", CORE_PORTAL_URL);
  } else {
    // Non-production: use same-origin login (no cross-domain redirect)
    loginUrl = new URL("/login", window.location.origin);
  }

  if (returnPath) {
    const trimmed = String(returnPath || "").trim();
    if (trimmed) {
      loginUrl.searchParams.set("redirect", IS_MODULE ? new URL(trimmed, window.location.origin).href : trimmed);
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