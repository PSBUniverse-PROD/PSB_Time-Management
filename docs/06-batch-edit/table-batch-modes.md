# TableZ Batch Edit Modes

This document covers how TableZ handles batch editing in its three modes, plus the action logic and row behavior rules that apply across all modes.

> **In simple terms:** Batch editing means the user can make multiple changes (add rows, edit rows, delete rows) and then save everything at once with a single "Save" click, instead of saving each change individually.

---

## Quick Summary

| Feature | Without Batch Mode | Internal Batch Mode | External Batch Mode |
|---------|-------------------|-------------------|-------------------|
| Who manages row state? | Module hooks | TableZ (draft/baseline engine) | Module hooks (via `onBatchChange`) |
| Row changes saved when? | Immediately (per action) | All at once (`saveBatch`) | All at once (module save) |
| Row CSS highlighting? | Via `__batchState` on row | Via diff engine (`batchDiff`) | Via `__batchState` on row |
| Undo delete built-in? | Yes, via `onUndoBatchAction` | Yes, `removeRow` toggles `__pendingRemove` | Yes, via `onUndoBatchAction` |
| Used by | Admin modules (Status, App, Card, Company) | Future / data-table examples | Admin modules (legacy `__batchState` flow) |

---

## Mode 1: Without Batch Mode (Default)

This is the mode when `batchMode` is not set (or `false`) on `<TableZ>`.

> **In simple terms:** This is the most common mode. The table just displays data. Your module code handles everything — what happens on edit, delete, save. The table is a dumb screen that shows whatever you give it.

### How Actions Work

```
User clicks action → ActionColumn emits { action, row }
  → tableActions.handleAction receives it
  → Calls action.onClick(row, rowIndex) directly
```

Each action's `onClick` is a module-provided callback. The module decides what to do.

### Row State Management

- The **module hook** stamps `__batchState` on each row (e.g. `"deleted"`, `"created"`, `"updated"`).
- TableZ does NOT manage state — it renders whatever `data` array you pass.

### Row CSS Highlighting

| `__batchState` | CSS Class | Visual |
|----------------|-----------|--------|
| `"created"` | `psb-row-created` | Green highlight |
| `"updated"` | `psb-row-updated` | Blue highlight |
| `"deleted"` | `psb-row-deleted` | Red strikethrough |
| `"hardDeleted"` | `psb-row-deleted` | Red strikethrough |
| `"reordered"` | `psb-row-updated` | Blue highlight |

### Undo Delete

When a row has `__batchState === "deleted"` or `"hardDeleted"` (or `__pendingRemove === true`):

1. ActionColumn automatically **hides all normal actions**.
2. ActionColumn renders a single **"Undo Delete"** button (rotate-left icon, green).
3. Clicking it calls the `onUndoBatchAction(row)` callback passed to `<TableZ>`.

```jsx
<TableZ
  data={decoratedStatuses}
  actions={actions}
  onUndoBatchAction={hook.unstageHardDeleteStatus}
/>
```

---

## Mode 2: Internal Batch Mode (`batchMode={true}`)

This mode activates when `batchMode={true}` and `onBatchChange` is **not** provided. TableZ manages everything internally.

> **In simple terms:** In this mode, you hand the table your data and it handles the rest: tracking which rows were added, edited, or deleted, highlighting changes, and giving you a diff when it's time to save. You don't need to write that logic yourself.

### How Actions Work

```
User clicks action → ActionColumn emits { action, row }
  → tableActions.handleAction enters batchMode branch
  → Infers batch type from action
  → Calls batchApi.removeRow() or batchApi.stageRowChange()
```

The action's `onClick` is **not called** in this mode.

### How Batch Type Is Inferred

`resolveBatchTypeFromAction(action)` checks in order:
1. Explicit `action.batchType` / `action.batchEventType` / `action.mutationType` / `action.intent`
2. Infers from `action.key` + `action.label` text:
   - `/(delete|deactivate|remove|archive)/` → `"delete"`
   - `/(create|add|new)/` → `"create"`
   - `/(edit|update|toggle|enable|disable|save)/` → `"update"`
3. Falls back to `"update"` if nothing matches

### Draft / Baseline / Diff Engine

```
data prop → baseline (frozen snapshot)
         → draft (user edits this)
         → diff = compare(draft, baseline) → highlighting + save payload
```

| Method | What It Does |
|--------|-------------|
| `addRow(newRow)` | Prepends new row with temp ID |
| `removeRow(rowId)` | Toggles `__pendingRemove` (undo-able) |
| `updateRow(rowId, updates)` | Merges updates into draft row |
| `applyReorder(nextRows)` | Replaces entire draft array (for drag-and-drop reordering) |
| `cancelBatch()` | Resets draft to baseline |
| `saveBatch()` | Builds payload, calls `onBatchSave(payload)` |

### Dirty Tracking

The batch engine exposes `hasPendingChanges` — a boolean that is `true` whenever the draft differs from the baseline. Use this to enable/disable Save Batch and Cancel Batch buttons.

### Row CSS (Diff-Based)

| State | CSS Class | Visual |
|-------|-----------|--------|
| New row (temp ID) | `psb-row-new` | Green highlight |
| Modified field | `psb-row-modified` | Blue highlight |
| Pending remove | `psb-row-pending-remove` | Red strikethrough |

Changed cells also get `psb-cell-changed`.

### Save Payload

```js
{
  deleted: [{ id: "row-id" }, ...],
  created: [{ tempId: "tmp-...", data: {...} }, ...],
  updated: [{ id: "row-id", data: {...}, changedColumns: Set }, ...],
}
```

### Usage Example

```jsx
<TableZ
  data={users}
  columns={userColumns}
  rowIdKey="user_id"
  batchMode={true}
  batchFields={[
    { key: "first_name", type: "text" },
    { key: "is_active", type: "boolean" },
  ]}
  actions={[
    { key: "delete-user", label: "Delete", icon: "trash", onClick: () => {} },
  ]}
  onBatchSave={async (payload) => {
    await saveToServer(payload);
  }}
/>
```

---

## Mode 3: External Batch Mode (`batchMode={true}` + `onBatchChange`)

Activates when `batchMode={true}` AND `onBatchChange` is a function. TableZ delegates all state to the module.

### How Actions Work

```
User clicks action → batchMode branch
  → Calls onBatchChange({ type, row, previousRow, action, batchState, rowIndex })
```

The module's `onBatchChange` handler receives every mutation and decides how to update state.

### Row State

Same as without batch mode — module stamps `__batchState` on rows.

---

## ActionColumn Built-In Behaviors (All Modes)

| Behavior | How It Works |
|----------|-------------|
| Action ordering | View(1) → Edit/Cancel(2) → Save/Deactivate/Restore(3) → Delete(4) |
| Action coloring | Icon maps to CSS class (pen=blue, trash=red, ban=amber, rotate-left=green) |
| Confirmation modal | Actions with `type: "danger"` or `confirm: true` show a modal first |
| Visible filtering | Actions with `visible(row)` returning `false` are hidden |
| Disabled state | Actions with `disabled(row)` returning `true` are grayed out |
| Auto-hide on delete | When row is pending removal, all normal actions are hidden |
| Auto-show undo | When row is pending removal and `onUndoBatchAction` exists, undo button appears |

---

## Action Logic: States and Visibility

### Core Row States

- **Active** — default state
- **Editing** — row is being edited
- **Inactive** — soft-deleted (deactivated)

### Action Visibility Matrix

| Action | Active | Editing | Inactive |
|--------|--------|---------|----------|
| View | Yes | No | No |
| Edit | Yes | No | No |
| Cancel | No | Yes | No |
| Deactivate | Yes | No | No |
| Restore | No | No | Yes |
| Delete | Yes | No | Yes (cleanup) |

### Toggle Pairs

- **Edit ↔ Cancel:** Edit enters edit mode, Cancel reverts and exits.
- **Deactivate ↔ Restore:** Deactivate sets `is_active = false`, Restore sets it back to `true`.

### Critical Rules

- Edit and Deactivate are **mutually exclusive** — you can't deactivate a row that's being edited.
- Delete is a hard delete. Only available on active, non-editing rows.

---

## Row Behavior in Batch Mode

### Key Principle: Staging ≠ Locking

When a user stages a change (clicks Deactivate, Edit, or Delete), the row must **stay fully interactive** until "Save Batch" is triggered.

### Required Behavior

1. **Do NOT disable the row** after staging a change. No `disabled`, `opacity`, or `pointer-events: none`.
2. **Replace actions** instead of disabling:
   - Deactivate → row shows **Restore** button
   - Edit → row shows **Cancel** button
   - Delete → row shows **Undo Delete** button
3. **Keep visual highlights** (row coloring, tags) so the user can see what changed.

### Correct Interaction Model

| Action Clicked | What Happens |
|---------------|-------------|
| Deactivate | Stage change → Show **Restore** |
| Restore | Remove staged change → Show **Deactivate** |
| Edit | Enter edit mode → Show **Cancel** |
| Cancel | Exit edit mode → Revert changes |
| Delete | Stage for deletion → Show **Undo Delete** |
| Undo Delete | Remove deletion stage → Show normal actions |

---

## Detailed Action Definitions

### View

- **Purpose:** Read-only access — open details in a modal, page, or drawer.
- **Behavior:** No state change. Just display data.
- **Available:** Active rows only. Not available during editing or when inactive.

### Edit

- **Purpose:** Enter edit mode for a row.
- **Behavior:** Switch row to editing state. Replace display fields with inputs. Store original data snapshot so Cancel can revert.
- **Available:** Active rows only.

### Deactivate

- **Purpose:** Soft delete — disable the record.
- **Behavior:** Set `is_active = false`. Move row to inactive state. Do **NOT** remove from DB.
- **Available:** Active rows only. Not available during editing.

### Restore

- **Purpose:** Undo a deactivation.
- **Behavior:** Set `is_active = true`. Move row back to active state.
- **Available:** Inactive rows only.

### Delete

- **Purpose:** Hard delete — mark for permanent removal.
- **Behavior:** Toggle `__pendingRemove`. Row shows as strikethrough. Undo button appears.
- **Available:** Active and inactive rows (inactive rows can be deleted for cleanup). Not available during editing.
- **Confirmation:** Require a confirmation modal. In the confirmation dialog, **list where this record is being used or referenced by** other records so the user understands the impact.

---

## Action Flow Diagram

```
                        ┌──────────────────────┐
                        │  User clicks action   │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │    ActionColumn       │
                        │  (confirmation modal  │
                        │   if type=danger)     │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  tableActions.js      │
                        │  handleAction()       │
                        └──────────┬───────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                  │
          batchMode=true    batchMode=true     batchMode=false
          (internal)        (external)         (no batch)
                 │                 │                  │
        ┌────────▼──────┐  ┌──────▼────────┐  ┌─────▼──────────┐
        │ batchApi.*    │  │ onBatchChange  │  │ action.onClick  │
        │ removeRow()   │  │ (module hook)  │  │ (module hook)   │
        │ stageRow()    │  │               │  │                 │
        └───────────────┘  └───────────────┘  └─────────────────┘
```

---

## Usage Pattern Examples

### Without Batch Mode (Admin Modules)

```jsx
// Module hook stamps __batchState on rows
const decoratedStatuses = statuses.map((s) => ({
  ...s,
  __batchState: pendingDeleteIds.has(s.status_id) ? "hardDeleted" : null,
}));

// Actions array
const actions = [
  { key: "delete-status", label: "Delete", type: "danger", icon: "trash",
    confirm: true,
    onClick: (row) => stageHardDeleteStatus(row) },
];

// TableZ renders without batchMode
<TableZ
  data={decoratedStatuses}
  actions={actions}
  onUndoBatchAction={unstageHardDeleteStatus}
/>
```

### With Batch Mode (Internal)

```jsx
<TableZ
  data={users}
  columns={userColumns}
  rowIdKey="user_id"
  batchMode={true}
  batchFields={[
    { key: "first_name", type: "text" },
    { key: "is_active", type: "boolean" },
  ]}
  actions={[
    { key: "delete-user", label: "Delete", icon: "trash", onClick: () => {} },
  ]}
  onBatchSave={async (payload) => {
    await saveToServer(payload);
  }}
/>
```
