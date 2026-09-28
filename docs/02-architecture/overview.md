# Architecture Overview

This is the primary reference for understanding how PSBUniverse Core works. Read this before modifying authentication, RBAC, module registration, or routing.

> **New here?** Start with the [Getting Started Guide](../01-getting-started/getting-started-v2.md) — it covers setup, environment config, and building your first module. Come back here for the deep dive into how things work under the hood.

---

## What Is PSBUniverse Core?

PSBUniverse Core is a **modular platform application**. Think of it like an operating system — it provides the platform, and modules are the installed apps.

> **In simple terms:** Imagine your phone's home screen. The phone itself (Core) handles security, login, and navigation. Each app on your phone (Module) does its own thing — email, calendar, etc. You don't rebuild the phone to add an app.

It separates two concerns:

| Layer | Responsibility |
|-------|---------------|
| **Core** | Authentication, identity mapping, RBAC, routing, shared UI shell |
| **Modules** | Domain features, workflows, card-level filtering, module-specific UI |

### Why This Split Matters

1. Security behavior stays consistent — one team owns auth and access control.
2. Module teams can build features without touching platform code.
3. Adding a new module doesn't require editing core files.
4. The existing business table model (INT foreign keys) is preserved — auth UUIDs stay in the auth layer only.

> **In simple terms:** Your business tables use simple numbers (1, 2, 3) as IDs. The login system uses long random strings (UUIDs) as IDs. We keep them separate so your business code stays clean.

---

## Key Runtime Files

| File | Purpose |
|------|---------|
| `src/core/auth/AuthProvider.js` | Loads and stores `authUser`, `dbUser`, `roles`, `loading` |
| `src/core/auth/useAuth.js` | React hook to access auth context from any component |
| `src/core/auth/access.js` | `hasAppAccess()` and `hasCardAccess()` helper functions |
| `src/core/auth/DashboardModules.js` | Filters module list by app access |
| `src/core/auth/ModuleAccessGate.js` | Blocks unauthorized module routes |
| `src/core/auth/bootstrap.actions.js` | Server Action — resolves auth user + business user + roles |
| `src/core/auth/createBusinessUser.js` | Creates auth user + business user + roles (with rollback) |
| `src/modules/loadModules.js` | Discovers module definitions from `src/modules/*/index.js` |
| `scripts/generate-routes.js` | Auto-generates `src/app/` route files from module `index.js` definitions |
| `src/shared/utils/databind.actions.js` | Server Actions for table query, filter options, and export |
| `src/core/supabase/client.js` | Browser Supabase client (for user-session operations) |
| `src/core/supabase/admin.js` | Server-only admin Supabase client (for privileged operations) |

---

## Authentication System

PSBUniverse uses **two identity sources** connected by a bridge column.

> **In simple terms:** When someone logs in, Supabase knows them by a long random ID (UUID). But our business tables (like employees, departments) use simple number IDs. The `auth_user_id` column is the bridge — it connects "login user #abc-123" to "employee #7".

| Source | Table | Key | Purpose |
|--------|-------|-----|---------|
| Auth identity | Supabase Auth | `auth_user_id` (UUID) | Login credentials, session tokens |
| Business profile | `psb_s_user` | `user_id` (INT) | Name, company, department, status |

The `auth_user_id` column in `psb_s_user` bridges the two.

### Auth Flow (Step by Step)

1. User submits login form → `supabase.auth.signInWithPassword()`.
2. On success, login page sets the `sb-access-token` cookie.
3. Login calls `hasServerSession()` Server Action to confirm the server can see the session.
4. Login redirects to `/psbpages/dashboard` via `window.location.assign()`.
5. `AuthProvider` runs and calls `supabase.auth.getUser()`.
6. If that fails or the session is expired, `AuthProvider` calls `bootstrapAuthState()` Server Action.
7. Core maps `authUser.id` → `psb_s_user` by `auth_user_id`.
8. Core loads active role rows from `psb_m_userapproleaccess` by `dbUser.user_id`.
9. Everything is exposed via the `useAuth()` hook.

### Session Cookie

| Property | Value |
|----------|-------|
| Cookie name | `sb-access-token` |
| Set by | Login page, AuthProvider (on session events) |
| Cleared by | AuthProvider on sign-out |
| Checked by | `AuthProvider` (validates session on load) and `ModuleAccessGate` (blocks unauthorized routes) |

### Using `useAuth()` in Your Code

```js
import { useAuth } from "@/core/auth/useAuth";

export default function MyComponent() {
  const { authUser, dbUser, roles, loading } = useAuth();

  if (loading) return <p>Loading...</p>;
  if (!authUser || !dbUser) return <p>No active session.</p>;

  return <p>Welcome, {dbUser.email}</p>;
}
```

**Rules:**
1. Always handle the `loading` state.
2. Always handle `null` for `authUser` / `dbUser`.
3. Never call `useAuth()` outside `AuthProvider`.
4. Never call `supabase.auth.getUser()` directly in module components — use `useAuth()` instead.

---

## RBAC System

RBAC (Role-Based Access Control) has **two layers**.

> **In simple terms:** RBAC answers two questions: "Can this user open this module?" (App Access) and "Can this user see this specific feature inside the module?" (Card Access). The answers come from the database, not from code.

### Layer 1: App Access (Core Responsibility)

Controls whether a user can enter a module at all.

> **For example:** A user with the "Viewer" role might see the Metal Buildings module on the dashboard, but a user without any Metal Buildings role won't see it at all — and typing the URL directly won't work either.

| What | How |
|------|-----|
| Data source | `psb_m_userapproleaccess` |
| Check function | `hasAppAccess(userRoles, appId)` |
| Effect | Dashboard hides modules the user can't access. Direct URL access is blocked by `ModuleAccessGate`. |

### Layer 2: Card Access (Module Responsibility)

Controls which features/cards within a module are visible.

> **For example:** Inside the Metal Buildings module, a "Manager" role might see the "Delete Project" card, but a "Viewer" role only sees "View Projects". The module code checks this using `hasCardAccess()`.

| What | How |
|------|-----|
| Data sources | `psb_s_appcard`, `psb_m_appcardgroup`, `psb_m_appcardroleaccess` |
| Check function | `hasCardAccess(cardId, userRoles, cardRoleAccess)` |
| Effect | Module features can be shown or hidden per role mapping. |

### End-to-End Data Flow

```
Login → Supabase auth session
  → authUser.id
  → query psb_s_user by auth_user_id → dbUser.user_id
  → query active roles from psb_m_userapproleaccess
  → roles stored in auth context
  → core checks app access by app_id (dashboard + route gate)
  → module checks card access by card_id (feature filtering)
```

### Card Access Example

```js
import { hasCardAccess } from "@/core/auth/access";
import { useAuth } from "@/core/auth/useAuth";

function CardsView({ cards, cardRoleAccess }) {
  const { roles } = useAuth();

  const visibleCards = cards.filter((card) =>
    hasCardAccess(card.card_id, roles, cardRoleAccess)
  );

  return (
    <div>
      {visibleCards.map((card) => (
        <div key={card.card_id}>{card.card_name}</div>
      ))}
    </div>
  );
}
```

---

## Dashboard Resolution Order

The dashboard page (`/psbpages/dashboard`) builds its tiles from database setup tables in this order:

1. **User access scope** — `psb_m_userapproleaccess` + `psb_s_role` + `psb_s_application` decide which apps the user can access.
2. **Card/group visibility** — `psb_m_appcardgroup` + `psb_s_appcard` + `psb_m_appcardroleaccess` decide which cards to show.
3. **App-level fallback** — if card/group setup is missing, fallback tiles can still come from `psb_s_application`.

> **In simple terms:** Dashboard tiles come from the database setup. If card setup is incomplete, the app can still show basic app tiles from `psb_s_application`.

**What this means for you:** Keep setup tables correct (`app`, `group`, `card`, `card-role`) or users will see missing or incomplete dashboard tiles.

---

## Provisioning a New User

Use the `createBusinessUser` helper (in `src/core/auth/createBusinessUser.js`) for the governed flow:

1. Creates auth user in Supabase Auth.
2. Inserts business user row in `psb_s_user`.
3. Inserts role rows in `psb_m_userapproleaccess`.
4. Rolls back downstream records if any step fails.

> **In simple terms:** "Rollback" means if step 3 fails, the system automatically deletes what was created in steps 1 and 2 so you don't end up with a half-created user.

---

## Layer Responsibilities

| Layer | Owns | Must Not Own |
|-------|------|-------------|
| Core | Auth, user mapping, app-level RBAC, route gating | Domain feature behavior |
| Module | Domain UI, card-level filtering, feature workflows | Auth identity, app-level authorization |

---

## Development Principles

1. Keep platform enforcement in core.
2. Keep business feature logic in modules.
3. Use DB-driven access logic only — no hardcoded role names or permission lists.
4. Never mix auth UUID logic directly into business table joins.

---

## Troubleshooting

### User logs in but sees no modules

1. Is `dbUser` resolved from `auth_user_id`?
2. Are role rows active in `psb_m_userapproleaccess`?
3. Does the module `module_key` match an active row in `psb_s_application`?

### User gets redirected back to /login after sign in

1. Does `bootstrapAuthState()` return `authUser.id` after login?
2. Is `sb-access-token` present in browser cookies?
3. Is `AuthProvider` receiving a valid token from the cookie?
4. Are you testing against the correct server port?

### Route opens but should be blocked

1. Does `ModuleAccessGate` receive the correct `appId`?
2. Does `hasAppAccess` compare `role.app_id` correctly?
3. Is the module marked `public: true`? Public modules skip the access gate.
4. Does the role row have `is_active = true` unexpectedly?

### Module cards show incorrectly

1. Is the card query scoped by `app_id` and `is_active`?
2. Are card-role mappings loaded with `is_active = true`?
3. Is `hasCardAccess` called before rendering card actions?

---

## Current Constraints

1. `src/modules` is the canonical module location.
2. Card-level filtering depends on module implementation — core provides the helper.
3. `supabase/migrations` folder exists but currently has no SQL files.
4. There are no API routes — all server logic uses Server Actions (`"use server"` files).

---

## What Is Working Today

1. Global auth context is active and exposed via `useAuth()`.
2. Login/logout and session guard are active (`AuthProvider` + `ModuleAccessGate` + cookie check).
3. App-level RBAC is enforced on the dashboard and at the route entry gate.
4. Module loading and route resolution are fully dynamic (auto-discovery).
5. Card-level access helper (`hasCardAccess`) exists for modules to use.

---

## Operational Checklist

Before deploying any change to auth or RBAC, verify:

1. Build passes (`npm run build`).
2. Login flow completes — user lands on dashboard with correct modules.
3. Unauthorized route access is blocked (direct URL returns "No Access").
4. Dashboard visibility is correct — only authorized modules appear.
5. Module cards are filtered correctly by role mapping.

---

## Recent Platform Changes

See [CHANGELOG.md](../CHANGELOG.md) for a dated log of platform changes including auth refactors, RBAC updates, and module system improvements.
