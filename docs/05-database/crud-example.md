# CRUD Example: Roles Module

A complete, working example of a module with full CRUD operations. Copy this pattern for your own modules.

---

## Folder Structure

```
src/modules/roles/
  index.js                    ← Module definition
  data/
    roles.actions.js          ← "use server" — all database queries
    roles.data.js             ← Client helpers — column defs, form builders
  pages/
    RolesPage.js              ← Server component — loads data
    RolesView.jsx             ← "use client" — all UI, state, interaction
```

To scaffold this, run:

```bash
npm run create-module -- roles
```

Then fill in the files below.

---

## 1. `index.js` — Module Definition

```js
const rolesModule = {
  key: "roles",
  module_key: "roles-app",       // ← must match psb_s_application
  name: "Roles",
  description: "Manage user roles.",
  icon: "shield-halved",
  group_name: "Administration",
  group_desc: "Tools for system configuration and management.",
  order: 150,
  routes: [
    { path: "/roles", page: "RolesPage" },
  ],
};

export default rolesModule;
```

---

## 2. `data/roles.actions.js` — Server Actions (All DB Access)

This is the **only** file that talks to the database. Every function here runs on the server.

```js
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

const TABLE = "psb_s_role";

// ─── READ ──────────────────────────────────────────────────

export async function loadRoles() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return { roles: data ?? [] };
}

// ─── CREATE ────────────────────────────────────────────────

export async function createRole(payload) {
  if (!payload?.role_name?.trim()) throw new Error("Role name is required.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      role_name: payload.role_name.trim(),
      role_desc: payload.role_desc?.trim() || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── UPDATE ────────────────────────────────────────────────

export async function updateRole(roleId, updates) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      role_name: updates.role_name,
      role_desc: updates.role_desc,
      is_active: updates.is_active,
    })
    .eq("role_id", roleId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── DELETE ────────────────────────────────────────────────

export async function deleteRole(roleId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("role_id", roleId);

  if (error) throw new Error(error.message);
}
```

---

## 3. `data/roles.data.js` — Client Helpers

Helper functions used by the View. No database calls here.

```js
// Column definitions for TableZ
export const ROLE_COLUMNS = [
  { key: "role_name", label: "Name",        sortable: true },
  { key: "role_desc", label: "Description", sortable: true },
  { key: "is_active", label: "Active",      sortable: true, width: 100 },
];

// Empty form for creating a new role
export function createEmptyRoleForm() {
  return { role_name: "", role_desc: "", is_active: true };
}

// Convert a DB row into a form-compatible shape
export function createFormFromRole(role) {
  return {
    role_name: role.role_name ?? "",
    role_desc: role.role_desc ?? "",
    is_active: role.is_active ?? true,
  };
}
```

---

## 4. `pages/RolesPage.js` — Server Component

Loads data on the server, passes it to the View.

```js
import { loadRoles } from "../data/roles.actions";
import RolesView from "./RolesView";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const { roles } = await loadRoles();
  return <RolesView roles={roles} />;
}
```

---

## 5. `pages/RolesView.jsx` — Client Component (All UI)

All state, interaction, and rendering in one file.

```jsx
"use client";

import { useState, useCallback } from "react";
import { createRole, updateRole, deleteRole } from "../data/roles.actions";
import { ROLE_COLUMNS, createEmptyRoleForm, createFormFromRole } from "../data/roles.data";
import { toastSuccess, toastError } from "@/shared/utils/toast";
import { useRouter } from "next/navigation";

export default function RolesView({ roles = [] }) {
  const router = useRouter();
  const [rows, setRows] = useState(roles);
  const [form, setForm] = useState(createEmptyRoleForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // ─── CREATE / UPDATE ──────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateRole(editingId, form);
        toastSuccess("Role updated.");
      } else {
        await createRole(form);
        toastSuccess("Role created.");
      }
      setForm(createEmptyRoleForm());
      setEditingId(null);
      router.refresh(); // re-runs the server component to reload data
    } catch (err) {
      toastError(err.message);
    } finally {
      setSaving(false);
    }
  }, [editingId, form, router]);

  // ─── EDIT ─────────────────────────────────────────────────

  const handleEdit = useCallback((role) => {
    setEditingId(role.role_id);
    setForm(createFormFromRole(role));
  }, []);

  // ─── DELETE ───────────────────────────────────────────────

  const handleDelete = useCallback(async (roleId) => {
    try {
      await deleteRole(roleId);
      toastSuccess("Role deleted.");
      router.refresh();
    } catch (err) {
      toastError(err.message);
    }
  }, [router]);

  // ─── RENDER ───────────────────────────────────────────────

  return (
    <main className="container py-4">
      <h2>Roles</h2>

      {/* Form */}
      <div className="card mb-3 p-3">
        <div className="row g-2">
          <div className="col">
            <input
              className="form-control"
              placeholder="Role name"
              value={form.role_name}
              onChange={(e) => setForm({ ...form, role_name: e.target.value })}
            />
          </div>
          <div className="col">
            <input
              className="form-control"
              placeholder="Description"
              value={form.role_desc}
              onChange={(e) => setForm({ ...form, role_desc: e.target.value })}
            />
          </div>
          <div className="col-auto">
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {editingId ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((role) => (
            <tr key={role.role_id}>
              <td>{role.role_name}</td>
              <td>{role.role_desc}</td>
              <td>{role.is_active ? "Yes" : "No"}</td>
              <td>
                <button className="btn btn-sm btn-outline-primary me-1" onClick={() => handleEdit(role)}>
                  Edit
                </button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(role.role_id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

---

## How It All Connects

```
User visits /roles
  → RolesPage.js runs on the server
    → calls loadRoles() from roles.actions.js
    → passes data to RolesView
  → RolesView.jsx runs in the browser
    → renders table from roles data
    → user clicks "Create" → calls createRole() server action
    → user clicks "Edit"   → populates form, then updateRole()
    → user clicks "Delete" → calls deleteRole() server action
    → router.refresh() reloads server data after each change
```

| File | What It Does |
|------|-------------|
| `index.js` | Registers the module and its routes |
| `data/roles.actions.js` | All database operations (server only) |
| `data/roles.data.js` | Column defs, form builders, helpers (browser) |
| `pages/RolesPage.js` | Loads data on the server, passes to View |
| `pages/RolesView.jsx` | All UI, state, and user interaction |
