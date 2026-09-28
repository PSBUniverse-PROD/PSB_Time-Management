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

export async function POST(request) {
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
      headers: [
        ['Content-Type', 'application/json'],
        ['Set-Cookie', getClearPSBSessionCookieHeader()],
        ['Set-Cookie', getClearPSBUserPayloadCookieHeader()],
      ],
    });
  } catch (error) {
    console.error('Logout endpoint error:', error);

    // Still clear the cookie even if database operation fails
    const responseBody = JSON.stringify({ success: true, message: 'Logout complete' });

    return new Response(responseBody, {
      status: 200,
      headers: [
        ['Content-Type', 'application/json'],
        ['Set-Cookie', getClearPSBSessionCookieHeader()],
        ['Set-Cookie', getClearPSBUserPayloadCookieHeader()],
      ],
    });
  }
}