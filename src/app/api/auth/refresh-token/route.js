/**
 * Token Refresh Endpoint
 * POST /api/auth/refresh-token
 * Refreshes expiring or valid tokens
 *
 * Note: CORS headers are no longer needed. All SSO validation is done
 * locally via the psb_user_payload cookie (scoped to .psbuniverse.com).
 */

import { verifyToken, getTokenTimeRemaining, generateToken } from '@/core/auth/jwt.utils';
import { getPSBSessionCookieFromRequest, getPSBSessionCookieHeader, getPSBUserPayloadCookieHeader } from '@/core/auth/cookies.utils';

// Refresh token if less than 2 hours remaining
const REFRESH_THRESHOLD = 2 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    // Get token from request
    let token = getPSBSessionCookieFromRequest(request);

    // Fallback: check request body
    if (!token) {
      const requestBody = await request.json();
      token = requestBody?.token;
    }

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'No session token found' }), {
        status: 401,
        headers: [['Content-Type', 'application/json']],
      });
    }

    // Verify token
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
        status: 401,
        headers: [['Content-Type', 'application/json']],
      });
    }

    // Check time remaining
    const timeRemaining = getTokenTimeRemaining(payload);

    // If more than threshold remaining, return existing token
    if (timeRemaining > REFRESH_THRESHOLD) {
      return new Response(JSON.stringify({
        success: true,
        token,
        refreshed: false,
        expiresAt: payload.expiresAt,
      }), {
        status: 200,
        headers: [['Content-Type', 'application/json']],
      });
    }

    // Refresh token - generate new token with same data
    const newToken = await generateToken(
      {
        userId: payload.userId,
        authUserId: payload.authUserId,
        email: payload.email,
        fullName: payload.fullName,
        modules: payload.modules,
        roles: payload.roles,
      },
      '24h'
    );

    const responseBody = JSON.stringify({
      success: true,
      token: newToken,
      refreshed: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Use new Response() with array-based headers to reliably produce TWO separate Set-Cookie headers.
    // When refreshing the session, we must also refresh the user payload cookie so both stay in sync.
    return new Response(responseBody, {
      status: 200,
      headers: [
        ['Content-Type', 'application/json'],
        ['Set-Cookie', getPSBSessionCookieHeader(newToken)],
        ['Set-Cookie', getPSBUserPayloadCookieHeader({
          userId: payload.userId,
          email: payload.email,
          fullName: payload.fullName,
          modules: payload.modules || [],
          roles: payload.roles || [],
        })],
      ],
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: [['Content-Type', 'application/json']],
    });
  }
}