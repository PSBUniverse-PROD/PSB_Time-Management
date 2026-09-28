/**
 * SSO Middleware — timeTracker.middleware.js
 *
 * Protects API routes in this module using centralized SSO authentication.
 *
 * USAGE:
 *   import { withModuleAuth } from "@/core/auth/middleware.auth";
 *
 *   async function GET(request) {
 *     const userId = request.userId;
 *     return Response.json({ data: [] });
 *   }
 *
 *   export default withModuleAuth("TIME_TRACKER", GET);
 *
 * This middleware:
 *   1. Reads the psb_session cookie from the request
 *   2. Validates the JWT token signature and expiration
 *   3. Checks the token hasn't been invalidated (logout)
 *   4. Verifies the user has access to this module
 *   5. Attaches session payload to request.userId / request.modules
 *
 * For public routes (no auth required), use withSessionAuth() instead.
 */
export { withModuleAuth, withSessionAuth } from "@/core/auth/middleware.auth";
