# Creating a New Project (Senior Workflow)

Use this guide when you are creating a brand-new app repository from PSBUniverse core.

This is not the junior onboarding flow. After finishing this guide, hand the app repo to junior developers and have them follow [Getting Started (v2)](./getting-started-v2.md).

---

## Goal

Create a new writable app repository with:
- `origin` = the new app repo (push/pull allowed)
- `core` = PSBUniverse core (fetch only, push blocked)
- `core-main` = tracking branch for upstream core sync

Daily development should happen in the app repo, not in a core clone.

---

## Step 1: Create the New App Repository

Create a new repository in your org (example: `PSB_Connect`).

Recommended options:
1. Use a GitHub template based on core.
2. Or bootstrap from a local clone with the app repo as `origin` and core as upstream.

If using local bootstrap flow:

```bash
git clone https://github.com/PSBUniverse-DEV/PSB_Connect.git
cd PSB_Connect
git remote add core https://github.com/PSBUniverse-DEV/PSBUniverse-core.git
git fetch core
```

If your app repo is EMPTY (no commits yet):

```bash
git checkout -b main core/main
git push -u origin main
```

If your app repo already has a first commit (README/.gitignore/license):

```bash
git checkout main
git merge core/main --allow-unrelated-histories -m "Merge core baseline into app repo"
# if README.md conflicts, keep core version:
git checkout --theirs README.md
git add README.md
git commit --no-edit
git push -u origin main
```

---

## Step 2: Configure Upstream Core as Read-Only

From the new app repo (after Step 1):

```bash
git remote set-url --push core no_push_allowed
git fetch core
git branch core-main core/main
```

If `core-main` already exists, skip the last line.

Verify:

```bash
git remote -v
```

Expected:

```text
core    https://github.com/PSBUniverse-DEV/PSBUniverse-core.git (fetch)
core    no_push_allowed (push)
origin  https://github.com/PSBUniverse-DEV/PSB_Connect.git (fetch)
origin  https://github.com/PSBUniverse-DEV/PSB_Connect.git (push)
```

---

## Step 3: Run Project Bootstrap

From the app repo root:

```powershell
.\scripts\setup.ps1
```

What this handles:
- validates/locks core push URL
- installs dependencies
- creates `.env.local` template
- configures VS Code read-only rules for core folders in module repos

---

## Step 4: Prepare Database Baseline

Before junior developers create modules, confirm baseline records exist.

Minimum setup checklist:
- `psb_s_application`: create active app row with canonical `module_key`
- `psb_m_appcardgroup`: create card group rows used by dashboard modules
- `psb_s_role`: create role rows for your app
- `psb_m_userapproleaccess`: map test users to roles

When modules are added, also create/update:
- `psb_s_appcard` with correct `route_path`
- `psb_m_appcardroleaccess` with visibility rules

---

## Step 5: Handoff Package for Junior Developers

Share these items with juniors:
1. App repo URL
2. Required `module_key` values they should use in module `index.js`
3. Supabase keys for `.env.local`
4. Role and card-group expectations for first module

Tell juniors to follow:
- [Getting Started (v2)](./getting-started-v2.md)
- [Your First Module - Quick Start](../08-junior-dev-guide/quickstart.md)
- [Module Creation Checklist](../08-junior-dev-guide/module-creation-checklist.md)

---

## Step 6: Sync Policy

Use the sync script before starting work sessions:

```powershell
.\scripts\sync-repo.ps1
```

This updates `main` from both `origin/main` and `core/main` (through `core-main`) using merge strategy.

---

## Recommended VS Code Usage

Default for daily work:
- open only the app repo folder in VS Code

Optional for senior maintenance:
- use a multi-root workspace when comparing app repo with a separate core clone

---

## Common Pitfalls

- Cloning core and building features there instead of in the app repo
- Leaving `core` push URL writable
- Missing `core-main` branch before running sync script
- Missing `psb_s_application.module_key` row before module onboarding
- Route added in module `index.js` but missing matching `psb_s_appcard.route_path`
