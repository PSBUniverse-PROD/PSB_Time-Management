import { createHash } from 'node:crypto';
import { verifyToken, getTokenTimeRemaining, generateToken } from '@/core/auth/jwt.utils';
import { getPSBSessionCookieFromRequest, getPSBSessionCookieHeader, getPSBUserPayloadCookieHeader } from '@/core/auth/cookies.utils';
import { getAuthCorsHeaders, resolveAllowedAuthOrigin } from '@/core/auth/cors.utils';
import { getSupabaseAdmin } from '@/core/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFRESH_THRESHOLD = 2 * 60 * 60 * 1000;

function corsHeaders(request) {
  return getAuthCorsHeaders(request, 'POST, OPTIONS');
}

function json(request, body, status) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !resolveAllowedAuthOrigin(request)) {
    return json(request, { success: false, error: 'Origin not allowed' }, 403);
  }

  try {
    let token = getPSBSessionCookieFromRequest(request);
    if (token && !origin) {
      return json(request, { success: false, error: 'Origin not allowed' }, 403);
    }
    if (!token) token = (await request.json().catch(() => null))?.token;
    if (!token) return json(request, { success: false, error: 'No session token found' }, 401);

    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return json(request, { success: false, error: 'Invalid or expired token' }, 401);
    }
    if (!payload.userId || !payload.authUserId) {
      return json(request, { success: false, error: 'Invalid session identity' }, 401);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: invalidation, error: invalidationError } = await supabaseAdmin
      .from('psb_session_tokens')
      .select('id')
      .eq('token_hash', createHash('sha256').update(token).digest('hex'))
      .maybeSingle();
    if (invalidationError) return json(request, { success: false, error: 'Unable to verify session' }, 503);
    if (invalidation) return json(request, { success: false, error: 'Session invalidated' }, 401);

    const timeRemaining = getTokenTimeRemaining(payload);
    if (timeRemaining > REFRESH_THRESHOLD) {
      return json(request, { success: true, token, refreshed: false, expiresAt: payload.expiresAt }, 200);
    }

    const { data: dbUser, error: userError } = await supabaseAdmin
      .from('psb_s_user')
      .select('user_id, auth_user_id, email, first_name, last_name, is_active')
      .eq('user_id', payload.userId)
      .eq('auth_user_id', payload.authUserId)
      .maybeSingle();
    if (userError) return json(request, { success: false, error: 'Unable to verify user' }, 503);
    if (!dbUser || ['false', '0', 'f', 'n', 'no'].includes(String(dbUser.is_active).toLowerCase())) {
      return json(request, { success: false, error: 'User is no longer active' }, 401);
    }

    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('psb_m_userapproleaccess')
      .select('app_id, role_id')
      .eq('user_id', dbUser.user_id)
      .eq('is_active', true);
    if (rolesError) return json(request, { success: false, error: 'Unable to verify access' }, 503);

    const sessionPayload = {
      userId: dbUser.user_id,
      authUserId: dbUser.auth_user_id,
      email: dbUser.email || payload.email,
      fullName: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
      modules: [...new Set((userRoles || []).map((role) => role.app_id).filter(Boolean))],
      roles: [...new Set((userRoles || []).map((role) => role.role_id).filter(Boolean))],
    };
    const newToken = await generateToken(sessionPayload, '24h');
    const renewedPayload = await verifyToken(newToken);
    if (payload.expiresAt <= Date.now() || payload.exp * 1000 <= Date.now()) {
      return json(request, { success: false, error: 'Session expired before renewal completed' }, 401);
    }

    return new Response(JSON.stringify({ success: true, token: newToken, refreshed: true, expiresAt: renewedPayload.expiresAt }), {
      status: 200,
      headers: [
        ...Object.entries(corsHeaders(request)),
        ['Set-Cookie', getPSBSessionCookieHeader(newToken)],
        ['Set-Cookie', getPSBUserPayloadCookieHeader(sessionPayload)],
      ],
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return json(request, { success: false, error: 'Unable to extend session' }, 500);
  }
}