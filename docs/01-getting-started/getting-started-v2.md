# Getting Started (v2) — Developer Guide

Everything you need to go from zero to running your first module inside PSBUniverse Core. Follow every step in order. Run each command one at a time. Do not skip steps.

This guide is for developers working in an existing app repository (for example, a junior developer onboarding to a project).

If you are the senior developer creating a brand-new app repository from core, use [Creating a New Project](./creating-a-new-project.md) first, then return here.

---

## Part 1: GitHub Setup

### 1.1 — Clone your app repo

Your senior dev will give you a repo name (e.g. `PSB_MetalBuildingsApp`). Clone that app repo (not core):

```bash
git clone https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git
cd PSB_MetalBuildingsApp
```

> Replace `PSB_MetalBuildingsApp` with whatever repo name you were given.

### 1.2 — Open it in VS Code

```bash
code .
```

Use the VS Code terminal for everything from here on.

### 1.3 — Confirm you're on main

```bash
git branch
```

You should see `* main`. If not, run `git checkout main`.

### 1.4 — Run the setup script

This one command sets up your entire project — you don't have to do anything manually:

```bash
.\scripts\setup.ps1
```

You'll see output like:

```
=== PSBUniverse Setup ===
[1/4] Adding core remote...
  Core remote added (push disabled).
[2/4] Installing packages...
[3/4] Creating .env.local template...
  IMPORTANT: Open .env.local and paste your real Supabase keys.
[4/4] Everything is read-only. No module folders detected yet.
  Run setup.ps1 again after creating your module.

=== Setup complete! ===
REMINDER: Update .env.local with your real Supabase keys before running the app.
```

What it did:

| Step | What it does |
|------|-------------|
| 1 | Connected your repo to the shared platform code (and blocked you from accidentally pushing to it) |
| 2 | Installed all the packages the project needs |
| 3 | Created a `.env.local` file where you'll paste your database keys |
| 4 | Locked all files in VS Code so you can only edit your own module folder (more on this in Part 3) |

> **Node version:** You need Node.js **v18 or higher**. Check with `node -v`. If you're lower, download from [nodejs.org](https://nodejs.org).

### 1.5 — Fill in your database keys

The setup script created a file called `.env.local` with placeholder values. You need to replace them with real keys.

Open `.env.local` and paste the values your senior dev gives you:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

All three values come from the Supabase dashboard (your senior dev will give them to you).

> Leave `NEXT_PUBLIC_ENV=local` as-is. Don't change it unless your senior tells you to.

### 1.6 — First sync with core

This pulls the latest shared code from the platform into your repo.

Create the tracking branch once (first-time setup only):

```bash
git fetch core
git branch core-main core/main
```

Then run the sync script:

```powershell
.\scripts\sync-repo.ps1
```

> If you see "branch core-main already exists" during setup, that's fine. Keep going.

> Daily rule: run `.\scripts\sync-repo.ps1` before starting feature work.

### 1.7 — Verify your remotes

```bash
git remote -v
```

You should see:

```
core    https://github.com/PSBUniverse-DEV/PSBUniverse-core.git (fetch)
core    no_push_allowed (push)
origin  https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git (fetch)
origin  https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git (push)
```

- **origin** = your app repo (you push here)
- **core** = the shared platform (you only pull from here, never push)

### 1.8 — Set your git identity (once per computer)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## Part 2: Run the App

### 2.0 — Tech Stack (What You're Developing With)

This project uses the following stack:

| Layer | Stack |
|------|-------|
| Frontend framework | Next.js 16 (app-based routing) + React 19 |
| Language/runtime | JavaScript (ES Modules), Node.js 18+ |
| Styling/UI | Bootstrap 5, React-Bootstrap, shared internal UI components |
| Data/auth backend | Supabase (`@supabase/supabase-js`) |
| Client data + tables | TanStack Query, TanStack Table |
| Icons + drag/drop | Font Awesome, dnd-kit |
| Quality/tooling | ESLint (`eslint`, `eslint-config-next`) |

PSBUniverse also includes internal scripts for module scaffolding and route generation (`create-module`, `gen:routes`, `new-page`).

### 2.1 — Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. You should see the login page.

### 2.2 — What happens behind the scenes

When you run `npm run dev`, two things happen automatically before the server starts:

1. **Route generation** — a script scans all modules and creates the route files Next.js needs (under `src/app/`). You'll see `gen:routes` output in the terminal.
2. **Dev server** — Next.js starts with webpack and serves your app on port 3000.

You don't need to do anything for step 1 — it's automatic.

### 2.3 — First-time expectations

- The first page load is slow (webpack is compiling everything). This is normal.
- You might see a `PackFileCacheStrategy` warning in the terminal. Ignore it.
- After login you'll land on the **dashboard**.

### 2.4 — Verify the build works

Before you start writing code, make sure the project builds clean:

```bash
npm run build
```

If this fails on a fresh clone, **don't try to fix it** — tell your senior dev.

---

## Part 3: The Module System

This is how you create pages in PSBUniverse. Every page lives inside a **module**.

### 3.1 — Create your module

```bash
npm run create-module -- metal-buildings
```

After creating your module, **re-run the setup script** to unlock your new folder so you can actually edit it:

```bash
.\scripts\setup.ps1
```

You'll see it find your module and make it editable:

```
[4/4] Configuring VS Code read-only rules...
  Everything is read-only EXCEPT:
    - src/modules/metal-buildings/
    - .env files
```

Now you can type in files inside `src/modules/metal-buildings/`. Everything else in the project is locked — if you try to type in a locked file, nothing will happen. That's on purpose — those files belong to the platform and shouldn't be changed by you.

The `create-module` command creates a folder with five files:

```
src/modules/metal-buildings/
  index.js                        ← Defines your module (name, icon, routes)
  pages/
    MetalBuildingsPage.js         ← Server component (loads data from DB)
    MetalBuildingsView.jsx        ← Client component (all your UI goes here)
  data/
    metalBuildings.actions.js     ← Server Actions (database queries)
    metalBuildings.data.js        ← Client helpers (form builders, constants)
```

It also auto-generates a route file under `src/app/` so Next.js knows about your page.

> If your module belongs to a group, add a prefix: `npm run create-module -- admin/metal-buildings`
>
> For database, RBAC, and runtime verification after scaffolding, follow [Module Creation Checklist](../08-junior-dev-guide/module-creation-checklist.md).

### 3.2 — Open `index.js` and fill it in

The script pre-fills most values. You need to update these:

```javascript
const metalBuildingsModule = {
  key: "metal-buildings",           // ← don't change this
  module_key: "metal-app",          // ← ask your senior for the correct value
  name: "Metal Buildings",
  description: "Metal Buildings application.",
  icon: "building",                 // ← pick from fontawesome.com/search
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,                       // ← lower number = appears first
  routes: [
    { path: "/metal-buildings", page: "MetalBuildingsPage" },
  ],
};
```

**What each field means:**

| Field | What it does | Who gives you the value |
|-------|-------------|------------------------|
| `key` | Unique ID for your module | Auto-generated |
| `module_key` | Links to an application in the database | Ask your senior |
| `name` | Display name on the dashboard | You pick |
| `icon` | Font Awesome icon name | You pick |
| `group_name` | Which card group it sits in | Ask your senior |
| `order` | Sort position on the dashboard | You pick |
| `routes` | What URLs your module has | You define |

### 3.3 — The two-file pattern (Page + View)

Every page has two files:

| File | Runs on | What goes here |
|------|---------|---------------|
| `MetalBuildingsPage.js` | Server | Load data from the database, pass it to the View |
| `MetalBuildingsView.jsx` | Browser | All UI — buttons, forms, tables, useState, onClick |

Think of it like a kitchen: the **Page** goes to the fridge and grabs ingredients (data), the **View** cooks and plates the food (renders UI).

**Rules:**
- Page files must NOT have `"use client"` at the top.
- View files MUST have `"use client"` at the top.
- Don't mix them up — server code can't use `useState` or `onClick`.

### 3.4 — Adding more pages

Want `/metal-buildings/settings`? Run one command:

```bash
npm run new-page -- modules/metal-buildings/index.js settings
```

This creates `pages/SettingsPage.js` and `pages/SettingsView.jsx`, adds the route to your `index.js`, and generates the `src/app/` wrapper — all in one step.

The route generator also runs automatically on `npm run dev` and `npm run build`.

```javascript
// Output in index.js
routes: [
  { path: "/metal-buildings", page: "MetalBuildingsPage" },
  { path: "/metal-buildings/settings", page: "SettingsPage" },  // ← new
],
```

### 3.5 — Database queries (Server Actions)

All database code goes in `data/metalBuildings.actions.js`. This file has `"use server"` at the top, which means it runs on the server — the browser never sees these queries.

```javascript
"use server";
import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function loadMetalBuildingsData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("your_table_name")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
}
```

Then call it from your Page:

```javascript
// MetalBuildingsPage.js
import MetalBuildingsView from "./MetalBuildingsView";
import { loadMetalBuildingsData } from "../data/metalBuildings.actions";

export default async function MetalBuildingsPage() {
  const { items } = await loadMetalBuildingsData();
  return <MetalBuildingsView items={items} />;
}
```

### 3.6 — Where NOT to put your code

| Folder | Rule |
|--------|------|
| `src/modules/your-module/` | YOUR code goes here |
| `src/app/` | Auto-generated — never edit |
| `src/core/` | Platform internals — don't touch |
| `src/shared/` | Shared UI components — don't modify, but you can import from here |
| `scripts/` | Build scripts — don't touch |

---

## Part 4: Scripts Reference

These are all the commands you'll use. Run them from the project root.

### Setup commands

| Command | What it does |
|---------|-------------|
| `.\scripts\setup.ps1` | One-time setup: core remote, npm install, .env.local, VS Code readonly. Re-run after creating a new module. |
| `\.\scripts\sync-repo.ps1` | Syncs your repo safely (origin pull + core-main update + merge + push). Run at the start of each work session. |

### Everyday commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts the dev server on http://localhost:3000. Auto-generates routes first. |
| `npm run build` | Creates a production build. Auto-generates routes first. Run before every PR. |
| `npm run lint` | Checks your code for errors. Fix everything it reports before submitting a PR. |

### Module commands

| Command | What it does |
|---------|-------------|
| `npm run create-module -- <name>` | Creates a new module with all 5 files. Safe to run on existing modules (skips files that exist). |
| `npm run new-page -- modules/<name>/index.js <page>` | Adds a new page to an existing module. |
| `npm run gen:routes` | Manually regenerates route files from all module `index.js` definitions. Normally you don't need this — `dev` and `build` run it automatically. |

### What "auto-generates routes" means

When you run `npm run dev` or `npm run build`, a script called `generate-routes.js` runs first. It:

1. Reads every module's `index.js` to find all routes
2. Creates a page file under `src/app/` for each route (e.g. `src/app/metal-buildings/page.js`)
3. Deletes old page files for routes that no longer exist
4. Generates `src/app/rewrites.json` for URL rewriting

You never need to create or edit files under `src/app/`. The script handles it.

---

## Part 5: Daily Git Workflow

### Pushing your work

```bash
git add -A
git commit -m "feat: add Metal Buildings list page"
git push origin main
```

### Syncing core updates (start of each work session)

```bash
\.\scripts\sync-repo.ps1
```

What this script does for you:

1. Pulls latest `main` from `origin`
2. Updates `core-main` from `core/main`
3. Merges `core-main` into `main`
4. Pushes `main` to `origin`

It also auto-stashes uncommitted changes before syncing, then restores them.

### If you get a merge conflict

1. Open the conflicted file and look for `<<<<<<<`, `=======`, `>>>>>>>` markers.
2. Choose the final version you want (or combine both), then remove the markers.
3. Save the file, then run:

```bash
git add path/to/the/file.js
git merge --continue
git push origin main
```

If you're stuck, run `git merge --abort` to undo everything and ask your senior for help.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails | Delete `node_modules` and `package-lock.json`, then `npm install` again |
| Port 3000 in use | Kill the other process, or use `PORT=3001 npm run dev` |
| Login redirects back to login | Check `.env.local` — make sure all 3 values are correct |
| Module not on dashboard | Check that `module_key` in your `index.js` matches a value in `psb_s_application` |
| Page shows 404 | Run `npm run gen:routes` and check that `src/app/<your-route>/page.js` was created |
| Build fails on fresh clone | Don't fix it — tell your senior |
| PowerShell blocks npm | Use `npm.cmd` instead |
| `"use client"` error on Page file | Remove `"use client"` from your Page.js — only View files get that |
| `rejected — failed to push` | Run `git pull origin main` then push again |
| Can't edit my module files in VS Code | Re-run `.\scripts\setup.ps1` — it will detect your module folder and unlock it |
| setup.ps1 says "No module folders detected" | Create your module first (`npm run create-module`), then re-run setup.ps1 |

---

## Quick Checklist

Use this before submitting a PR:

- [ ] `.env.local` has all 3 Supabase values
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes without errors
- [ ] `npm run lint` shows no errors
- [ ] Module `index.js` has correct `module_key` (asked senior)
- [ ] Page files do NOT have `"use client"`
- [ ] View files DO have `"use client"`
- [ ] Each route's `page` value matches a filename in `pages/`
- [ ] Module appears on the dashboard after login
- [ ] Ran `setup.ps1` after creating your module (VS Code shows your folder as editable)
