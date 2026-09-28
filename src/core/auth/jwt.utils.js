/**
 * JWT Utilities for PSBUniverse SSO
 * Handles token generation, validation, and management for cross-subdomain authentication
 */

import { jwtVerify, SignJWT } from 'jose';

// ── Configuration ────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRATION = '24h'; // 24 hours

// Convert secret to Uint8Array for jose library
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET);

// ── Token Schema ────────────────────────────────────────────
/**
 * JWT Token Payload Structure
 * @typedef {Object} JWTPayload
 * @property {string} userId - User ID from psb_s_user
 * @property {string} authUserId - Supabase auth user ID
 * @property {string} email - User email
 * @property {string} fullName - User full name
 * @property {string[]} modules - List of accessible module IDs
 * @property {string[]} roles - List of role IDs
 * @property {number} issuedAt - Token issued timestamp
 * @property {number} expiresAt - Token expiration timestamp
 */

// ── Token Generation ────────────────────────────────────────────
/**
 * Generate JWT token for authenticated user
 * @param {Object} userData - User data object
 * @param {string} userData.userId - User ID
 * @param {string} userData.authUserId - Supabase auth user ID
 * @param {string} userData.email - User email
 * @param {string} userData.fullName - User full name
 * @param {string[]} userData.modules - Accessible modules
 * @param {string[]} userData.roles - User roles
 * @param {string} [expiresIn='24h'] - Token expiration time
 * @returns {Promise<string>} Signed JWT token
 */
export async function generateToken(userData, expiresIn = JWT_EXPIRATION) {
  try {
    const now = Date.now();
    const expirationMs = parseExpirationTime(expiresIn);
    const expiresAt = now + expirationMs;

    const payload = {
      userId: userData.userId || '',
      authUserId: userData.authUserId || '',
      email: userData.email || '',
      fullName: userData.fullName || '',
      modules: Array.isArray(userData.modules) ? userData.modules : [],
      roles: Array.isArray(userData.roles) ? userData.roles : [],
      issuedAt: now,
      expiresAt,
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(getSecretKey());

    return token;
  } catch (error) {
    console.error('JWT generation error:', error);
    throw new Error('Failed to generate authentication token');
  }
}

// ── Token Verification ────────────────────────────────────────────
/**
 * Verify JWT token validity and extract payload
 * @param {string} token - JWT token to verify
 * @returns {Promise<JWTPayload>} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export async function verifyToken(token) {
  try {
    if (!token) {
      throw new Error('Token is required');
    }

    const { payload } = await jwtVerify(token, getSecretKey());

    // Additional expiration check
    if (payload.expiresAt && payload.expiresAt < Date.now()) {
      throw new Error('Token has expired');
    }

    return payload;
  } catch (error) {
    if (error.message.includes('expired')) {
      throw new Error('Token has expired');
    }
    console.error('JWT verification error:', error);
    throw new Error('Invalid or malformed token');
  }
}

// ── Token Validation ────────────────────────────────────────────
/**
 * Check if token has access to specific module
 * @param {JWTPayload} payload - Decoded token payload
 * @param {string} moduleId - Module ID to check
 * @returns {boolean} True if user has access to module
 */
export function hasModuleAccess(payload, moduleId) {
  if (!payload || !Array.isArray(payload.modules)) {
    return false;
  }
  return payload.modules.includes(moduleId);
}

/**
 * Check if token has specific role
 * @param {JWTPayload} payload - Decoded token payload
 * @param {string} roleId - Role ID to check
 * @returns {boolean} True if user has role
 */
export function hasRole(payload, roleId) {
  if (!payload || !Array.isArray(payload.roles)) {
    return false;
  }
  return payload.roles.includes(roleId);
}

/**
 * Check if token is still valid (not expired)
 * @param {JWTPayload} payload - Decoded token payload
 * @returns {boolean} True if token is valid
 */
export function isTokenValid(payload) {
  if (!payload || !payload.expiresAt) {
    return false;
  }
  return payload.expiresAt > Date.now();
}

// ── Utility Functions ────────────────────────────────────────────
/**
 * Parse expiration time string to milliseconds
 * @param {string} expiresIn - Expiration time (e.g., '24h', '7d', '1m')
 * @returns {number} Milliseconds
 */
function parseExpirationTime(expiresIn) {
  const match = expiresIn.match(/^(\d+)([hdms])$/);
  if (!match) {
    return 24 * 60 * 60 * 1000; // Default to 24 hours
  }

  const [, amount, unit] = match;
  const ms = parseInt(amount, 10);

  switch (unit) {
    case 's':
      return ms * 1000;
    case 'm':
      return ms * 60 * 1000;
    case 'h':
      return ms * 60 * 60 * 1000;
    case 'd':
      return ms * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/**
 * Calculate remaining time in token
 * @param {JWTPayload} payload - Decoded token payload
 * @returns {number} Remaining milliseconds
 */
export function getTokenTimeRemaining(payload) {
  if (!payload || !payload.expiresAt) {
    return 0;
  }
  return Math.max(0, payload.expiresAt - Date.now());
}

/**
 * Get token expiration date
 * @param {JWTPayload} payload - Decoded token payload
 * @returns {Date|null} Expiration date or null
 */
export function getTokenExpirationDate(payload) {
  if (!payload || !payload.expiresAt) {
    return null;
  }
  return new Date(payload.expiresAt);
}
