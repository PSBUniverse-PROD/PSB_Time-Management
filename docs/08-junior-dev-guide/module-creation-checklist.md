# Module Creation Checklist

Use this after running:

```bash
npm run create-module -- <module-name>
```

This checklist is the operational version of the scaffold notes and helps avoid missed DB/RBAC setup.

---

## 1) Pre-Checks

- [ ] You are in your app repo (not a core clone)
- [ ] `git remote -v` shows `origin` writable and `core` push blocked
- [ ] `.env.local` contains valid Supabase keys
- [ ] You know the correct `module_key` value from your senior

---

## 2) Scaffold and Access

- [ ] Run `npm run create-module -- <module-name>`
- [ ] Re-run `.\scripts\setup.ps1` so your new module folder is writable in VS Code
- [ ] Confirm generated files exist:
  - `src/modules/<module>/index.js`
  - `src/modules/<module>/pages/<Module>Page.js`
  - `src/modules/<module>/pages/<Module>View.jsx`
  - `src/modules/<module>/data/<module>.actions.js`
  - `src/modules/<module>/data/<module>.data.js`

---

## 3) Module Definition (`index.js`)

- [ ] `key` uses lowercase + dashes and matches folder name
- [ ] `module_key` matches `psb_s_application.module_key`
- [ ] `routes` contains at least one path/page mapping
- [ ] each route `page` value matches a real file in `pages/`
- [ ] `icon`, `group_name`, and `order` are set intentionally

---

## 4) Database + RBAC Setup

- [ ] `psb_s_application` has an active row for your `module_key`
- [ ] `psb_s_appcard` has a row for each route (`route_path` exact match)
- [ ] `psb_m_appcardgroup` has expected group rows
- [ ] `psb_m_appcardroleaccess` maps card visibility to roles
- [ ] `psb_s_role` contains required roles for your app
- [ ] `psb_m_userapproleaccess` maps your test users to roles

---

## 5) Runtime Validation

- [ ] Run `npm run dev`
- [ ] Visit the module route and confirm page renders
- [ ] Verify module card appears on dashboard
- [ ] Verify unauthorized user sees access restriction
- [ ] Run `npm run build` and confirm no build errors

---

## 6) Common Failure Signals

- 404 on module route: route wrapper missing or route path mismatch
- Access denied for valid user: role/card mappings missing or wrong
- Module card not visible: `psb_s_appcard` row missing/inactive
- App ID resolution errors: `module_key` mismatch in `index.js` vs `psb_s_application`

---

## 7) Daily Workflow Reminder

Before feature work sessions, sync upstream changes:

```powershell
.\scripts\sync-repo.ps1
```

Then continue development from your app repo `main` branch.
