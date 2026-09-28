# PSBUniverse SSO - Module Integration Quick Start

## Overview

This guide helps you integrate a PSBUniverse module with the centralized SSO system.

---

## Prerequisites

- Module deployed on psbuniverse.com subdomain (e.g., `gutter.psbuniverse.com`)
- Node.js and Next.js setup
- Access to module codebase

---

## 5-Minute Integration

### Step 1: Add Dependencies

```bash
npm install jose cookie
```

### Step 2: Create SSO Client Utility

Create `src/core/sso-client.js`:

```javascript
/**
 * SSO Client for PSBUniverse Modules
 * Handles authentication with Core Portal
 */

const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://psbuniverse.com";
const MODULE_ID = process.env.NEXT_PUBLIC_MODULE_ID;

/**
 * Validate session token with Core Portal
 * @returns {Promise<Object|null>} Session payload or null
 */
export async function validateSessionToken() {
  try {
    const response = await fetch(`${CORE_PORTAL_URL}/api/auth/validate-token`, {
      method: "GET",
      credentials: "include", // Include cookies
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.valid ? data.payload : null;
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

/**
 * Check if user has access to this module
 * @returns {Promise<boolean>} True if user has module access
 */
export async function hasModuleAccess() {
  const session = await validateSessionToken();
  if (!session) return false;

  if (!MODULE_ID) {
    console.warn("NEXT_PUBLIC_MODULE_ID not configured");
    return false;
  }

  return session.modules.includes(MODULE_ID);
}

/**
 * Get current user session
 * @returns {Promise<Object|null>} User session or null
 */
export async function getCurrentSession() {
  return validateSessionToken();
}

/**
 * Logout user (universal logout across all modules)
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

  // Redirect to Core Portal login
  window.location.assign(`${CORE_PORTAL_URL}/login`);
}

/**
 * Navigate to Core Portal
 */
export function redirectToPortal(path = "/") {
  window.location.assign(`${CORE_PORTAL_URL}${path}`);
}
```

### Step 3: Protect Module Entry Point

Update your main layout or page:

```javascript
// src/app/layout.js or src/app/page.js
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
        // Not authenticated - redirect to Core Portal login
        logout();
      }

      setLoading(false);
    }

    checkAuth();
  }, []);

  if (loading) {
    return <div className="loading">Authenticating...</div>;
  }

  if (!authenticated) {
    return <div className="error">Access denied</div>;
  }

  return (
    <html>
      <body>
        <header>
          <h1>Module Name</h1>
          <nav>
            <span>Welcome, {user?.fullName}</span>
            <button onClick={logout}>Logout</button>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
```

### Step 4: Create Environment File

Create `.env.local`:

```env
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER
```

For development:

```env
NEXT_PUBLIC_CORE_PORTAL_URL=http://localhost:3000
NEXT_PUBLIC_MODULE_ID=GUTTER
```

### Step 5: Protect API Routes (Optional)

```javascript
// src/app/api/data/route.js
import { validateSessionToken } from "@/core/sso-client";

export async function GET(request) {
  // Validate session
  const session = await validateSessionToken();

  if (!session) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Check module access
  if (!session.modules.includes("GUTTER")) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // Process request with authenticated user
  const userId = session.userId;
  return Response.json({ data: [], userId });
}
```

---

## Full Example: Gutter Module

### File Structure

```
gutter.psbuniverse.com/
├── src/
│   ├── core/
│   │   └── sso-client.js
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js
│   │   └── api/
│   │       └── data/
│   │           └── route.js
│   └── components/
│       └── Dashboard.jsx
├── .env.local
└── package.json
```

### Implementation

**src/app/layout.js**:
```javascript
"use client";

import { useEffect, useState } from "react";
import { validateSessionToken, logout } from "@/core/sso-client";
import "./globals.css";

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
        logout();
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!authenticated) return <div>Access Denied</div>;

  return (
    <html lang="en">
      <body>
        <header style={{ display: "flex", justifyContent: "space-between" }}>
          <h1>Gutter Application</h1>
          <div>
            <span>{user?.fullName}</span>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
```

**src/app/page.js**:
```javascript
"use client";

import { useEffect, useState } from "react";

export default function GutterDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/api/data", { credentials: "include" });
        if (response.ok) {
          const result = await response.json();
          setData(result.data);
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div>Loading data...</div>;

  return (
    <main>
      <h2>Dashboard</h2>
      <p>Welcome to Gutter Application</p>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </main>
  );
}
```

**src/app/api/data/route.js**:
```javascript
import { validateSessionToken } from "@/core/sso-client";

export async function GET(request) {
  const session = await validateSessionToken();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.modules.includes("GUTTER")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({
    data: [
      { id: 1, name: "Item 1", userId: session.userId },
      { id: 2, name: "Item 2", userId: session.userId },
    ],
    userId: session.userId,
  });
}
```

**.env.local**:
```env
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER
```

---

## Testing the Integration

### Local Development

1. Start Core Portal (localhost:3000)
2. Start Module (localhost:3001)
3. Login at Core Portal
4. Navigate to module (localhost:3001)
5. Should auto-authenticate using shared cookie

### Production Testing

1. Login at `https://psbuniverse.com`
2. Navigate to `https://gutter.psbuniverse.com`
3. Should automatically be authenticated

---

## Debugging

### Check Session Token

Open browser DevTools Console:

```javascript
// Validate current session
const session = await fetch('https://psbuniverse.com/api/auth/validate-token')
  .then(r => r.json());
console.log(session);
```

### Check Cookies

In DevTools (Application tab → Cookies):
- Look for `psb_session` cookie
- Verify domain is `.psbuniverse.com`
- Verify HttpOnly flag is set

### Check Headers

In Network tab, verify login response includes:
```
Set-Cookie: psb_session=...; Domain=.psbuniverse.com; HttpOnly; Secure; SameSite=Lax
```

---

## Common Issues

### "Access denied" error

**Problem**: Module is checking access but user doesn't have permission

**Solution**:
1. Check user's roles in Core Portal
2. Verify module is assigned to user's role
3. Check `NEXT_PUBLIC_MODULE_ID` matches registered module ID

### Token validation fails

**Problem**: Session validation returns null

**Solution**:
1. Ensure logged in at Core Portal
2. Check `NEXT_PUBLIC_CORE_PORTAL_URL` is correct
3. Verify cookies are enabled
4. Check network errors in DevTools

### Cookie not shared across subdomains

**Problem**: Cookie visible in one subdomain but not another

**Solution**:
1. Verify cookie domain is `.psbuniverse.com` (not `psbuniverse.com`)
2. Ensure both are subdomains of `psbuniverse.com`
3. Check domains in CORS settings

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Add SSO client utility
3. ✅ Protect module entry point
4. ✅ Configure environment variables
5. ✅ Test authentication flow
6. ✅ Protect API routes
7. ✅ Deploy to production

For more details, see [SSO Architecture Documentation](./README.md).
