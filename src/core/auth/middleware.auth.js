/**
 * Module Authorization Middleware for PSBUniverse SSO
 * Used by modules to validate session tokens and check module access
 */

import { NextResponse } from 'next/server';
import { verifyToken } from '@/core/auth/jwt.utils';
import { getPSBSessionCookieFromRequest } from '@/core/auth/cookies.utils';
import { isSessionInvalidated } from '@/core/auth/session.service';

// ── Middleware Factory ────────────────────────────────────────────────────
/**
 * Create middleware for protecting API routes
 * @param {string} moduleId - Module ID to verify access
 * @param {Function} handler - Route handler function
 * @returns {Function} Middleware handler
 */
export function withModuleAuth(moduleId, handler) {
  return async (request) => {
    try {
      const token = getPSBSessionCookieFromRequest(request);

      if (!token) {
        return NextResponse.json(
          { error: 'Unauthorized: No session token' },
          { status: 401 }
        );
      }

      // Verify token
      let payload;
      try {
        payload = await verifyToken(token);
      } catch (error) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid token' },
          { status: 401 }
        );
      }

      // Check if token is invalidated
      const invalidated = await isSessionInvalidated(token);
      if (invalidated) {
        return NextResponse.json(
          { error: 'Unauthorized: Session invalidated' },
          { status: 401 }
        );
      }

      // Check module access
      if (!payload.modules || !payload.modules.includes(moduleId)) {
        return NextResponse.json(
          { error: 'Forbidden: No access to module' },
          { status: 403 }
        );
      }

      // Attach payload to request for handler
      request.sessionPayload = payload;
      request.userId = payload.userId;
      request.modules = payload.modules;

      // Call handler
      return handler(request);
    } catch (error) {
      console.error('Module auth middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Create middleware for validating session only (no module check)
 * @param {Function} handler - Route handler function
 * @returns {Function} Middleware handler
 */
export function withSessionAuth(handler) {
  return async (request) => {
    try {
      const token = getPSBSessionCookieFromRequest(request);

      if (!token) {
        return NextResponse.json(
          { error: 'Unauthorized: No session token' },
          { status: 401 }
        );
      }

      // Verify token
      let payload;
      try {
        payload = await verifyToken(token);
      } catch (error) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid token' },
          { status: 401 }
        );
      }

      // Check if token is invalidated
      const invalidated = await isSessionInvalidated(token);
      if (invalidated) {
        return NextResponse.json(
          { error: 'Unauthorized: Session invalidated' },
          { status: 401 }
        );
      }

      // Attach payload to request for handler
      request.sessionPayload = payload;
      request.userId = payload.userId;
      request.modules = payload.modules;

      // Call handler
      return handler(request);
    } catch (error) {
      console.error('Session auth middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Validate session token from request
 * @param {Request} request - Next.js request
 * @param {string} [moduleId] - Optional module ID to check
 * @returns {Promise<{valid: boolean, payload: Object|null, error: string|null}>}
 */
export async function validateRequestSession(request, moduleId) {
  try {
    const token = getPSBSessionCookieFromRequest(request);

    if (!token) {
      return {
        valid: false,
        payload: null,
        error: 'No session token found',
      };
    }

    // Verify token
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (error) {
      return {
        valid: false,
        payload: null,
        error: 'Invalid or expired token',
      };
    }

    // Check if token is invalidated
    const invalidated = await isSessionInvalidated(token);
    if (invalidated) {
      return {
        valid: false,
        payload: null,
        error: 'Session has been invalidated',
      };
    }

    // Check module access if provided
    if (moduleId) {
      if (!payload.modules || !payload.modules.includes(moduleId)) {
        return {
          valid: false,
          payload,
          error: `No access to module: ${moduleId}`,
        };
      }
    }

    return {
      valid: true,
      payload,
      error: null,
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return {
      valid: false,
      payload: null,
      error: 'Internal server error',
    };
  }
}

// ── Usage Example ────────────────────────────────────────────────────────
/**
 * Example usage in a module API route:
 *
 * // src/app/api/gutter/data/route.js
 * import { withModuleAuth } from '@/core/auth/middleware.auth';
 *
 * async function GET(request) {
 *   const userId = request.userId;
 *   // Handle request with authenticated user
 *   return Response.json({ data: [] });
 * }
 *
 * export default withModuleAuth('GUTTER', GET);
 */
