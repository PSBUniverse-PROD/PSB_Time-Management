/**
 * Authentication Logout Endpoint
 * POST /api/auth/logout
 * Invalidates session and clears cookies
 *
 * Note: CORS headers are no longer needed. All SSO validation is done
 * locally via the psb_user_payload cookie (scoped to .psbuniverse.com).
 */

import { invalidateSession } from '@/core/auth/session.service';
import { getClearPSBSessionCookieHeader, getClearPSBUserPayloadCookieHeader, getPSBSessionCookieFromRequest } from '@/core/auth/cookies.utils';
import { getAuthCorsHeaders, resolveAllowedAuthOrigin } from '@/core/auth/cors.utils';

export const dynamic = 'force-dynamic';

function logoutHeaders(request) {
  const hostname = new URL(request.url).hostname;
  const domains = hostname === 'psbuniverse.com' || hostname.endsWith('.psbuniverse.com')
    ? ['.psbuniverse.com', '']
    : [''];
  return [
    ...Object.entries(getAuthCorsHeaders(request, 'POST, OPTIONS')),
    ...domains.flatMap((domain) => [
      ['Set-Cookie', getClearPSBSessionCookieHeader({ domain })],
      ['Set-Cookie', getClearPSBUserPayloadCookieHeader({ domain })],
    ]),
    ['Set-Cookie', 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax'],
  ];
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: getAuthCorsHeaders(request, 'POST, OPTIONS') });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (!origin || (origin !== new URL(request.url).origin && !resolveAllowedAuthOrigin(request))) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: getAuthCorsHeaders(request, 'POST, OPTIONS'),
    });
  }
  try {
    // Get token from request
    const token = getPSBSessionCookieFromRequest(request);

    // Invalidate session in database
    if (token) {
      await invalidateSession(token);
    }

    const responseBody = JSON.stringify({ success: true, message: 'Logged out successfully' });

    // Use new Response() with array-based headers to reliably produce TWO separate Set-Cookie headers.
    // NextResponse.headers.set() + .append() does NOT reliably handle multiple Set-Cookie headers
    // in Node.js runtime — the Headers API may merge them with commas which is invalid for Set-Cookie.
    return new Response(responseBody, {
      status: 200,
      headers: logoutHeaders(request),
    });
  } catch (error) {
    console.error('Logout endpoint error:', error);

    // Still clear the cookie even if database operation fails
    const responseBody = JSON.stringify({ success: true, message: 'Logout complete' });

    return new Response(responseBody, {
      status: 200,
      headers: logoutHeaders(request),
    });
  }
}