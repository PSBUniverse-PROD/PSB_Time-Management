# PSBUniverse SSO - Environment Variables & Deployment Guide

## Environment Variables

### Core Portal (psbuniverse.com)

Create or update `.env.local`:

```env
# ── JWT Configuration ────────────────────────────────────────────────────
# Secret key for signing JWT tokens
# IMPORTANT: Change this to a secure random string in production!
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-super-secret-key-change-this-in-production

# ── Cookie Configuration ────────────────────────────────────────────────
# Domain for session cookies (must start with a dot for subdomain sharing)
NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com

# ── Supabase Configuration ────────────────────────────────────────────
# These are your Supabase project credentials
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# ── Application Configuration ────────────────────────────────────────
# Environment: local, dev, prod
NEXT_PUBLIC_ENV=local

# ── Optional: Token Settings ────────────────────────────────────────
# Token expiration time (default: 24h)
# JWT_EXPIRATION=24h

# ── Optional: Feature Flags ────────────────────────────────────────
# ENABLE_SSO_DEBUG=false
```

### Module Applications (Gutter, OHD, Metal Buildings)

Create or update `.env.local` in each module:

```env
# ── Core Portal Configuration ────────────────────────────────────────
# URL of the Core Portal
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com

# Unique identifier for this module (must match psb_s_application.app_id)
NEXT_PUBLIC_MODULE_ID=GUTTER

# ── Environment ────────────────────────────────────────────────────
NEXT_PUBLIC_ENV=local

# ── Supabase Configuration (if needed for additional queries) ────────────
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Development vs Production

#### Development Environment

**Core Portal .env.local**:
```env
JWT_SECRET=dev-secret-key-not-for-production
NEXT_PUBLIC_COOKIE_DOMAIN=localhost
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key
NEXT_PUBLIC_ENV=dev
```

**Module .env.local**:
```env
NEXT_PUBLIC_CORE_PORTAL_URL=http://localhost:3000
NEXT_PUBLIC_MODULE_ID=GUTTER
NEXT_PUBLIC_ENV=dev
```

#### Production Environment

**Core Portal .env.production**:
```env
JWT_SECRET=generated-secure-production-key
NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=production-anon-key
SUPABASE_SERVICE_ROLE_KEY=production-service-role-key
NEXT_PUBLIC_ENV=prod
```

**Module .env.production**:
```env
NEXT_PUBLIC_CORE_PORTAL_URL=https://psbuniverse.com
NEXT_PUBLIC_MODULE_ID=GUTTER
NEXT_PUBLIC_ENV=prod
```

---

## Deployment Guide

### Prerequisites

- Node.js 18+ installed
- Next.js 14+ configured
- Vercel account (or your preferred hosting)
- Supabase project set up
- Domain configured (psbuniverse.com and subdomains)

### Step 1: Generate JWT Secret

Generate a secure JWT secret for production:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

Save this securely in your production environment.

### Step 2: Deploy Core Portal to Vercel

#### Option A: Using Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import GitHub repository for PSBUniverse-core
4. Configure environment variables:
   - `JWT_SECRET`: Your generated secret
   - `NEXT_PUBLIC_COOKIE_DOMAIN`: `.psbuniverse.com`
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key
   - `NEXT_PUBLIC_ENV`: `prod`
5. Click "Deploy"
6. Add custom domain: `psbuniverse.com`

#### Option B: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Set environment variables
vercel env add JWT_SECRET
vercel env add NEXT_PUBLIC_COOKIE_DOMAIN
vercel env add NEXT_PUBLIC_SUPABASE_URL
# ... etc

# Deploy with environment variables
vercel --prod
```

### Step 3: Deploy Modules to Vercel

For each module (Gutter, OHD, Metal Buildings):

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import GitHub repository for module
4. Configure environment variables:
   - `NEXT_PUBLIC_CORE_PORTAL_URL`: `https://psbuniverse.com`
   - `NEXT_PUBLIC_MODULE_ID`: `GUTTER` (or respective module ID)
   - `NEXT_PUBLIC_ENV`: `prod`
5. Add custom domain: `gutter.psbuniverse.com` (or respective subdomain)
6. Click "Deploy"

### Step 4: Configure DNS

In your domain registrar (GoDaddy, Route 53, Cloudflare, etc.):

#### CNAME Records

```
psbuniverse.com              CNAME  psbuniverse.vercel.app
gutter.psbuniverse.com       CNAME  gutter-psbuniverse.vercel.app
ohd.psbuniverse.com          CNAME  ohd-psbuniverse.vercel.app
metal.psbuniverse.com        CNAME  metal-psbuniverse.vercel.app
```

Or use Vercel's domain management for automatic setup.

### Step 5: Verify Deployment

After deployment, verify everything works:

```bash
# Test Core Portal
curl https://psbuniverse.com/api/auth/validate-token

# Test Module Access
curl -H "Cookie: psb_session=test" https://gutter.psbuniverse.com

# Check HTTPS
curl -I https://psbuniverse.com
```

### Step 6: Monitor Deployment

1. Check Vercel deployment status
2. Monitor error logs: `vercel logs`
3. Check Core Portal health endpoint
4. Test login flow end-to-end

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Setup Steps

#### 1. Clone Repository

```bash
git clone https://github.com/your-org/PSBUniverse-core.git
cd PSBUniverse-core
npm install
```

#### 2. Configure Environment

Create `.env.local`:

```env
JWT_SECRET=dev-secret-key
NEXT_PUBLIC_COOKIE_DOMAIN=localhost
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev-key
SUPABASE_SERVICE_ROLE_KEY=dev-service-key
NEXT_PUBLIC_ENV=dev
```

#### 3. Update Hosts File (optional, for subdomain testing)

On Windows: `C:\Windows\System32\drivers\etc\hosts`
On Mac/Linux: `/etc/hosts`

Add:
```
127.0.0.1  psbuniverse.local
127.0.0.1  gutter.psbuniverse.local
127.0.0.1  ohd.psbuniverse.local
127.0.0.1  metal.psbuniverse.local
```

Then use `psbuniverse.local` instead of `localhost` for testing.

#### 4. Start Development Server

```bash
npm run dev
```

Access at: `http://localhost:3000`

#### 5. Clone and Setup Modules

For each module (in separate directories):

```bash
git clone https://github.com/your-org/gutter-module.git
cd gutter-module
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_CORE_PORTAL_URL=http://localhost:3000
NEXT_PUBLIC_MODULE_ID=GUTTER
NEXT_PUBLIC_ENV=dev
```

Start module server:

```bash
npm run dev -- -p 3001
```

### Testing Locally

1. Open `http://localhost:3000` (Core Portal)
2. Log in with test credentials
3. Open `http://localhost:3001` (Gutter module)
4. Should be automatically authenticated
5. Test logout from either application

---

## Database Migrations

### Running Migrations

#### Via Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Navigate to SQL Editor
3. Run migration file: `supabase/migrations/20260618000000_sso_system.sql`

#### Via Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-id

# Run migrations
supabase migration up

# Check status
supabase migration list
```

### Verifying Migrations

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'psb_%' AND table_schema = 'public';

-- Check sessions table
SELECT * FROM public.psb_sessions LIMIT 1;

-- Check session tokens table
SELECT * FROM public.psb_session_tokens LIMIT 1;
```

---

## Performance Optimization

### Caching

Enable response caching for API endpoints:

```javascript
// src/app/api/auth/validate-token/route.js
export const revalidate = 60; // Cache for 60 seconds
```

### Rate Limiting

Implement rate limiting with Redis or similar:

```javascript
import Ratelimit from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),
});

export async function POST(request) {
  const { success } = await ratelimit.limit(request.ip);

  if (!success) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  // Process request
}
```

### Database Optimization

Create indexes for common queries:

```sql
-- Already included in migration file
CREATE INDEX idx_psb_sessions_auth_user_id ON psb_sessions (auth_user_id);
CREATE INDEX idx_psb_sessions_expires_at ON psb_sessions (expires_at);
```

---

## Security Hardening

### 1. Environment Variables

- [ ] Never commit `.env.local` to Git
- [ ] Use `.env.local` in `.gitignore`
- [ ] Generate unique JWT_SECRET for each environment
- [ ] Rotate JWT_SECRET periodically

### 2. HTTPS/SSL

- [ ] Ensure all domains use HTTPS
- [ ] Enable HSTS header
- [ ] Verify SSL certificates

### 3. CORS Configuration

```javascript
// src/middleware.js
const ALLOWED_ORIGINS = [
  "https://psbuniverse.com",
  "https://gutter.psbuniverse.com",
  "https://ohd.psbuniverse.com",
  "https://metal.psbuniverse.com",
];

export function middleware(request) {
  const origin = request.headers.get("origin");

  if (ALLOWED_ORIGINS.includes(origin)) {
    // Allow request
  }
}
```

### 4. Content Security Policy

```javascript
// next.config.mjs
export default {
  headers: [
    {
      source: "/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self' 'unsafe-inline';",
        },
      ],
    },
  ],
};
```

---

## Monitoring & Logging

### Application Monitoring

Set up with services like:
- **Vercel Analytics**: Automatic with Vercel deployment
- **Sentry**: Real-time error tracking
- **DataDog**: Full-stack monitoring

### Logging

```javascript
// Log authentication events
console.log(`User ${userId} logged in at ${new Date()}`);
console.log(`User ${userId} logged out at ${new Date()}`);
console.log(`Token validation failed: ${error}`);
```

### Health Check Endpoint

```javascript
// src/app/api/health/route.js
export async function GET() {
  return Response.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
```

---

## Troubleshooting Deployment

### Issue: "Module not found" errors

**Solution**:
1. Verify all dependencies installed
2. Check import paths
3. Run `npm install` again

### Issue: Environment variables not set

**Solution**:
1. Verify variables in Vercel dashboard
2. Restart deployment
3. Check `.env.production` file

### Issue: CORS errors

**Solution**:
1. Check CORS headers in response
2. Verify origin is whitelisted
3. Check cookies: `include` flag

### Issue: Cookie not sharing across subdomains

**Solution**:
1. Verify domain is `.psbuniverse.com` (with dot)
2. Check Set-Cookie header in response
3. Verify both are actual subdomains

---

## Rollback Procedure

If deployment goes wrong:

```bash
# Revert to previous deployment
vercel rollback

# Or manually select previous build
# Via Vercel dashboard: Deployments → Previous version → Promote
```

---

## Maintenance Tasks

### Regular Tasks

- [ ] Monitor error logs daily
- [ ] Review authentication metrics weekly
- [ ] Check expired sessions cleanup monthly
- [ ] Rotate JWT_SECRET every 3 months

### Cleanup Jobs

```bash
# Clean up expired sessions (run via cron job)
curl https://psbuniverse.com/api/admin/cleanup-sessions \
  -H "Authorization: Bearer admin-token"
```

### Backup

- [ ] Back up Supabase database weekly
- [ ] Enable Supabase backups
- [ ] Export session data periodically

---

## Support & Issues

For deployment issues:
1. Check Vercel logs: `vercel logs`
2. Check error tracking service (Sentry, etc.)
3. Review this troubleshooting guide
4. Contact the Core Platform team

---

## Next Steps

After deployment:
1. ✅ Test SSO flow end-to-end
2. ✅ Monitor error rates
3. ✅ Get team feedback
4. ✅ Document learnings
5. ✅ Plan future improvements
