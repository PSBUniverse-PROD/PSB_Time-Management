/**
 * Session Introspection Endpoint (cross-subdomain, credentialed)
 * GET/OPTIONS /api/auth/introspect?module=<module_key>
 *
 * The single source of truth for module apps. The browser sends the
 * .psbuniverse.com `psb_session` cookie here automatically; core verifies it
 * with JWT_SECRET (which never leaves core), resolves the caller's module_key
 * to an app_id via psb_s_application, and reports identity, roles, and whether
 * the caller is authorized for that app. Modules carry no JWT_SECRET, no
 * Supabase keys, and no numeric app id — only their own module_key slug.
 */

import { verifyToken } from '@/core/auth/jwt.utils';
import { isSessionInvalidated } from '@/core/auth/session.service';
import { getPSBSessionCookieFromRequest } from '@/core/auth/cookies.utils';
import { getSupabaseAdmin } from '@/core/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── CORS: echo the Origin only for psbuniverse.com subdomains (+ localhost dev)
function resolveAllowedOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  try {
    const { hostname, protocol } = new URL(origin);
    const isPsb = hostname === 'psbuniverse.com' || hostname.endsWith('.psbuniverse.com');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if ((isPsb || isLocal) && (protocol === 'https:' || protocol === 'http:')) return origin;
  } catch {
    return '';
  }
  return '';
}

function corsHeaders(request) {
  const allowOrigin = resolveAllowedOrigin(request);
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-PSB-Module';
  }
  return headers;
}

function json(request, body, status) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

// Read the caller's module_key from ?module= or the X-PSB-Module header.
function readModuleKey(request) {
  let key = '';
  try {
    key = new URL(request.url).searchParams.get('module') || '';
  } catch {
    key = '';
  }
  if (!key) key = request.headers.get('x-psb-module') || '';
  return String(key || '').trim();
}

// Resolve a module_key slug to its active app_id via psb_s_application.
// Returns { appId } when found, { appId: null } when the key is unknown.
async function resolveAppIdByModuleKey(moduleKey) {
  if (!moduleKey) return { appId: null };
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('psb_s_application')
    .select('app_id, is_active')
    .eq('module_key', moduleKey)
    .maybeSingle();
  if (!data || !data.app_id) return { appId: null };
  if (data.is_active === false) return { appId: null };
  return { appId: String(data.app_id) };
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  try {
    const token = getPSBSessionCookieFromRequest(request);
    if (!token) {
      return json(request, { authenticated: false, error: 'No session token' }, 401);
    }

    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return json(request, { authenticated: false, error: 'Invalid or expired token' }, 401);
    }

    if (await isSessionInvalidated(token)) {
      return json(request, { authenticated: false, error: 'Session invalidated' }, 401);
    }

    const modules = Array.isArray(payload.modules) ? payload.modules.map(String) : [];
    const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];

    const moduleKey = readModuleKey(request);
    const { appId } = await resolveAppIdByModuleKey(moduleKey);

    // No module_key supplied → core itself (same-origin): a valid session is
    // enough. Key supplied but unknown → not authorized (moduleKnown:false lets
    // the shell show a clear "module not registered" message).
    let authorizedForApp;
    let moduleKnown;
    if (!moduleKey) {
      authorizedForApp = true;
      moduleKnown = true;
    } else if (appId === null) {
      authorizedForApp = false;
      moduleKnown = false;
    } else {
      authorizedForApp = modules.includes(appId);
      moduleKnown = true;
    }

    return json(
      request,
      {
        authenticated: true,
        authorizedForApp,
        moduleKnown,
        moduleKey: moduleKey || null,
        appId,
        userId: payload.userId,
        email: payload.email,
        fullName: payload.fullName,
        modules,
        roles,
        expiresAt: payload.expiresAt,
      },
      200,
    );
  } catch (error) {
    console.error('Introspect endpoint error:', error);
    return json(request, { authenticated: false, error: 'Internal server error' }, 500);
  }
}