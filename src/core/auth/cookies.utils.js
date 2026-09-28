/**
 * Cross-Subdomain Cookie Utilities for PSBUniverse SSO
 * Handles secure session cookie management across psbuniverse.com subdomains
 */

// ── Cookie Configuration ────────────────────────────────────────────
const COOKIE_NAME = 'psb_session';
const ENV = process.env.NEXT_PUBLIC_ENV || 'local';
const COOKIE_DOMAIN = ENV === 'prod' ? (process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '.psbuniverse.com') : '';
const COOKIE_PATH = '/';
const COOKIE_SECURE = ENV === 'prod';
const COOKIE_SAMESITE = 'Lax';
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours in seconds

// ── Cookie Setter ────────────────────────────────────────────────────────
/**
 * Set PSBUniverse session cookie (client-side)
 * @param {string} token - JWT token
 * @param {Object} [options] - Cookie options
 * @param {number} [options.maxAge] - Cookie age in seconds
 * @param {string} [options.domain] - Cookie domain
 * @returns {void}
 */
export function setPSBSessionCookie(token, options = {}) {
  if (typeof document === 'undefined') {
    return; // Server-side environment
  }

  if (!token) {
    clearPSBSessionCookie();
    return;
  }

  const maxAge = options.maxAge || COOKIE_MAX_AGE;
  const domain = options.domain || COOKIE_DOMAIN;

  // Construct cookie string with all required attributes
  let cookieStr = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  cookieStr += `; Path=${COOKIE_PATH}`;
  cookieStr += `; Max-Age=${maxAge}`;
  cookieStr += `; SameSite=${COOKIE_SAMESITE}`;

  if (domain) {
    cookieStr += `; Domain=${domain}`;
  }

  if (COOKIE_SECURE) {
    cookieStr += '; Secure';
  }

  document.cookie = cookieStr;
}

// ── Cookie Getter ────────────────────────────────────────────────────────
/**
 * Get PSBUniverse session cookie value (client-side)
 * @returns {string|null} Token value or null if not found
 */
export function getPSBSessionCookie() {
  if (typeof document === 'undefined') {
    return null; // Server-side environment
  }

  const match = document.cookie.match(new RegExp(`(^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}

// ── Cookie Remover ────────────────────────────────────────────────────────
/**
 * Clear PSBUniverse session cookie (client-side)
 * @returns {void}
 */
export function clearPSBSessionCookie() {
  if (typeof document === 'undefined') {
    return; // Server-side environment
  }

  // Set cookie with expiration in the past
  let cookieStr = `${COOKIE_NAME}=`;
  cookieStr += `; Path=${COOKIE_PATH}`;
  cookieStr += `; Max-Age=0`;
  cookieStr += `; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  cookieStr += `; SameSite=${COOKIE_SAMESITE}`;

  if (COOKIE_DOMAIN) {
    cookieStr += `; Domain=${COOKIE_DOMAIN}`;
  }

  if (COOKIE_SECURE) {
    cookieStr += '; Secure';
  }

  document.cookie = cookieStr;
}

// ── Server-Side Utilities ────────────────────────────────────────────────────
/**
 * Parse PSBUniverse session cookie from request headers (server-side)
 * @param {Request} request - Next.js request object
 * @returns {string|null} Token value or null
 */
export function getPSBSessionCookieFromRequest(request) {
  if (!request || !request.headers) {
    return null;
  }

  try {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
      return null;
    }

    const cookies = Object.fromEntries(
      cookieHeader
        .split(';')
        .map((cookie) => cookie.trim().split('='))
        .map(([name, value]) => [name, decodeURIComponent(value || '')])
    );

    return cookies[COOKIE_NAME] || null;
  } catch {
    return null;
  }
}

/**
 * Get Set-Cookie header string for server-side response
 * @param {string} token - JWT token
 * @param {Object} [options] - Cookie options
 * @returns {string} Set-Cookie header value
 */
export function getPSBSessionCookieHeader(token, options = {}) {
  const maxAge = options.maxAge || COOKIE_MAX_AGE;
  const domain = options.domain || COOKIE_DOMAIN;

  let cookieStr = `${COOKIE_NAME}=${encodeURIComponent(token || '')}`;
  cookieStr += `; Path=${COOKIE_PATH}`;
  cookieStr += `; Max-Age=${maxAge}`;
  cookieStr += `; SameSite=${COOKIE_SAMESITE}`;

  if (domain) {
    cookieStr += `; Domain=${domain}`;
  }

  if (COOKIE_SECURE) {
    cookieStr += '; Secure';
  }

  // Add HttpOnly for security
  cookieStr += '; HttpOnly';

  return cookieStr;
}

/**
 * Get Set-Cookie header for clearing session (server-side response)
 * @returns {string} Set-Cookie header value for clearing
 */
export function getClearPSBSessionCookieHeader() {
  const domain = COOKIE_DOMAIN;

  let cookieStr = `${COOKIE_NAME}=`;
  cookieStr += `; Path=${COOKIE_PATH}`;
  cookieStr += `; Max-Age=0`;
  cookieStr += `; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  cookieStr += `; SameSite=${COOKIE_SAMESITE}`;

  if (domain) {
    cookieStr += `; Domain=${domain}`;
  }

  if (COOKIE_SECURE) {
    cookieStr += '; Secure';
  }

  cookieStr += '; HttpOnly';

  return cookieStr;
}

// ── Shared Payload Cookie (for local JWT validation) ────────────────────────
const USER_PAYLOAD_COOKIE_NAME = 'psb_user_payload';
const USER_PAYLOAD_COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours

/**
 * Build a Set-Cookie header for the user payload cookie.
 * This cookie is NOT HttpOnly so client-side JS can read it for local JWT validation.
 * @param {Object} payload - User payload { userId, email, fullName, modules, roles }
 * @returns {string} Set-Cookie header value
 */
export function getPSBUserPayloadCookieHeader(payload = {}) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const domain = COOKIE_DOMAIN;

  let cookieStr = `${USER_PAYLOAD_COOKIE_NAME}=${encoded}`;
  cookieStr += `; Path=${COOKIE_PATH}`;
  cookieStr += `; Max-Age=${USER_PAYLOAD_COOKIE_MAX_AGE}`;
  cookieStr += `; SameSite=${COOKIE_SAMESITE}`;

  if (domain) {
    cookieStr += `; Domain=${domain}`;
  }

  if (COOKIE_SECURE) {
    cookieStr += '; Secure';
  }

  // NOT HttpOnly — client-side JS must be able to read this
  return cookieStr;
}

/**
 * Get Set-Cookie header for clearing the user payload cookie
 * @returns {string} Set-Cookie header value for clearing
 */
export function getClearPSBUserPayloadCookieHeader() {
  const domain = COOKIE_DOMAIN;

  let cookieStr = `${USER_PAYLOAD_COOKIE_NAME}=`;
  cookieStr += `; Path=${COOKIE_PATH}`;
  cookieStr += `; Max-Age=0`;
  cookieStr += `; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  cookieStr += `; SameSite=${COOKIE_SAMESITE}`;

  if (domain) {
    cookieStr += `; Domain=${domain}`;
  }

  if (COOKIE_SECURE) {
    cookieStr += '; Secure';
  }

  return cookieStr;
}

// ── Cookie Constants Export ────────────────────────────────────────────────
export const COOKIE_CONSTANTS = {
  NAME: COOKIE_NAME,
  DOMAIN: COOKIE_DOMAIN,
  PATH: COOKIE_PATH,
  SECURE: COOKIE_SECURE,
  SAMESITE: COOKIE_SAMESITE,
  MAX_AGE: COOKIE_MAX_AGE,
  USER_PAYLOAD_NAME: USER_PAYLOAD_COOKIE_NAME,
};
