# Database Naming Conventions

This document standardizes naming for all database objects in PSBUniverse Core. Follow these rules when creating or modifying any table, column, constraint, or index.

---

## Table Naming

### Prefix Model

Every table uses the `psb_` platform prefix followed by a **type prefix**.

> **In simple terms:** Every table name starts with `psb_` so you know it belongs to this project. The second part tells you what kind of table it is: `_s_` = a main data table (like a list of users), `_m_` = a link table that connects two things together (like connecting a user to a role), `_t_` = a log of events (like invoices).

| Prefix | Meaning | Examples |
|--------|---------|----------|
| `psb_s_` | Source / master / reference table | `psb_s_user`, `psb_s_role`, `psb_s_application` |
| `psb_m_` | Mapping / link table | `psb_m_userapproleaccess`, `psb_m_appcardroleaccess` |
| `psb_t_` | Transaction / event table (future) | `psb_t_invoice`, `psb_t_auditlog` |

### Rules

1. Always include the `psb_` platform prefix.
2. Use **lowercase snake_case** only.

   > **For example:** `psb_s_user` is correct. `PsbSUser` or `psb-s-user` are wrong. Snake_case means lowercase words separated by underscores.

3. Use singular nouns for entity tables when practical.
4. Use explicit relationship names for mapping tables.

### Good vs Bad

| Good | Bad | Why |
|------|-----|-----|
| `psb_s_user` | `users` | Missing platform and type prefix |
| `psb_m_userapproleaccess` | `user_role_map` | Too generic, inconsistent |
| `psb_s_appcard` | `cards_tbl` | Ambiguous suffix |

---

## Column Naming

### Primary Keys

- Name format: `<entity>_id`
- Type: `bigint` (current schema standard)
- Examples: `user_id`, `role_id`, `app_id`, `card_id`

### Foreign Keys

- Reuse the referenced primary key name **exactly**.
- Avoid alternate names like `user_ref_id` unless required by a specific context.

Good: `user_id` → references `psb_s_user.user_id`
Bad: `usr_id`, `app_ref`

### Boolean Columns

- Prefix with `is_` for state flags.
- Use positive semantics.
- Examples: `is_active`, `is_deleted`

### Timestamp Columns

Use consistent audit fields:

```
created_at    (timestamp with time zone)
updated_at    (timestamp with time zone)
created_by    (bigint or text)
updated_by    (bigint or text)
```

### Identity Bridge Column

- `auth_user_id` (UUID) — bridges Supabase Auth identity to business user.

---

## Constraint Naming

> **In simple terms:** Constraints are rules the database enforces automatically. A primary key constraint says "this column must be unique." A foreign key constraint says "this value must exist in another table." We name them consistently so they're easy to find when debugging.

| Type | Pattern | Example |
|------|---------|---------|
| Primary key | `<table>_pkey` | `psb_s_user_pkey` |
| Foreign key | `fk_<child>_<parent>` | `fk_user_company`, `fk_card_group` |
| Unique | `<table>_<column>_key` or `uq_<purpose>` | `psb_s_user_email_key`, `uq_card_role` |
| Check | `<table>_<rule>_ck` | `psb_s_application_display_order_positive_ck` |

---

## Index Naming

| Type | Pattern | Example |
|------|---------|---------|
| Non-unique | `idx_<table>_<column(s)>` | `idx_user_email`, `idx_user_company` |
| Unique | `<table>_<column>_uq` or `uq_<purpose>` | `psb_s_application_display_order_uq` |

---

## Mapping Table Naming

Mapping tables should clearly describe the relationship.

> **For example:** `psb_m_userapproleaccess` connects three things: a user, a role, and an application. The name tells you exactly what it links. When you see `_m_`, you know it's a many-to-many relationship table.

- `psb_m_userapproleaccess` — maps user → role → application.
- `psb_m_appcardroleaccess` — maps card → role.

Do **not** use vague names like `map1`, `relation`, or `link_table`.

---

## Data Type Consistency

| Column Category | Recommended Type |
|----------------|-----------------|
| PK/FK in business tables | `bigint` |
| Auth identity bridge | `uuid` (`auth_user_id`) |
| Timestamps | `timestamp with time zone` |
| Flags | `boolean` |

---

## SQL Example

### Compliant Table

```sql
create table public.psb_s_featureflag (
   flag_id bigserial primary key,
   app_id bigint not null,
   flag_name text not null,
   is_active boolean default true,
   created_at timestamp with time zone default now(),
   updated_at timestamp with time zone,
   constraint fk_featureflag_app
      foreign key (app_id) references psb_s_application(app_id)
);
```

### Compliant Index

```sql
create index if not exists idx_featureflag_app
on public.psb_s_featureflag(app_id);
```

---

## Anti-Patterns to Avoid

1. Mixed casing (`UserTable`, `RoleMap`).
2. Unclear abbreviations (`usr`, `rl`, `applnk`).
3. Prefix-free tables in a prefixed schema.
4. Different names for the same FK concept across tables.
5. Weak constraint names that hide relationship intent.

---

## Checklist for New Tables

Before merging a schema change:

- [ ] Table uses correct prefix (`psb_s_`, `psb_m_`, or `psb_t_`) and snake_case.
- [ ] PK and FK names follow the `<entity>_id` pattern.
- [ ] Audit columns (`created_at`, `updated_at`) are consistent.
- [ ] Constraints follow the naming patterns above.
- [ ] Index names are explicit and searchable.
- [ ] Mapping tables clearly describe their relationship.
