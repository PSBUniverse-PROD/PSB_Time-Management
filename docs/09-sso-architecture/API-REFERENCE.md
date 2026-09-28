# PSBUniverse SSO - API Reference

## Authentication Endpoints

All endpoints use the base URL: `https://psbuniverse.com` (or configured Core Portal URL)

---

## POST /api/auth/login

Generate a session token after Supabase authentication.

### Request

```http
POST /api/auth/login HTTP/1.1
Host: psbuniverse.com
Content-Type: application/json

{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `accessToken` | string | Yes | Supabase access token from sign-in response |

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1702641600000,
  "user": {
    "id": "12345",
    "email": "user@company.com",
    "name": "John Doe"
  }
}
```

**Error (400 Bad Request)**:
```json
{
  "error": "Access token is required"
}
```

**Error (401 Unauthorized)**:
```json
{
  "error": "Invalid or expired access token"
}
```

**Error (404 Not Found)**:
```json
{
  "error": "User not found in system"
}
```

### Headers Set

```
Set-Cookie: psb_session=<jwt_token>; Domain=.psbuniverse.com; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly
```

### Example

```javascript
// Login flow
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accessToken: supabaseSession.access_token,
  }),
});

const session = await response.json();
if (response.ok) {
  // Cookie is automatically set
  window.location.assign('/dashboard');
}
```

---

## POST /api/auth/logout

Invalidate session and clear cookies.

### Request

```http
POST /api/auth/logout HTTP/1.1
Host: psbuniverse.com
Cookie: psb_session=<jwt_token>
```

### Response

**Success (200 OK)**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Headers Set

```
Set-Cookie: psb_session=; Domain=.psbuniverse.com; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure; HttpOnly
```

### Example

```javascript
async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include', // Include cookies
  });

  // Redirect to login
  window.location.assign('/login');
}
```

---

## GET /api/auth/validate-token

Validate session token and return payload (primary method for modules).

### Request

```http
GET /api/auth/validate-token HTTP/1.1
Host: psbuniverse.com
Cookie: psb_session=<jwt_token>
```

### Response

**Valid (200 OK)**:
```json
{
  "valid": true,
  "payload": {
    "userId": "12345",
    "authUserId": "a1b2c3d4-e5f6-4a5b-8c9d-e1f2a3b4c5d6",
    "email": "user@company.com",
    "fullName": "John Doe",
    "modules": ["GUTTER", "OHD", "METAL_BUILDINGS"],
    "roles": ["ROLE_001", "ROLE_002"],
    "issuedAt": 1702555200000,
    "expiresAt": 1702641600000
  }
}
```

**Invalid (401 Unauthorized)**:
```json
{
  "valid": false,
  "error": "Token has expired"
}
```

### Example

```javascript
async function validateSession() {
  const response = await fetch('/api/auth/validate-token', {
    method: 'GET',
    credentials: 'include',
  });

  if (response.ok) {
    const { payload } = await response.json();
    console.log('User:', payload.email);
    console.log('Modules:', payload.modules);
    return payload;
  }

  // Not authenticated
  window.location.assign('/login');
  return null;
}
```

---

## POST /api/auth/validate-token

Alternative method to validate token (useful for server-to-server).

### Request

```http
POST /api/auth/validate-token HTTP/1.1
Host: psbuniverse.com
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | string | Yes | JWT token to validate |

### Response

**Valid (200 OK)**:
```json
{
  "valid": true,
  "payload": {
    "userId": "12345",
    "authUserId": "a1b2c3d4-e5f6-4a5b-8c9d-e1f2a3b4c5d6",
    "email": "user@company.com",
    "fullName": "John Doe",
    "modules": ["GUTTER", "OHD"],
    "roles": ["ROLE_001"],
    "expiresAt": 1702641600000
  }
}
```

**Invalid (401 Unauthorized)**:
```json
{
  "valid": false,
  "error": "Invalid or malformed token"
}
```

### Example

```javascript
// Module server-side validation
const response = await fetch('https://psbuniverse.com/api/auth/validate-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: extractedTokenFromCookie,
  }),
});

if (response.ok) {
  const { payload } = await response.json();
  // Token is valid
}
```

---

## POST /api/auth/refresh-token

Refresh token if expiring within threshold (2 hours).

### Request

```http
POST /api/auth/refresh-token HTTP/1.1
Host: psbuniverse.com
Cookie: psb_session=<jwt_token>
Content-Type: application/json
```

### Response

**Already Valid (200 OK)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshed": false,
  "expiresAt": 1702641600000
}
```

**Refreshed (200 OK)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshed": true,
  "expiresAt": 1702728000000
}
```

**Invalid (401 Unauthorized)**:
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

### Headers Set (if refreshed)

```
Set-Cookie: psb_session=<new_jwt_token>; Domain=.psbuniverse.com; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly
```

### Example

```javascript
async function refreshTokenIfNeeded() {
  const response = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    credentials: 'include',
  });

  if (response.ok) {
    const data = await response.json();
    console.log('Refreshed:', data.refreshed);
    // New token is in cookie if refreshed=true
    return data;
  }

  // Token is invalid, redirect to login
  window.location.assign('/login');
}
```

---

## Token Payload Schema

### JWT Token Structure

```javascript
{
  // User Identification
  "userId": "12345",              // psb_s_user.user_id
  "authUserId": "uuid-here",      // Supabase auth user ID
  "email": "user@company.com",    // User email
  "fullName": "John Doe",         // Full name

  // Authorization
  "modules": ["GUTTER", "OHD", "METAL_BUILDINGS"], // Accessible modules
  "roles": ["ROLE_001", "ROLE_002"],                // User roles

  // Timestamps (milliseconds)
  "issuedAt": 1702555200000,      // Token creation time
  "expiresAt": 1702641600000      // Token expiration time (24h from issuance)
}
```

### Token Claims

| Claim | Type | Description |
|-------|------|-------------|
| `userId` | string | Database user ID (psb_s_user.user_id) |
| `authUserId` | string | Supabase authentication user ID (UUID) |
| `email` | string | User email address |
| `fullName` | string | User's full name |
| `modules` | string[] | List of module IDs user can access |
| `roles` | string[] | List of role IDs assigned to user |
| `issuedAt` | number | Unix timestamp (milliseconds) when token was created |
| `expiresAt` | number | Unix timestamp (milliseconds) when token expires |

---

## Error Responses

All endpoints return appropriate HTTP status codes:

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Token validated |
| 400 | Bad Request | Missing required parameter |
| 401 | Unauthorized | Invalid or expired token |
| 403 | Forbidden | User lacks module access |
| 500 | Server Error | Internal server error |

### Error Response Format

```json
{
  "error": "Error message here",
  "details": "Optional additional details"
}
```

---

## Cookie Management

### Session Cookie

The `psb_session` cookie is automatically managed by the SSO system:

```
Name:     psb_session
Value:    <JWT token>
Domain:   .psbuniverse.com
Path:     /
Expires:  24 hours from creation
Secure:   true (production)
HttpOnly: true (prevents JavaScript access)
SameSite: Lax (CSRF protection)
```

### Setting Cookie (server response)

```
Set-Cookie: psb_session=<token>; Domain=.psbuniverse.com; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly
```

### Clearing Cookie

```
Set-Cookie: psb_session=; Domain=.psbuniverse.com; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure; HttpOnly
```

---

## CORS Headers

When accessed from modules on subdomains:

```
Access-Control-Allow-Origin: *.psbuniverse.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Rate Limiting

API endpoints have the following rate limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | Per minute per IP |
| `/api/auth/logout` | 10 requests | Per minute per user |
| `/api/auth/validate-token` | 100 requests | Per minute per IP |
| `/api/auth/refresh-token` | 10 requests | Per minute per user |

---

## Examples

### Complete Login Flow

```javascript
async function login(email, password) {
  // 1. Authenticate with Supabase
  const supabase = createClient(url, key);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // 2. Create SSO session
  const response = await fetch('https://psbuniverse.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      accessToken: data.session.access_token,
    }),
  });

  if (!response.ok) throw new Error('Login failed');

  // 3. Cookie is set automatically
  // 4. Redirect to dashboard
  window.location.assign('/dashboard');
}
```

### Module Authentication Check

```javascript
async function requireAuth(moduleId = null) {
  const response = await fetch('https://psbuniverse.com/api/auth/validate-token', {
    credentials: 'include',
  });

  if (!response.ok) {
    // Not authenticated, redirect to login
    window.location.assign('https://psbuniverse.com/login');
    return null;
  }

  const { payload } = await response.json();

  // Check module access if specified
  if (moduleId && !payload.modules.includes(moduleId)) {
    throw new Error(`Access denied to module: ${moduleId}`);
  }

  return payload;
}
```

### Protected API Route

```javascript
// src/app/api/protected/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  // Extract token from cookie
  const cookie = request.headers.get('cookie');
  const token = cookie
    ?.split(';')
    .find(c => c.trim().startsWith('psb_session='))
    ?.split('=')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate token with Core Portal
  const response = await fetch('https://psbuniverse.com/api/auth/validate-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { payload } = await response.json();

  // Use authenticated user info
  return NextResponse.json({
    message: `Hello ${payload.fullName}`,
    userId: payload.userId,
  });
}
```

---

## Webhook Events (Future)

The SSO system will support webhooks for module notifications:

- `session.created`: New session created
- `session.invalidated`: Session invalidated (logout)
- `user.role_changed`: User roles updated
- `user.module_access_changed`: User module access changed

---

## Support

For API issues or questions:
1. Check this reference documentation
2. Review error messages and status codes
3. Check browser DevTools Network tab
4. Contact the Core Platform team
