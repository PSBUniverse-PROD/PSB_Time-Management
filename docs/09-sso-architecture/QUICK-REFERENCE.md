# PSBUniverse SSO - Quick Reference Card

## For Module Developers

### Setup (5 minutes)

```bash
# 1. Add dependencies
npm install jose cookie

# 2. Create .env.local
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER

# 3. Create src/core/sso-client.js (see guide)
# 4. Wrap your app with auth check
# 5. Add logout button
```

### Protect Components

```javascript
import { validateSessionToken, logout } from "@/core/sso-client";

export default function Page() {
  useEffect(() => {
    validateSessionToken().then(session => {
      if (!session) logout();
    });
  }, []);

  return <YourComponent />;
}
```

### Protect API Routes

```javascript
// Check token from cookie
const token = extractTokenFromCookie(request);
const response = await fetch('https://psbuniverse.com/api/auth/validate-token', {
  method: 'POST',
  body: JSON.stringify({ token })
});
```

### Logout

```javascript
import { logout } from "@/core/sso-client";

<button onClick={logout}>Logout</button>
```

---

## For Core Platform Team

### Deploy Core Portal

```bash
# Set environment variables
JWT_SECRET=<generated-secure-key>
NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>

# Deploy to Vercel
vercel --prod

# Run migrations
supabase migration up
```

### Verify Deployment

```bash
# Test endpoints
curl https://psbuniverse.com/api/auth/validate-token

# Check logs
vercel logs

# Monitor errors
# (via Sentry or error tracking service)
```

---

## API Quick Reference

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/auth/login` | POST | Start session | Supabase |
| `/api/auth/logout` | POST | End session | Cookie |
| `/api/auth/validate-token` | GET | Check auth | Cookie |
| `/api/auth/refresh-token` | POST | Refresh token | Cookie |

### Login Example

```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ accessToken: supabaseToken })
});
```

### Validate Example

```javascript
const response = await fetch('/api/auth/validate-token', {
  credentials: 'include'
});
const { payload } = await response.json();
console.log(payload.modules); // User's accessible modules
```

---

## Common Tasks

### Check if User is Authenticated

```javascript
const session = await validateSessionToken();
if (!session) {
  // Not authenticated
  logout();
}
```

### Get User Information

```javascript
const session = await validateSessionToken();
console.log(session.userId);      // User ID
console.log(session.email);       // Email
console.log(session.fullName);    // Name
console.log(session.modules);     // Accessible modules
console.log(session.roles);       // User roles
```

### Check Module Access

```javascript
const session = await validateSessionToken();
if (session.modules.includes('GUTTER')) {
  // User can access Gutter module
}
```

### Refresh Expiring Token

```javascript
const response = await fetch('/api/auth/refresh-token', {
  method: 'POST',
  credentials: 'include'
});
if (response.json().refreshed) {
  // Token was refreshed, new one in cookie
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `validateSessionToken` returns null | User not logged in, call `logout()` |
| Token validation fails (401) | Token expired, invalid, or invalidated |
| Cookie not shared across subdomains | Domain must be `.psbuniverse.com` (with dot) |
| "Module not found" | Set `NEXT_PUBLIC_MODULE_ID` environment variable |
| CORS error | Check core portal is accessible from module |

---

## Environment Variables

### Core Portal (.env.local)
```env
JWT_SECRET=your-secret-key
NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Module (.env.local)
```env
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER
```

---

## Security Checklist

- [ ] Never commit `.env.local`
- [ ] Use unique `JWT_SECRET` for each environment
- [ ] Enable HTTPS/SSL on all domains
- [ ] Set `HttpOnly` flag on session cookie
- [ ] Set `Secure` flag on session cookie in production
- [ ] Validate tokens on every API call
- [ ] Rotate `JWT_SECRET` periodically
- [ ] Monitor failed authentication attempts

---

## Files Overview

### Core Authentication
- `src/core/auth/jwt.utils.js`: JWT token operations
- `src/core/auth/cookies.utils.js`: Cookie management
- `src/core/auth/session.service.js`: Session lifecycle
- `src/core/auth/middleware.auth.js`: API protection

### API Routes
- `src/app/api/auth/login/route.js`: Generate session
- `src/app/api/auth/logout/route.js`: End session
- `src/app/api/auth/validate-token/route.js`: Verify token
- `src/app/api/auth/refresh-token/route.js`: Refresh token

### Database
- `supabase/migrations/20260618000000_sso_system.sql`: Tables & functions

### Documentation
- `docs/09-sso-architecture/README.md`: Architecture
- `docs/09-sso-architecture/module-integration-guide.md`: Integration
- `docs/09-sso-architecture/API-REFERENCE.md`: API docs
- `docs/09-sso-architecture/DEPLOYMENT-GUIDE.md`: Deployment
- `docs/09-sso-architecture/MIGRATION-GUIDE.md`: Migration

---

## Useful Commands

```bash
# Start development
npm run dev

# Build for production
npm run build

# Run migrations
supabase migration up

# Check migrations status
supabase migration list

# Deploy to Vercel
vercel --prod

# Check Vercel logs
vercel logs

# Clear browser cache
# DevTools: Storage → Clear site data
```

---

## Links & Resources

- [Full Documentation](./README.md)
- [API Reference](./API-REFERENCE.md)
- [Module Integration](./module-integration-guide.md)
- [Deployment Guide](./DEPLOYMENT-GUIDE.md)
- [Migration Guide](./MIGRATION-GUIDE.md)
- [Implementation Summary](./IMPLEMENTATION-SUMMARY.md)

---

## Emergency Procedures

### User Locked Out

1. Check in Supabase if account still active
2. Verify user has roles assigned
3. Check if session was invalidated
4. Force password reset if needed

### Token Validation Failing

1. Check `JWT_SECRET` is correct
2. Verify token hasn't expired
3. Check database for invalidation record
4. Restart Core Portal if secret changed

### Module Can't Connect to Core Portal

1. Check URL in `NEXT_PUBLIC_CORE_PORTAL_URL`
2. Verify Core Portal is running
3. Check network connectivity
4. Check CORS configuration

---

## Performance Tips

- Cache token validation for up to 60 seconds
- Use token refresh to minimize re-authentication
- Implement connection pooling to database
- Monitor token generation performance
- Set up alerts for high error rates

---

## Support Contacts

- **Core Platform Team**: [email/slack]
- **Security Team**: [email/slack]
- **DevOps Team**: [email/slack]

---

**Last Updated**: June 18, 2026  
**Version**: 1.0  
**Status**: Production Ready
