# Development Rules

These rules apply to every module in PSBUniverse.

This document is written for day-to-day development work. If you are new, start with [Getting Started (v2)](../01-getting-started/getting-started-v2.md), then come back here.

---

## Core Idea

Use core systems. Do not replace core systems.

- Core owns authentication, app-level access checks, routing, and shared layout.
- Modules own feature UI, feature workflows, and card-level visibility.

> In simple terms: Core is the building. Your module is one office inside the building.

---

## Terms You Should Know

- RBAC: Role-Based Access Control. This controls who can see what.
- App access: Can the user open this module at all?
- Card access: Inside a module, can the user see this feature/action card?

---

## Non-Negotiable Rules

1. Do not build your own auth flow in modules.
2. Do not hardcode role names like `if (roleName === "Admin")`.
3. Do not create API routes for module CRUD (`src/app/api/...`). Use Server Actions.
4. Do not edit core infrastructure files unless a lead asks for it.
5. Do not edit generated route wrappers in `src/app/`.

If your task requires breaking any rule above, stop and ask your senior.

---

## UI Rules

### Do

- Use shared UI from `@/shared/components/ui`.
- Show loading, empty, error, and no-access states.
- Keep layout and spacing consistent with existing modules.

### Do Not

- Build local versions of Button, Modal, Table, or other shared components.
- Add random inline styling that fights shared styles.
- Redesign global app shell/navigation from module code.

---

## Module Rules

### Required module structure

```
src/modules/<module-name>/
  index.js
  data/
  pages/
```

### Module is responsible for

- Defining routes in `index.js`
- Loading and shaping data
- Managing view state and filters
- Applying card-level visibility checks

### Module must not do

- Replace auth behavior
- Replace app-level RBAC behavior
- Move business logic into shared components

---

## RBAC Rules

Use core helpers for access checks:

- `hasAppAccess()` for module access
- `hasCardAccess()` for feature/card access inside the module

Do access checks before rendering sensitive UI.

Correct:

```js
if (!canViewTable) return null;
```

Wrong:

```js
// inside shared table component
if (row.role !== "Admin") hideColumn("salary");
```

---

## Table Rules

`TableZ` is display-focused and controlled by parent state.

- Your module owns data, filters, sort state, and pagination state.
- `TableZ` receives state via props and emits callbacks.
- If you want data-binding helpers, use `TableX`.

Not allowed:

1. Fetching data inside table components
2. Storing business logic in table components
3. Mixing access-control decisions inside shared table internals

---

## Environment Safety Rules

Environment names and deployment targets can change by team/project.

Always follow the values provided by your senior for:

1. `.env.local` values
2. Deployment environment mapping
3. Database target per stage (local/dev/prod)

Hard safety rules:

1. Never use production keys in local development.
2. Never expose service-role keys in client/browser code.
3. Keep secrets in environment variables only.

---

## Recommended Developer Flow

1. Follow [Getting Started (v2)](../01-getting-started/getting-started-v2.md).
2. Run `npm run create-module -- <module-name>`.
3. Re-run `./scripts/setup.ps1` so your module folder is editable in VS Code.
4. Update `index.js` with the correct `module_key` from your senior.
5. Register database setup records (app, group, card, card-role mapping).
6. Build server Page + client View.
7. Add card-level access checks.
8. Run `npm run build` and `npm run lint`.

---

## Escalate Immediately If You Need To Change

1. Auth flow
2. RBAC model
3. Core route guarding behavior
4. Shared UI contracts used by many modules

Ask your tech lead before making those changes.
