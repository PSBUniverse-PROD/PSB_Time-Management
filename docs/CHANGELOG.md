# Changelog

## 2026-05-11 New Page Scaffolding Script

Added a `newpage` subcommand to `generate-routes.js` so developers can add a new page to an existing module with one command.

### Changes

1. **Added `newpage` subcommand to `generate-routes.js`** — Creates the Page (server component) and View (client component) files, adds the route entry to the module's `index.js`, and runs route generation automatically.
2. **Added `npm run new-page` script** — shortcut for `node scripts/generate-routes.js newpage`.

### Usage

```bash
npm run new-page -- modules/admin/gutter/index.js settings
```

### Safety Checks

- Errors if the module index.js doesn't exist
- Errors if the route already exists in the module
- Errors if the page files already exist
- Shows help if arguments are missing

### Documentation Updated

- Quickstart, Getting Started, and Module System docs updated to reference `npm run new-page`.

---

## 2026-05-02 Status Badge System & Design Tokens

Unified all status indicators across the platform using a new `StatusBadge` component backed by CSS custom property tokens. Replaced all local status Badge implementations with a single shared component.

### Changes

1. **Added `src/shared/components/ui/feedback/StatusBadge.js`** — shared component that renders a pill-shaped badge with dot indicator. Accepts `status` string (case-insensitive) and optional `label` override. Supported statuses: active, completed, approved, processing, in-progress, pending, waiting, suspended, failed, error, rejected, inactive, disabled, cancelled, archived, draft.

2. **Added status tokens to `src/styles/variables.css`** — `--psb-status-{name}`, `--psb-status-{name}-bg`, `--psb-status-{name}-border` for all 10 status categories (active, completed, processing, pending, suspended, failed, inactive, cancelled, archived, draft).

3. **Added status badge CSS to `src/app/globals.css`** — `.psb-status-badge`, `.psb-status-dot`, and per-status classes (`.psb-status-active`, `.psb-status-inactive`, etc.) using the token system.

4. **Exported from barrel** — `StatusBadge` added to `src/shared/components/ui/index.js`.

5. **Replaced local StatusBadge in admin pages:**
   - `ApplicationSetupView.jsx` — removed local function, imported shared component
   - `CardModuleSetupView.jsx` — removed local function, imported shared component
   - `CompanyDepartmentSetupView.jsx` — removed local function, imported shared component
   - `StatusSetupView.jsx` — removed local function, imported shared component
   - `UserMasterSetupView.jsx` — replaced 3 raw Badge status usages with StatusBadge

6. **Updated `ProfileView.jsx`** — replaced hardcoded Bootstrap Badge with shared StatusBadge.

7. **Updated `ExamplesPage.js`** — all live status demos now use StatusBadge; all code snippets updated to teach the new pattern; `SNIPPET_BADGE` rewritten for StatusBadge.

8. **Updated `useDataTableModuleController.js`** — status column now uses StatusBadge instead of Badge + helper function.

### Migration Rule

All active/inactive/pending/failed status indicators **must** use `StatusBadge`. Do not use raw `Badge` with `bg="success"` / `bg="danger"` for status display. `Badge` remains valid for non-status labels (roles, tags, categories, versions).

### Impact

- Status colors are now consistent across all modules via CSS tokens.
- Changing a status color in `variables.css` propagates everywhere instantly.
- No module-level color logic needed — just pass the status string.

---

## 2026-04-29 Auto-Route Generation And Module Scaffolding

Route files in `src/app/` are now auto-generated from module `index.js` definitions. A new scaffolding script lets devs create modules with one command.

### Changes

1. **Added `scripts/generate-routes.js`** — scans all module `index.js` files, reads their `routes` arrays, and generates thin `page.js` wrappers in `src/app/`.
2. **Added `scripts/create-module.js`** — scaffolds a new module with the correct folder structure (`index.js` + `data/` + `pages/`). Supports group prefixes via slash syntax (e.g. `admin/inventory-tracker`). Auto-runs `generate-routes.js` after scaffolding.
3. **Added npm scripts** — `gen:routes`, `predev`, `prebuild`, `create-module` hooks ensure routes are always up-to-date.
4. **Removed `src/app/[...modulePath]/page.js`** — the catch-all dynamic route is no longer needed.
5. **All 11 route files** are now auto-generated with `// @generated` markers.

### Impact

- Developers never touch `src/app/` — they only define routes in their module's `index.js`.
- Running `npm run dev` or `npm run build` automatically regenerates routes.
- Running `npm run create-module -- my-module` scaffolds a complete module with inline docs.
- Stale routes are automatically cleaned up when modules are removed.

### Documentation Updated

- All docs updated to reference `npm run create-module` as the standard way to start a new module.
- CRUD example rewritten from legacy 7-file structure to current 5-file pattern (actions, data, Page, View).
- Developer quickstart and full guide updated to lead with the scaffolding command.

---

## 2026-04-28 Server Action Migration And Module Consolidation

This release eliminates all API routes, migrates all modules to the Page + View pattern (formerly called Blazor Mirror), and unifies routing through the catch-all.

### 1) All API Routes Removed — Server Actions Only

Removed:
1. `src/app/api/me/bootstrap/route.js`
2. `src/app/api/databind/query/route.js`
3. `src/app/api/databind/options/route.js`
4. `src/app/api/databind/export/route.js`
5. `src/app/api/databind/schema/route.js`
6. `src/app/api/examples/data-table/route.js`, `data.js`, `options/route.js`, `export/route.js`
7. All `src/app/api/admin/*` route stubs

Added:
1. `src/core/auth/bootstrap.actions.js` — Server Action replacing `/api/me/bootstrap`. Exports `bootstrapAuthState()` and `hasServerSession()`.
2. `src/shared/utils/databind.actions.js` — Server Actions replacing all `/api/databind/*` routes. Exports `databindQuery()`, `databindOptions()`, `databindExport()`, `databindSchema()`.
3. `src/modules/psbpages/examples/data/dataTableExample.actions.js` — Server Actions replacing `/api/examples/data-table/*` routes.

Updated:
1. `src/core/auth/AuthProvider.js` — now calls `bootstrapAuthState()` instead of fetching `/api/me/bootstrap`.
2. `src/shared/components/ui/table/TableX.js` — now calls `databindQuery()`, `databindOptions()`, `databindExport()` instead of fetch calls.
3. `src/modules/psbpages/examples/pages/data-table/useDataTableModuleController.js` — now calls Server Actions instead of fetch.
4. `src/modules/psbpages/login/data/login.data.js` — now calls `hasServerSession()` instead of fetching `/api/me/bootstrap`.

Behavior changes:
1. `src/app/api/` directory no longer exists. All server logic uses `"use server"` files.
2. AbortController replaced with `let active = true` flag pattern (Server Actions don't support AbortController signals).
3. File export: Server Actions return `{content, fileName, mimeType}`, client creates Blob and triggers download.

### 2) All Modules Migrated to Page + View Pattern

All 9 modules now follow the standard structure: `index.js` + `data/` + `pages/`.

Admin modules (5): application-setup, card-module-setup, company-department-setup, status-setup, user-master-setup.

PSBPages modules (4): dashboard, login, profile, examples.

Legacy folders removed from all modules: `components/`, `hooks/`, `services/`, `repo/`, `model/`, `utils/`, `view/`.

### 3) PSBPages Route Consolidation

Removed:
1. `src/app/psbpages/` — all hardcoded route files (dashboard, login, profile, examples, examples/data-table).

Added:
1. `src/modules/psbpages/dashboard/index.js` — module definition with `public: true`.
2. `src/modules/psbpages/login/index.js` — module definition with `public: true`.
3. `src/modules/psbpages/profile/index.js` — module definition with `public: true`.
4. `src/modules/psbpages/examples/index.js` — module definition with `public: true`.

Updated:
1. `src/app/[...modulePath]/page.js` — now supports `public: true` modules that skip `ModuleAccessGate`.

Behavior changes:
1. All pages (admin and psbpages) are routed through the single catch-all `[...modulePath]/page.js`.
2. Modules with `public: true` render without RBAC checks — used for system pages like login, dashboard, profile.
3. `src/app/` now contains only: `layout.js`, `page.js`, `providers.js`, `globals.css`, and the catch-all folder.

### 4) Module Definition: `public` Field

New optional field `public: true` in module `index.js`:
- Skips `ModuleAccessGate` — page renders without app-level RBAC check.
- Module still needs `module_key` for `app_id` resolution but access is not gated.
- Used for core system pages that must be accessible without role assignments.

### 5) Documentation Updated

All docs updated to reflect:
1. No API routes — Server Actions are the only backend pattern.
2. `public: true` module field documented in module system and field reference.
3. Routes updated from `/examples` to `/psbpages/examples`.
4. CRUD example rewritten to current 5-file pattern (actions, data, Page, View).
5. Auth flow docs updated: `bootstrapAuthState()` replaces `/api/me/bootstrap`.

## 2026-04-17 Shared UI Examples And Playground Update

This release updates the shared UI examples route and documentation flow to improve developer onboarding and sandbox testing.

### 1) Examples Route Restructure

Updated:
1. `src/app/examples/page.js`
2. `src/app/examples/page.module.css`

Behavior changes:
1. `/examples` now uses a three-layer structure:
   - Quick Start
   - Playground
   - Reference
2. Reference content is split by component with clearer pattern guidance.
3. State-driven controls now include pattern toggles:
   - Input (Basic, Validation)
   - SearchBar (Basic, With API)
   - Modal (Basic, Save Flow)

### 2) Playground Expansion (Bonus Section)

Added:
1. Bonus Playground section in `/examples` with accordion-based scenarios:
   - Workflow actions with modal confirmation pattern
   - Real-world table scenario (employee review)
   - Add User form with shared components only

Behavior changes:
1. Workflow confirmation example now demonstrates shared `Modal` flow instead of browser prompt patterns.
2. Real-world table scenario uses supported row action types and confirm flow.
3. Add User form includes explicit hardcoded demo options for dropdown-based fields.

### 3) Dropdown Layering And Visibility Fixes

Updated:
1. `src/shared/components/ui/controls/Dropdown.js`
2. `src/app/examples/page.module.css`
3. `src/app/examples/page.js`

Behavior changes:
1. Shared dropdown menu layering is raised (`z-index`) for overlay safety.
2. Accordion clipping issue resolved (overflow clipping removed from accordion item container).
3. Add User demo dropdowns open upward to keep options visible near bottom-of-page accordions.

### 4) Table Pagination UI Cleanup

Updated:
1. `src/shared/components/ui/table/Table.js`
2. `src/app/globals.css`

Behavior changes:
1. Rows-per-page selector now uses default iconless style (`psb-ui-table-page-size-select`).

### 5) Docs Alignment

Updated:
1. `docs/README.md`
2. `docs/Devs/JR_DEV_DEVELOPMENT_GUIDE.md`

Behavior changes:
1. Docs now reference `/examples` as the primary shared UI reference/playground route.
2. Developer guidance now reflects updated examples usage and supported table row-action type constraints.

## 2026-04-16 Core Refactor And Stability Update

This release consolidates authentication, routing, dashboard access resolution, and profile rendering into a core-first architecture.

### 1) Core Auth And Session

Added:
1. `src/core/auth/AuthProvider.js`
2. `src/core/auth/useAuth.js`
3. `src/core/auth/access.js`

Behavior changes:
1. Auth context now resolves `authUser`, `dbUser`, and active `roles` from one place.
2. `sb-access-token` cookie is synchronized from Supabase session events.
3. Auth hydration supports background refresh for `TOKEN_REFRESHED` and `USER_UPDATED`.
4. Initialization includes bootstrap fallback when `supabase.auth.getUser()` is stale or unavailable.

### 2) Bootstrap Endpoint For Server-Resolved Identity

Added:
1. `src/app/api/me/bootstrap/route.js`

Behavior:
1. Reads `sb-access-token` from request cookies.
2. Resolves Supabase auth user from access token.
3. Resolves business user from `psb_s_user` using `auth_user_id` with email fallback.
4. Auto-syncs `auth_user_id` when missing/mismatched.
5. Loads active role mappings from `psb_m_userapproleaccess` and enriches role/app display names.
6. Enriches company, department, and status labels for profile/dashboard.
7. Returns no-store payload: `{ authUser, dbUser, roles }`.

### 3) Login Flow Stabilization

Updated:
1. `src/app/login/page.js`

Behavior changes:
1. Login uses `supabase.auth.signInWithPassword`.
2. Access token cookie is set client-side after successful sign-in.
3. Login waits briefly for `/api/me/bootstrap` to confirm server session visibility.
4. Redirect now uses `window.location.assign("/dashboard")` for full navigation handoff.

### 4) Route Guard And Shell Behavior

Updated:
1. `src/middleware.js`
2. `src/shared/components/layout/AppLayout.js`

Behavior changes:
1. Middleware now validates the trimmed cookie value (not just cookie object presence).
2. API routes remain excluded from middleware matcher.
3. App shell auth logic now depends on `useAuth()`.
4. Login page bypass rendering is explicit.
5. Logout uses `supabase.auth.signOut()` and clears `sb-access-token`.

### 5) Dashboard Data Resolution

Added/Updated:
1. `src/app/dashboard/page.js`
2. `src/core/auth/DashboardModules.js`

Behavior changes:
1. Dashboard attempts setup-driven cards first:
   - `psb_m_userapproleaccess`
   - `psb_m_appcardgroup`
   - `psb_s_appcard`
   - `psb_m_appcardroleaccess`
2. Cards are filtered by active app-role scope and card-role mappings.
3. Ordering is deterministic across app/group/card order values.
4. Fallback order when setup cards are unavailable:
   - dynamic module cards from `loadModules()`
   - assigned app tiles from `psb_s_application`
5. Banner organization block is currently fixed/static in `DashboardModules` and not DB-driven.

### 6) Module Routing And Access Gate

Added/Updated:
1. `src/app/[...modulePath]/page.js`
2. `src/core/auth/ModuleAccessGate.js`
3. `src/modules/loadModules.js`

Behavior changes:
1. Catch-all route now awaits `params` for Next.js 16 compatibility.
2. Route matching still uses longest-path-first sort by module route path length.
3. Matched module routes are wrapped by `ModuleAccessGate` for app-level RBAC.
4. Unknown routes return `notFound()`.

### 7) Profile Page Migration

Updated:
1. `src/app/profile/page.js`

Behavior changes:
1. Profile uses `useAuth()` state instead of legacy module session hooks.
2. Role display is grouped by application from resolved role mappings.
3. Password update uses `supabase.auth.updateUser({ password })`.
4. Request-update mailto uses resolved company admin email when available.

### 8) Supabase Client Consolidation

Added:
1. `src/core/supabase/client.js`
2. `src/core/supabase/admin.js`

Behavior:
1. Browser singleton client for user-session operations.
2. Server-only admin singleton for privileged API operations.

### 9) Shared UI Wrappers Added

Added:
1. `src/shared/components/ui/Button.js`
2. `src/shared/components/ui/Card.js`
3. `src/shared/components/ui/Input.js`
4. `src/shared/components/ui/Modal.js`
5. `src/shared/components/ui/table/Table.js`
6. `src/shared/components/ui/Badge.js`
7. `src/shared/components/ui/index.js`
8. `src/shared/components/layout/PageContainer.js`

Purpose:
1. Provide consistent wrapper components over React-Bootstrap primitives.
2. Centralize reusable styling hooks and class contracts.

### 10) Legacy User-Master Stack Removal

Removed:
1. Legacy module-layer login/session/admin service stack under `src/modules/user-master/**`.
2. Query providers and user-master realtime bridge previously tied to old session model.

Result:
1. Core auth context is now the single runtime source for identity and access.

### 11) Known Non-Blocking Warnings

Current build/runtime warnings still present:
1. Next middleware convention deprecation warning (`middleware` to `proxy`).
2. Dynamic import expression warning in `src/modules/loadModules.js` import trace.

These warnings do not block build output in the current state.
