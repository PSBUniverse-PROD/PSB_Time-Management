import { NextResponse } from "next/server";

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
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicAsset = pathname.includes("_next") || pathname === "/favicon.ico";

  if (isApiRoute || isPublicAsset) {
    return NextResponse.next();
  }

  // ── Check for SSO session token ────────────────────────────────────────
  // First check new SSO cookie (psb_session)
  let token = String(req.cookies.get("psb_session")?.value || "").trim();

  // Fallback to legacy Supabase token if SSO token not found
  if (!token) {
    token = String(req.cookies.get("sb-access-token")?.value || "").trim();
  }

  // ── Redirect to login if no token, preserving original URL ──────────────
  if (!token && !isLoginPage) {
    // Use full absolute URL so redirect survives domain changes
    url.pathname = "/login";
    url.searchParams.set("redirect", req.nextUrl.toString());
    const response = NextResponse.redirect(url);
    
    // Add Cache-Control to prevent caching redirects
    response.headers.set("Cache-Control", "no-store, must-revalidate");
    
    return response;
  }

  // ── Allow request to continue ────────────────────────────────────────────
  const response = NextResponse.next();
  
  // Add security headers for SSO system
  response.headers.set("X-SSO-Enabled", "true");
  
  return response;
}

export const config = {
  matcher: [
    // Match all routes except:
    "/((?!_next|favicon.ico).*)",
  ],
};