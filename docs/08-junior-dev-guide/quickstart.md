# Your First Module — Quick Start

> **New here?** Start with the [Getting Started Guide](../01-getting-started/getting-started-v2.md) first — it covers GitHub setup, dependencies, environment config, and running the app. This page focuses only on building your first module.

This is a beginner-friendly walkthrough for creating your first module.

Use this page with the [Module Creation Checklist](./module-creation-checklist.md) so you do not miss database and RBAC setup.

---

## Step 1: Create Your Module

Open a terminal and run:

```bash
npm run create-module -- metal-buildings
```

This creates your module folder with all the files you need:

```
src/modules/metal-buildings/
  index.js                        ← The ID card for your module
  data/
    metalBuildings.actions.js     ← Server Actions (database access)
    metalBuildings.data.js        ← Shared helpers (used by the view)
  pages/
    MetalBuildingsPage.js         ← Server entry (loads data)
    MetalBuildingsView.jsx        ← The interactive UI (runs in the browser)
```

It also auto-generates the route file so Next.js knows about your page.

After scaffolding, run setup again so VS Code unlocks your new module folder:

```powershell
.\scripts\setup.ps1
```

If your module belongs under a group, use a slash:

```bash
npm run create-module -- admin/metal-buildings
```

---

## Step 2: Update `index.js`

Open `index.js` — the scaffolding already filled in most fields. Update these:

```javascript
const metalBuildingsModule = {
  key: "metal-buildings",
  module_key: "metal-app",      // ← ask your senior for this value
  name: "Metal Buildings",
  description: "Metal Buildings application.",
  icon: "building",          // ← pick from https://fontawesome.com/search?o=r&m=free
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,
  routes: [
    { path: "/metal-buildings", page: "MetalBuildingsPage" },
  ],
};

export default metalBuildingsModule;
```

**What each field means:**

| Field | What It Does |
|-------|-------------|
| `key` | A unique ID for your module (lowercase, dashes, no spaces) |
| `module_key` | Which application this belongs to — must match a `module_key` in `psb_s_application` (ask your senior for the value) |
| `name` | The display name users see on the dashboard |
| `description` | A short sentence shown under the module card |
| `icon` | A Font Awesome icon name (e.g. `building`, `gear`) |
| `group_name` | Which group this card sits under on the dashboard |
| `group_desc` | Description for the group |
| `order` | Sort order (lower number = appears first) |
| `routes` | A list of URLs and which page file to load for each one |

The `routes` array is the most important part. Each entry says:
- `path` — the URL the user visits (e.g. `/metal-buildings`)
- `page` — the **filename** inside your `pages/` folder (without `.js`)

---

## Step 3: Edit `pages/MetalBuildingsPage.js` — The Page (Server Component)

This is the entry point. It runs on the **server**, loads data, and passes it to the view.
The scaffolding already created this file — open it and add your data loading:

```javascript
import MetalBuildingsView from "./MetalBuildingsView.jsx";
// import { loadMetalBuildingsData } from "../data/metalBuildings.actions";

export default async function MetalBuildingsPage() {
  // const { items } = await loadMetalBuildingsData();
  return <MetalBuildingsView />;
}
```

**Rules for page files:**

1. **DO NOT** put `"use client"` at the top. Pages must be server components.
2. Keep this file simple — load data, pass to view.
3. The filename must match the `page` value in your route (`"DashboardPage"` → `DashboardPage.js`).

---

## Step 4: Edit `pages/MetalBuildingsView.jsx` — The UI (Client Component)

This is where your actual visible UI code goes. It runs in the **browser**.
The scaffolding already created a placeholder — open it and start building:

```javascript
"use client";

export default function MetalBuildingsView() {
  return (
    <div className="container mt-4">
      <h1>Hello World!</h1>
    </div>
  );
}
```

**Rules for view/component files:**

1. **DO** put `"use client"` at the very top. This is required for anything interactive (buttons, forms, state, etc.).
2. Put all your UI, hooks (`useState`, `useEffect`), and event handlers here.

---

## Why Two Files? (Server vs Client)

Next.js needs to know what runs on the server vs the browser.

- **Server components** (page entry files) — can talk to the database, load data, do secure stuff. They run once on the server and send HTML to the browser.
- **Client components** (view files) — can handle clicks, forms, animations, and anything interactive. They run in the user's browser.

The pattern is always:

```
Page (server) → loads data → passes to → View (client)
```

This is not something we invented — it's how Next.js works.

---

## How the System Finds Your Module

When you run `npm run create-module`, it auto-runs a script (`scripts/generate-routes.js`) that creates the matching route file inside `src/app/`. The same script also runs on `npm run dev` and `npm run build`.

When a user visits `/metal-buildings`, Next.js finds the auto-generated route file and loads your page component directly.

**You do not need to edit any file outside your module folder.** No registration step, no config file, nothing.

---

## Adding More Pages

Want a second page at `/metal-buildings/settings`? Run one command:

```bash
npm run new-page -- modules/metal-buildings/index.js settings
```

This automatically:
1. Creates `pages/SettingsPage.js` (server component)
2. Creates `pages/SettingsView.jsx` (client component)
3. Adds the route to your module's `index.js`
4. Generates the `src/app/` route wrapper

After running, your `index.js` routes will look like:

```javascript
routes: [
  { path: "/metal-buildings", page: "MetalBuildingsPage" },
  { path: "/metal-buildings/settings", page: "SettingsPage" },  // ← added by script
],
```

And you'll have two new files ready to edit:

```javascript
// pages/SettingsPage.js — server entry (loads data, passes to view)
// pages/SettingsView.jsx — client UI (your code goes here)
```

That's it. No other files to touch.

---

## Quick Checklist

Need the full setup and verification list? Use [Module Creation Checklist](./module-creation-checklist.md).

- [ ] Created module with `npm run create-module -- my-module`
- [ ] Updated `index.js` with correct `module_key` (ask your senior)
- [ ] `key` is lowercase with dashes (no spaces)
- [ ] `module_key` matches a value in `psb_s_application` (ask your senior)
- [ ] `routes` array has at least one entry
- [ ] Each route `page` value matches a file in `pages/`
- [ ] Page entry files have **no** `"use client"` directive
- [ ] View/component files **do** have `"use client"` at the top
- [ ] Module shows up on the dashboard after login

---

## Common Mistakes

| Mistake | What Happens |
|---------|-------------|
| Putting `"use client"` on a page entry file | Page won't load — server data loading breaks |
| `page` in route doesn't match filename | Core can't find the file — blank page |
| Editing files outside your module folder | You might break another module or the platform |
| Forgetting `module_key` | Core can't resolve `app_id` — module throws an error |
| Creating API route files | Unnecessary — use Server Actions in `data/*.actions.js` instead |
