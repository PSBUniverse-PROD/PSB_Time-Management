# Full Guide

This is a rulebook, not a tutorial. If you need to learn how to build your first module, start with the [Getting Started Guide](../01-getting-started/getting-started-v2.md) or the [Quick Start](quickstart.md). Come back here for the rules you must follow.

Breaking these rules can break RBAC, module consistency, and platform stability.

> **In simple terms:** RBAC (Role-Based Access Control) is the system that controls who can see what. If you break it, users might see pages or data they shouldn't — or lose access to things they need.

---

## Your Role

You build **module features**. You do not redesign architecture.

**Simple rule:** Use core. Do not replace core.

### What You Are Allowed To Do

1. Build module UI pages and views inside `src/modules/`.
2. Define module routes in your module's `index.js`.
3. Write Server Actions in `data/*.actions.js` for database access.
4. Read cards and card groups from the database.
5. Use `hasCardAccess()` for card-level filtering.
6. Use `useAuth()` to read `authUser`, `dbUser`, `roles`, and `loading`.
7. Add data helpers inside your module's `data/` folder.

### What You Must NOT Do

1. **Auth:** Do not create your own auth system. Do not use `password_hash` for login. Do not call `supabase.auth.getUser()` directly — use `useAuth()`.
   - *Why dangerous:* Session mismatch, duplicated auth behavior, security risk.

   > **For example:** If you call `supabase.auth.getUser()` in your component and another component calls `useAuth()`, they might return different user data if one refreshes and the other doesn't. Always use `useAuth()` so everyone reads from the same source.

2. **Roles:** Do not create or assign roles in module code. Do not hardcode role names.
   - *Why dangerous:* Permissions stop matching the database. Access becomes impossible to audit.

3. **Access control:** Do not bypass app-level RBAC. Do not skip card access checks.
   - *Why dangerous:* Unauthorized users can open routes and see data they shouldn't.

4. **Session:** Do not rename or replace the `sb-access-token` cookie. Do not bypass the bootstrap check.
   - *Why dangerous:* Users get redirected back to login after successful sign-in. Server/client auth state can diverge.

   > **In simple terms:** The "bootstrap check" is the system's startup routine that loads the current user's identity and roles when the page first opens. If you skip it, the app doesn't know who's logged in.

5. **Core files:** Do not edit files in `src/core/` or `src/shared/` without lead approval.

6. **API routes:** Do not create files in `src/app/api/`. Use Server Actions instead.
   - *Why dangerous:* Bypasses the standard data flow pattern. Makes modules harder to maintain.

**If your task requires any of these, stop and escalate to your tech lead.**

> **In simple terms:** "Escalate" just means ask your senior dev or tech lead before doing it. It's not a bad thing — it's how you avoid breaking something that affects everyone.

---

## Module Contract

Your `index.js` must export:

```js
export default {
  key: "my-module",         // Unique ID (lowercase, dashes)
  module_key: "my-app",     // Matches module_key in psb_s_application
  name: "My Module",        // Dashboard display name
  routes: [
    { path: "/my-module", page: "DashboardPage" },
  ],
};
```

- `page` is a string matching a filename in your `pages/` folder (without `.js`).
- Core auto-discovers your module — no core file edits needed.
- `app_id` is resolved automatically from `module_key`. You never set it yourself.

> **For example:** If your senior tells you the `module_key` is `"metal-app"`, just put that in your `index.js`. The system will automatically look up the matching `app_id` from the database. You never need to know what number `app_id` is.

For the full module structure and contract details, see [Module System](../02-architecture/module-system.md).

---

## Using RBAC in Your Module

```js
import { useAuth } from "@/core/auth/useAuth";
import { hasCardAccess } from "@/core/auth/access";

function MyFeature({ cards, cardRoleAccess }) {
  const { roles, loading } = useAuth();

  if (loading) return <p>Loading...</p>;

  const visibleCards = cards.filter((card) =>
    hasCardAccess(card.card_id, roles, cardRoleAccess)
  );

  return visibleCards.map((card) => (
    <div key={card.card_id}>{card.card_name}</div>
  ));
}
```

**Rules:**
- Do not parse roles manually.
- Do not hardcode `if (roleName === "Admin")` checks.
- Always use `role_id` and `card_id` mappings from the database.

---

## Working with the Database

Use the database as the single source of truth.

**Rules:**
1. Do not hardcode cards, groups, or permissions in code.
2. Query by `app_id` for module data.
3. Filter by `is_active` where needed.

**Module-level tables you'll work with:**
- `psb_m_appcardgroup` — card groups
- `psb_s_appcard` — feature cards
- `psb_m_appcardroleaccess` — card-role mappings

**Data flow in your module:**
1. Load cards and groups.
2. Load card-role mappings.
3. Filter cards using `hasCardAccess()`.

For CRUD patterns and examples, see [CRUD Guide](../05-database/crud-guide.md) and [CRUD Example](../05-database/crud-example.md).

---

## Routing Rules

1. Define routes in your module's `index.js` with `path` and `page` fields.
2. `path` must start with `/`.
3. `path` should match the `route_path` column in your database card records.
4. Route files in `src/app/` are **auto-generated** by `scripts/generate-routes.js` — do not create or edit them manually.
5. The generator runs automatically on `npm run dev` and `npm run build`.

For full routing details, see [Module System](../02-architecture/module-system.md).

---

## UI and Styling Rules

1. Use the shared components from `@/shared/components/ui`. Do not create your own Button, Modal, or TableZ.
2. Use the core shell layout — do not redesign navigation.
3. Show clear loading, empty, error, and no-access states.
4. Keep spacing and typography consistent.

For the full component list and specs, see [Shared UI System](../04-ui-system/shared-components.md).

---

## Using the Shared Table

Import from:

```js
import { TableZ } from "@/shared/components/ui";
```

**Hard rules:**
1. Do not install table libraries inside your module.
2. Do not build custom tables when the shared table supports the feature.
3. Keep all data and filter state in your module — pass into TableZ via props.
4. TableZ is controlled mode only.

**Row action types are limited to:** `primary`, `secondary`, `danger`. Do not use `success` or `warning`.

**Reference implementation:** Open `/psbpages/examples/data-table` in dev and study `src/modules/psbpages/examples/pages/data-table/DataTablePage.js`.

For the full table API and rules, see [Development Rules](../03-development-rules/rules.md).

### Full Data Table API Example

This is a complete, copy-ready example of how to wire up the shared table:

```js
const [columns, setColumns] = useState([
  { key: "name", label: "Name", sortable: true, resizable: true, width: 220, visible: true },
  { key: "status", label: "Status", visible: true, render: (row) => <Badge>{row.status}</Badge> },
  { key: "internal_notes", label: "Notes", visible: false },
]);

const [sort, setSort] = useState({ key: "name", direction: "asc" });
const [applicationOptions, setApplicationOptions] = useState([]);

useEffect(() => {
  let active = true;
  async function loadApplicationOptions() {
    const apps = await fetchApplications();
    if (!active) return;
    setApplicationOptions(apps.map((item) => ({ label: item.name, value: item.id })));
  }
  loadApplicationOptions();
  return () => { active = false; };
}, []);

const filtersConfig = [
  { key: "status", label: "Status", type: "select",
    options: [{ label: "Active", value: true }, { label: "Inactive", value: false }] },
  { key: "app_id", label: "Application", type: "select",
    dataSource: fetchApplications, options: applicationOptions },
  { key: "created_at", label: "Created Date", type: "date-range" },
];

const actions = [
  { label: "Edit", onClick: (row) => handleEdit(row) },
  { label: "Delete", onClick: (row) => handleDelete(row), variant: "danger" },
];

const handleColumnVisibilityChange = (nextColumns) => setColumns(nextColumns);
const handleColumnResizeChange = (nextColumns) => setColumns(nextColumns);

<TableZ
  columns={columns}
  data={rows}
  loading={loading}
  total={total}
  page={page}
  pageSize={pageSize}
  filters={filtersConfig}
  appliedFilters={appliedFilters}
  sort={sort}
  onFilterChange={handleFilterChange}
  onSortChange={setSort}
  onPageChange={handlePageChange}
  onSearchChange={handleSearch}
  onColumnVisibilityChange={handleColumnVisibilityChange}
  onColumnResizeChange={handleColumnResizeChange}
  actions={actions}
  onExport={handleExport}
/>
```

### Shared UI Reference & Playground

Use the built-in examples as your primary reference:

1. Open `/psbpages/examples` in dev for the full shared UI guide, playground, and reference experience.
2. Use **Quick Start** for the baseline setup sequence.
3. Use **Playground** for interaction testing.
4. Use **Reference** for props and pattern contracts.

**Bonus playground usage:**
1. Use the Bonus Playground table scenario as the default pattern for real-world review/approval flows.
2. Use the Bonus Add User form as the baseline for shared Input + Dropdown + validation composition.
3. Use the modal confirmation pattern for critical workflow actions instead of browser `prompt` UX.

---

## Building a Module (Step by Step)

1. Run `npm run create-module -- my-module` to scaffold the module (see [Getting Started](../01-getting-started/getting-started-v2.md#part-3-the-module-system)).
2. Register the app in `psb_s_application` (if it doesn't exist).
3. Create groups in `psb_m_appcardgroup`.
4. Create cards in `psb_s_appcard`.
5. Assign role access in `psb_m_appcardroleaccess`.
6. Write your `data/*.actions.js` (Server Actions for DB access).
7. Write your `pages/*Page.js` (server entry) and `pages/*View.jsx` (client UI).
8. Apply card access checks with `hasCardAccess()`.
9. Test with authorized and unauthorized users.

**Do NOT create API route files** (`src/app/api/...`). Use Server Actions instead.

---

## File Layout Cheat Sheet

```
src/modules/my-module/
  index.js                    ← Module identity + routes
  data/
    myModule.actions.js       ← "use server" — all DB calls go here
    myModule.data.js          ← Client-safe helpers (optional)
  pages/
    DashboardPage.js          ← Server entry: loads data, renders view
    DashboardView.jsx         ← "use client" — all UI, hooks, sub-components
```

---

## Common Mistakes

| Mistake | Why It's a Problem |
|---------|--------------------|
| Hardcoding roles in components | Permissions stop matching the database |
| Skipping card access checks | Unauthorized users see features they shouldn't |
| Fetching auth user in every component | Duplicated calls, session mismatches |
| Missing `key` or `module_key` in index.js | Module won't load — core throws an error |
| Wrong `module_key` | Module maps to wrong application, RBAC breaks |
| No loading or no-access states | Broken UX, no feedback to the user |
| Creating API routes for CRUD | Unnecessary — use Server Actions in `data/*.actions.js` |
| Importing `getSupabaseAdmin` in view files | Build error — server-only code can't run in browser |

---

## PR Checklist

All items must pass before submitting:

- [ ] Module structure follows the required pattern (`index.js` + `data/` + `pages/`)
- [ ] `index.js` exports `key`, `module_key`, `name`, `routes`
- [ ] `module_key` has a matching active row in `psb_s_application`
- [ ] Card groups exist in `psb_m_appcardgroup`
- [ ] Cards exist in `psb_s_appcard` with correct `app_id` (resolved from `module_key`) and `route_path`
- [ ] Card-role mappings exist in `psb_m_appcardroleaccess`
- [ ] All DB access is in `data/*.actions.js` files with `"use server"` directive
- [ ] No API routes created (`src/app/api/...`)
- [ ] Module uses `useAuth()` from core
- [ ] Module uses `hasCardAccess()` for card visibility
- [ ] No hardcoded role names or permission flags
- [ ] No custom auth logic
- [ ] Authorized user flow works
- [ ] Unauthorized cards are hidden/disabled
- [ ] Unauthorized route is blocked by core gate
- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)

---

## Escalation Rule

If your task requires changing:

1. Auth flow
2. RBAC model
3. Role governance
4. Core route guard logic

**Stop and escalate to your tech lead.** Do not make architecture changes inside module tasks.
