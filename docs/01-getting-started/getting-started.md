# Getting Started (Legacy - Archived)

> ⚠️ Deprecated. This file is kept only for historical reference.

Use these guides instead:

1. [Getting Started (v2)](./getting-started-v2.md) — current onboarding for developers working in an existing app repo.
2. [Creating a New Project](./creating-a-new-project.md) — senior workflow for bootstrapping a brand-new app repo from core.
3. [Module Creation Checklist](../08-junior-dev-guide/module-creation-checklist.md) — required post-scaffold checks (DB, RBAC, runtime validation).

If you reached this page from an old bookmark, switch to **Getting Started (v2)** now.

Only do this when the team says "the core has been updated." Do NOT do this on your own.

### Step-by-Step Sync

```bash
# 1. Save your current work
git add -A
git commit -m "wip: save work before syncing core"

# 2. Update core-main
git checkout core-main
git pull core main

# 3. Merge core changes into your main
git checkout main
git merge core-main -m "Merge upstream core changes into main"

# 4. Push
git push origin main
```

> This uses merge instead of rebase so your commit history stays stable and no force-push is needed.

### Resolving Conflicts

If git pauses during the merge and reports conflicts:

1. Open the conflicted file — look for `<<<<<<<`, `=======`, `>>>>>>>` markers.
2. Decide which version to keep (or combine both). Delete the markers.
3. Save the file, then:

```bash
git add path/to/the/file.js
git merge --continue
```

4. Repeat for any other conflicted files.

To abort and go back to how things were before the merge:

```bash
git merge --abort
```

**If you're unsure about a conflict, ask a senior dev for help.**

---

## Available npm Scripts

| Command | What It Does |
|---------|-------------|
| `npm run create-module -- <name>` | Scaffold a new module with all required files (e.g. `npm run create-module -- metal-buildings`) |
| `npm run dev` | Auto-generates routes, starts local dev server on port 3000 |
| `npm run build` | Auto-generates routes, creates a production build (run before every PR) |
| `npm run gen:routes` | Manually regenerate route files from module definitions |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Run ESLint checks |

---

## Key URLs

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Main app |
| http://localhost:3000/login | Login page |
| http://localhost:3000/dashboard | Dashboard (after login) |
| http://localhost:3000/examples | Shared UI guide and playground |
| http://localhost:3000/examples/data-table | Data table reference example |
| http://localhost:3000/admin/application-setup | Admin: application setup |

---

## Project Structure

```
scripts/        ← Auto-route generator (do not edit)
src/
  app/          ← Auto-generated route files (do not edit)
  core/         ← Auth, layout, Supabase clients (DO NOT MODIFY)
  modules/      ← Your module code lives here
    admin/      ← Admin setup modules
    psbpages/   ← Platform pages (dashboard, login, profile)
  shared/       ← Shared UI components and utilities (DO NOT MODIFY)
  styles/       ← Global CSS and theme variables
config/         ← App configuration
docs/           ← Documentation
```

**Rules:**
1. Your work goes inside `src/modules/`. Use `npm run create-module -- <name>` to scaffold a new module.
2. Do **not** edit files in `src/core/`, `src/shared/`, `src/app/`, or `scripts/` without lead approval.
3. Route files in `src/app/` are auto-generated — never create or edit them manually.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails | Delete `node_modules` and `package-lock.json`, then run `npm install` again |
| Port 3000 already in use | Kill the other process, or run `PORT=3001 npm run dev` |
| Supabase connection errors | Double-check your `.env.local` values against the Supabase dashboard |
| Login redirects back to login | Check `.env.local`, check browser console for auth errors |
| Build fails on fresh clone | Don't fix it — report to tech lead |
| PowerShell blocks npm | Use `npm.cmd` instead of `npm` |
| `remote core already exists` | Already set up — move on |
| `branch core-main already exists` | Already set up — move on |
| Merge conflict you don't understand | Run `git merge --abort` and ask a senior dev |
| `rejected — failed to push` | Run `git pull origin main` then push again |
| `Make sure you configure user.name` | Go to Section 5 and run the `git config` commands |

---

## Quick Reference Card

| What you want to do | Command |
|---|---|
| Check what branch you're on | `git branch` |
| Switch to main | `git checkout main` |
| Stage all changes | `git add -A` |
| Commit your work | `git commit -m "your message"` |
| Push your work | `git push origin main` |
| Sync core updates | See Section 6 |

---

## Rules

1. **Always work on `main`** (or a feature branch). Never commit your work to `core-main`.
2. **`core-main` is read-only.** It's a mirror of the shared core. Don't touch it.
3. **Never push to `core`.** Only push to `origin`.
4. **Never edit files in `src/app/`.** Route files are auto-generated.
5. **Never edit files in `src/core/` or `src/shared/`** without lead approval.
6. **Commit often.** Small commits with clear messages are better than one giant commit.
7. **`.env*` files are excluded by `.gitignore`** — never commit credentials.
