# Auto-Route Generation

> **Status:** Implemented (April 2026)

## Overview

Route files in `src/app/` are auto-generated from module `index.js` definitions. Developers never touch `src/app/` — they only define routes in their module's `index.js` and the system generates everything else.

---

## How It Works

`scripts/generate-routes.js` is a Node.js script that:

1. Recursively scans `src/modules/` for `index.js` files.
2. Dynamically imports each module definition and reads its `routes` array.
3. For each route, generates a thin `page.js` wrapper in the corresponding `src/app/` directory.
4. Marks every generated file with `// @generated — do not edit. Run \`npm run gen:routes\` to regenerate.`
5. Only overwrites files that have the `@generated` marker (manual files are never touched).
6. Removes stale generated files when routes are deleted or renamed.

### Generated File Example

For a module with:

```js
routes: [{ path: "/admin/status-setup", page: "StatusSetupPage" }]
```

The script produces `src/app/admin/status-setup/page.js`:

```js
// @generated — do not edit. Run `npm run gen:routes` to regenerate.
import StatusSetupPage from "@/modules/admin/status-setup/pages/StatusSetupPage";

export default function Page(props) {
  return <StatusSetupPage {...props} />;
}
```

---

## npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run create-module -- <name>` | Scaffolds a new module, then auto-runs `gen:routes` |
| `npm run gen:routes` | Manually regenerate all route files |
| `npm run dev` | Auto-runs `gen:routes` via `predev` hook, then starts dev server |
| `npm run build` | Auto-runs `gen:routes` via `prebuild` hook, then builds |
For the full scripts reference, see [Getting Started — Part 4](../01-getting-started/getting-started-v2.md#part-4-scripts-reference).
---

## Why This Approach?

### Previous: Catch-All Route

The original system used a single `src/app/[...modulePath]/page.js` that dynamically imported modules at runtime via `loadModules()`. This had two problems:

1. **Dev mode failure** — `import(/* webpackIgnore: true */ url)` does a native Node.js import that can't parse JSX. Works at Turbopack build time but fails at webpack/Turbopack dev runtime.
2. **Dev friction** — when thin route files were added as a workaround, devs had to manually create files in `src/app/`, violating the "only touch your module folder" rule.

### Current: Auto-Generated Routes

The generator solves both problems:
- Route files use standard imports that work in all modes (dev, build, production).
- Devs only define routes in `index.js` — the script handles `src/app/`.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `@generated` marker | Protects manual files from being overwritten |
| `writeIfChanged()` | Avoids unnecessary file writes (preserves HMR stability) |
| `cleanStaleRoutes()` | Automatically removes routes for deleted modules |
| Pre-hooks (`predev`, `prebuild`) | Routes are always up-to-date before the server starts |
| Idempotent | Running the script twice produces identical output |

---

## Rules

1. **Never manually create or edit** `page.js` files in `src/app/admin/` or `src/app/psbpages/`.
2. Files with the `@generated` marker are owned by the script.
3. If a generated file looks wrong, fix the module's `index.js` and re-run `npm run gen:routes`.
4. The script runs as part of `npm run dev` and `npm run build` — no extra steps needed.
