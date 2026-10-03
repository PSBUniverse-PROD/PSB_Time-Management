/**
 * Impersonation Endpoint ("log in as user")
 *
 * GET  /api/auth/impersonate  -> { canImpersonate: boolean } for the current session
 * POST /api/auth/impersonate  -> mints a session for { identifier } (username or email)
 *
 * Why this exists:
 * Support staff often need to reproduce a problem that only a specific user
 * sees. Asking for that person's password is unsafe and slow, so instead an
 * already-signed-in user with the right role swaps into the target's session.
 *
 * Security gate (server-side only):
 * The caller must hold a valid `psb_session` cookie AND an ACTIVE "CORE MANAGER"
 * role, resolved live through psb_m_userapproleaccess -> psb_s_role. Because the
 * check happens here on the server, nothing about it is sent to the browser: the
 * page can only ask "may I?", never grant itself permission. A user whose role
 * is deactivated or removed loses the ability immediately, with no redeploy.
 *
 * This bypasses the target user's password, so every check here matters.
 */

import { getSupabaseAdmin } from '@/core/supabase/admin';
import { createUserSession, isSessionInvalidated } from '@/core/auth/session.service';
import { verifyToken } from '@/core/auth/jwt.utils';
import {
  getPSBSessionCookieFromRequest,
  getPSBSessionCookieHeader,
  getPSBUserPayloadCookieHeader,
  getPSBImpersonatorSessionCookieFromRequest,
  getPSBImpersonatorSessionCookieHeader,
  getClearPSBImpersonatorSessionCookieHeader,
} from '@/core/auth/cookies.utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Build a small JSON response.
 * @param {Object} body - Body to serialize
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: [['Content-Type', 'application/json']],
  });
}

/**
 * The role allowed to impersonate. Override with IMPERSONATION_REQUIRED_ROLE if
 * the role is ever renamed in psb_s_role, so no code change is needed.
 * Matched case-insensitively against psb_s_role.role_name.
 */
const REQUIRED_ROLE_NAME = process.env.IMPERSONATION_REQUIRED_ROLE || 'CORE MANAGER';

function isActiveRow(record) {
  const value = record?.is_active;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  return !['false', '0', 'f', 'n', 'no'].includes(normalized);
}

/**
 * Resolve and fully verify the CALLER's own session.
 * This deliberately reads the caller's own psb_session cookie — never a
 * client-supplied user id — so the identity used for the role check cannot
 * be spoofed by the request body.
 * @param {Request} request
 * @returns {Promise<Object|null>} Decoded session payload, or null if absent/invalid
 */
async function resolveCallerSession(request) {
  const token = getPSBSessionCookieFromRequest(request);
  if (!token) return null;

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    return null;
  }

  // A token invalidated at logout must not count, even if not yet expired.
  if (await isSessionInvalidated(token)) return null;
  return payload;
}

async function resolveImpersonatorSession(request) {
  const token = getPSBImpersonatorSessionCookieFromRequest(request);
  if (!token) return null;

  try {
    const payload = await verifyToken(token);
    if (await isSessionInvalidated(token)) return null;
    return { token, payload };
  } catch {
    return null;
  }
}

/**
 * Check whether a verified session belongs to a user with an active
 * CORE MANAGER role. Active flags are normalized like the profile bootstrap,
 * which supports boolean, numeric, and common text representations.
 *
 * The user's own roles are re-read from the database on every call rather than
 * trusted from the JWT, so revoking the role takes effect immediately instead of
 * waiting for the session to expire.
 * @param {Object} payload - Verified session payload
 * @returns {Promise<boolean>} True when the caller may impersonate
 */
async function getCallerImpersonationAccess(payload) {
  if (!payload?.userId) return { allowed: false, reason: 'session_user_missing' };

  const supabaseAdmin = getSupabaseAdmin();

  // The caller's active app-role assignments.
  const { data: accessRows, error: accessError } = await supabaseAdmin
    .from('psb_m_userapproleaccess')
    .select('role_id, is_active')
    .eq('user_id', payload.userId);
  if (accessError) throw accessError;

  const roleIds = [...new Set((accessRows || [])
    .filter(isActiveRow)
    .map((r) => r.role_id)
    .filter(Boolean))];
  if (roleIds.length === 0) return { allowed: false, reason: 'no_active_assignments' };

  // Does any of those roles resolve to an active "CORE MANAGER" role?
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from('psb_s_role')
    .select('role_id, role_name, is_active')
    .in('role_id', roleIds);
  if (roleError) throw roleError;

  const requiredRoleName = REQUIRED_ROLE_NAME.trim().toLocaleLowerCase();
  const requiredRoles = (Array.isArray(roleRows) ? roleRows : []).filter((role) =>
    String(role?.role_name || '').trim().toLocaleLowerCase() === requiredRoleName,
  );
  if (requiredRoles.length === 0) return { allowed: false, reason: 'required_role_not_assigned' };
  if (!requiredRoles.some(isActiveRow)) return { allowed: false, reason: 'required_role_inactive' };
  return { allowed: true, reason: null };
}

async function callerCanImpersonate(payload) {
  const access = await getCallerImpersonationAccess(payload);
  return access.allowed;
}

// ── GET: may the current session impersonate? ────────────────────────────────
export async function GET(request) {
  try {
    const payload = await resolveCallerSession(request);
    const [access, impersonatorSession] = await Promise.all([
      getCallerImpersonationAccess(payload),
      resolveImpersonatorSession(request),
    ]);
    return json({
      canImpersonate: access.allowed,
      denialReason: access.reason,
      isImpersonating: Boolean(impersonatorSession),
    }, 200);
  } catch (error) {
    console.error('Impersonation permission check failed:', error);
    return json({ error: 'Unable to verify impersonation permission' }, 503);
  }
}

// ── POST: mint a session for the target user ────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body?.action === 'restore') {
      const originalSession = await resolveImpersonatorSession(request);
      if (!originalSession) return json({ error: 'Original session is no longer available' }, 401);

      const { token, payload } = originalSession;
      const maxAge = Number.isFinite(payload.expiresAt)
        ? Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1000))
        : undefined;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: [
          ['Content-Type', 'application/json'],
          ['Set-Cookie', getPSBSessionCookieHeader(token, { maxAge })],
          ['Set-Cookie', getPSBUserPayloadCookieHeader({
            userId: payload.userId,
            email: payload.email,
            fullName: payload.fullName,
            modules: payload.modules,
            roles: payload.roles,
          })],
          ['Set-Cookie', getClearPSBImpersonatorSessionCookieHeader()],
          ['Set-Cookie', 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax'],
        ],
      });
    }

    const caller = await resolveCallerSession(request);
    if (!caller) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!(await callerCanImpersonate(caller))) {
      return json({ error: 'Forbidden' }, 403);
    }

    if (await resolveImpersonatorSession(request)) {
      return json({ error: 'Return to your original account before impersonating another user' }, 409);
    }

    const identifier = String(body?.identifier || '').trim();
    if (!identifier) {
      return json({ error: 'A username or email is required' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Resolve the target user by username first, then by email.
    let targetUser = null;
    {
      const { data: byUsername } = await supabaseAdmin
        .from('psb_s_user')
        .select('*')
        .ilike('username', identifier)
        .maybeSingle();
      targetUser = byUsername || null;
    }
    if (!targetUser && identifier.includes('@')) {
      const { data: byEmail } = await supabaseAdmin
        .from('psb_s_user')
        .select('*')
        .eq('email', identifier)
        .maybeSingle();
      targetUser = byEmail || null;
    }

    if (!targetUser) {
      return json({ error: 'Target user not found' }, 404);
    }
    if (String(targetUser.user_id) === String(caller.userId)) {
      return json({ error: 'You are already signed in as this user' }, 400);
    }

    // Load the target's active roles so the new session carries the same
    // app/role access the target would normally get from a real sign-in.
    const { data: roleRows, error: targetRolesError } = await supabaseAdmin
      .from('psb_m_userapproleaccess')
      .select('*')
      .eq('user_id', targetUser.user_id);
    if (targetRolesError) throw targetRolesError;

    const roles = Array.isArray(roleRows) ? roleRows.filter(isActiveRow) : [];
    const moduleIds = [...new Set(roles.map((r) => r.app_id).filter(Boolean))];
    const roleIds = [...new Set(roles.map((r) => r.role_id).filter(Boolean))];

    const targetAuthUser = {
      id: targetUser.auth_user_id || targetUser.user_id,
      email: targetUser.email,
    };

    const session = await createUserSession(targetAuthUser, targetUser, roles);
    const callerToken = getPSBSessionCookieFromRequest(request);
    const restoreMaxAge = Number.isFinite(caller.expiresAt)
      ? Math.max(1, Math.floor((caller.expiresAt - Date.now()) / 1000))
      : undefined;

    // Audit trail (server logs only).
    console.log(
      `[Impersonate] admin userId=${caller.userId} -> target userId=${targetUser.user_id} (${targetUser.username || targetUser.email}) at ${new Date().toISOString()}`,
    );

    const responseBody = JSON.stringify({
      success: true,
      user: {
        id: targetUser.user_id,
        email: targetUser.email,
        name: `${targetUser.first_name || ''} ${targetUser.last_name || ''}`.trim(),
      },
    });

    // Array-form headers, matching login/route.js, so each cookie is emitted as
    // its own Set-Cookie header instead of being comma-merged (invalid for cookies).
    return new Response(responseBody, {
      status: 200,
      headers: [
        ['Content-Type', 'application/json'],
        ['Set-Cookie', getPSBSessionCookieHeader(session.token)],
        ['Set-Cookie', getPSBImpersonatorSessionCookieHeader(callerToken, { maxAge: restoreMaxAge })],
        ['Set-Cookie', getPSBUserPayloadCookieHeader({
          userId: targetUser.user_id,
          email: targetUser.email,
          fullName: `${targetUser.first_name || ''} ${targetUser.last_name || ''}`.trim(),
          modules: moduleIds,
          roles: roleIds,
        })],
        // Clear the admin's legacy Supabase cookie so client-side identity
        // resolution falls through to the impersonated psb_user_payload.
        ['Set-Cookie', 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax'],
      ],
    });
  } catch (error) {
    console.error('Impersonation endpoint error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
