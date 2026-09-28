# Supabase CRUD Guide

This guide shows how to perform reliable database operations in PSBUniverse Core using Supabase. Follow these patterns for every query you write.

---

## Which Supabase Client to Use

PSBUniverse has **two** Supabase clients. Using the wrong one is a security risk.

> **In simple terms:** The browser client is like a regular user — it can only do what the logged-in user is allowed to do. The admin client is like a master key — it can do anything (create users, delete records, etc.). The admin client must only run on the server, never in browser code.

| Client | File | When to Use |
|--------|------|-------------|
| Browser client | `src/core/supabase/client.js` | Client components — reads tied to the logged-in user's session |
| Server admin client | `src/core/supabase/admin.js` | Server Actions and server-only code — privileged operations like creating users |

**Rules:**
1. Never expose the service role key in browser code.

   > **In simple terms:** The "service role key" is the master password for your database. If it ends up in browser code, anyone can inspect your page and steal it. Keep it in `.env.local` and only use it in Server Actions.

2. Never use the admin client in client components.

---

## Standard Query Pattern

Use the same pattern for every operation:

1. Execute the query.
2. Check `error`.
3. Validate the data shape.
4. Return a predictable result.

```js
const { data, error } = await supabase
  .from("psb_s_user")
  .select("*")
  .eq("auth_user_id", authUserId)
  .maybeSingle();

if (error) {
  throw new Error(error.message);
}

return data ?? null;
```

---

## SELECT Examples

### Resolve Business User from Auth Identity

```js
const { data: dbUser, error } = await supabase
  .from("psb_s_user")
  .select("*")
  .eq("auth_user_id", authUser.id)
  .maybeSingle();

if (error) throw new Error(error.message);
```

### Load Active App-Role Mappings

```js
const { data: roles, error } = await supabase
  .from("psb_m_userapproleaccess")
  .select("*")
  .eq("user_id", dbUser.user_id)
  .eq("is_active", true);

if (error) throw new Error(error.message);
```

### Load Cards for One Application

```js
const { data: cards, error } = await supabase
  .from("psb_s_appcard")
  .select("*")
  .eq("app_id", moduleAppId)
  .eq("is_active", true)
  .order("display_order", { ascending: true });

if (error) throw new Error(error.message);
```

### Load Card Groups

```js
const { data: groups, error } = await supabase
  .from("psb_m_appcardgroup")
  .select("*")
  .eq("app_id", moduleAppId)
  .eq("is_active", true)
  .order("display_order", { ascending: true });

if (error) throw new Error(error.message);
```

### Load Card-Role Mappings

```js
const { data: cardRoleAccess, error } = await supabase
  .from("psb_m_appcardroleaccess")
  .select("*")
  .eq("is_active", true);

if (error) throw new Error(error.message);
```

### Resolve Auth User from Cookie Token (Server Action)

This pattern is used by `src/core/auth/bootstrap.actions.js`:

```js
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/core/supabase/admin";

const cookieStore = await cookies();
const accessToken = cookieStore.get("sb-access-token")?.value;

if (!accessToken) {
  return { authUser: null, dbUser: null, roles: [] };
}

const supabaseAdmin = getSupabaseAdmin();
const { data: authData, error } = await supabaseAdmin.auth.getUser(accessToken);

if (error || !authData?.user) {
  return { authUser: null, dbUser: null, roles: [] };
}
```

---

## INSERT Examples

### Insert Business User (After Auth User Creation)

Uses the server admin flow from `src/core/auth/createBusinessUser.js`:

```js
const { data: dbUser, error } = await supabaseAdmin
  .from("psb_s_user")
  .insert({
    email,
    auth_user_id: authUserId,
    first_name,
    last_name,
  })
  .select("*")
  .single();
```

### Insert User Role Mappings

```js
const rows = selectedRoleRows.map((row) => ({
  user_id: dbUser.user_id,
  role_id: row.role_id,
  app_id: row.app_id,
  is_active: true,
}));

const { data, error } = await supabaseAdmin
  .from("psb_m_userapproleaccess")
  .insert(rows)
  .select("*");

if (error) throw new Error(error.message);
```

---

## UPDATE Examples

### Update User Profile

```js
const { data, error } = await supabase
  .from("psb_s_user")
  .update({
    first_name: "Sam",
    phone: "09123456789",
    updated_at: new Date().toISOString(),
  })
  .eq("user_id", dbUser.user_id)
  .select("*")
  .single();

if (error) throw new Error(error.message);
```

### Soft-Disable App Access

```js
const { error } = await supabaseAdmin
  .from("psb_m_userapproleaccess")
  .update({
    is_active: false,
    updated_at: new Date().toISOString(),
  })
  .eq("user_id", userId)
  .eq("role_id", roleId)
  .eq("app_id", appId);

if (error) throw new Error(error.message);
```

---

## DELETE Examples

Prefer soft disable (update `is_active = false`) where audit history matters. Use hard delete only when appropriate.

### Delete Card-Role Mapping

```js
const { error } = await supabaseAdmin
  .from("psb_m_appcardroleaccess")
  .delete()
  .eq("card_id", cardId)
  .eq("role_id", roleId);

if (error) throw new Error(error.message);
```

### Delete Business User (Rollback Path)

```js
const { error } = await supabaseAdmin
  .from("psb_s_user")
  .delete()
  .eq("user_id", dbUser.user_id);

if (error) throw new Error(error.message);
```

---

## Error Handling Best Practices

1. **Always check `error` explicitly.** Never skip it.
2. Throw or return structured error messages.
3. Validate data shape (`array`, `maybeSingle`, `single`) before using the result.
4. Add rollback logic when operations span multiple tables.
5. Never silently swallow Supabase errors.

### Multi-Step Example with Rollback

```js
try {
  const auth = await createAuthUser();
  const dbUser = await insertBusinessUser(auth.id);
  const roles = await insertRoleMappings(dbUser.user_id);
  return { auth, dbUser, roles };
} catch (err) {
  await rollbackIfNeeded();
  throw err;
}
```

---

## Query Safety Rules

1. Always filter by keys (`user_id`, `app_id`, `role_id`, `card_id`).
2. Always include `is_active` when access logic depends on active status.
3. Use `maybeSingle()` only when zero or one row is expected.
4. Use `single()` only when exactly one row is required.

   > **For example:** Use `maybeSingle()` when looking up a user by email — they might not exist yet, so getting zero rows is fine. Use `single()` when fetching a record by its primary key — it should always exist, and if it doesn't, that's an error.

5. Keep `SELECT` columns focused in high-traffic paths.
6. Do not run duplicate auth/role queries — use `useAuth()` central context.
7. For server bootstrap endpoints, send no-store cache headers.

---

## Anti-Patterns to Avoid

> **In simple terms:** "Anti-patterns" are common mistakes that seem like they'd work but actually cause problems. Avoid these.

1. Using `auth_user_id` for business joins (use `user_id` instead).
2. Hardcoding role names in UI checks.
3. Loading roles repeatedly in each component.
4. Writing custom password handling in `psb_s_user`.
5. Running privileged writes from browser code.

---

## Checklist Before Merging CRUD Code

- [ ] Correct Supabase client selected (browser vs admin).
- [ ] Query uses correct table keys and `is_active` filters.
- [ ] Error paths are handled explicitly.
- [ ] Multi-step writes include rollback strategy.
- [ ] Access-sensitive queries align with core RBAC model.
