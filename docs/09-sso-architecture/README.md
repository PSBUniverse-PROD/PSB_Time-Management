# PSBUniverse Single Sign-On (SSO) Architecture

## Overview

The PSBUniverse SSO system provides centralized authentication and cross-subdomain session management. Users log in once through the Core Portal and automatically gain access to all authorized modules without additional authentication.

---

## System Architecture

### Current System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      PSBUniverse Core Portal                     │
│                    (psbuniverse.com)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Authentication Service                           │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ • Supabase Auth (credentials validation)                │   │
│  │ • JWT Token Generation                                  │   │
│  │ • Session Management                                    │   │
│  │ • Cross-subdomain Cookie Management                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         User Session Management                          │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ • Active session tracking                               │   │
│  │ • Token invalidation on logout                          │   │
│  │ • Automatic session cleanup                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Authorization & Module Access                    │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ • Role-based access control (RBAC)                      │   │
│  │ • Module-to-user permission mapping                     │   │
│  │ • Dynamic module discovery                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    │ SSO Token + Cookie
                    │ Domain: .psbuniverse.com
                    │
        ┌───────────┼───────────┬──────────────┐
        │           │           │              │
        ▼           ▼           ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌───────────────┐ ┌──────────────┐
│   Gutter    │ │     OHD     │ │    Metal      │ │   Future     │
│   Module    │ │   Module    │ │ Buildings     │ │   Module     │
│ :3001       │ │ :3002       │ │ :3003         │ │              │
├─────────────┤ ├─────────────┤ ├───────────────┤ ├──────────────┤
│ • Read      │ │ • Validate  │ │ • Auto-login  │ │ • Inherit    │
│   cookie    │ │   token     │ │   if token    │ │   SSO        │
│ • Validate  │ │ • Verify    │ │   present     │ │   system     │
│   token     │ │   module    │ │ • Check       │ │              │
│ • Check     │ │   access    │ │   permissions │ │              │
│   module    │ │ • Redirect  │ │ • Redirect    │ │              │
│   access    │ │   to login  │ │   if needed   │ │              │
│ • Redirect  │ │   if needed │ │              │ │              │
│   if needed │ │            │ │              │ │              │
└─────────────┘ └─────────────┘ └───────────────┘ └──────────────┘
```

---

## Token Structure

### JWT Token Payload

```json
{
  "userId": "12345",
  "authUserId": "a1b2c3d4-e5f6-4a5b-8c9d-e1f2a3b4c5d6",
  "email": "user@company.com",
  "fullName": "John Doe",
  "modules": ["GUTTER", "OHD", "METAL_BUILDINGS"],
  "roles": ["ROLE_001", "ROLE_002"],
  "issuedAt": 1702555200000,
  "expiresAt": 1702641600000
}
```

### Cookie Settings

```
Name:     psb_session
Domain:   .psbuniverse.com
Path:     /
Secure:   true (production only)
HttpOnly: true
SameSite: Lax
Max-Age:  86400 (24 hours)
```

---

## Login Flow

### Step-by-Step Process

```
1. User navigates to psbuniverse.com/login
   ↓
2. User submits credentials (email/password)
   ↓
3. Core Portal validates with Supabase Auth
   ↓
4. Supabase returns access token
   ↓
5. Core Portal calls /api/auth/login with access token
   ↓
6. Authentication Service:
   • Validates token with Supabase
   • Resolves user from database (auth_user_id → psb_s_user)
   • Loads user's accessible modules & roles
   • Generates JWT token
   • Creates session record
   ↓
7. Response includes Set-Cookie header:
   Set-Cookie: psb_session=<JWT>; Domain=.psbuniverse.com; HttpOnly; Secure; SameSite=Lax
   ↓
8. Browser stores cookie for .psbuniverse.com domain
   ↓
9. User redirected to /dashboard
   ↓
10. AuthProvider initializes with session data
    ↓
11. User can access all authorized modules
```

### Login Code Example

```javascript
// src/modules/psbpages/login/pages/LoginView.jsx
"use client";

import { getSupabase } from "@/core/supabase/client";
import { setPSBSessionCookie } from "@/core/auth/cookies.utils";

async function handleLogin(email, password) {
  try {
    // 1. Authenticate with Supabase
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // 2. Create SSO session via API
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: data.session.access_token,
      }),
    });

    if (!response.ok) throw new Error("Session creation failed");

    const sessionData = await response.json();

    // 3. Cookie is set automatically by Set-Cookie header
    // No need to manually set it

    // 4. Redirect to dashboard
    window.location.assign("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    // Show error to user
  }
}
```

---

## Authorization Flow

### Module Access Check

```
User Request to Module
    ↓
Module reads psb_session cookie
    ↓
Module validates token:
  • Signature verification (JWT)
  • Expiration check
  • Invalidation check (logout)
    ↓
Token Valid? → NO → Redirect to /login
    ↓
   YES
    ↓
Check module access in token payload:
  payload.modules.includes(MODULE_ID)
    ↓
Has Access? → NO → Show 403 Forbidden
    ↓
      YES
    ↓
Grant Access to Module
```

### Module Middleware Example

```javascript
// Usage in any module API route

// src/app/api/gutter/data/route.js
import { withModuleAuth } from "@/core/auth/middleware.auth";

async function GET(request) {
  const userId = request.userId;
  const modules = request.modules;

  // User is authenticated and has access to GUTTER module
  return Response.json({ data: [] });
}

// Protect route with module access check
export const route = withModuleAuth("GUTTER", GET);
```

---

## Logout Flow

### Step-by-Step Process

```
1. User clicks "Logout" in any module
   ↓
2. Module calls POST /api/auth/logout
   ↓
3. Authentication Service:
   • Extracts token from request cookie
   • Invalidates token in database
   • Records logout in audit trail
   ↓
4. Response includes Set-Cookie header to clear cookie:
   Set-Cookie: psb_session=; Max-Age=0; Domain=.psbuniverse.com
   ↓
5. Browser clears cookie for .psbuniverse.com domain
   ↓
6. Redirect to /login
   ↓
7. User is logged out from ALL modules (universal logout)
```

### Logout Code Example

```javascript
// src/shared/utils/logout.js
"use client";

export async function handleLogout() {
  try {
    // Call logout API
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include", // Include cookies
    });

    if (!response.ok) throw new Error("Logout failed");

    // Cookie is cleared by Set-Cookie header automatically

    // Redirect to login
    window.location.assign("/login");
  } catch (error) {
    console.error("Logout error:", error);
    // Fallback: clear cookie and redirect anyway
    document.cookie =
      "psb_session=; Max-Age=0; Domain=.psbuniverse.com; Path=/";
    window.location.assign("/login");
  }
}
```

---

## API Endpoints

### POST /api/auth/login

**Purpose**: Generate session token after Supabase authentication

**Request**:
```json
{
  "accessToken": "supabase_access_token_here"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "token": "jwt_token_here",
  "expiresAt": 1702641600000,
  "user": {
    "id": "12345",
    "email": "user@company.com",
    "name": "John Doe"
  }
}
```

**Headers**: Sets `Set-Cookie: psb_session=...`

---

### POST /api/auth/logout

**Purpose**: Invalidate session and clear cookies

**Request**: No body required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Headers**: Sets `Set-Cookie: psb_session=; Max-Age=0;`

---

### GET/POST /api/auth/validate-token

**Purpose**: Validate token and return payload (for modules)

**Request** (POST):
```json
{
  "token": "jwt_token_here"
}
```

**Response** (200 OK):
```json
{
  "valid": true,
  "payload": {
    "userId": "12345",
    "email": "user@company.com",
    "fullName": "John Doe",
    "modules": ["GUTTER", "OHD"],
    "roles": ["ROLE_001"],
    "expiresAt": 1702641600000
  }
}
```

**Error Response** (401):
```json
{
  "valid": false,
  "error": "Token has expired"
}
```

---

### POST /api/auth/refresh-token

**Purpose**: Refresh expiring tokens

**Request**: No body required (reads from cookie)

**Response** (200 OK):
```json
{
  "success": true,
  "token": "new_jwt_token",
  "refreshed": true,
  "expiresAt": 1702641600000
}
```

---

## Module Integration Guide

### For Existing Modules (Gutter, OHD, Metal Buildings)

#### Step 1: Update Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "jose": "^5.4.1",
    "cookie": "^0.6.0"
  }
}
```

#### Step 2: Create SSO Utilities

Create `src/utils/sso.js`:
```javascript
export async function validateSessionToken() {
  try {
    const response = await fetch(
      "https://psbuniverse.com/api/auth/validate-token",
      {
        method: "GET",
        credentials: "include", // Include cookies
        headers: {
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.payload || null;
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

export async function checkModuleAccess(moduleId) {
  const session = await validateSessionToken();
  if (!session) return false;
  return session.modules.includes(moduleId);
}

export async function handleModuleLogout() {
  try {
    await fetch("https://psbuniverse.com/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Logout error:", error);
  }
  // Redirect to Core Portal
  window.location.assign("https://psbuniverse.com/login");
}
```

#### Step 3: Add Authentication Check

In module's main layout/entry point:
```javascript
"use client";

import { useEffect, useState } from "react";
import { validateSessionToken } from "@/utils/sso";

export default function ModuleLayout({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const session = await validateSessionToken();
      if (session) {
        setAuthenticated(true);
      } else {
        // Redirect to Core Portal login
        window.location.assign("https://psbuniverse.com/login");
      }
      setLoading(false);
    }

    checkAuth();
  }, []);

  if (loading) return <div>Authenticating...</div>;

  return authenticated ? <>{children}</> : null;
}
```

#### Step 4: Update API Routes

Protect API routes with middleware:
```javascript
// src/app/api/data/route.js
import { withModuleAuth } from "https://psbuniverse.com/auth/middleware";

async function GET(request) {
  const userId = request.userId;
  // Request is authenticated and authorized
  return Response.json({ data: [] });
}

export default withModuleAuth("GUTTER", GET);
```

---

### For New Modules

#### Step 1: Request Module ID

Contact the Core Portal team to register a new module ID in `psb_s_application`:
- `app_id`: Unique identifier (e.g., "INVENTORY", "CRM")
- `app_name`: Display name
- `app_code`: Short code

#### Step 2: Initialize with SSO

When creating a new module, include SSO utilities from the start:
```javascript
// src/core/auth/sso-client.js
export const SSO_CONFIG = {
  corePortalUrl: "https://psbuniverse.com",
  moduleId: "YOUR_MODULE_ID",
};

export async function requireModuleAuth() {
  const response = await fetch(
    `${SSO_CONFIG.corePortalUrl}/api/auth/validate-token`,
    { credentials: "include" }
  );

  if (!response.ok) {
    window.location.assign(`${SSO_CONFIG.corePortalUrl}/login`);
    return null;
  }

  return await response.json();
}
```

#### Step 3: Protect Routes

```javascript
// src/app/page.js
"use client";

import { requireModuleAuth } from "@/core/auth/sso-client";

export default function HomePage() {
  useEffect(() => {
    requireModuleAuth();
  }, []);

  return <Dashboard />;
}
```

---

## Database Schema

### Core Tables

#### `psb_s_user`
- `auth_user_id` (UUID): Links to Supabase auth user
- `email`: User email
- `first_name`, `last_name`: User name
- Additional profile fields

#### `psb_m_userapproleaccess`
- `user_id`: Links to psb_s_user
- `app_id`: Module ID
- `role_id`: Role ID
- `is_active`: Whether access is active

#### `psb_s_application`
- `app_id`: Module identifier
- `app_name`: Display name
- `app_code`: Short code

### New SSO Tables

#### `psb_sessions`
Stores active and historical session records
- `id`: Primary key
- `auth_user_id`: Supabase user ID
- `user_id`: Database user ID
- `token_hash`: Hash of JWT token
- `created_at`: Session creation time
- `expires_at`: Token expiration time
- `is_active`: Session status

#### `psb_session_tokens`
Audit trail for token invalidations (logout events)
- `id`: Primary key
- `auth_user_id`: Supabase user ID
- `user_id`: Database user ID
- `token_hash`: Hash of invalidated token
- `invalidated_at`: Invalidation timestamp

---

## Environment Variables

### Core Portal (psbuniverse.com)

```env
# .env.local

# JWT Configuration
JWT_SECRET=your-secret-key-change-this-in-production

# Cookie Configuration
NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Module Applications

```env
# .env.local

# Core Portal Configuration
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER
```

---

## Security Considerations

### 1. Token Security
- Tokens are JWT signed with HS256
- Secret key must be strong and unique
- Rotate secret periodically
- Never expose secret in client code

### 2. Cookie Security
- `HttpOnly`: Prevents JavaScript access (prevents XSS attacks)
- `Secure`: Only transmitted over HTTPS (prevents MITM)
- `SameSite=Lax`: Prevents CSRF attacks
- `Domain=.psbuniverse.com`: Shared across subdomains only

### 3. CORS Handling
- API endpoints use credentials: include
- Modules must whitelist Core Portal in CORS

### 4. Token Invalidation
- Tokens are immediately invalidated on logout
- Invalidated tokens cannot be used
- Audit trail of all logout events

---

## Troubleshooting

### User redirected to login after successful sign-in
**Cause**: Session not being created or cookie not being set

**Solution**:
1. Check `/api/auth/login` endpoint is working
2. Verify `JWT_SECRET` is set
3. Check Set-Cookie header in response
4. Verify domain setting matches environment

### Token validation fails
**Cause**: Token expired, invalidated, or malformed

**Solution**:
1. Check token expiration time
2. Verify token hasn't been invalidated
3. Check JWT_SECRET matches token generation
4. Validate token format

### Cookie not persisting across subdomains
**Cause**: Domain setting incorrect

**Solution**:
1. Verify `NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com`
2. Check Set-Cookie header includes Domain
3. Ensure subdomains are under .psbuniverse.com

---

## Future Enhancements

1. **OAuth2 Integration**: Support external OAuth providers
2. **MFA/2FA**: Multi-factor authentication
3. **Session Timeout**: Automatic logout after inactivity
4. **Device Tracking**: Track devices and locations
5. **Permissions Granularity**: Fine-grained permissions per feature
6. **Audit Logging**: Comprehensive audit trail
7. **SSO Integration**: SAML, OpenID Connect support

---

## Support & Questions

For questions about the SSO system:
1. Check this documentation
2. Review implementation examples
3. Check GitHub issues
4. Contact the Core Platform team
