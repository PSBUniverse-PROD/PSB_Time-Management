# PSBUniverse SSO — Usage

Cross-subdomain single sign-on where **core owns everything**: core signs and
verifies sessions and is the only app that reads the DB for auth. Modules hold
no numeric ids and no auth secrets — they ask core.

## How it works

1. You log in on core (`www.psbuniverse.com`); core sets the `psb_session`
   cookie scoped to `.psbuniverse.com`.
2. You open a module (e.g. `timesheets.psbuniverse.com`); the browser sends the
   shared cookie automatically.
3. The shared shell calls `GET {CORE_PORTAL_URL}/api/auth/introspect?module=<module_key>`
   with credentials. Core verifies the signed `psb_session`, maps `module_key` →
   `app_id` via `psb_s_application`, and returns identity, roles, and
   `authorizedForApp`.
4. The module trusts core's `authorizedForApp` — it verifies nothing itself.

## Module Startup And Login

A modular app is a separate deployment of the shared shell, not a separate required
sign-in. When `NEXT_PUBLIC_MODULE_KEY` is set to a non-core key, `AuthProvider`
initializes directly from core introspection instead of local Supabase auth or a
module-local bootstrap action.

- The local login form is hidden while the module verifies SSO or redirects.
- An authenticated visitor to the module's login page follows a validated return
   URL, or goes to the module's local root. That root resolves the first non-login,
   non-root route declared by the matching `module_key` in the module registry.
   An unknown key or missing home route produces a 404 rather than a redirect loop.
- A confirmed missing/expired session sends the visitor to core's login with the
   full module URL as the return destination, including its query string.
- If core is unavailable, the module shows a retry state instead of a credentials
   form. Introspection requests time out after 15 seconds.
- Local Supabase sign-out triggers SSO revalidation. It does not end a valid shared
   session, and local Supabase identity events cannot replace a module's SSO user.

Core login reports success only after `/api/auth/login` succeeds and introspection
verifies the new browser session. Session checks pause during that sign-in
transition so they cannot reject the user before the shared cookie is created.

Deploy the updated core, then sync **and redeploy** each modular app. Syncing source
alone does not update an already deployed app. Each app must configure
`NEXT_PUBLIC_MODULE_KEY` to match both its registry definition and core app record.
For local module development, set `NEXT_PUBLIC_CORE_PORTAL_URL` to your running
local core portal; module login is still centralized there.

Run the service-free shell regression suite from the repo root:

```powershell
node --test scripts/tests/sso-shell.tests.mjs
```

## Session Lifecycle

The shared `AuthProvider` owns session checks and the warning modal. Feature modules
do not need their own expiry timers, logout handlers, or renewal dialogs.

- Normal introspection calls use a 30-second client cache. The provider bypasses
   that cache every 30 seconds, when the tab becomes visible, and at the last verified
   expiry. Background browser throttling can delay checks until the tab resumes.
- A confirmed expired, missing, or invalidated shared session
   clears local user/role state and redirects to login with the current path and
   query as the return destination. Supabase sign-out alone causes revalidation.
- Temporary network/server failures keep the last verified result rather than
   immediately logging the user out. They do not extend a known expired session.

### Ten-Minute Warning

At 10 minutes remaining, the global **Session Expiring** modal shows a countdown:

- **Extend for 24 hours** requests renewal from core. On success, the modal closes
   and expiry/warning timers are reset to the renewed deadline.
- **Not now** or the close button dismisses the warning for that expiry. The
   session still ends at its deadline unless it is renewed elsewhere.
- During renewal, duplicate requests and dismissal are blocked. Non-authentication
   failures show a retryable error; a `401` ends the session and requires login.

### Renewal Contract

The shell's `extendSession()` helper sends a credentialed POST to
`/api/auth/refresh-token`, same-origin on core and at `NEXT_PUBLIC_CORE_PORTAL_URL`
on module deployments. The request times out after 15 seconds. A module must not
try to extend a session by editing client cookies or its countdown.

The server renews a valid session with at most two hours remaining to **24 hours
from renewal**, not 24 hours added to its old deadline. Earlier requests retain the
current token and return `refreshed: false`. An expired token cannot be renewed.

Before issuing new cookies, core checks origin, signature/expiry, revocation,
user identity linkage and active status, and current role access. Required database
lookup failures do not issue a new token. Renewal only reads database records; it
does not update `psb_sessions` tracking records or invalidate the previous token.
That previous token retains its original expiry.

The new shared cookies are picked up by other tabs on their next check. Each tab
revalidates before enforcing an old deadline so renewal in another tab is respected.
See the [API Reference](API-REFERENCE.md) for responses and error statuses.

## Environment variables

### Core (`www.psbuniverse.com`)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_ENV` | `prod` | Makes cookies `Domain=.psbuniverse.com` + `Secure` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.psbuniverse.com` | Shared cookie scope |
| `NEXT_PUBLIC_CORE_PORTAL_URL` | `https://www.psbuniverse.com` | Portal URL |
| `NEXT_PUBLIC_MODULE_KEY` | `psbuniverse` (or unset) | Core → introspect same-origin |
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service key | **server-only**; introspect/admin |
| `JWT_SECRET` | strong random | **server-only**; signs + verifies `psb_session` |
| `JWT_EXPIRATION` | `24h` | optional |
| `IMPERSONATION_REQUIRED_ROLE` | `CORE MANAGER` | optional |

### Each module (e.g. Time Tracker)

| Variable | Value | Required |
|---|---|---|
| `NEXT_PUBLIC_MODULE_KEY` | its slug, e.g. `time-tracker` | **yes** — must match `psb_s_application.module_key` |
| `NEXT_PUBLIC_CORE_PORTAL_URL` | `https://www.psbuniverse.com` | **yes** |
| `NEXT_PUBLIC_ENV` | `prod` | **yes** (cross-subdomain cookies) |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.psbuniverse.com` | **yes** (logout clears shared cookie) |
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | **yes** (shell client init) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | **yes** (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service key | only if the module has its own server-side data |
| `JWT_SECRET` | same as core | only if the module verifies tokens in its own API routes |
| `NEXT_PUBLIC_MODULE_ID` | — | **removed** — no longer used |

Module `module_key` slugs: `project-map`, `time-tracker`, `gutter-app`,
`ohd-app`, `metal-app`, `inventory`, `workflow`, `psbuniverse` (core).

## Database / admin requirements

- **`psb_s_application.module_key`** — unique, non-null slug per app; a module's
  `NEXT_PUBLIC_MODULE_KEY` must equal it, and the row must be `is_active = true`.
- **Card `route_path`** (Card Module Setup) — point at the real subdomain
  (`https://timesheets.psbuniverse.com/…`), never a `vercel.app` URL.
- **User access** — a user reaches a module only with an active
  `psb_m_userapproleaccess` row for that `app_id` (User Master Setup).
- **Hosting** — core and every module on `*.psbuniverse.com` over HTTPS.

## Deploy order

1. Deploy **core** (introspect + refresh-token endpoints and shell) with the core env above.
2. Deploy each **module** (shell) with the module env; drop `NEXT_PUBLIC_MODULE_ID`.
3. Point card `route_path`s at the subdomains.

## Adding a new module

1. Application Setup → create the app (gets a `module_key`).
2. User Master Setup → grant users access.
3. Deploy the module with the shared shell + these env vars:
   `NEXT_PUBLIC_MODULE_KEY`, `NEXT_PUBLIC_CORE_PORTAL_URL`, `NEXT_PUBLIC_ENV=prod`,
   `NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com`, Supabase URL + anon key.
4. Card Module Setup → add its card pointing at its subdomain.

No `MODULE_ID`, no host maps, no core code change.

## Testing

1. Log in at `www.psbuniverse.com`.
2. Click a module card → opens already logged in, no prompt.
3. Module DevTools → Network: `GET .../api/auth/introspect?module=<slug>`
   → `200 {authenticated:true, authorizedForApp:true}`, no CORS error. Further
   checks occur every 30 seconds and when the tab becomes visible.
4. A user without that module → "No access to this module."
5. In a controlled non-production test, use a server-issued session with no more
   than 10 minutes remaining. Check the global modal, countdown, and both actions
   on desktop and mobile; do not alter signed tokens in the browser.
6. Choose **Extend for 24 hours**. Verify a successful POST, renewed cookie expiry,
   closed modal, and continued authentication in a second tab.
7. Simulate a failed renewal. Verify the error and retry controls; a rejected or
   expired session should instead redirect to login.
8. Dismiss the warning and allow the session to expire. Verify local auth state is
   cleared and login is shown when the expiry check completes.

## Notes / trade-offs

- Trust lives in core's verified answer, not the forgeable `psb_user_payload`.
- Module auth depends on core being reachable (short client cache tolerates a
  brief blip; a sustained core outage blocks new module authorization).
- `JWT_SECRET` is the master secret — rotating it invalidates all `psb_session`
  cookies (everyone re-logs in) and must be updated everywhere at once.
