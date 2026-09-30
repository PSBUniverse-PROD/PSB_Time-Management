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

1. Deploy **core** (introspect endpoint + shell) with the core env above.
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
3. Module DevTools → Network: one `GET .../api/auth/introspect?module=<slug>`
   → `200 {authenticated:true, authorizedForApp:true}`, no CORS error.
4. A user without that module → "No access to this module."

## Notes / trade-offs

- Trust lives in core's verified answer, not the forgeable `psb_user_payload`.
- Module auth depends on core being reachable (short client cache tolerates a
  brief blip; a sustained core outage blocks new module authorization).
- `JWT_SECRET` is the master secret — rotating it invalidates all `psb_session`
  cookies (everyone re-logs in) and must be updated everywhere at once.
