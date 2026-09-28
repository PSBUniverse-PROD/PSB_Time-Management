# PSBUniverse SSO - Migration Guide for Existing Modules

## Overview

This guide helps migrate existing PSBUniverse modules (Gutter, OHD, Metal Buildings) from the current authentication system to the new centralized SSO system.

---

## Why Migrate?

### Current System Challenges

❌ **Isolated Sessions**: Each module has independent authentication  
❌ **Re-authentication Required**: Users must log in multiple times  
❌ **Inconsistent Sessions**: Session state varies across modules  
❌ **Difficult Logout**: Logging out from one module doesn't affect others  
❌ **Limited Scalability**: Each new module duplicates auth logic  
❌ **No Cross-Module Permissions**: Hard to manage access across modules

### New SSO Benefits

✅ **Single Sign-On**: Users log in once, access all modules  
✅ **Universal Session**: Shared session across all subdomains  
✅ **Centralized Logout**: Logging out everywhere is automatic  
✅ **Unified Permissions**: Central permission management  
✅ **Scalable**: New modules automatically inherit SSO  
✅ **Secure**: Centralized token management and validation  

---

## Migration Timeline

### Phase 1: Preparation (Week 1)

- [ ] Review this guide
- [ ] Set up development environment
- [ ] Configure environment variables
- [ ] Test locally

### Phase 2: Code Changes (Week 2)

- [ ] Add SSO dependencies
- [ ] Create SSO client utility
- [ ] Update layout components
- [ ] Update API routes
- [ ] Update logout logic

### Phase 3: Testing (Week 3)

- [ ] Unit testing
- [ ] Integration testing
- [ ] Cross-subdomain testing
- [ ] Production staging

### Phase 4: Deployment (Week 4)

- [ ] Deploy to staging
- [ ] Smoke testing
- [ ] Monitor for issues
- [ ] Deploy to production
- [ ] Monitor production

---

## Step-by-Step Migration

### Step 1: Update Dependencies

Add SSO dependencies to `package.json`:

```bash
npm install jose cookie
```

Or manually add to `package.json`:

```json
{
  "dependencies": {
    "jose": "^5.4.1",
    "cookie": "^0.6.0"
  }
}
```

Then run:

```bash
npm install
```

### Step 2: Create SSO Client Utility

Create new file `src/core/sso-client.js`:

```javascript
/**
 * SSO Client for PSBUniverse Modules
 * Provides centralized authentication with Core Portal
 */

const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://psbuniverse.com";
const MODULE_ID = process.env.NEXT_PUBLIC_MODULE_ID;

/**
 * Validate current session with Core Portal
 */
export async function validateSessionToken() {
  try {
    const response = await fetch(`${CORE_PORTAL_URL}/api/auth/validate-token`, {
      method: "GET",
      credentials: "include",
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.valid ? data.payload : null;
  } catch (error) {
    console.error("SSO validation error:", error);
    return null;
  }
}

/**
 * Check if user has access to this module
 */
export async function hasModuleAccess() {
  const session = await validateSessionToken();
  if (!session || !MODULE_ID) return false;
  return session.modules.includes(MODULE_ID);
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  return validateSessionToken();
}

/**
 * Logout user (redirects to Core Portal)
 */
export async function logout() {
  try {
    await fetch(`${CORE_PORTAL_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Logout error:", error);
  }
  window.location.assign(`${CORE_PORTAL_URL}/login`);
}

/**
 * Navigate to Core Portal
 */
export function goToPortal(path = "/") {
  window.location.assign(`${CORE_PORTAL_URL}${path}`);
}
```

### Step 3: Configure Environment Variables

Create/update `.env.local`:

```env
# SSO Configuration
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER

# For local development:
# NEXT_PUBLIC_CORE_PORTAL_URL=http://localhost:3000
# NEXT_PUBLIC_MODULE_ID=GUTTER
```

### Step 4: Update Main Layout

**Before** (old authentication):
```javascript
// src/app/layout.js (old)
"use client";
import { useAuth } from "@/core/auth/useAuth";

export default function RootLayout({ children }) {
  const { authUser, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!authUser) return <div>Not authenticated</div>;

  return <html>{children}</html>;
}
```

**After** (new SSO):
```javascript
// src/app/layout.js (new)
"use client";

import { useEffect, useState } from "react";
import { validateSessionToken, logout } from "@/core/sso-client";

export default function RootLayout({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function checkAuth() {
      const session = await validateSessionToken();
      if (session) {
        setAuthenticated(true);
        setUser(session);
      } else {
        logout(); // Redirect to login
      }
      setLoading(false);
    }

    checkAuth();
  }, []);

  if (loading) return <div>Authenticating...</div>;
  if (!authenticated) return null; // Redirecting...

  return (
    <html>
      <body>
        <header>
          {/* Show user info and logout button */}
          <span>{user?.fullName}</span>
          <button onClick={logout}>Logout</button>
        </header>
        {children}
      </body>
    </html>
  );
}
```

### Step 5: Update Logout Functionality

**Before** (old logout):
```javascript
// Old logout code
const supabase = getSupabase();
await supabase.auth.signOut();
clearAccessTokenCookie();
window.location.assign("/login");
```

**After** (new SSO logout):
```javascript
// New logout code
import { logout } from "@/core/sso-client";

// In your component:
<button onClick={logout}>Logout</button>
```

### Step 6: Update API Routes

**Before** (old API route):
```javascript
// src/app/api/data/route.js (old)
import { bootstrap } from "@/core/auth/bootstrap.actions";

export async function GET(request) {
  const session = await bootstrap();
  if (!session?.authUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ data: [] });
}
```

**After** (new SSO API route):
```javascript
// src/app/api/data/route.js (new)
import { validateSessionToken } from "@/core/sso-client";

async function GET(request) {
  // Extract token from cookie
  const cookieHeader = request.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/psb_session=([^;]*)/);
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate with Core Portal
  const response = await fetch(
    `https://psbuniverse.com/api/auth/validate-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }
  );

  if (!response.ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { payload } = await response.json();
  const userId = payload.userId;

  // Process request
  return Response.json({ data: [], userId });
}

export { GET };
```

### Step 7: Update Protected Components

**Before**:
```javascript
// Old protected component
"use client";
import { useAuth } from "@/core/auth/useAuth";

export default function Dashboard() {
  const { authUser, dbUser, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!authUser) return <div>Not authenticated</div>;

  return <div>Welcome {dbUser?.email}</div>;
}
```

**After**:
```javascript
// New protected component
"use client";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/core/sso-client";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const session = await getCurrentUser();
      setUser(session);
      setLoading(false);
    }
    loadUser();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;

  return <div>Welcome {user?.email}</div>;
}
```

---

## Verification Checklist

After migration, verify:

### Local Testing

- [ ] Module loads and requires authentication
- [ ] Redirects to Core Portal login if not authenticated
- [ ] Logs in via Core Portal
- [ ] Auto-authenticates in module after login
- [ ] Module displays user information correctly
- [ ] Logout from module redirects to Core Portal
- [ ] Cannot access module after logout

### Cross-Module Testing

- [ ] Log in at Core Portal
- [ ] Access Module 1 (Gutter) → Auto-authenticated
- [ ] Access Module 2 (OHD) → Auto-authenticated
- [ ] Logout from Module 1 → Logs out from all modules
- [ ] Access Module 2 → Redirects to login

### API Testing

- [ ] API routes require valid token
- [ ] Invalid tokens return 401
- [ ] Valid tokens return 200 with data
- [ ] Module access is verified

### Production Readiness

- [ ] Environment variables configured
- [ ] SSL/HTTPS enabled
- [ ] Cookie domain set correctly
- [ ] No console errors
- [ ] Performance acceptable

---

## Troubleshooting

### Module shows "Not Authenticated" but user is logged in

**Cause**: SSO client can't reach Core Portal or token validation fails

**Solution**:
1. Check `NEXT_PUBLIC_CORE_PORTAL_URL` is correct
2. Verify Core Portal is running
3. Check network in DevTools
4. Verify cookie domain is `.psbuniverse.com`

### Token validation fails with 401

**Cause**: Token expired, malformed, or invalidated

**Solution**:
1. Check token hasn't expired
2. Verify token format is correct
3. Check if user was logged out
4. Refresh the page to get new token

### Cookie not shared across subdomains

**Cause**: Cookie domain not set correctly

**Solution**:
1. Verify `psb_session` cookie has domain `.psbuniverse.com`
2. Check Core Portal Set-Cookie header
3. Ensure both subdomains are under `.psbuniverse.com`

### Modules still using old auth after deployment

**Cause**: Code not properly replaced or cached

**Solution**:
1. Verify new code is deployed
2. Clear browser cache (Ctrl+Shift+Delete)
3. Check DevTools Network tab for API calls
4. Verify console for errors

---

## Rollback Plan

If issues occur, you can temporarily rollback:

1. Keep old auth code in separate branch
2. Switch back to old environment variables
3. Revert module to use old authentication
4. Investigate issues before re-attempting

---

## Post-Migration

### Cleanup

- [ ] Remove old auth files if no longer needed
- [ ] Remove unused dependencies
- [ ] Update documentation
- [ ] Remove old logout buttons/routes

### Optimization

- [ ] Monitor token validation performance
- [ ] Optimize API route caching
- [ ] Add proper error handling
- [ ] Implement token refresh logic

### Monitoring

- [ ] Set up error alerting
- [ ] Monitor failed authentications
- [ ] Track session duration
- [ ] Monitor API response times

---

## Getting Help

If you encounter issues during migration:

1. Check this troubleshooting guide
2. Review API documentation
3. Check browser DevTools Network/Console tabs
4. Contact the Core Platform team

---

## Examples by Module

### Gutter Module

[See complete Gutter example in module-integration-guide.md](./module-integration-guide.md)

### OHD Module

Same pattern as Gutter:
1. Set `NEXT_PUBLIC_MODULE_ID=OHD`
2. Follow integration guide
3. Update API routes for OHD

### Metal Buildings Module

Same pattern as Gutter:
1. Set `NEXT_PUBLIC_MODULE_ID=METAL_BUILDINGS`
2. Follow integration guide
3. Update API routes for Metal Buildings

---

## Timeline Estimates

| Task | Duration |
|------|----------|
| Dependencies & Setup | 30 minutes |
| Code Changes | 2-3 hours |
| Local Testing | 1 hour |
| Cross-module Testing | 1 hour |
| Staging Deployment | 30 minutes |
| Production Deployment | 30 minutes |
| **Total** | **6-8 hours** |

---

## Support Contact

For migration support:
- Email: platform-team@company.com
- Slack: #psbuniverse-platform
- Docs: See this directory
