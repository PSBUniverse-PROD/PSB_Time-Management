# Shared UI System

This document defines every shared UI component, its behavior contract, and the design tokens that govern the visual system. All modules must use these components — no custom implementations allowed.

---

## Approved Shared Components

| Component | Purpose |
|-----------|---------|
| TableZ | Full data-table: controlled state, filters, sorting, pagination, column resize/visibility, context menu, side panel, batch edit, export |
| TableX | Data-binding wrapper around TableZ: connects to server-side query/filter/export Server Actions |
| ActionColumn | Row action buttons: inline (1 action) or dropdown (2+ actions) |
| InlineEditCell | Inline cell editor for batch edit mode |
| SearchBar | Debounced global search input |
| Dropdown | Select/menu component |
| Button | Standard action button |
| Input | Form text input |
| Modal | Dialog overlay |
| Card | Content container |
| Badge | Inline label (tags, roles, categories) |
| StatusBadge | Token-driven status indicator pill (active, inactive, pending, etc.) |
| Toast | Auto-dismiss notification (via `toastSuccess`, `toastError`, etc.) |
| GlobalToastHost | Single app-level toast container |

**Import all from the barrel export:**

> **In simple terms:** A "barrel export" just means there's one file that re-exports everything. Instead of remembering which subfolder each component lives in, you import them all from one place: `@/shared/components/ui`.

```js
import { TableZ, TableX, Button, Modal, Badge, StatusBadge } from "@/shared/components/ui";
```

**Hard rule:** Anything outside this list is rejected unless the shared UI system is explicitly extended first.

---

## Live Reference & Playground

> **Start here.** Open `/psbpages/examples` in your dev server to see every component rendered live. Use the playground to click, type, and interact with real components. The examples below are copy-paste starting points — the live page is the visual reference.

---

## Usage Examples

These are real, working code snippets you can copy into your view files. Every example uses only shared components.

### Button

```jsx
import { Button } from "@/shared/components/ui";

// Variants
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button variant="ghost">Skip</Button>

// With loading state (spinner + disabled automatically)
const [saving, setSaving] = useState(false);
<Button variant="primary" loading={saving} onClick={handleSave}>
  Save Changes
</Button>

// Disabled
<Button variant="primary" disabled>Not Allowed</Button>
```

**What you'll see:** A styled button matching the platform look. `loading={true}` shows a spinner inside the button and disables clicks — you don't need to handle that yourself.

---

### Input

```jsx
import { Input } from "@/shared/components/ui";

// Basic text input
<Input
  type="text"
  placeholder="Enter company name"
  value={name}
  onChange={(e) => setName(e.target.value)}
/>

// With error styling
<Input
  type="email"
  placeholder="Email address"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  isInvalid={!!emailError}
/>
{emailError && <div className="text-danger small mt-1">{emailError}</div>}

// Password input
<Input type="password" placeholder="Enter password" />
```

**What you'll see:** A clean form input that matches Button height. `isInvalid` adds a red border (Bootstrap built-in).

---

### SearchBar

```jsx
import { SearchBar } from "@/shared/components/ui";

// Debounced search — fires onDebouncedChange 350ms after the user stops typing
<SearchBar
  placeholder="Search employees..."
  onDebouncedChange={(query) => handleSearch(query)}
/>

// Custom debounce delay
<SearchBar
  placeholder="Search..."
  debounceMs={500}
  onDebouncedChange={(query) => handleSearch(query)}
/>
```

**What you'll see:** A search input with a small search icon. It waits until the user stops typing before calling your handler — prevents firing on every keystroke.

---

### Dropdown

```jsx
import { Dropdown } from "@/shared/components/ui";

<Dropdown>
  <Dropdown.Toggle variant="secondary">
    Actions
  </Dropdown.Toggle>
  <Dropdown.Menu>
    <Dropdown.Item onClick={() => handleEdit(row)}>Edit</Dropdown.Item>
    <Dropdown.Item onClick={() => handleDuplicate(row)}>Duplicate</Dropdown.Item>
    <Dropdown.Divider />
    <Dropdown.Item onClick={() => handleDelete(row)} className="text-danger">
      Delete
    </Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

**What you'll see:** A button that opens a floating menu below it. Items are clickable rows. The divider is a thin line separating groups.

---

### Card

```jsx
import { Card } from "@/shared/components/ui";

// Simple card with title
<Card title="Department Summary">
  <p>Total employees: {total}</p>
  <p>Active: {active}</p>
</Card>

// Card with subtitle and footer
<Card
  title="Metal Buildings"
  subtitle="Application overview"
  footer={<Button variant="primary">Open</Button>}
>
  <p>Status: Active</p>
</Card>
```

**What you'll see:** A bordered container with a header area (title + subtitle), a body area (your content), and an optional footer. Cards are used for dashboard tiles and content sections.

---

### Badge

```jsx
import { Badge } from "@/shared/components/ui";

// Use Badge for non-status labels: tags, roles, categories
<Badge bg="primary">Admin</Badge>
<Badge bg="info" text="dark">v2.1</Badge>
<Badge bg="light" text="dark">Optional</Badge>
```

**What you'll see:** A small rounded label. Use it for categorical tags, role labels, or version indicators — anything that is NOT a status. For active/inactive/pending/failed statuses, use `StatusBadge` instead.

---

### StatusBadge

```jsx
import { StatusBadge } from "@/shared/components/ui";

// Basic usage — pass a status string
<StatusBadge status="active" />
<StatusBadge status="inactive" />
<StatusBadge status="pending" />
<StatusBadge status="failed" />
<StatusBadge status="suspended" />
<StatusBadge status="processing" />
<StatusBadge status="draft" />
<StatusBadge status="archived" />

// Custom label override
<StatusBadge status="active" label="Enabled" />

// In a table column
{
  key: "is_active",
  label: "Status",
  render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
}
```

**What you'll see:** A pill-shaped badge with a small colored dot and label. Colors are driven by CSS tokens in `variables.css` — every module gets the same colors automatically.

**Supported statuses:** `active`, `completed`, `approved`, `processing`, `in-progress`, `pending`, `waiting`, `suspended`, `failed`, `error`, `rejected`, `inactive`, `disabled`, `cancelled`, `archived`, `draft`

**Rule:** All active/inactive status indicators must use `StatusBadge`. Do not use raw `Badge` with `bg="success"` / `bg="danger"` for status display.

---

### Modal

```jsx
import { Modal, Button } from "@/shared/components/ui";

const [showModal, setShowModal] = useState(false);

<Button onClick={() => setShowModal(true)}>Open Dialog</Button>

<Modal
  show={showModal}
  onHide={() => setShowModal(false)}
  title="Confirm Delete"
  footer={
    <>
      <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
      <Button variant="danger" loading={deleting} onClick={handleDelete}>Delete</Button>
    </>
  }
>
  <p>Are you sure you want to delete this record? This cannot be undone.</p>
</Modal>
```

**What you'll see:** A centered popup with a dim background. The title shows at the top with a close button. Your footer buttons appear at the bottom right. Clicking outside or pressing Escape closes it.

---

### Toast

```jsx
import { toastSuccess, toastError, toastWarning, toastInfo } from "@/shared/utils/toast";

// After a successful save
toastSuccess("Record saved successfully.");

// After an error
toastError("Failed to save. Please try again.");

// Warning
toastWarning("This action cannot be undone.");

// Info
toastInfo("New updates available.");
```

**What you'll see:** A small notification slides in at the top-right corner and disappears after 4 seconds. Green for success, red for error, yellow for warning, blue for info. You don't need to render anything — just call the function from any event handler.

---

## Putting It Together

Here's what a real module view looks like using shared components:

```jsx
"use client";

import { useState } from "react";
import { Card, Button, Modal, StatusBadge, Input } from "@/shared/components/ui";
import { toastSuccess, toastError } from "@/shared/utils/toast";

export default function MetalBuildingsView({ items = [] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      // await createBuilding({ name });
      toastSuccess("Building added.");
      setShowAdd(false);
      setName("");
    } catch {
      toastError("Failed to add building.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1>Metal Buildings</h1>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          Add Building
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted">No buildings found.</p>
      ) : (
        <div className="row g-3">
          {items.map((item) => (
            <div key={item.id} className="col-md-4">
              <Card title={item.name}>
                <StatusBadge status={item.is_active ? "active" : "inactive"} />
              </Card>
            </div>
          ))}
        </div>
      )}

      <Modal
        show={showAdd}
        onHide={() => setShowAdd(false)}
        title="Add Building"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
          </>
        }
      >
        <Input
          placeholder="Building name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Modal>
    </div>
  );
}
```

This example uses Button, Card, StatusBadge, Modal, Input, and Toast — all from shared components, zero custom UI.

---

## Table System

### Behavior

- Display only — emits events, never fetches data.
- Fully controlled by the parent module.

> **In simple terms:** The table is like a whiteboard. Your module writes on it (passes data) and tells it what to display. When the user clicks "sort" or "filter", the table tells your module "hey, the user wants to sort by name" — but it doesn't sort anything itself. Your module does the sorting and passes the new data back.

### What the Module Controls

- Data array
- Filters configuration and state
- Sorting state
- Pagination state
- Column visibility array

### Data Flow

```
User interacts with TableZ
  → TableZ emits an event through onChange (search, filters, sorting, pagination, etc.)
  → Module updates its state
  → Module fetches data via Server Action
  → Module passes updated data back to TableZ
```

### TableZ vs TableX

| Feature | TableZ | TableX |
|---------|--------|--------|
| Purpose | Full-featured table for module pages | Data-binding wrapper that connects to Server Actions |
| State management | Controlled — module manages all state | Manages query/filter/pagination state internally via databind |
| Filters/search/sort | Full support | Full support (delegates to Server Actions) |
| Column resize/visibility | Full support | Full support |
| Batch edit mode | Built-in (via `useTableBatchEdit`) | Inherits from TableZ |
| Export | Full support | Full support (via databind export) |
| Drag reorder | Via `useTableDragNDrop` hook | Via `useTableDragNDrop` hook |

**Use `TableZ`** when you manage data fetching yourself (via Server Actions in your module).
**Use `TableX`** when you want automatic data binding to the databind Server Actions.

> **For example:** If you're building a simple list page and want the table to handle fetching, filtering, and pagination for you, use `TableX`. If you need full control over how data is loaded and transformed, use `TableZ`.

### TableZ Anatomy

TableZ is a complete table surface made up of several named regions. Use these names when discussing layout, styling, or integration work:

| Region | Owned by | When it appears | Purpose |
|--------|----------|-----------------|---------|
| **Page/Main Toolbar** | Parent module or page | Optional | Holds the page title, record count, tabs, Add actions, or page-level controls. TableZ does not render this region. |
| **Batch Toolbar** | TableZ | `batchMode={true}` with pending changes | Shows batch status and save/reset actions. |
| **Filter Toolbar** | TableZ | `filterConfig` contains filters | Collapsible select, text, date, and date-range filters. |
| **Search Toolbar** | TableZ | Unless `hideSearch={true}` | Debounced search using `searchPlaceholder`. |
| **Table Surface** | TableZ | Always | Headers, sorting, resizing, row rendering, actions, drag handles, loading, empty, and detail states. |
| **Table Footer** | TableZ | Unless `hideFooter={true}` | Row count, page size, and pagination controls. |

The normal composition is:

```text
Page/Main Toolbar (parent-owned, optional)
  TableZ
    Batch Toolbar (optional)
    Filter Toolbar (optional)
    Search Toolbar (optional)
    Table Surface
    Table Footer (optional)
```

TableZ owns its interaction regions. The parent owns the page-level toolbar so it can coordinate the table with tabs, page navigation, Add actions, and other module controls. Use `hideSearch` or `hideFooter` when the parent provides an equivalent control or when rendering a nested table.

The compact operational setup styling is the shared TableZ baseline. `variant="setup"` remains accepted for compatibility and documentation clarity, but it does not create a separate visual language.

---

## TableZ Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `Array` | required | Column definitions: `{ key, label, render?, sortable?, resizable? }` |
| `data` | `Array` | required | Row data array |
| `rowIdKey` | `string` | `"id"` | Property name used as unique row identifier |
| `actions` | `Array` | `[]` | Row action definitions: `{ type, label, icon?, onClick, hidden? }` |
| `selectedRowId` | `string\|null` | `null` | Currently selected/expanded row ID (highlights the row) |
| `onRowClick` | `function` | -- | Callback fired when a row is clicked: `(row) => void` |
| `draggable` | `boolean` | `false` | Enable drag-and-drop row reordering |
| `onReorder` | `function` | -- | Callback fired after reorder: `(newOrderedData) => void` |
| `hideSearch` | `boolean` | `false` | Hides the Search Toolbar. Use when the parent provides search or for nested tables. |
| `hideFooter` | `boolean` | `false` | Hides the table footer (pagination/row count) |
| `variant` | `string` | `""` | Compatibility/display hint. `"setup"` is accepted; all TableZ instances use the shared compact visual baseline. |
| `renderDetail` | `function` | -- | Renders an expandable detail panel below the selected row: `(row) => ReactNode` |
| `onChange` | `function` | -- | Controlled-mode event channel for search, filters, sorting, pagination, actions, export, visibility, and resize events |

### Master-Detail Pattern

Use `selectedRowId` + `onRowClick` + `renderDetail` to build expandable master-detail tables:

```jsx
import { TableZ } from "@/shared/components/ui";

const [expandedId, setExpandedId] = useState(null);

function handleRowClick(row) {
  setExpandedId((prev) => (prev === row.app_id ? null : row.app_id));
}

<TableZ
  columns={columns}
  data={applications}
  rowIdKey="app_id"
  actions={actions}
  selectedRowId={expandedId}
  onRowClick={handleRowClick}
  draggable
  onReorder={handleReorder}
  renderDetail={(row) => (
    <div>
      <h6>Roles for: {row.app_name}</h6>
      <TableZ columns={roleColumns} data={getRolesForApp(row.app_id)} hideSearch hideFooter />
    </div>
  )}
/>
```

**Behavior:**
- Clicking a row expands its detail panel. Clicking the same row again collapses it (toggle).
- `hideSearch` and `hideFooter` are useful on nested/detail tables where search and pagination are unnecessary.
- `draggable` + `onReorder` enables drag handles on each row for manual ordering.

---

## Row Actions

Row actions are config-driven via the `actions` prop on TableZ/TableX. The `ActionColumn` component renders them.

### Row Action Type Contract

The only supported `type` values for row actions are:

| Type | Use For |
|------|---------|
| `primary` | Default/main actions |
| `secondary` | Less prominent actions |
| `danger` | Destructive actions (delete, deactivate) |

**Do not** pass `success` or `warning` to row actions. If your business meaning is success/warning, map it to a supported type before passing actions.

---

## Filter System

- Developer-defined only — no user-created filters.
- Supports static options or server-resolved options.
- Module resolves options (via Server Actions) and passes them as `options`; the table does not execute server calls.
- Filter changes update module state and trigger a data reload.

---

## Search Bar

- Must be debounced.
- Updates the module's filter/query state.
- Triggers data reload through the module's normal flow.

> **In simple terms:** "Debounced" means the search doesn't fire on every single keystroke. It waits until the user stops typing (usually ~300ms) and then searches. This prevents hammering the server with a request for every letter.

---

## Right-Click Context Menu

The table context menu is the **single access point** for:

- Column visibility toggles
- Export (CSV, Excel)
- Clear sorting

Do not duplicate these controls in a separate toolbar.

---

## Export

- Server-side only.
- Uses the current table state/context (filters, sort).
- CSV and Excel only.

---

## Design Tokens

All shared components follow these locked design tokens.

> **In simple terms:** "Design tokens" are just the approved values for spacing, font sizes, and border radius that every component uses. Think of them as the building code for the UI — everyone uses the same measurements so everything looks consistent.

### Spacing

```
4px, 8px, 12px, 16px, 24px
```

### Border Radius

```
6px, 8px, 12px
```

### Font Sizes

```
12px, 14px, 16px
```

### Transitions

```
0.15s, 0.2s
```

---

## Component Specs

### Button

| Property | Spec |
|----------|------|
| Variants | Primary, Secondary, Danger, Ghost |
| States | Default, Hover, Active, Disabled, Loading |
| Layout | Fixed height, no wrapping, consistent padding |

### Input

| Property | Spec |
|----------|------|
| States | Default, Focus, Error, Disabled |
| Layout | Same height as Button, clean consistent padding |

### Modal

| Property | Spec |
|----------|------|
| Behavior | Centered, dim background, scroll inside |
| Layout | Fixed max width, footer right-aligned |

### Card

| Property | Spec |
|----------|------|
| Layout | Consistent padding, optional hover lift |

### Badge

| Property | Spec |
|----------|------|
| Layout | Small, rounded, inline |
| Use for | Tags, roles, categories, version labels |

### StatusBadge

| Property | Spec |
|----------|------|
| Layout | Pill-shaped with dot indicator |
| Colors | Driven by `--psb-status-*` tokens in `variables.css` |
| Use for | Active/inactive, pending, failed, processing, etc. |

---

## Toast

| Property | Spec |
|----------|------|
| Auto-dismiss | Always |
| Position | Top-right, stack downward, newest on top |
| Hover behavior | Pause timer, expand spacing |
| States | Enter → Visible → Exit |
| Host | Single `GlobalToastHost` instance per app |

---

## Global Rules

### Disabled State

- Lower opacity.
- No interaction (no pointer events).

### Icons

- 16px or 20px.
- Center aligned.
- Use icons to reinforce meaning, not replace labels.
- Keep icon usage consistent for recurring actions across modules.

### Accessibility

- Preserve contrast ratios for text and interactive elements.
- Ensure focus visibility on all interactive components (buttons, inputs, links).
- Use labels on form inputs — do not rely on placeholder text alone.

### Z-Index Layering (Low → High)

> **In simple terms:** Z-index controls what appears on top of what. A dropdown sits below a modal, which sits below a toast notification. This prevents a dropdown from accidentally covering a popup.

1. Dropdown
2. Modal
3. Toast
4. Overlay

### Animation

- No arbitrary timings.
- Use standard transitions (0.15s, 0.2s).

---

## Workflow Toolbar Actions

These are **toolbar-level** actions, not row actions. They follow different rules.

| Action | Semantic Type | UI Variant |
|--------|--------------|------------|
| Approve | Success | Primary |
| Confirm | Primary | Primary |
| Reject | Danger | Danger |
| Void | Danger | Danger |
| Return | Warning | Secondary |
| Recall | Secondary | Secondary |

**Rules:**
- Critical actions must require confirmation.
- Actions must show loading while executing.
- Toolbar actions may use semantic labels like success/warning (unlike row actions which are limited to primary/secondary/danger).
- All actions must be state-driven. Disable actions when not allowed.
- After action: show toast feedback and log for audit.

---

## Visual Styling Rules

### Layout

- All pages render inside the core shell (`AppLayout`). Do not create competing shells.
- Keep module pages focused on domain content.
- Do not reset root body/html styles from module pages.

### Typography

- One consistent body font across the platform.
- Clear heading levels: `h1` for page title, `h2` for section title.

### Spacing

- Use consistent vertical rhythm (8px base).
- Keep container padding and card spacing predictable.

### Color

- Semantic meanings must stay stable: success = completion, warning = caution, danger = destructive.
- Do not use color alone to communicate state.

### State UI

Every module page must handle:
1. Loading state
2. Empty state
3. Error state
4. No-access state

---

## Performance Rules

- Debounce search inputs.
- Use server-side pagination.
- Maximum 500 rows per page.
- Do not load full datasets into table flows.

---

## Extensibility Rules

- Add features via config only — do not fork or duplicate shared components.
- Follow existing patterns.
- If you need a new shared component, propose it and get approval before building it.

---

## Ownership Summary

| Area | Owner |
|------|-------|
| Data | Module |
| Filters | Module |
| Actions | Module |
| UI Rendering | Shared Components |
| UI Rules | Shared Components |

---

## Testing Rules

When testing a module's table integration:

1. Filters must match server behavior — selecting a filter should produce the same results as the Server Action query.
2. Sorting must match backend behavior — the table's sort state should produce the same order as the server.
3. Actions must respect permission and state constraints — disabled/hidden actions should stay that way.

---

## UX Rules

1. No layout shifting — components should not jump around when data loads or state changes.
2. No inconsistent action behavior — the same action type should behave the same way across all modules.
3. No random module-specific interaction patterns — follow the shared patterns documented here.

---

## Do Not

1. Add new UI patterns ad hoc — propose and get approval first.
2. Override shared styles from module code.
3. Create duplicate components that already exist in the shared library.
4. Add inline business logic inside shared UI components.
5. Break action rules (row action types, toolbar semantic mappings).

---

## Component Structure Standards

Every feature page should follow this recommended structure:

```
FeaturePage
  ├── Header block          (page title, breadcrumb)
  ├── Filter/search block   (if needed)
  ├── Content block         (grid, list, or table)
  ├── Action block          (toolbar actions, batch save)
  └── Empty/error block     (shown when data is missing or load fails)
```

Use small composable components rather than one large page component.

---

## Example: Card Grid Pattern

A simple, reusable card grid pattern for modules:

```jsx
function CardGrid({ items }) {
  if (!items.length) {
    return <p>No records found.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => (
        <div key={item.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{item.title}</h3>
          <p>{item.description}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## Long-Term Styling Governance

As module count grows:

1. Keep a shared token strategy for spacing, color, and typography.
2. Review module UI against this guide during code review.
3. Prefer incremental consistency improvements over large visual rewrites.

The goal is not visual rigidity — it's predictable quality and maintainable UX across all modules.

---

## Shared UI Wrapper Components

Core includes wrapper components under `src/shared/components/ui`:

1. Button
2. Card
3. Input
4. Modal
5. Table
6. StatusBadge

**Usage goals:**
- Keep Bootstrap styling consistent across modules by using these wrappers.
- Centralize `psb-ui-*` contracts so changes propagate everywhere.
- Reduce visual divergence between modules.

**Migration note:** Legacy direct React-Bootstrap usage can remain during incremental migration. New code should use the shared wrappers.
