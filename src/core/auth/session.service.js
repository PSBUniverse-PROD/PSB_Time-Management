/**
 * Session Service for PSBUniverse SSO
 * Manages session lifecycle, token generation, and module access
 */

'use server';

import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/core/supabase/admin';
import { generateToken, verifyToken } from '@/core/auth/jwt.utils';
import { getPSBSessionCookieFromRequest } from '@/core/auth/cookies.utils';

// ── Session Creation ────────────────────────────────────────────────────
/**
 * Create a new authenticated session for user
 * @param {Object} authUser - Supabase auth user
 * @param {Object} dbUser - Database user record
 * @param {Array} roles - User roles
 * @returns {Promise<{token: string, expiresAt: number}>} Session token and expiration
 */
export async function createUserSession(authUser, dbUser, roles) {
  try {
    if (!authUser || !dbUser) {
      throw new Error('Invalid user data');
    }

    // Extract module IDs from roles
    const moduleIds = [...new Set(roles.map((r) => r.app_id).filter(Boolean))];

    // Extract role IDs
    const roleIds = [...new Set(roles.map((r) => r.role_id).filter(Boolean))];

    // Generate JWT token
    const token = await generateToken(
      {
        userId: dbUser.user_id,
        authUserId: authUser.id,
        email: authUser.email,
        fullName: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
        modules: moduleIds,
        roles: roleIds,
      },
      '24h' // 24-hour expiration
    );

    // Optionally store session in database for tracking/invalidation
    await storeSessionRecord(authUser.id, dbUser.user_id, token);

    return {
      token,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  } catch (error) {
    console.error('Session creation error:', error);
    throw new Error('Failed to create session');
  }
}

// ── Session Retrieval & Validation ────────────────────────────────────────
/**
 * Get current session from request
 * @param {Request} request - Next.js request object
 * @returns {Promise<Object|null>} Decoded session payload or null
 */
export async function getSessionFromRequest(request) {
  try {
    const token = getPSBSessionCookieFromRequest(request);
    if (!token) {
      return null;
    }

    const payload = await verifyToken(token);
    return payload;
  } catch (error) {
    console.error('Session retrieval error:', error);
    return null;
  }
}

/**
 * Get current session from cookies (Server Action context)
 * @returns {Promise<Object|null>} Decoded session payload or null
 */
export async function getCurrentSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('psb_session')?.value;

    if (!token) {
      return null;
    }

    const payload = await verifyToken(token);
    return payload;
  } catch (error) {
    console.error('Session retrieval error:', error);
    return null;
  }
}

// ── Module Authorization ────────────────────────────────────────────────
/**
 * Check if session user has access to module
 * @param {Object} sessionPayload - Decoded session token
 * @param {string} moduleId - Module ID to check
 * @returns {boolean} True if user can access module
 */
export async function userHasModuleAccess(sessionPayload, moduleId) {
  if (!sessionPayload || !Array.isArray(sessionPayload.modules)) {
    return false;
  }
  return sessionPayload.modules.includes(moduleId);
}

/**
 * Load user's accessible modules from database
 * @param {string} userId - User ID (psb_s_user.user_id)
 * @returns {Promise<Array>} List of accessible modules
 */
export async function loadUserModules(userId) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Get user's active roles
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('psb_m_userapproleaccess')
      .select('app_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError || !Array.isArray(userRoles)) {
      return [];
    }

    // Get unique app/module IDs
    const moduleIds = [...new Set(userRoles.map((r) => r.app_id).filter(Boolean))];

    // Optionally enrich with application details
    if (moduleIds.length === 0) {
      return [];
    }

    const { data: applications } = await supabaseAdmin
      .from('psb_s_application')
      .select('app_id, app_name, app_code')
      .in('app_id', moduleIds);

    return applications || [];
  } catch (error) {
    console.error('Load user modules error:', error);
    return [];
  }
}

/**
 * Load user's accessible roles from database
 * @param {string} userId - User ID (psb_s_user.user_id)
 * @returns {Promise<Array>} List of user roles
 */
export async function loadUserRoles(userId) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: roles, error } = await supabaseAdmin
      .from('psb_m_userapproleaccess')
      .select('role_id, app_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error || !Array.isArray(roles)) {
      return [];
    }

    return roles;
  } catch (error) {
    console.error('Load user roles error:', error);
    return [];
  }
}

// ── Session Invalidation ────────────────────────────────────────────────
/**
 * Invalidate a session (logout)
 * @param {string} token - Session token to invalidate
 * @returns {Promise<void>}
 */
export async function invalidateSession(token) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Verify token first
    const payload = await verifyToken(token);

    // Record invalidation in database for audit trail
    await supabaseAdmin.from('psb_session_tokens').insert({
      auth_user_id: payload.authUserId,
      user_id: payload.userId,
      token_hash: hashToken(token),
      invalidated_at: new Date().toISOString(),
    });

    console.log('Session invalidated:', payload.userId);
  } catch (error) {
    console.error('Session invalidation error:', error);
    // Don't throw - allow logout to continue
  }
}

/**
 * Check if token has been invalidated
 * @param {string} token - Session token
 * @returns {Promise<boolean>} True if token is invalidated
 */
export async function isSessionInvalidated(token) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const hash = hashToken(token);

    const { data, error } = await supabaseAdmin
      .from('psb_session_tokens')
      .select('id')
      .eq('token_hash', hash)
      .maybeSingle();

    if (error) {
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Session validation check error:', error);
    return false;
  }
}

// ── Utility Functions ────────────────────────────────────────────────────
/**
 * Store session record in database
 * @param {string} authUserId - Supabase auth user ID
 * @param {string} userId - Database user ID
 * @param {string} token - JWT token
 * @returns {Promise<void>}
 */
async function storeSessionRecord(authUserId, userId, token) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const tokenHash = hashToken(token);

    console.log(`[SessionStore] Attempting to store session for user ${userId}, authUser ${authUserId}`);

    // Check for an existing active session for this user
    const { data: existingSession, error: lookupError } = await supabaseAdmin
      .from('psb_sessions')
      .select('id, token_hash')
      .eq('auth_user_id', authUserId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (lookupError) {
      console.error('[SessionStore] Lookup error:', lookupError);
      // Fall back to insert if lookup fails
      const { error: insertError } = await supabaseAdmin.from('psb_sessions').insert({
        auth_user_id: authUserId,
        user_id: userId,
        token_hash: tokenHash,
        created_at: now,
        expires_at,
        is_active: true,
      });

      if (insertError) {
        console.error('[SessionStore] Insert error (fallback):', insertError);
      } else {
        console.log(`[SessionStore] Inserted new session for user ${userId}`);
      }
      return;
    }

    if (existingSession?.id) {
      // Update the existing active session — prevents duplicate rows
      const { error: updateError } = await supabaseAdmin
        .from('psb_sessions')
        .update({
          token_hash: tokenHash,
          expires_at,
        })
        .eq('id', existingSession.id);

      if (updateError) {
        console.error('[SessionStore] Update error:', updateError);
      } else {
        console.log(`[SessionStore] Updated existing session ${existingSession.id} for user ${userId}`);
      }
    } else {
      // No active session found — create a new one
      const { error: insertError } = await supabaseAdmin.from('psb_sessions').insert({
        auth_user_id: authUserId,
        user_id: userId,
        token_hash: tokenHash,
        created_at: now,
        expires_at,
        is_active: true,
      });

      if (insertError) {
        console.error('[SessionStore] Insert error (new):', insertError);
      } else {
        console.log(`[SessionStore] Inserted new session for user ${userId}`);
      }
    }
  } catch (error) {
    // Table might not exist yet, log and continue
    console.error('[SessionStore] Unexpected error:', error);
  }
}

/**
 * Simple hash function for token (for audit trail)
 * @param {string} token - Token to hash
 * @returns {string} Token hash
 */
function hashToken(token) {
  if (typeof window === 'undefined') {
    // Use Node.js crypto
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  // Browser - just return first 50 chars + last 10
  return `${token.substring(0, 50)}...${token.substring(token.length - 10)}`;
}

/**
 * Clear expired sessions (cleanup job)
 * @returns {Promise<number>} Number of sessions cleared
 */
export async function clearExpiredSessions() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('psb_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('Error clearing expired sessions:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('Clear expired sessions error:', error);
    return 0;
  }
}
