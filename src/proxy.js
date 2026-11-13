import { NextResponse } from "next/server";
import { isLoginPath, LOGIN_SHORT_PATH } from "@/core/auth/redirect-validator";
import { SSO_ENABLED } from "@/core/sso-client";
import { parentPathOf, routePathOf } from "@/core/routes.js";
import dealerPortalModule from "@/modules/dealer/index.js";

// Dealer portal addresses come from its module (src/modules/dealer/index.js).
const DEALER_LOGIN_PATH = routePathOf(dealerPortalModule, "DealerLoginPage");
const DEALER_BASE_PATH = parentPathOf(DEALER_LOGIN_PATH);

/**
 * SSO Proxy Middleware for PSBUniverse
 * Validates cross-subdomain session tokens and enforces authentication
 * 
 * This middleware:
 * 1. Checks for valid psb_session cookie (cross-subdomain SSO token)
 * 2. Redirects to login if token is missing or invalid
 * 3. Allows login page and API routes to bypass authentication
 * 4. Works across all PSBUniverse subdomains
 * 
 * Note: CORS headers are no longer needed. All SSO validation is done
 * locally via the psb_user_payload cookie (scoped to .psbuniverse.com).
 */

export function proxy(req) {
  const url = req.nextUrl.clone();
  const pathname = url.pathname;

  // ── Bypass routes ────────────────────────────────────────────────────
  // Allow login page and API routes
  const isLoginPage = isLoginPath(pathname);
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicAsset = pathname.includes("_next") || pathname === "/favicon.ico";

  if (isApiRoute || isPublicAsset) {
    return NextResponse.next();
  }

  // ── Dealer portal ────────────────────────────────────────────────────
  // Dealers sign in separately (psb_dealer_session, see core/dealer/dealerAuth).
  // Their pages never accept or require an internal session; the page itself
  // verifies the cookie, this only checks that one is present.
  if (pathname === DEALER_BASE_PATH || pathname.startsWith(`${DEALER_BASE_PATH}/`)) {
    const hasDealerSession = Boolean(String(req.cookies.get("psb_dealer_session")?.value || "").trim());
    if (!hasDealerSession && pathname !== DEALER_LOGIN_PATH) {
      url.pathname = DEALER_LOGIN_PATH;
      url.search = "";
      const dealerRedirect = NextResponse.redirect(url);
      dealerRedirect.headers.set("Cache-Control", "no-store, must-revalidate");
      return dealerRedirect;
    }
    return NextResponse.next();
  }

  // ── Check for SSO session token ────────────────────────────────────────
  // First check new SSO cookie (psb_session)
  let token = SSO_ENABLED ? String(req.cookies.get("psb_session")?.value || "").trim() : "";

  // Fallback to legacy Supabase token if SSO token not found
  if (!token) {
    token = String(req.cookies.get("sb-access-token")?.value || "").trim();
  }

  // ── Redirect to login if no token, preserving original URL ──────────────
  if (!token && !isLoginPage) {
    // Use full absolute URL so redirect survives domain changes
    url.pathname = LOGIN_SHORT_PATH;
    url.searchParams.set("redirect", req.nextUrl.toString());
    const response = NextResponse.redirect(url);
    
    // Add Cache-Control to prevent caching redirects
    response.headers.set("Cache-Control", "no-store, must-revalidate");
    
    return response;
  }

  // ── Allow request to continue ────────────────────────────────────────────
  const response = NextResponse.next();
  
  // Add security headers for SSO system
  response.headers.set("X-SSO-Enabled", String(SSO_ENABLED));
  
  return response;
}

export const config = {
  matcher: [
    // Match all routes except:
    "/((?!_next|favicon.ico).*)",
  ],
};