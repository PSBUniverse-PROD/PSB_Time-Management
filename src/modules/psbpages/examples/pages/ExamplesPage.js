"use client";

import { useCallback, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faChevronUp, faChevronDown, faCopy } from "@fortawesome/free-solid-svg-icons";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  Modal,
  MultiSelectDropdown,
  SearchBar,
  StatusBadge,
  TableZ,
  TABLE_FILTER_TYPES,
  createFilterConfig,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
} from "@/shared/components/ui";
import AppIcon from "@/shared/components/ui/AppIcon";
import styles from "./ExamplesPage.module.css";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const WORKFLOW_ACTIONS = [
  { key: "approve", label: "Approve", type: "success",   critical: false },
  { key: "reject",  label: "Reject",  type: "danger",    critical: true  },
  { key: "return",  label: "Return",  type: "warning",   critical: false },
  { key: "recall",  label: "Recall",  type: "secondary", critical: false },
  { key: "void",    label: "Void",    type: "danger",    critical: true  },
  { key: "confirm", label: "Confirm", type: "primary",   critical: false },
];

const STATUS_OPTIONS = [
  { label: "Active",    value: "active"    },
  { label: "Pending",   value: "pending"   },
  { label: "Inactive",  value: "inactive"  },
  { label: "Suspended", value: "suspended" },
];

const DEMO_STATUS_OPTIONS = STATUS_OPTIONS.length > 0
  ? STATUS_OPTIONS
  : [
      { label: "Active", value: "active" },
      { label: "Pending", value: "pending" },
      { label: "Inactive", value: "inactive" },
      { label: "Suspended", value: "suspended" },
    ];

// `TEAM_OPTIONS` defined later in the file is used for forms and demos —
// remove duplicate here and rely on the centralized definition further down.

const TABLE_SOURCE_ROWS = [
  { id: 1, employee_code: "EMP-1101", full_name: "Avery Nguyen",   email: "avery.nguyen@psbuniverse.local",   team: "Platform",   role: "admin",   status: "active",    created_at: "2026-03-22" },
  { id: 2, employee_code: "EMP-1102", full_name: "Jordan Patel",   email: "jordan.patel@psbuniverse.local",   team: "Risk",       role: "manager", status: "pending",   created_at: "2026-03-18" },
  { id: 3, employee_code: "EMP-1103", full_name: "Riley Walker",   email: "riley.walker@psbuniverse.local",   team: "Operations", role: "analyst", status: "inactive",  created_at: "2026-03-11" },
  { id: 4, employee_code: "EMP-1104", full_name: "Morgan Torres",  email: "morgan.torres@psbuniverse.local",  team: "Finance",    role: "viewer",  status: "suspended", created_at: "2026-03-06" },
  { id: 5, employee_code: "EMP-1105", full_name: "Taylor Lopez",   email: "taylor.lopez@psbuniverse.local",   team: "Support",    role: "manager", status: "active",    created_at: "2026-02-28" },
  { id: 6, employee_code: "EMP-1106", full_name: "Casey Johnson",  email: "casey.johnson@psbuniverse.local",  team: "Audit",      role: "analyst", status: "pending",   created_at: "2026-02-21" },
];
const SETUP_TABLE_ROWS = [
  { status_id: "run-queued", status_name: "Queued", status_description: "Waiting to start", display_color: "#64748B", display_order: 10, is_active: true },
  { status_id: "run-active", status_name: "In Progress", status_description: "Currently running", display_color: "#2563EB", display_order: 20, is_active: true },
  { status_id: "run-complete", status_name: "Complete", status_description: "Finished successfully", display_color: "#16A34A", display_order: 30, is_active: true },
  { status_id: "run-paused", status_name: "Paused", status_description: "Temporarily stopped", display_color: "#D97706", display_order: 40, is_active: false },
];

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

const SNIPPET_IMPORT = `import { TableZ, Button, Input, Modal, Badge, SearchBar, Dropdown, toastSuccess } from "@/shared/components/ui";`;

const SNIPPET_TABLE_BASIC = `import { TableZ } from "@/shared/components/ui";

<TableZ
  data={rows}
  columns={columns}
  state={tableState}
  filterConfig={filterConfig}
  actions={actions}
  variant="setup"
  loading={loading}
  onChange={handleTableChange}
/>`;

const SNIPPET_TABLE_STATE = `const [tableState, setTableState] = useState({
  filters: {},
  sorting: { key: "created_at", direction: "desc" },
  pagination: { page: 1, pageSize: 10, total: 0 },
  columnVisibility: {},
  columnSizing: {},
});`;

const SNIPPET_TABLE_DATABIND = `// --- FULL END-TO-END: How data flows from Database to your Table ---
//
// This shows the COMPLETE journey of data in a real module.
// Read each layer top to bottom â€” this is the exact pattern every module follows.
//
// DATA SOURCE
//   Table: psb_s_appcard (Supabase)
//   Columns: card_id (PK), group_id (FK), card_name, card_desc,
//            route_path, icon, display_order, is_active
//
// LAYER STACK (each layer has ONE job)
//   1. Server Action â€“ "use server" file, queries Supabase, returns data
//   2. Page          â€“ server component, calls action, passes data to View
//   3. View          â€“ "use client" component, renders TableZ with data

// -- 1. SERVER ACTION -- data/cardModuleSetup.actions.js
"use server";
import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function loadCards(groupId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_appcard")
    .select("*")
    .eq("group_id", groupId)
    .order("display_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCard(payload) {
  const cardName = String(payload?.card_name ?? "").trim();
  if (!cardName) throw new Error("Card name is required.");
  if (!payload?.group_id) throw new Error("Group ID is required.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_appcard")
    .insert({
      group_id: payload.group_id,
      card_name: cardName,
      card_desc: payload?.card_desc ?? "",
      route_path: payload?.route_path ?? "#",
      icon: payload?.icon ?? "table-cells-large",
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// -- 2. PAGE -- pages/CardModuleSetupPage.js (server component)
import { loadCards } from "../data/cardModuleSetup.actions";
import CardModuleSetupView from "./CardModuleSetupView.jsx";

export default async function CardModuleSetupPage() {
  const cards = await loadCards();
  return <CardModuleSetupView seedCards={cards} />;
}

// -- 3. VIEW -- pages/CardModuleSetupView.jsx ("use client")
const selectedGroupCards = useMemo(() =>
  allCards
    .filter((card) => card.group_id === selectedGroup?.group_id)
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)),
  [allCards, selectedGroup?.group_id],
);

const cardColumns = useMemo(() => [
  { key: "display_order", label: "Order",  sortable: false, width: 80 },
  { key: "card_name",     label: "Card",   sortable: true,  width: 200 },
  { key: "route_path",    label: "Route",  sortable: false, width: 200 },
  {
    key: "is_active",
    label: "Active",
    width: 100,
    render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
  },
], []);

<TableZ
  columns={cardColumns}
  data={selectedGroupCards}
  rowIdKey="card_id"
  actions={cardActions}
  emptyMessage="No cards in this group."
  draggable={true}
  onReorder={handleCardReorder}
/>`;

const SNIPPET_TABLE_FILTERS_HARDCODE = `// Hardcoded filter items (use when options are fixed/known at build time)
//
// Real example: Card Module Setup â€” filter cards by active status
const filterConfig = createFilterConfig([
  {
    key: "is_active",
    label: "Status",
    type: TABLE_FILTER_TYPES.SELECT,
    options: [
      { label: "Active",   value: true  },
      { label: "Inactive", value: false },
    ],
  },
]);`;

const SNIPPET_TABLE_FILTERS_DATABIND = `// Databind filter items from Server Action (use when options come from the database)
//
// Real example: User Master Setup â€” role filter loaded from psb_s_app_roles
// Server Action: loadRoleOptions() in data/userMaster.actions.js
//
// Action returns: [{ role_id: 1, role_name: "Admin" }, ...]
const [roleOptions, setRoleOptions] = useState([]);

useEffect(() => {
  let active = true;
  async function load() {
    const roles = await loadRoleOptions();
    if (!active) return;
    setRoleOptions(roles.map((role) => ({
      label: role.role_name,
      value: role.role_id,
    })));
  }
  load();
  return () => { active = false; };
}, []);

const filterConfig = createFilterConfig([
  {
    key: "role_id",
    label: "Role",
    type: TABLE_FILTER_TYPES.SELECT,
    options: roleOptions,   // â† populated from the Server Action
  },
  {
    key: "created_at",
    label: "Created Date",
    type: TABLE_FILTER_TYPES.DATERANGE,
    // No options needed â€” date range uses a date picker
  },
]);`;

const SNIPPET_TABLE_COLUMNS = `// Real example: Card Module Setup â€” card groups table columns
// Source table: psb_m_appcardgroup
// Columns map directly to database fields
const groupColumns = useMemo(() => [
  // "Order" shows the display_order field (drag-to-reorder sets this)
  { key: "display_order", label: "Order",       sortable: false, width: 80  },
  // "Group Name" is the primary identifier
  { key: "group_name",    label: "Group Name",  sortable: true,  width: 220 },
  // "Description" is optional context
  { key: "group_desc",    label: "Description", sortable: false, width: 250 },
  // "Icon" â€” hidden by default, available via Customize Table panel
  { key: "icon",          label: "Icon",        sortable: false, width: 120, defaultVisible: false },
  // "Active" - render with StatusBadge for visual status
  {
    key: "is_active",
    label: "Active",
    sortable: false,
    width: 100,
    render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
  },
], []);

// Column options:
//   key            â€” matches the field name in the row object (from DB)
//   label          â€” column header text
//   sortable       â€” enables click-to-sort on this column
//   width          â€” pixel width
//   defaultVisible â€” set to false to hide on first render (still in Customize panel)
//   render         â€” custom cell renderer: (row) => ReactNode`;

const SNIPPET_TABLE_ACTIONS = `// Real example: Card Module Setup â€” row actions for the card groups table
// Actions appear as a dropdown in the leftmost "Actions" column
//
// Each action needs: key, label, type, onClick
// Optional: visible, disabled, confirm, confirmMessage, icon
const groupActions = useMemo(() => [
  {
    key: "edit",
    label: "Edit",
    type: "primary",           // primary | secondary | danger
    icon: "pen",              // Font Awesome icon name
    onClick: (row) => {
      // Open edit dialog pre-filled with this group's data
      setDialog({ kind: "edit-group", groupId: row.group_id });
      setGroupDraft({
        name: row.group_name,
        desc: row.group_desc || "",
        icon: row.icon || "",
      });
    },
  },
  {
    key: "deactivate",
    label: "Deactivate",
    type: "danger",
    icon: "trash",
    // Only show for active, non-pending groups
    visible: (row) => row.is_active && !isTempGroupId(row.group_id),
    // Confirm dialog before executing
    confirm: true,
    confirmMessage: (row) => \`Deactivate group "\${row.group_name}"?\`,
    onClick: (row) => {
      // Add to batch deactivation list (saved on "Save Batch")
      setPendingBatch((prev) => ({
        ...prev,
        groupDeactivations: [...prev.groupDeactivations, row.group_id],
      }));
    },
  },
], []);

// Action type determines button color:
//   "primary"   ? blue
//   "secondary" ? gray
//   "danger"    ? red`;

const SNIPPET_TABLE_ONCHANGE = `// onChange receives ALL table events through a single channel.
// event.type tells you what happened. Switch on it.
//
// Real example from: useDataTableModuleController.js (Data Table Example)
//
// Event types emitted by <TableZ />:
//   "search"           ? user typed in the search bar
//   "filters"          ? user changed a filter dropdown / date range
//   "sorting"          ? user clicked a sortable column header
//   "pagination"       ? user changed page or page size
//   "action"           ? user clicked a row action button
//   "export"           ? user clicked CSV/Excel export
//   "columnVisibility" ? user toggled a column in Customize panel
//   "columnResize"     ? user resized a column by dragging

function handleTableChange(event) {
  switch (event.type) {
    case "search":
      // event.value = search string
      setTableState((prev) => ({
        ...prev,
        filters: { ...prev.filters, search: event.value },
        pagination: { ...prev.pagination, page: 1 },
      }));
      break;

    case "filters":
      // event.filters = full filter object from filter bar
      setTableState((prev) => ({
        ...prev,
        filters: event.filters,
        pagination: { ...prev.pagination, page: 1 },
      }));
      break;

    case "sorting":
      // event.sorting = { key: "column_key", direction: "asc" | "desc" }
      setTableState((prev) => ({
        ...prev,
        sorting: event.sorting,
        pagination: { ...prev.pagination, page: 1 },
      }));
      break;

    case "pagination":
      // event.pagination = { page: number, pageSize: number }
      setTableState((prev) => ({
        ...prev,
        pagination: { ...prev.pagination, ...event.pagination },
      }));
      break;

    case "action":
      // event.action = the action config object
      // event.row = the row data object
      event.action.onClick(event.row);
      break;

    case "export":
      // event.format = "csv" | "excel"
      callExportApi(event.format);
      break;

    case "columnVisibility":
      // event.columnVisibility = { columnKey: boolean }
      setTableState((prev) => ({
        ...prev,
        columnVisibility: event.columnVisibility,
      }));
      break;
  }
}`;

const SNIPPET_BUTTON = `import { Button } from "@/shared/components/ui";

// Variants determine the visual style and semantic meaning:
//   "primary"   ? main action (Save, Submit, Approve)
//   "primary"   → main CTA, save actions (blue)
//   "success"   → creation / add actions (green)
//   "secondary" → secondary action (Cancel, Back, Reset)
//   "warning"   → reversible caution (Deactivate, Disable)
//   "danger"    → destructive action (Delete, Remove permanently)
//   "restore"   → recovery action (Restore, Re-enable)
//   "ghost"     → subtle/text-only action (Help, View Details)

// Real example: Card Module Setup batch save toolbar
<Button variant="primary" loading={isSaving} onClick={handleSaveBatch}>
  Save Batch ({pendingSummary.total})
</Button>
<Button variant="ghost" onClick={handleCancelBatch} disabled={isSaving}>
  Cancel
</Button>

// Real example: Modal footer with add flow
<Button variant="ghost" onClick={closeDialog} disabled={isMutatingAction}>
  Cancel
</Button>
<Button variant="success" loading={isMutatingAction} onClick={handleConfirmAddGroup}>
  Add Group
</Button>

// Disabled state â€” prevents all interaction
<Button variant="primary" disabled>Disabled</Button>`;

const SNIPPET_INPUT = `import { Input } from "@/shared/components/ui";

// Real example: Card Module Setup â€” Add Card Group dialog form fields
// Draft state holds the form values
const [groupDraft, setGroupDraft] = useState({ name: "", desc: "", icon: "" });

// Group name input â€” required field
<Input
  value={groupDraft.name}
  onChange={(e) => setGroupDraft((prev) => ({ ...prev, name: e.target.value }))}
  placeholder="Enter group name"
  isInvalid={!groupDraft.name.trim()}   // red border when empty
/>

// Description input â€” optional field
<Input
  value={groupDraft.desc}
  onChange={(e) => setGroupDraft((prev) => ({ ...prev, desc: e.target.value }))}
  placeholder="Optional description"
/>

// Read-only display (e.g. showing a generated ID)
<Input value="GRP-10042" disabled />`;

const SNIPPET_SEARCHBAR = `import { SearchBar } from "@/shared/components/ui";

// SearchBar debounces input so API calls don't fire on every keystroke.
// onDebouncedChange fires after the user stops typing for debounceMs.
//
// Real example: Data Table Example â€” search bar triggers table reload
<SearchBar
  value={tableState.filters?.search || ""}
  debounceMs={350}
  placeholder="Search code, name, team, role, status"
  onDebouncedChange={(nextValue) => {
    // Update table state ? triggers data re-fetch
    setTableState((prev) => ({
      ...prev,
      filters: { ...prev.filters, search: nextValue },
      pagination: { ...prev.pagination, page: 1 },
    }));
  }}
/>`;

const SNIPPET_DROPDOWN_BASIC = `import { Dropdown } from "@/shared/components/ui";

// Basic dropdown â€” static menu items, click handlers
// Used for: row action menus, toolbar option menus
<Dropdown>
  <Dropdown.Toggle variant="secondary" size="sm">
    Actions
  </Dropdown.Toggle>
  <Dropdown.Menu>
    <Dropdown.Item onClick={handleEdit}>Edit</Dropdown.Item>
    <Dropdown.Item onClick={handleDuplicate}>Duplicate</Dropdown.Item>
    <Dropdown.Divider />
    <Dropdown.Item onClick={handleDeactivate}>Deactivate</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>`;

const SNIPPET_DROPDOWN_DATABIND = `// Databind dropdown from Server Action
//
// Real example: Card Module Setup â€” Application Selector
// Data source: psb_s_application table
// Server Action: loadApplications() in data/cardModuleSetup.actions.js
//
// The Page (server component) loads applications and passes them as props:
//   const applications = await loadApplications();
//   return <CardModuleSetupView seedApplications={applications} />;
//
// View (client component) binds to Dropdown:
const [selectedApp, setSelectedApp] = useState(null);

<Dropdown>
  <Dropdown.Toggle variant="secondary" size="sm">
    {selectedApp?.app_name || "Select Application"}
  </Dropdown.Toggle>
  <Dropdown.Menu>
    {applications.map((app) => (
      <Dropdown.Item
        key={app.app_id}
        onClick={() => setSelectedApp(app)}
      >
        {app.app_name}
      </Dropdown.Item>
    ))}
  </Dropdown.Menu>
</Dropdown>`;

const SNIPPET_DROPDOWN_HARDCODE = `// Hardcoded combo items (use when options are known at build time)
//
// Real example: status filter options for a table
const statusItems = [
  { label: "Active",    value: "active"    },
  { label: "Pending",   value: "pending"   },
  { label: "Inactive",  value: "inactive"  },
  { label: "Suspended", value: "suspended" },
];

<Dropdown.Menu>
  {statusItems.map((item) => (
    <Dropdown.Item key={item.value} onClick={() => onSelect(item.value)}>
      {item.label}
    </Dropdown.Item>
  ))}
</Dropdown.Menu>`;

const SNIPPET_INPUT_VALIDATION = `// Input with validation â€” show error only after user interaction
//
// Real example: Card Module Setup â€” validate group name before saving
const [groupDraft, setGroupDraft] = useState({ name: "", desc: "", icon: "" });
const [touched, setTouched] = useState(false);
const nameError = touched && !groupDraft.name.trim();

<Input
  value={groupDraft.name}
  onChange={(e) => setGroupDraft((prev) => ({ ...prev, name: e.target.value }))}
  onBlur={() => setTouched(true)}           // mark as touched on blur
  placeholder="Group Name"
  isInvalid={nameError}                     // red border when empty + touched
/>
{nameError && <p className="field-error">Group name is required.</p>}

// In the submit handler:
const handleConfirmAddGroup = () => {
  setTouched(true);
  if (!groupDraft.name.trim()) {
    toastError("Group name is required.", "Validation");
    return;
  }
  // ... proceed with API call
};`;

const SNIPPET_MODAL = `import { Modal, Button } from "@/shared/components/ui";

// Modal is used for: confirmation dialogs, add/edit forms, workflow actions
//
// Real example: Card Module Setup â€” Add Card Group dialog
const [dialog, setDialog] = useState({ kind: null });
const [isMutatingAction, setIsMutatingAction] = useState(false);

<Modal
  show={dialog.kind === "add-group"}
  onHide={() => setDialog({ kind: null })}
  title="Add Card Group"
  footer={
    <>
      <Button variant="ghost" onClick={() => setDialog({ kind: null })} disabled={isMutatingAction}>
        Cancel
      </Button>
      <Button variant="primary" loading={isMutatingAction} onClick={handleConfirmAddGroup}>
        Add Group
      </Button>
    </>
  }
>
  <Input
    value={groupDraft.name}
    onChange={(e) => setGroupDraft((prev) => ({ ...prev, name: e.target.value }))}
    placeholder="Group Name"
  />
  <Input
    value={groupDraft.desc}
    onChange={(e) => setGroupDraft((prev) => ({ ...prev, desc: e.target.value }))}
    placeholder="Description (optional)"
  />
</Modal>`;

const SNIPPET_SEARCHBAR_WITH_API = `// SearchBar with server-side search (for large datasets)
//
// Real example: Data Table Example â€” server-side search via Server Action
// Server Action: loadEmployees() in data/dataTableExample.actions.js
//
// The view calls the Server Action when filters change:
const loadData = useCallback(async () => {
  setLoading(true);
  try {
    const result = await loadEmployees({
      page: tableState.pagination.page,
      pageSize: tableState.pagination.pageSize,
      search: tableState.filters?.search || "",
      sortKey: tableState.sorting?.key || "",
      sortDir: tableState.sorting?.direction || "",
      filters: tableState.filters,
    });

    setRows(result.rows || []);
    setTableState((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, total: result.total || 0 },
    }));
  } finally {
    setLoading(false);
  }
}, [tableState.filters, tableState.sorting, tableState.pagination.page, tableState.pagination.pageSize]);

// The SearchBar is built into <TableZ /> via searchPlaceholder prop,
// OR you can use it standalone:
<SearchBar
  value={search}
  debounceMs={350}
  placeholder="Search employees..."
  onDebouncedChange={(next) => {
    setSearch(next);
    loadData(next);
  }}
/>`;

const SNIPPET_MODAL_SAVE_FLOW = `// Modal with full save-to-server flow
//
// Real example: Card Module Setup â€” Add Card Group via Server Action
// Server Action: createCardGroup() in data/cardModuleSetup.actions.js
//
import { createCardGroup } from "../data/cardModuleSetup.actions";

const [dialog, setDialog] = useState({ kind: null });
const [isMutatingAction, setIsMutatingAction] = useState(false);
const [groupDraft, setGroupDraft] = useState({ name: "", desc: "", icon: "" });

const handleConfirmAddGroup = async () => {
  const groupName = groupDraft.name.trim();
  if (!groupName) {
    toastError("Group name is required.", "Validation");
    return;
  }

  setIsMutatingAction(true);
  try {
    await createCardGroup({
      app_id: selectedApp.app_id,
      group_name: groupName,
      group_desc: groupDraft.desc.trim(),
      icon: groupDraft.icon.trim() || "layer-group",
    });

    toastSuccess("Card group added.", "Add Group");
    setDialog({ kind: null });
    setGroupDraft({ name: "", desc: "", icon: "" });
  } catch (err) {
    toastError(err.message, "Error");
  } finally {
    setIsMutatingAction(false);
  }
};

<Modal
  show={dialog.kind === "add-group"}
  onHide={() => !isMutatingAction && setDialog({ kind: null })}
  title="Add Card Group"
  footer={
    <>
      <Button variant="ghost" onClick={() => setDialog({ kind: null })} disabled={isMutatingAction}>
        Cancel
      </Button>
      <Button variant="primary" loading={isMutatingAction} onClick={handleConfirmAddGroup}>
        Add Group
      </Button>
    </>
  }
>
  <Input value={groupDraft.name} onChange={(e) => setGroupDraft(p => ({...p, name: e.target.value}))} placeholder="Group Name" />
  <Input value={groupDraft.desc} onChange={(e) => setGroupDraft(p => ({...p, desc: e.target.value}))} placeholder="Description" />
</Modal>`;

const SNIPPET_BADGE = `import { StatusBadge } from "@/shared/components/ui";

// StatusBadge renders a token-driven pill badge for status values.
// Supported statuses: active, inactive, pending, processing,
// completed, failed, cancelled, archived, draft, suspended.
//
// Real example: Card Module Setup - is_active column renderer
{
  key: "is_active",
  label: "Active",
  width: 100,
  render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
}

// Custom label override
<StatusBadge status="active" label="Enabled" />`;
const SNIPPET_TOAST = `import { toastSuccess, toastError, toastWarning, toastInfo } from "@/shared/components/ui";

// Toast shows temporary notification messages in the top-right corner.
// GlobalToastHost is already mounted once in the app layout â€” do NOT add it again.
//
// Real examples from Card Module Setup:
//
// After batch save succeeds:
toastSuccess(\`Saved \${pendingSummary.total} batched change(s).\`, "Save Batch");

// After an API call fails:
toastError(error?.message || "Failed to save batched changes.", "Error");

// After adding a card to pending batch:
toastSuccess("Card added to batch.", "Add Card");

// Warning for unsaved changes:
toastWarning("You have unsaved changes.", "Warning");

// Informational message:
toastInfo("Drag rows to reorder.", "Tip");

// Signature: toastSuccess(message, title?)
// All four variants: toastSuccess, toastError, toastWarning, toastInfo`;

const SNIPPET_CARD_SURFACE = `import { Card } from "@/shared/components/ui";

// Card is a container surface with optional title, subtitle, and toolbar.
// Used to wrap tables, forms, and content sections on setup pages.
//
// Real example: Card Module Setup â€” left panel wraps Card Groups table
<Card
  title="Card Groups"
  subtitle="Drag rows to reorder groups"
  toolbar={
    <Button size="sm" variant="primary" onClick={() => setDialog({ kind: "add-group" })}>
      <FontAwesomeIcon icon={faPlus} /> Add Group
    </Button>
  }
>
  <TableZ
    columns={groupColumns}
    data={decoratedAppGroups}
    rowIdKey="group_id"
    actions={groupActions}
    emptyMessage="No card groups for this application."
    draggable={!isSaving}
    onReorder={handleGroupReorder}
  />
</Card>

// Props:
//   title    (string)    â€” Card header text
//   subtitle (string)    â€” Smaller text below title
//   toolbar  (ReactNode) â€” Right-aligned header content (buttons, etc.)
//   children (ReactNode) â€” Card body content`;

const SNIPPET_TOKENS = `/* Design tokens \u2014 from src/styles/variables.css */

/* Spacing */
--psb-space-4  --psb-space-8  --psb-space-12
--psb-space-16 --psb-space-24

/* Radius */
--psb-radius-6  --psb-radius-8  --psb-radius-12

/* Font size */
--psb-font-12  --psb-font-14  --psb-font-16

/* Transitions */
--psb-transition-150  --psb-transition-200`;

const SNIPPET_MODULE_STRUCTURE = `src/modules/my-module/
  index.js                    â† Module identity + routes
  data/
    myModule.actions.js       â† "use server" â€” all DB calls go here
    myModule.data.js          â† Client-safe helpers (optional)
  pages/
    MyModulePage.js            â† Server entry: loads data, renders view
    MyModuleView.jsx           â† "use client" â€” all UI, hooks, state`;

const SNIPPET_MODULE_MANIFEST = `// index.js â€” this is your module's registration file.
// The module loader reads this to know your module exists.
//
// key        â†’ unique slug (used in URLs)
// module_key â†’ must match a module_key in psb_s_application (ask your senior)
// routes     â†’ page: string name that maps to a file in pages/

const myModule = {
  key: "my-module",
  module_key: "my-app",         // â† ask your senior for this value
  name: "My Module",
  description: "My Module application.",
  icon: "table-cells",
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,
  routes: [
    { path: "/my-module", page: "MyModulePage" },
  ],
};

export default myModule;`;

const SNIPPET_MODULE_BUILD_SEQUENCE = `1. Run: npm run create-module -- my-module
2. Update index.js with correct module_key (ask your senior)
3. Register app in psb_s_application table (if it doesn't exist)
4. Create groups in psb_m_appcardgroup
5. Create cards in psb_s_appcard
6. Assign role access in psb_m_appcardroleaccess
7. Write Server Actions in data/*.actions.js
8. Build your Page (server) + View (client) in pages/
9. Apply card access checks with hasCardAccess()
10. Test with authorized and unauthorized users
11. Run npm run build â€” must pass clean`;

const SNIPPET_CRUD_SERVER_ACTIONS = `// data/roles.actions.js â€” "use server"
// ALL database access goes here. No other file calls Supabase.
"use server";
import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function loadRoles() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_role")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRole({ name, description }) {
  if (!name?.trim()) throw new Error("Role name is required.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_role")
    .insert({
      role_name: name.trim(),
      role_desc: description?.trim() ?? "",
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateRole({ id, name, description, isActive }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_role")
    .update({
      role_name: name?.trim(),
      role_desc: description?.trim(),
      is_active: isActive,
    })
    .eq("role_id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRole(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("psb_s_role")
    .delete()
    .eq("role_id", id);

  if (error) throw new Error(error.message);
  return true;
}

// Rule: View â†’ Server Action â†’ Supabase. That's it.
// No model, no repo, no service, no hook files needed.`;

const SNIPPET_ROLES_STRUCTURE = `src/modules/admin/roles/
  index.js                    â† Module identity + routes
  data/
    roles.actions.js          â† "use server" â€” all DB calls (CRUD)
    roles.data.js             â† Client-safe helpers (optional)
  pages/
    RolesPage.js              â† Server entry: loads data, renders view
    RolesView.jsx             â† "use client" â€” all UI, hooks, state`;

const SNIPPET_ROLES_ACTIONS = `// data/roles.actions.js
"use server";
import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function loadRoles() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_role")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRole({ name, description }) {
  if (!name?.trim()) throw new Error("Role name is required.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_role")
    .insert({ role_name: name.trim(), role_desc: description?.trim() ?? "", is_active: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}`;

const SNIPPET_ROLES_PAGE = `// pages/RolesPage.js â€” SERVER COMPONENT (no "use client")
// This runs on the server. It loads data and passes it to the View.

import { loadRoles } from "../data/roles.actions";
import RolesView from "./RolesView.jsx";

export default async function RolesPage() {
  const roles = await loadRoles();
  return <RolesView seedRoles={roles} />;
}`;

const SNIPPET_ROLES_VIEW = `// pages/RolesView.jsx â€” CLIENT COMPONENT ("use client")
// All UI, state, and event handlers go here.

"use client";

import { useState } from "react";
import { createRole, deleteRole } from "../data/roles.actions";
import { Card, Button, Modal, Input, StatusBadge } from "@/shared/components/ui";
import { toastSuccess, toastError } from "@/shared/utils/toast";

export default function RolesView({ seedRoles }) {
  const [roles, setRoles] = useState(seedRoles);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      const role = await createRole({ name });
      setRoles((prev) => [role, ...prev]);
      toastSuccess("Role created.");
      setShowAdd(false);
      setName("");
    } catch (err) {
      toastError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.role_id !== id));
      toastSuccess("Role deleted.");
    } catch (err) {
      toastError(err.message);
    }
  }

  return (
    <div className="container mt-4">
      <Card title="Roles" toolbar={
        <Button variant="success" onClick={() => setShowAdd(true)}>Add Role</Button>
      }>
        {roles.map((role) => (
          <div key={role.role_id} className="d-flex justify-content-between p-2 border-bottom">
            <span>{role.role_name}</span>
            <StatusBadge status={role.is_active ? "active" : "inactive"} />
          </div>
        ))}
      </Card>
      <Modal show={showAdd} onHide={() => setShowAdd(false)} title="Add Role" footer={
        <>
          <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleAdd}>Save</Button>
        </>
      }>
        <Input placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </div>
  );
}`;

const SNIPPET_ROLES_INDEX = `// index.js â€” module manifest
// The module loader scans for this file to register your module.
// Run: npm run create-module -- admin/roles

const rolesModule = {
  key: "roles",
  module_key: "roles-app",     // â† must match psb_s_application.module_key
  name: "Roles",
  description: "Manage user roles and permissions.",
  icon: "shield-halved",
  group_name: "Admin",
  group_desc: "Admin modules.",
  order: 100,
  routes: [
    { path: "/admin/roles", page: "RolesPage" },
  ],
};

export default rolesModule;`;

const SNIPPET_MODULE_DEPLOY_CHECKLIST = `Before release:
- Build passes (npm run build)
- Lint passes (npm run lint)
- Module structure: index.js + data/ + pages/
- module_key matches psb_s_application
- Login/session flow verified
- Unauthorized route access blocked
- Dashboard visibility verified for multiple users
- Module cards verified against role mappings
- No hardcoded role names/permissions
- All DB access in data/*.actions.js with "use server"
- No API routes created (src/app/api/...)
- Table row action types use only: primary | secondary | danger`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getStatusBadge() {
  // DEPRECATED: kept as placeholder; use <StatusBadge status="..." /> instead.
  return { bg: "secondary", text: "light" };
}

async function copyText(text) {
  const v = String(text || "");
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(v); return true; } catch { /* fall through */ }
  }
  if (typeof document === "undefined") return false;
  const el = document.createElement("textarea");
  el.value = v;
  el.setAttribute("readonly", "readonly");
  el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el);
  el.select();
  el.setSelectionRange(0, el.value.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  return ok;
}

function toButtonVariantByType(type) {
  if (type === "danger") return "danger";
  if (type === "secondary" || type === "warning") return "secondary";
  return "primary";
}

// ---------------------------------------------------------------------------
// Primitive components
// ---------------------------------------------------------------------------

function Snippet({ title, code }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };
  return (
    <div className={styles.snippet}>
      <div className={styles.snippetHeader}>
        <span className={styles.snippetTitle}>{title}</span>
        <button
          type="button"
          onClick={handle}
          className={[styles.copyBtn, copied ? styles.copyBtnDone : ""].filter(Boolean).join(" ")}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={styles.codeBlock}><code>{code}</code></pre>
    </div>
  );
}

function ExampleBlock({ title, when, children, snippet, snippetTitle, rules }) {
  return (
    <div className={styles.exampleBlock}>
      {title ? <p className={styles.exampleTitle}>{title}</p> : null}
      {when  ? <p className={styles.exampleWhen}>{when}</p>   : null}
      <div className={styles.examplePreview}>{children}</div>
      {snippet ? <Snippet title={snippetTitle || "Usage"} code={snippet} /> : null}
      {rules ? (
        <ul className={styles.exampleRules}>
          {rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function StepBar({ steps, active, onChange }) {
  return (
    <div className={styles.stepBar} role="tablist">
      {steps.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={active === s.id}
          className={[styles.stepTab, active === s.id ? styles.stepTabActive : ""].filter(Boolean).join(" ")}
          onClick={() => onChange(s.id)}
        >
          <span className={styles.stepNum}>{i + 1}</span>
          <span className={styles.stepLabel}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function Accordion({ items }) {
  const [openKey, setOpenKey] = useState(items[0]?.key || "");
  return (
    <div className={styles.accordion}>
      {items.map((item) => {
        const isOpen = openKey === item.key;
        return (
          <div key={item.key} className={[styles.accordionItem, isOpen ? styles.accordionItemOpen : ""].filter(Boolean).join(" ")}>
            <button
              type="button"
              className={styles.accordionHeader}
              onClick={() => setOpenKey(isOpen ? "" : item.key)}
              aria-expanded={isOpen}
            >
              <span>{item.title}</span>
              <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} aria-hidden="true" />
            </button>
            {isOpen ? <div className={styles.accordionBody}>{item.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function RefPropRow({ prop, required, type, desc }) {
  return (
    <div className={styles.propRow}>
      <div className={styles.propLeft}>
        <span className={styles.propName}>{prop}</span>
        <span className={[styles.propBadge, required ? styles.propBadgeReq : styles.propBadgeOpt].filter(Boolean).join(" ")}>
          {required ? "required" : "optional"}
        </span>
      </div>
      <span className={styles.propType}>{type}</span>
      <span className={styles.propDesc}>{desc}</span>
    </div>
  );
}

function PatternToggle({ modes, active, onChange }) {
  return (
    <div className={styles.patternToggle}>
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={[styles.patternBtn, active === m.id ? styles.patternBtnActive : ""].filter(Boolean).join(" ")}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Start tab
// ---------------------------------------------------------------------------

const MODULE_CREATION_STEPS = [
  {
    key: "step-0",
    title: "Step 0: How the Project Works",
    content: (
      <div className={styles.refBody}>
        <p className={styles.stepNote}>
          Before writing any code, understand how the project is organized. This is a <strong>Next.js App Router</strong> project
          with <strong>Supabase</strong> as the database. Here is how the folders map to responsibilities:
        </p>
        <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
          <pre style={{ fontSize: "0.85rem", overflow: "auto", margin: 0 }}>{`PSBUniverse-core/
  src/
    app/                        â† Next.js routing (auto-generated â€” DO NOT EDIT)
      admin/                    â† Admin page routes
        <module>/page.js        â† Auto-generated by scripts/generate-routes.js
      psbpages/                 â† System page routes (dashboard, login, etc.)

    modules/                    â† All your code lives here
      admin/                    â† Admin modules
        application-setup/      â† Each module follows the same structure:
          index.js              â†   Module identity + routes
          data/                 â†   Server Actions ("use server" â€” DB calls)
          pages/                â†   Page (server) + View (client)
      psbpages/                 â† System modules (dashboard, login, etc.)

    core/                       â† Framework code (DO NOT modify)
      auth/                     â† Login, session, RBAC, access gates
      supabase/                 â† Database client setup (admin + browser)
      layout/                   â† App shell (navbar, sidebar)

    shared/                     â† Reusable UI components
      components/ui/            â† TableZ, TableX, Button, Input, Modal, Badge, etc.
      utils/                    â† toast.js, navbar-loader.js

  scripts/
    create-module.js            â† npm run create-module -- my-module
    generate-routes.js          â† Auto-generates src/app/ route files`}</pre>
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <p className={styles.ruleHeading}>How a Page Request Works</p>
          <pre style={{ fontSize: "0.85rem", overflow: "auto", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>{`User visits /admin/application-setup
  â†’ Next.js matches src/app/admin/application-setup/page.js (auto-generated)
    â†’ page.js imports ApplicationSetupPage from src/modules/admin/application-setup/pages/
      â†’ Page (server component) calls Server Actions to load data from Supabase
      â†’ Page passes data to View (client component)
        â†’ View renders using shared UI components (TableZ, Card, Modal, Badge)`}</pre>
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <p className={styles.ruleHeading}>Key Concepts</p>
          <div className={styles.ruleGrid}>
            <div className={styles.ruleCol}>
              <ul className={styles.ruleList}>
                <li><strong>Modules are self-contained</strong> â€” each module has its own data/ and pages/. No module imports from another module.</li>
                <li><strong>Core is off-limits</strong> â€” never edit files in <code>src/core/</code>. It handles auth, layout, and database setup.</li>
                <li><strong>Shared UI is your toolkit</strong> â€” import from <code>@/shared/components/ui</code> for all UI components.</li>
              </ul>
            </div>
            <div className={styles.ruleCol}>
              <ul className={styles.ruleList}>
                <li><strong>Server Actions only</strong> â€” all database access goes in <code>data/*.actions.js</code> files with <code>&quot;use server&quot;</code>. No API routes.</li>
                <li><strong>Auto-generated routes</strong> â€” <code>src/app/</code> files are auto-generated. Never edit them manually.</li>
                <li><strong>Server vs Client</strong> â€” Pages load data on the server. Views render on the client with <code>&quot;use client&quot;</code>.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "step-1",
    title: "Step 1: Scaffold Your Module",
    content: (
      <div className={styles.refBody}>
        <p className={styles.stepNote}>Run one command to create a module with the correct structure:</p>
        <Snippet title="Create a module" code={`npm run create-module -- metal-buildings\n\n# For admin modules, use a group prefix:\nnpm run create-module -- admin/inventory-tracker`} />
        <p className={styles.stepNote}>This generates all the files you need and auto-generates the route file so Next.js knows about your page.</p>
        <Snippet title="Generated structure" code={SNIPPET_MODULE_STRUCTURE} />
        <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px", borderLeft: "4px solid #ffc107" }}>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            <strong>You do not need to create any files outside your module folder.</strong> No registration step, no config file, no route file. The scaffolding command does everything.
          </p>
        </div>
      </div>
    ),
  },
  {
    key: "step-2",
    title: "Step 2: Module Structure (3 Folders)",
    content: (
      <div className={styles.refBody}>
        <Snippet title="Required module structure" code={SNIPPET_MODULE_STRUCTURE} />
        <div className={styles.ruleGrid}>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Role of Each Part</p>
            <ul className={styles.ruleList}>
              <li><code>index.js</code>: Module identity â€” key, module_key, name, routes. The module loader reads this file to discover your module.</li>
              <li><code>data/*.actions.js</code>: Server Actions with <code>&quot;use server&quot;</code> directive. ALL database calls go here. This is the only place that calls Supabase.</li>
              <li><code>data/*.data.js</code>: Optional client-safe helpers â€” formatters, constants, shared logic used by the view. No <code>&quot;use server&quot;</code> here.</li>
              <li><code>pages/*Page.js</code>: Server component. Loads data by calling Server Actions, passes it to the view as props. No <code>&quot;use client&quot;</code>.</li>
              <li><code>pages/*View.jsx</code>: Client component with <code>&quot;use client&quot;</code>. All UI, hooks, state, event handlers go here.</li>
            </ul>
          </div>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Data Flow</p>
            <pre style={{ fontSize: "0.85rem", overflow: "auto", padding: "0.5rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>{`Page (server)
  â†’ calls Server Action
    â†’ Server Action queries Supabase
    â†’ returns data
  â†’ passes data as props to View

View (client, "use client")
  â†’ receives data via props
  â†’ manages UI state (useState, useEffect)
  â†’ calls Server Actions for mutations
  â†’ renders shared UI components`}</pre>
            <p className={styles.ruleHeading} style={{ marginTop: "1rem" }}>Strict Rules</p>
            <ul className={styles.ruleList}>
              <li><strong>NEVER</strong> call Supabase from page or view files â€” only from <code>data/*.actions.js</code></li>
              <li><strong>NEVER</strong> put <code>&quot;use client&quot;</code> on a page file</li>
              <li><strong>NEVER</strong> create API routes in <code>src/app/api/</code></li>
            </ul>
          </div>
        </div>
        <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
        <p className={styles.ruleHeading}>Full Example: Roles Module</p>
        <Accordion items={[
          {
            key: "roles-structure",
            title: "STRUCTURE",
            content: (
              <div>
                <p className={styles.stepNote}>Three folders. That&apos;s it. No model, no repo, no service, no hooks folder.</p>
                <Snippet code={SNIPPET_ROLES_STRUCTURE} />
              </div>
            )
          },
          {
            key: "roles-actions",
            title: "1. SERVER ACTIONS (data/roles.actions.js)",
            content: (
              <div>
                <p className={styles.stepNote}>
                  This is where ALL database calls go. The <code>&quot;use server&quot;</code> directive at the top tells Next.js this code runs only on the server.
                  Import <code>getSupabaseAdmin</code> from core to get the database client.
                </p>
                <Snippet code={SNIPPET_ROLES_ACTIONS} />
              </div>
            )
          },
          {
            key: "roles-page",
            title: "2. PAGE (pages/RolesPage.js â€” server component)",
            content: (
              <div>
                <p className={styles.stepNote}>
                  The page is a <strong>server component</strong> (no &quot;use client&quot;). It calls the Server Action to load data, then passes it to the View.
                </p>
                <Snippet code={SNIPPET_ROLES_PAGE} />
              </div>
            )
          },
          {
            key: "roles-view",
            title: "3. VIEW (pages/RolesView.jsx â€” client component)",
            content: (
              <div>
                <p className={styles.stepNote}>
                  The view is a <strong>client component</strong> (<code>&quot;use client&quot;</code>). It receives data from the page, manages UI state, and calls Server Actions for mutations (create, delete, etc.).
                </p>
                <Snippet code={SNIPPET_ROLES_VIEW} />
              </div>
            )
          },
          {
            key: "roles-index",
            title: "4. INDEX (index.js â€” module manifest)",
            content: (
              <div>
                <p className={styles.stepNote}>
                  The module index tells the system your module exists. The <code>module_key</code> must match a row in <code>psb_s_application</code> â€” ask your senior for the value.
                </p>
                <Snippet code={SNIPPET_ROLES_INDEX} />
              </div>
            )
          },
        ]} />
      </div>
    ),
  },
  {
    key: "step-3",
    title: "Step 3: Writing Server Actions (Backend)",
    content: (
      <div className={styles.refBody}>
        <p className={styles.stepNote}>All database access must go through Server Actions in <code>data/*.actions.js</code> files. Here is the full CRUD pattern:</p>
        <Snippet title="Complete CRUD Server Actions" code={SNIPPET_CRUD_SERVER_ACTIONS} />
        <div className={styles.ruleGrid}>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Required Pattern</p>
            <ul className={styles.ruleList}>
              <li>Add <code>&quot;use server&quot;</code> at the top of the file</li>
              <li>Import <code>getSupabaseAdmin</code> from <code>@/core/supabase/admin</code></li>
              <li>Export async functions for each operation</li>
              <li>Validate inputs before querying</li>
              <li>Throw errors â€” the view catches them</li>
            </ul>
          </div>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Not Allowed</p>
            <ul className={styles.ruleList}>
              <li>Calling Supabase from view or page files</li>
              <li>Creating API route files (<code>src/app/api/...</code>)</li>
              <li>Importing <code>getSupabaseAdmin</code> in client components</li>
              <li>Duplicating query logic across files</li>
            </ul>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "step-4",
    title: "Step 4: Styling & Shared Components",
    content: (
      <div className={styles.refBody}>
        <p className={styles.stepNote}>Use shared components and design tokens only. Do not build custom UI for things the shared library already provides.</p>
        <div className={styles.ruleGrid}>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Standards</p>
            <ul className={styles.ruleList}>
              <li>Import from <code>@/shared/components/ui</code> for all components</li>
              <li>Use predefined tokens for spacing, typography, radius</li>
              <li>Keep states explicit: loading, empty, error, no-access</li>
            </ul>
          </div>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Restrictions</p>
            <ul className={styles.ruleList}>
              <li>No inline style hacks</li>
              <li>No custom tables, modals, or buttons</li>
              <li>No module-specific redesign of core shell</li>
            </ul>
          </div>
        </div>
        <Snippet title="Shared imports baseline" code={SNIPPET_IMPORT} />
      </div>
    ),
  },
  {
    key: "step-5",
    title: "Step 5: Database & Access Setup",
    content: (
      <div className={styles.refBody}>
        <p className={styles.stepNote}>Define your module manifest and set up access tables before testing.</p>
        <Snippet title="Module manifest (index.js)" code={SNIPPET_MODULE_MANIFEST} />
        <Snippet title="Build sequence" code={SNIPPET_MODULE_BUILD_SEQUENCE} />
        <div style={{ marginTop: "1.5rem" }}>
          <p className={styles.ruleHeading}>Database Naming</p>
          <ul className={styles.ruleList}>
            <li>Use predictable snake_case naming</li>
            <li>Keep table/column names descriptive and consistent</li>
            <li>Use stable key patterns for PK/FK fields</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    key: "step-6",
    title: "Step 6: Validate & Deploy",
    content: (
      <div className={styles.refBody}>
        <div className={styles.ruleGrid}>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Must Pass</p>
            <ul className={styles.ruleList}>
              <li>Authorized users can open module routes</li>
              <li>Unauthorized users are blocked by core gate</li>
              <li>Card visibility follows hasCardAccess mappings</li>
              <li><code>npm run build</code> passes clean</li>
              <li><code>npm run lint</code> passes clean</li>
            </ul>
          </div>
          <div className={styles.ruleCol}>
            <p className={styles.ruleHeading}>Hard Fails</p>
            <ul className={styles.ruleList}>
              <li>Hardcoded roles or permissions</li>
              <li>API routes created in <code>src/app/api/</code></li>
              <li>Supabase calls outside <code>data/*.actions.js</code></li>
              <li>Unsupported row action types</li>
            </ul>
          </div>
        </div>
        <Snippet title="Pre-deploy checklist" code={SNIPPET_MODULE_DEPLOY_CHECKLIST} />
      </div>
    ),
  },
];

function QuickStartTab() {
  return (
    <div className={styles.tabContent}>
      <Accordion items={MODULE_CREATION_STEPS} />
    </div>
  );
}

function QuickStartUiRecipesContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showErr, setShowErr] = useState(false);
  const emailErr = showErr && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <div className={styles.refBody}>
      <Snippet title="Import" code={SNIPPET_IMPORT} />
      <Snippet title="Table state" code={SNIPPET_TABLE_STATE} />
      <Snippet title="Table columns" code={SNIPPET_TABLE_COLUMNS} />
      <Snippet title="Table component" code={SNIPPET_TABLE_BASIC} />
      <Snippet title="Actions config" code={SNIPPET_TABLE_ACTIONS} />
      <Snippet title="Table onChange" code={SNIPPET_TABLE_ONCHANGE} />
      <ExampleBlock title="Input + Validation" snippet={SNIPPET_INPUT} snippetTitle="Input usage">
        <div className={styles.formStack}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" isInvalid={emailErr} />
          <Input value="READ-ONLY-001" disabled />
        </div>
        <div className={styles.actionRow}>
          <Button variant="primary" onClick={() => { setShowErr(true); if (!emailErr && email) toastSuccess("Saved.", "Form Demo"); }}>
            Validate
          </Button>
        </div>
      </ExampleBlock>
      <ExampleBlock title="Toast" snippet={SNIPPET_TOAST}>
        <div className={styles.actionRow}>
          <Button variant="primary"   onClick={() => toastSuccess("Done.", "Success")}>Success</Button>
          <Button variant="secondary" onClick={() => toastInfo("FYI.", "Info")}>Info</Button>
          <Button variant="secondary" onClick={() => toastWarning("Check this.", "Warning")}>Warning</Button>
          <Button variant="danger"    onClick={() => toastError("Failed.", "Error")}>Error</Button>
        </div>
      </ExampleBlock>
      <ExampleBlock title="Badge" snippet={SNIPPET_BADGE}>
        <div className={styles.badgeRow}>
          <StatusBadge status="active" />
          <StatusBadge status="pending" />
          <StatusBadge status="inactive" />
          <StatusBadge status="suspended" />
        </div>
      </ExampleBlock>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playground tab
// ---------------------------------------------------------------------------

function PlaygroundTab() {
  const [tableState, setTableState] = useState({
    filters: {},
    sorting: { key: "created_at", direction: "desc" },
    pagination: { page: 1, pageSize: 5, total: TABLE_SOURCE_ROWS.length },
    columnVisibility: {},
    columnSizing: {},
  });
  const [lastEvent,      setLastEvent]      = useState({ type: "unknown" });
  const [showTableLog,   setShowTableLog]   = useState(false);
  const [workflowKey,    setWorkflowKey]    = useState("");
  const [pendingWorkflowAction, setPendingWorkflowAction] = useState(null);
  const [tableSearch,    setTableSearch]    = useState("");
  const [inputValue,     setInputValue]     = useState("Jordan Carter");
  const [inputInvalid,   setInputInvalid]   = useState(false);
  const [searchValue,    setSearchValue]    = useState("");
  const [dropdownValue,         setDropdownValue]         = useState(null);
  const [dropdownShow,          setDropdownShow]          = useState(false);
  const [multiDropdownValues,   setMultiDropdownValues]   = useState([]);
  const [modalOpen,             setModalOpen]             = useState(false);
  const [modalSaving,    setModalSaving]    = useState(false);
  const [toastCount,     setToastCount]     = useState(0);
  const [cardModalOpen,  setCardModalOpen]  = useState(false);
  const [copiedIcon,     setCopiedIcon]     = useState(null);
  const [setupRows,      setSetupRows]      = useState(SETUP_TABLE_ROWS);

  const tableColumns = useMemo(() => [
    { key: "employee_code", label: "Code",    sortable: true, width: 130 },
    { key: "full_name",     label: "Name",    sortable: true, width: 180 },
    { key: "team",          label: "Team",    sortable: true, width: 120 },
    {
      key: "status", label: "Status", sortable: true, width: 120,
      render: (row) => {
        return <StatusBadge status={row.status} />;
      },
    },
    { key: "created_at", label: "Created", sortable: true, width: 130 },
  ], []);

  const filterConfig = useMemo(() => createFilterConfig([
    { key: "status",     label: "Status",       type: TABLE_FILTER_TYPES.SELECT,    options: STATUS_OPTIONS },
    { key: "team",       label: "Team",         type: TABLE_FILTER_TYPES.SELECT,    multiple: true, options: TEAM_OPTIONS },
    { key: "created_at", label: "Created Date", type: TABLE_FILTER_TYPES.DATERANGE },
  ]), []);

  const actions = useMemo(() => [
    {
      key: "preview", label: "Preview", type: "primary", icon: "eye",
      onClick: (row) => toastInfo(`Preview: ${row.employee_code}`, "Row Action"),
    },
    {
      key: "edit", label: "Edit", type: "secondary", icon: "pen",
      visible: (row) => row.status === "active",
      onClick: (row) => toastSuccess(`Edit: ${row.full_name}`, "Row Action"),
    },
    {
      key: "deactivate", label: "Deactivate", type: "secondary", icon: "ban",
      visible: (row) => row.status === "active",
      confirm: true,
      confirmMessage: (row) => `Deactivate ${row.full_name}?`,
      onClick: (row) => toastWarning(`Deactivated: ${row.full_name}`, "Row Action"),
    },
  ], []);

  const setupColumns = useMemo(() => [
    { key: "status_name", label: "Status Name", sortable: true, width: 150 },
    { key: "status_description", label: "Description", sortable: true, width: 220 },
    {
      key: "display_color", label: "Color", width: 130,
      render: (row) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: row.display_color, border: "1px solid rgba(0,0,0,.15)" }} />
          <code>{row.display_color}</code>
        </span>
      ),
    },
    { key: "display_order", label: "Order", sortable: true, width: 90 },
    {
      key: "is_active", label: "Active", sortable: true, width: 100,
      render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
    },
  ], []);

  const setupActions = useMemo(() => [
    {
      key: "edit", label: "Edit", type: "secondary", icon: "pen",
      onClick: (row) => toastSuccess(`Edit: ${row.status_name}`, "Setup Table"),
    },
    {
      key: "deactivate", label: "Deactivate", type: "secondary", icon: "ban",
      visible: (row) => row.is_active,
      onClick: (row) => setSetupRows((previous) => previous.map((item) => item.status_id === row.status_id ? { ...item, is_active: false } : item)),
    },
  ], []);

  const handleSetupReorder = useCallback((nextRows) => {
    setSetupRows(nextRows.map((row, index) => ({ ...row, display_order: (index + 1) * 10 })));
    toastSuccess("Display order updated.", "Setup Table");
  }, []);

  const selectedStatusLabels = useMemo(() => {
    const selectedItems = multiDropdownValues
      .map((value) => DEMO_STATUS_OPTIONS.find((option) => option.value === value)?.label || value)
      .filter(Boolean);
    return selectedItems.length > 0 ? selectedItems.join(", ") : "None";
  }, [multiDropdownValues]);

  const filteredRows = useMemo(() => {
    const f  = tableState.filters || {};
    const sq = normalizeText(f.search);
    const st = normalizeText(f.status);
    const teamF = f.team;
    const dr = f.created_at || {};
    const start = parseDateOnly(dr.start);
    const end   = parseDateOnly(dr.end);
    return TABLE_SOURCE_ROWS.filter((row) => {
      if (sq) {
        const hay = [row.employee_code, row.full_name, row.team, row.role, row.status, row.created_at].map(normalizeText).join(" ");
        if (!hay.includes(sq)) return false;
      }
      if (st && normalizeText(row.status) !== st) return false;

      // Team filter: support single-value and multi-select (array)
      if (Array.isArray(teamF)) {
        if (teamF.length > 0) {
          const allowed = new Set(teamF.map((t) => String(t || "").trim().toLowerCase()));
          if (!allowed.has(normalizeText(row.team))) return false;
        }
      } else if (teamF) {
        if (normalizeText(row.team) !== normalizeText(teamF)) return false;
      }
      const d = parseDateOnly(row.created_at);
      if (start && d && d < start) return false;
      if (end   && d && d > end)   return false;
      return true;
    });
  }, [tableState.filters]);

  const sortedRows = useMemo(() => {
    const { key: sk, direction: sd } = tableState.sorting || {};
    if (!sk) return filteredRows;
    const dir = sd === "desc" ? -1 : 1;
    return filteredRows.slice().sort((a, b) => {
      if (sk === "created_at") {
        return ((parseDateOnly(a.created_at)?.getTime() || 0) - (parseDateOnly(b.created_at)?.getTime() || 0)) * dir;
      }
      return String(a[sk] || "").localeCompare(String(b[sk] || ""), undefined, { sensitivity: "base", numeric: true }) * dir;
    });
  }, [filteredRows, tableState.sorting]);

  const pageSize  = Math.max(1, Number(tableState.pagination?.pageSize || 5));
  const total     = sortedRows.length;
  const maxPage   = Math.max(1, Math.ceil(total / pageSize));
  const page      = Math.min(Math.max(1, Number(tableState.pagination?.page || 1)), maxPage);
  const tableRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page, pageSize]);
  const tableViewState = useMemo(() => ({
    ...tableState,
    pagination: { ...tableState.pagination, page, pageSize, total },
  }), [tableState, page, pageSize, total]);

  const handleTableChange = useCallback((event) => {
    setLastEvent(event || { type: "unknown" });
    const t = String(event?.type || "").toLowerCase();
    if (t === "search") {
      const v = String(event.value || "").trim();
      setTableState((prev) => ({
        ...prev,
        filters: v ? { ...prev.filters, search: v } : Object.fromEntries(Object.entries(prev.filters).filter(([k]) => k !== "search")),
        pagination: { ...prev.pagination, page: 1 },
      }));
    } else if (t === "filters") {
      setTableState((prev) => ({ ...prev, filters: event.filters || {}, pagination: { ...prev.pagination, page: 1 } }));
    } else if (t === "sorting") {
      setTableState((prev) => ({ ...prev, sorting: event.sorting || {}, pagination: { ...prev.pagination, page: 1 } }));
    } else if (t === "pagination") {
      setTableState((prev) => ({
        ...prev,
        pagination: {
          ...prev.pagination,
          page:     Math.max(1, Number(event.pagination?.page     || 1)),
          pageSize: Math.max(1, Number(event.pagination?.pageSize || pageSize)),
        },
      }));
    } else if (t === "columnvisibility") {
      setTableState((prev) => ({ ...prev, columnVisibility: event.columnVisibility || prev.columnVisibility }));
    } else if (t === "columnresize") {
      setTableState((prev) => ({ ...prev, columnSizing: event.columnSizing || prev.columnSizing }));
    } else if (t === "action") {
      event?.action?.onClick?.(event.row);
    } else if (t === "export") {
      toastInfo(`Export: ${String(event?.format || "csv").toUpperCase()}`, "Export");
    }
  }, [pageSize]);

  const startWorkflowAction = (action) => {
    if (!action) {
      return;
    }

    setWorkflowKey(action.key);
    window.setTimeout(() => { setWorkflowKey(""); toastSuccess(`${action.label} complete.`, "Workflow"); }, 900);
  };

  const runWorkflow = (action) => {
    if (action?.critical) {
      setPendingWorkflowAction(action);
      return;
    }

    startWorkflowAction(action);
  };

  const confirmWorkflowAction = () => {
    const action = pendingWorkflowAction;
    setPendingWorkflowAction(null);
    startWorkflowAction(action);
  };

  const runModalSave = () => {
    setModalSaving(true);
    window.setTimeout(() => { setModalSaving(false); setModalOpen(false); toastSuccess("Saved.", "Modal"); }, 900);
  };

  const copyIconName = (name) => {
    navigator.clipboard.writeText(name).then(() => {
      setCopiedIcon(name);
      window.setTimeout(() => setCopiedIcon(null), 1200);
    });
  };

  const playgroundItems = [
    /* ------------------------------------------------------------------ */
    /*  1. Design Tokens — Colors, Typography, Spacing                    */
    /* ------------------------------------------------------------------ */
    {
      key: "play-design-tokens",
      title: "1. Design Tokens (Colors, Typography, Spacing)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Project Color Palette</p>
          <p style={{ fontSize: 12, color: "#4f6a7d", margin: 0 }}>
            All colors come from <code>src/styles/variables.css</code>. Use CSS variables — never hard-code hex values in modules.
          </p>
          <div className={styles.colorGrid}>
            {[
              { var: "--psb-brand",   hex: "#1d597f", label: "Brand (Primary)",   use: "Primary buttons, links, active tabs" },
              { var: "--psb-brand-2", hex: "#2b7b89", label: "Brand 2 (Secondary)", use: "Secondary accents, hover states" },
              { var: "--psb-gold",    hex: "#c4a06b", label: "Gold (Accent)",     use: "Highlights, premium badges" },
              { var: "--psb-ink",     hex: "#102736", label: "Ink (Dark)",        use: "Headers, bold text" },
              { var: "--psb-text",    hex: "#173348", label: "Text (Body)",       use: "Default body text" },
              { var: "--psb-muted",   hex: "#4f6578", label: "Muted",            use: "Captions, secondary labels" },
              { var: "--psb-bg",      hex: "#eef3f8", label: "Background",       use: "Page background" },
              { var: "--psb-surface", hex: "#ffffff", label: "Surface",          use: "Cards, modals, panels" },
              { var: "--psb-border",  hex: "#c8d7e4", label: "Border",           use: "Dividers, card borders" },
            ].map((c) => (
              <div key={c.var} className={styles.colorSwatch}>
                <div className={styles.colorBox} style={{ backgroundColor: c.hex }} />
                <div className={styles.colorInfo}>
                  <code style={{ fontSize: 11 }}>{c.var}</code>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a4364" }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: "#5a7a91" }}>{c.use}</span>
                </div>
              </div>
            ))}
          </div>

          <p className={styles.playLabel} style={{ marginTop: 16 }}>Bootstrap Badge Colors</p>
          <p style={{ fontSize: 12, color: "#4f6a7d", margin: 0 }}>
            Badges use Bootstrap <code>bg</code> prop. These are the standard colors for status display.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {[
              { bg: "success",   text: undefined, label: "Active / Approved", name: "success" },
              { bg: "warning",   text: "dark",    label: "Pending / Review",  name: "warning" },
              { bg: "danger",    text: undefined, label: "Error / Rejected",  name: "danger" },
              { bg: "secondary", text: undefined, label: "Inactive / Draft",  name: "secondary" },
              { bg: "dark",      text: undefined, label: "Suspended / Void",  name: "dark" },
              { bg: "info",      text: "dark",    label: "Information",       name: "info" },
              { bg: "light",     text: "dark",    label: "Default / Neutral", name: "light" },
            ].map((b) => (
              <div key={b.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Badge bg={b.bg} text={b.text}>{b.label}</Badge>
                <code style={{ fontSize: 10, color: "#5a7a91" }}>bg=&quot;{b.name}&quot;</code>
              </div>
            ))}
          </div>

          <p className={styles.playLabel} style={{ marginTop: 16 }}>Typography</p>
          <div style={{ display: "grid", gap: 6, padding: "8px 12px", background: "#f5faff", borderRadius: 8, border: "1px solid #d3e5f3" }}>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 14, color: "#173348" }}>
              <strong>Inter</strong> — Primary body font. Used for all text, labels, and UI controls.
              <br /><code style={{ fontSize: 11 }}>var(--psb-font-primary)</code>
            </p>
            <p style={{ margin: 0, fontFamily: "Manrope, sans-serif", fontSize: 14, color: "#173348" }}>
              <strong>Manrope</strong> — Secondary display font. Used for headings and titles.
              <br /><code style={{ fontSize: 11 }}>var(--psb-font-secondary)</code>
            </p>
          </div>

          <p className={styles.playLabel} style={{ marginTop: 16 }}>Spacing & Sizing</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
            {[
              { token: "--psb-space-4",  val: "4px",  use: "Tight gaps" },
              { token: "--psb-space-8",  val: "8px",  use: "Icon gaps" },
              { token: "--psb-space-12", val: "12px", use: "Card padding" },
              { token: "--psb-space-16", val: "16px", use: "Section gaps" },
              { token: "--psb-space-24", val: "24px", use: "Large padding" },
              { token: "--psb-radius-6", val: "6px",  use: "Buttons" },
              { token: "--psb-radius-8", val: "8px",  use: "Cards" },
              { token: "--psb-radius-12", val: "12px", use: "Modals" },
            ].map((s) => (
              <div key={s.token} style={{ background: "#fff", border: "1px solid #d8e8f3", borderRadius: 6, padding: "6px 8px" }}>
                <code style={{ fontSize: 10, color: "#1e6fa8" }}>{s.token}</code>
                <p style={{ margin: 0, fontSize: 12, color: "#1a4364", fontWeight: 700 }}>{s.val}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#5a7a91" }}>{s.use}</p>
              </div>
            ))}
          </div>

          <Snippet title="How to use design tokens in CSS Modules" code={`/* In your .module.css file */
.myCard {
  background: var(--psb-surface);
  border: 1px solid var(--psb-border);
  border-radius: var(--psb-radius-8);
  padding: var(--psb-space-16);
  color: var(--psb-text);
}

.myHeading {
  font-family: var(--psb-font-secondary);
  color: var(--psb-ink);
}

.myCaption {
  color: var(--psb-muted);
  font-size: var(--psb-font-12);
}`} />
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  2. Icon Library                                                    */
    /* ------------------------------------------------------------------ */
    {
      key: "play-icons",
      title: "2. Icon Library (AppIcon)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Available Icons</p>
          <p style={{ fontSize: 12, color: "#4f6a7d", margin: 0 }}>
            All icons are registered in <code>src/shared/utils/icons.js</code>. Use <code>AppIcon</code> component
            or string names in action configs. Click any icon to copy its name.
          </p>
          <div className={styles.iconGrid}>
            {[
              { name: "pencil-square", group: "CRUD", desc: "Edit" },
              { name: "trash",         group: "CRUD", desc: "Delete" },
              { name: "plus",          group: "CRUD", desc: "Add / Create" },
              { name: "eye",           group: "CRUD", desc: "View / Preview" },
              { name: "eye-slash",     group: "CRUD", desc: "Hide" },
              { name: "save",          group: "CRUD", desc: "Save" },
              { name: "ban",           group: "CRUD", desc: "Deactivate" },
              { name: "restore",       group: "CRUD", desc: "Undo / Restore" },
              { name: "cancel",        group: "CRUD", desc: "Cancel / Close" },
              { name: "check2",        group: "Status", desc: "Check mark" },
              { name: "check-circle",  group: "Status", desc: "Success" },
              { name: "x-circle",      group: "Status", desc: "Error / Blocked" },
              { name: "grid-3x3-gap",  group: "Dashboard", desc: "Grid layout" },
              { name: "collection",    group: "Dashboard", desc: "Groups" },
              { name: "card-list",     group: "Dashboard", desc: "List view" },
              { name: "envelope-at-fill", group: "Contact", desc: "Email" },
              { name: "telephone-fill",   group: "Contact", desc: "Phone" },
              { name: "grip-vertical",    group: "Misc", desc: "Drag handle" },
              { name: "three-dots-vertical", group: "Misc", desc: "Menu" },
              { name: "shield-lock",   group: "Misc", desc: "Permissions" },
              { name: "bucket",        group: "Misc", desc: "Reset / Clear" },
              { name: "sort-up",       group: "Sort", desc: "Sort ascending" },
              { name: "sort-down",     group: "Sort", desc: "Sort descending" },
              { name: "chevron-down",  group: "Sort", desc: "Expand" },
              { name: "chevron-up",    group: "Sort", desc: "Collapse" },
            ].map((ic) => (
              <button
                key={ic.name}
                type="button"
                className={[styles.iconItem, copiedIcon === ic.name ? styles.iconItemCopied : ""].filter(Boolean).join(" ")}
                onClick={() => copyIconName(ic.name)}
                title={`${ic.desc} — click to copy "${ic.name}"`}
              >
                <AppIcon icon={ic.name} style={{ fontSize: 18 }} />
                <span className={styles.iconName}>{ic.name}</span>
                <span className={styles.iconGroup}>{ic.group}</span>
              </button>
            ))}
          </div>
          <Snippet title="Using icons in your code" code={`// Option 1: AppIcon component (for any JSX)
import AppIcon from "@/shared/components/ui/AppIcon";
<AppIcon icon="pencil-square" className="text-primary" />
<AppIcon icon="trash" className="text-danger" />

// Option 2: In table row actions (string name)
const actions = [
  { key: "edit",   label: "Edit",   icon: "pencil-square", type: "secondary" },
  { key: "delete", label: "Delete", icon: "trash",         type: "danger"    },
  { key: "view",   label: "View",   icon: "eye",           type: "primary"   },
];

// Option 3: In database (psb_s_appcard.icon column)
// Store: "grid-3x3-gap", "collection", "card-list", etc.`} />
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  3. Button Component                                                */
    /* ------------------------------------------------------------------ */
    {
      key: "play-buttons",
      title: "3. Button (Variants, Loading, Sizes)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Button Variants</p>
          <p style={{ fontSize: 12, color: "#4f6a7d", margin: 0 }}>
            <code>variant</code> controls the color. Use <code>primary</code> for the main action,
            <code> secondary</code> for alternatives, <code>danger</code> for destructive, <code>ghost</code> for subtle.
          </p>
          <div className={styles.toolbarRow}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
          </div>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Size Variants</p>
          <div className={styles.toolbarRow} style={{ alignItems: "center" }}>
            <Button size="sm">Small</Button>
            <Button>Default</Button>
          </div>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Loading State</p>
          <p style={{ fontSize: 12, color: "#4f6a7d", margin: 0 }}>
            Set <code>loading=&#123;true&#125;</code> to show spinner and auto-disable. No extra logic needed.
          </p>
          <div className={styles.toolbarRow}>
            <Button loading>Saving...</Button>
            <Button variant="danger" loading>Deleting...</Button>
          </div>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Disabled State</p>
          <div className={styles.toolbarRow}>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Workflow Actions (try clicking)</p>
          <div className={styles.toolbarRow}>
            {WORKFLOW_ACTIONS.map((a) => (
              <Button key={a.key} size="sm" variant={toButtonVariantByType(a.type)} loading={workflowKey === a.key} onClick={() => runWorkflow(a)}>
                {a.label}
              </Button>
            ))}
          </div>
          <Modal
            show={Boolean(pendingWorkflowAction)}
            onHide={() => setPendingWorkflowAction(null)}
            title={`Confirm: ${pendingWorkflowAction?.label || "Action"}`}
            footer={(
              <>
                <Button variant="secondary" onClick={() => setPendingWorkflowAction(null)}>Cancel</Button>
                <Button variant={toButtonVariantByType(pendingWorkflowAction?.type)} onClick={confirmWorkflowAction}>
                  Yes, {pendingWorkflowAction?.label || "Continue"}
                </Button>
              </>
            )}
          >
            <p style={{ margin: 0, fontSize: 14 }}>Continue with {pendingWorkflowAction?.label || "this action"}?</p>
          </Modal>

          <Snippet title="Button usage" code={`import { Button } from "@/shared/components/ui";

// Variants
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button variant="ghost">Skip</Button>

// Loading state — automatically shows spinner + disables
<Button loading={saving} onClick={handleSave}>Save Changes</Button>

// Size
<Button size="sm">Small Button</Button>

// Disabled
<Button disabled>Cannot Click</Button>`} />

          <div style={{ padding: "8px 12px", background: "#fff3cd", borderRadius: 6, borderLeft: "4px solid #ffc107", marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#664d03" }}>
              <strong>Rule:</strong> One primary button per view. Use secondary for alternatives. Use danger only for destructive actions.
              Always use <code>loading</code> prop during async operations — never disable manually.
            </p>
          </div>
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  4. Input Field                                                     */
    /* ------------------------------------------------------------------ */
    {
      key: "play-input",
      title: "4. Input Field (Text, Validation)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Interactive Input</p>
          <div className={styles.formStack}>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter text"
              isInvalid={inputInvalid}
            />
            <div className={styles.toolbarRow}>
              <Button size="sm" onClick={() => setInputInvalid(!inputInvalid)}>
                {inputInvalid ? "Clear Error" : "Show Error"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setInputValue("")}>Clear</Button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Value: <code>{inputValue || "(empty)"}</code></p>

          <Snippet title="Input usage" code={`import { Input } from "@/shared/components/ui";

// Basic controlled input
<Input
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="Enter full name"
/>

// With validation error
<Input
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  isInvalid={touched && !isValidEmail(email)}
  placeholder="e.g. user@company.com"
/>
{touched && !isValidEmail(email) && (
  <p className={styles.fieldError}>Enter a valid email.</p>
)}

// Disabled
<Input value="Read-only value" disabled />`} />

          <div style={{ padding: "8px 12px", background: "#d1ecf1", borderRadius: 6, borderLeft: "4px solid #0dcaf0", marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#055160" }}>
              <strong>Tip:</strong> Input is always controlled (<code>value</code> + <code>onChange</code>). Use <code>isInvalid</code>
              for red border — pair it with an error message below the field. Supports all native <code>&lt;input&gt;</code> props (type, maxLength, etc.).
            </p>
          </div>
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  5. SearchBar                                                       */
    /* ------------------------------------------------------------------ */
    {
      key: "play-searchbar",
      title: "5. SearchBar (Debounced Search)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Try typing below — fires after 300ms pause</p>
          <SearchBar
            value={searchValue}
            debounceMs={300}
            placeholder="Search with debounce..."
            onDebouncedChange={(v) => {
              setSearchValue(v);
              if (v) toastInfo(`Searching: ${v}`, "Search");
            }}
          />
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Debounced value: <code>{searchValue || "(empty)"}</code></p>

          <Snippet title="SearchBar usage" code={`import { SearchBar } from "@/shared/components/ui";

// Basic — fires onDebouncedChange after user stops typing (350ms default)
<SearchBar
  value={query}
  onDebouncedChange={(value) => setQuery(value)}
  placeholder="Search employees..."
/>

// Custom delay
<SearchBar
  value={query}
  debounceMs={500}
  onDebouncedChange={(value) => fetchResults(value)}
  placeholder="Search with 500ms delay..."
/>

// With Server Action
const handleSearch = async (value) => {
  const results = await searchUsers(value);  // Server Action
  setRows(results);
};
<SearchBar value={query} onDebouncedChange={handleSearch} />`} />

          <div style={{ padding: "8px 12px", background: "#d1ecf1", borderRadius: 6, borderLeft: "4px solid #0dcaf0", marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#055160" }}>
              <strong>Tip:</strong> SearchBar prevents firing on every keystroke. Default delay is 350ms.
              Built into TableZ automatically — you only need SearchBar for custom search outside tables.
            </p>
          </div>
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  6. Dropdown                                                        */
    /* ------------------------------------------------------------------ */
    {
      key: "play-dropdown",
      title: "6. Dropdown (Combo Box / Action Menu)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Selection Dropdown</p>
          <Dropdown show={dropdownShow} onToggle={(show) => setDropdownShow(show)}>
            <Dropdown.Toggle variant="secondary" size="sm">
              {dropdownValue?.label || "Select Status"}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {DEMO_STATUS_OPTIONS.map((item) => (
                <Dropdown.Item
                  key={item.value}
                  onClick={() => {
                    setDropdownValue(item);
                    setDropdownShow(false);
                    toastSuccess(`Selected: ${item.label}`, "Selection");
                  }}
                >
                  {item.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Selected: <code>{dropdownValue?.label || "None"}</code></p>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Multi-select Dropdown</p>
          <MultiSelectDropdown
            options={DEMO_STATUS_OPTIONS}
            selectedValues={multiDropdownValues}
            onChange={setMultiDropdownValues}
            placeholder="Select statuses"
            buttonVariant="secondary"
            buttonSize="sm"
          />
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Selected: <code>{selectedStatusLabels}</code>
          </p>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Action Menu with Divider</p>
          <Dropdown>
            <Dropdown.Toggle variant="secondary" size="sm">Actions</Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => toastInfo("View clicked", "Action")}>
                <AppIcon icon="eye" style={{ marginRight: 6, width: 14 }} /> View
              </Dropdown.Item>
              <Dropdown.Item onClick={() => toastInfo("Edit clicked", "Action")}>
                <AppIcon icon="pencil-square" style={{ marginRight: 6, width: 14 }} /> Edit
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item className="text-danger" onClick={() => toastError("Delete clicked", "Action")}>
                <AppIcon icon="trash" style={{ marginRight: 6, width: 14 }} /> Delete
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>

          <Snippet title="Dropdown usage" code={`import { Dropdown } from "@/shared/components/ui";

// Selection dropdown
<Dropdown>
  <Dropdown.Toggle variant="secondary" size="sm">
    {selectedItem?.label || "Select..."}
  </Dropdown.Toggle>
  <Dropdown.Menu>
    {options.map((o) => (
      <Dropdown.Item key={o.value} onClick={() => setSelected(o)}>
        {o.label}
      </Dropdown.Item>
    ))}
  </Dropdown.Menu>
</Dropdown>

// Action menu with divider and icons
<Dropdown>
  <Dropdown.Toggle variant="secondary" size="sm">Actions</Dropdown.Toggle>
  <Dropdown.Menu>
    <Dropdown.Item onClick={onView}>View</Dropdown.Item>
    <Dropdown.Item onClick={onEdit}>Edit</Dropdown.Item>
    <Dropdown.Divider />
    <Dropdown.Item className="text-danger" onClick={onDelete}>Delete</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>

// Direction: drop="up" | "down" (default) | "start" | "end"
<Dropdown drop="up">...</Dropdown>`} />
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  7. Card                                                            */
    /* ------------------------------------------------------------------ */
    {
      key: "play-card",
      title: "7. Card (Content Container)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Card Variants</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            <Card title="Basic Card" subtitle="With title and subtitle">
              <p style={{ margin: 0, fontSize: 13 }}>Card body content goes here.</p>
            </Card>
            <Card
              title="Card with Footer"
              footer={
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Button variant="secondary" size="sm">Cancel</Button>
                  <Button size="sm">Save</Button>
                </div>
              }
            >
              <p style={{ margin: 0, fontSize: 13 }}>Footers are great for action buttons.</p>
            </Card>
            <Card
              header={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: "#1a4364" }}>Custom Header</span>
                  <Badge bg="success">Live</Badge>
                </div>
              }
            >
              <p style={{ margin: 0, fontSize: 13 }}>Use <code>header</code> prop for custom layouts.</p>
            </Card>
          </div>

          <Card
            title="Interactive Card"
            subtitle="Click the button to open a modal"
            footer={
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Button size="sm" onClick={() => setCardModalOpen(true)}>Open Modal</Button>
              </div>
            }
          >
            <p style={{ margin: 0, fontSize: 13 }}>This card demonstrates combining Card + Button + Modal together.</p>
          </Card>
          <Modal
            show={cardModalOpen}
            onHide={() => setCardModalOpen(false)}
            title="Card Action"
            footer={<Button variant="secondary" onClick={() => setCardModalOpen(false)}>Close</Button>}
          >
            <p style={{ margin: 0, fontSize: 14 }}>You triggered this modal from the card footer button.</p>
          </Modal>

          <Snippet title="Card usage" code={`import { Card } from "@/shared/components/ui";

// Basic card
<Card title="User Details" subtitle="Personal information">
  <p>Name: Jordan Patel</p>
</Card>

// With footer actions
<Card title="Edit Profile" footer={
  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
    <Button variant="secondary">Cancel</Button>
    <Button>Save</Button>
  </div>
}>
  <Input value={name} onChange={(e) => setName(e.target.value)} />
</Card>

// Custom header (replaces title/subtitle)
<Card header={<MyCustomHeader />}>
  <p>Body content</p>
</Card>`} />
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  8. Badge                                                           */
    /* ------------------------------------------------------------------ */
    {
      key: "play-badges",
      title: "8. Badges (Status Display)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Status Badges</p>
          <p style={{ fontSize: 12, color: "#4f6a7d", margin: 0 }}>
            Use StatusBadge for status indicators. Colors are driven by CSS tokens for project-wide consistency.
          </p>
          <div className={styles.badgeRow}>
            <StatusBadge status="active" />
            <StatusBadge status="pending" />
            <StatusBadge status="failed" />
            <StatusBadge status="inactive" />
            <StatusBadge status="suspended" />
            <StatusBadge status="processing" />
            <StatusBadge status="draft" />
          </div>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>Status Color Conventions</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
            {[
              { status: "active",     meaning: "Active, Approved, Complete, Enabled" },
              { status: "pending",    meaning: "Pending, Review, Waiting" },
              { status: "failed",     meaning: "Error, Rejected, Failed, Overdue" },
              { status: "inactive",   meaning: "Inactive, Disabled" },
              { status: "suspended",  meaning: "Suspended, Voided, Terminated" },
              { status: "processing", meaning: "In Progress, Under Review" },
              { status: "archived",   meaning: "Archived, Historical" },
              { status: "draft",      meaning: "Draft, Unpublished" },
            ].map((s) => (
              <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "#fff", border: "1px solid #e2edf5", borderRadius: 6 }}>
                <StatusBadge status={s.status} />
                <span style={{ fontSize: 11, color: "#4f6a7d" }}>{s.meaning}</span>
              </div>
            ))}
          </div>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>In Table Column (render function)</p>
          <div style={{ padding: "8px 12px", background: "#f5faff", borderRadius: 8, border: "1px solid #d3e5f3" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#5a7a91", width: 80 }}>active →</span>
              <StatusBadge status="active" />
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "#5a7a91", width: 80 }}>pending →</span>
              <StatusBadge status="pending" />
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "#5a7a91", width: 80 }}>inactive →</span>
              <StatusBadge status="inactive" />
            </div>
          </div>

          <Snippet title="StatusBadge usage in table columns" code={`import { StatusBadge } from "@/shared/components/ui";

// In column definition
const columns = [
  {
    key: "status", label: "Status", sortable: true, width: 120,
    render: (row) => <StatusBadge status={row.status} />,
  },
];

// Supported statuses: active, inactive, pending, processing,
// completed, failed, cancelled, archived, draft, suspended`} />
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  9. Modal                                                           */
    /* ------------------------------------------------------------------ */
    {
      key: "play-modal",
      title: "9. Modal (Dialog / Confirmation)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Try it</p>
          <Button size="sm" onClick={() => setModalOpen(true)}>Open Modal</Button>
          <Modal
            show={modalOpen}
            onHide={() => setModalOpen(false)}
            title="Confirm Change"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" loading={modalSaving} onClick={runModalSave}>Save</Button>
              </>
            }
          >
            <p style={{ margin: 0, fontSize: 14 }}>This modal has footer actions with a loading state on Save.</p>
          </Modal>

          <Snippet title="Modal usage" code={`import { Modal, Button } from "@/shared/components/ui";

const [show, setShow] = useState(false);
const [saving, setSaving] = useState(false);

// Confirmation modal
<Modal
  show={show}
  onHide={() => setShow(false)}
  title="Confirm Delete"
  footer={
    <>
      <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
      <Button variant="danger" loading={saving} onClick={handleDelete}>
        Yes, Delete
      </Button>
    </>
  }
>
  <p>Are you sure you want to delete this record?</p>
</Modal>

// Open it
<Button variant="danger" onClick={() => setShow(true)}>Delete</Button>`} />

          <div style={{ padding: "8px 12px", background: "#fff3cd", borderRadius: 6, borderLeft: "4px solid #ffc107", marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#664d03" }}>
              <strong>Rule:</strong> Always use shared Modal for confirmations — never <code>window.confirm()</code> or <code>alert()</code>.
              Put action buttons in <code>footer</code>. The destructive button should match the action variant (danger for delete, etc.).
            </p>
          </div>
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  10. Toast                                                          */
    /* ------------------------------------------------------------------ */
    {
      key: "play-toast",
      title: "10. Toast Notifications",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Click to trigger each type</p>
          <div className={styles.actionRow}>
            <Button size="sm" onClick={() => { setToastCount(c => c + 1); toastSuccess("Record saved successfully.", "Success"); }}>
              Success
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setToastCount(c => c + 1); toastInfo("3 records matched your search.", "Info"); }}>
              Info
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setToastCount(c => c + 1); toastWarning("This action cannot be undone.", "Warning"); }}>
              Warning
            </Button>
            <Button size="sm" variant="danger" onClick={() => { setToastCount(c => c + 1); toastError("Failed to save — check your connection.", "Error"); }}>
              Error
            </Button>
          </div>
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Toasts triggered: {toastCount}</p>

          <p className={styles.playLabel} style={{ marginTop: 12 }}>When to use each type</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
            {[
              { fn: "toastSuccess", when: "Create, update, delete, approve succeeded", color: "#198754" },
              { fn: "toastInfo",    when: "Search results count, status updates, FYI", color: "#0dcaf0" },
              { fn: "toastWarning", when: "Irreversible actions, data conflicts",       color: "#ffc107" },
              { fn: "toastError",   when: "Save failed, validation error, server error", color: "#dc3545" },
            ].map((t) => (
              <div key={t.fn} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: "#fff", border: "1px solid #e2edf5", borderRadius: 6 }}>
                <div style={{ width: 4, minHeight: 28, borderRadius: 2, background: t.color, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <code style={{ fontSize: 11 }}>{t.fn}()</code>
                  <p style={{ margin: 0, fontSize: 11, color: "#5a7a91" }}>{t.when}</p>
                </div>
              </div>
            ))}
          </div>

          <Snippet title="Toast usage" code={`import { toastSuccess, toastError, toastWarning, toastInfo } from "@/shared/components/ui";

// After a successful save
toastSuccess("User created successfully.", "Success");

// After an error
toastError("Failed to save — please try again.", "Error");

// Warning before irreversible action
toastWarning("This will permanently void the record.", "Warning");

// Informational
toastInfo("3 records matched your filter.", "Search");

// In a Server Action handler
const handleSave = async () => {
  setSaving(true);
  try {
    await createUser(formData);  // Server Action
    toastSuccess("User created.", "Success");
  } catch (err) {
    toastError(err.message, "Error");
  } finally {
    setSaving(false);
  }
};`} />
        </div>
      ),
    },
    /* ------------------------------------------------------------------ */
    /*  11. Data Table                                                     */
    /* ------------------------------------------------------------------ */
    {
      key: "play-table",
      title: "11. Data Table (TableZ — Filters, Sort, Actions)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Live interactive table with filters and row actions</p>
          <TableZ
            data={tableRows}
            columns={tableColumns}
            state={tableViewState}
            filterConfig={filterConfig}
            actions={actions}
            variant="setup"
            loading={false}
            pageSizeOptions={[5, 10, 20]}
            searchPlaceholder="Search code, name, team, role, status"
            onChange={handleTableChange}
          />
          <div className={styles.eventLogWrap} style={{ marginTop: 8 }}>
            <button type="button" className={styles.eventLogToggle} onClick={() => setShowTableLog((v) => !v)}>
              <FontAwesomeIcon icon={showTableLog ? faChevronUp : faChevronDown} aria-hidden="true" />
              {showTableLog ? "Hide" : "Show"} table events
            </button>
            {showTableLog ? <pre className={styles.eventPre}>{JSON.stringify(lastEvent, null, 2)}</pre> : null}
          </div>

          <Snippet title="Minimal table setup" code={`import { TableZ, StatusBadge, TABLE_FILTER_TYPES, createFilterConfig } from "@/shared/components/ui";

const columns = [
  { key: "employee_code", label: "Code",   sortable: true, width: 130 },
  { key: "full_name",     label: "Name",   sortable: true, width: 180 },
  { key: "status",        label: "Status", sortable: true, width: 120,
    render: (row) => <StatusBadge status={row.status} />,
  },
];

const filterConfig = createFilterConfig([
  { key: "status", label: "Status", type: TABLE_FILTER_TYPES.SELECT,
    options: [{ label: "Active", value: "active" }, { label: "Pending", value: "pending" }] },
]);

const actions = [
  { key: "edit", label: "Edit", icon: "pencil-square", type: "secondary",
    onClick: (row) => openEditModal(row) },
  { key: "delete", label: "Delete", icon: "trash", type: "danger",
    confirm: true, onClick: (row) => handleDelete(row.id) },
];

<TableZ
  data={rows}
  columns={columns}
  state={tableState}
  filterConfig={filterConfig}
  actions={actions}
  variant="setup"
  loading={loading}
  onChange={handleTableChange}
/>`} />
        </div>
      ),
    },
    {
      key: "play-table-setup",
      title: "12. TableZ Setup Variant (compact ordered lookup)",
      content: (
        <div className={styles.playBody}>
          <p className={styles.playLabel}>Opt-in setup styling for dense admin tables with custom identity, rendered cells, actions, and reorderable rows.</p>
          <TableZ
            data={setupRows}
            columns={setupColumns}
            rowIdKey="status_id"
            actions={setupActions}
            draggable
            onReorder={handleSetupReorder}
            variant="setup"
            pageSizeOptions={[5, 10]}
            searchPlaceholder="Search run statuses..."
            emptyMessage="No run statuses found."
          />
          <Snippet title="Setup variant" code={`import { TableZ } from "@/shared/components/ui";

<TableZ
  data={runStatuses}
  columns={columns}
  rowIdKey="status_id"
  actions={actions}
  draggable
  onReorder={handleReorder}
  variant="setup"
/>`} />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.tabContent}>
      <Accordion items={playgroundItems} />
      <div className={styles.bonusSection}>
        <p className={styles.bonusSectionLabel}>Bonus Playground</p>
        <p className={styles.bonusSectionSub}>Full real-world scenarios combining multiple components together.</p>
        <Accordion items={[
          { key: "bonus-workflow", title: "Workflow Actions with Modal Confirmation", content: <BonusWorkflowModal /> },
          { key: "bonus-table",   title: "Real-World Table Scenario (Employee Review)", content: <BonusRealWorldTable /> },
          { key: "bonus-form",    title: "Add User Form (Complete Validation)", content: <BonusAddUserForm /> },
        ]} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bonus Playground components
// ---------------------------------------------------------------------------

const TEAM_OPTIONS = [
  { label: "Platform",   value: "Platform"   },
  { label: "Risk",       value: "Risk"       },
  { label: "Operations", value: "Operations" },
  { label: "Finance",    value: "Finance"    },
  { label: "Support",    value: "Support"    },
  { label: "Audit",      value: "Audit"      },
];

const ROLE_OPTIONS = [
  { label: "Admin",   value: "admin"   },
  { label: "Manager", value: "manager" },
  { label: "Analyst", value: "analyst" },
  { label: "Viewer",  value: "viewer"  },
];

const FORM_TEAM_OPTIONS = TEAM_OPTIONS.length > 0
  ? TEAM_OPTIONS
  : [
      { label: "Platform", value: "platform" },
      { label: "Operations", value: "operations" },
      { label: "Risk", value: "risk" },
    ];

const FORM_ROLE_OPTIONS = ROLE_OPTIONS.length > 0
  ? ROLE_OPTIONS
  : [
      { label: "Admin", value: "admin" },
      { label: "Manager", value: "manager" },
      { label: "Viewer", value: "viewer" },
    ];

const FORM_STATUS_OPTIONS = DEMO_STATUS_OPTIONS.length > 0
  ? DEMO_STATUS_OPTIONS
  : [
      { label: "Active", value: "active" },
      { label: "Pending", value: "pending" },
      { label: "Inactive", value: "inactive" },
    ];

const BONUS_WORKFLOW_ACTIONS = [
  { key: "reject",  label: "Reject",  variant: "danger",    message: "This will reject the selected record and notify the submitter." },
  { key: "return",  label: "Return",  variant: "warning",   message: "This will return the record to the submitter for corrections." },
  { key: "recall",  label: "Recall",  variant: "secondary", message: "This will recall the record and place it back in draft state." },
  { key: "void",    label: "Void",    variant: "danger",    message: "This permanently voids the record. This action cannot be undone." },
];

function BonusWorkflowModal() {
  const [pending,  setPending]  = useState(null); // action being confirmed
  const [loading,  setLoading]  = useState(false);

  const handleConfirm = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setPending(null);
      toastSuccess(`${pending.label} completed successfully.`, pending.label);
    }, 900);
  };

  return (
    <div className={styles.playBody}>
      <p className={styles.playLabel}>
        Critical workflow actions USE shared modal confirmation instead of browser-native prompts.
        Developers remain free to define what happens on click - this is just a pattern example.
      </p>
      <div className={styles.toolbarRow}>
        {BONUS_WORKFLOW_ACTIONS.map((a) => (
          <Button key={a.key} size="sm" variant={a.variant} onClick={() => setPending(a)}>
            {a.label}
          </Button>
        ))}
      </div>

      <Modal
        show={!!pending}
        onHide={() => setPending(null)}
        title={`Confirm: ${pending?.label || ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant={pending?.variant || "primary"} loading={loading} onClick={handleConfirm}>
              Yes, {pending?.label}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>{pending?.message}</p>
      </Modal>
    </div>
  );
}

const REVIEW_SOURCE_ROWS = [
  { id: 1, employee_code: "EMP-1101", full_name: "Avery Nguyen",  team: "Platform",   role: "admin",   status: "pending",  submitted_at: "2026-04-10" },
  { id: 2, employee_code: "EMP-1102", full_name: "Jordan Patel",  team: "Risk",       role: "manager", status: "pending",  submitted_at: "2026-04-09" },
  { id: 3, employee_code: "EMP-1103", full_name: "Riley Walker",  team: "Operations", role: "analyst", status: "pending",  submitted_at: "2026-04-08" },
  { id: 4, employee_code: "EMP-1104", full_name: "Morgan Torres", team: "Finance",    role: "viewer",  status: "approved", submitted_at: "2026-04-07" },
  { id: 5, employee_code: "EMP-1105", full_name: "Taylor Lopez",  team: "Support",    role: "manager", status: "rejected", submitted_at: "2026-04-06" },
];

function BonusRealWorldTable() {
  const [rows,       setRows]       = useState(REVIEW_SOURCE_ROWS);
  const [tableState, setTableState] = useState({
    filters: {},
    sorting: { key: "submitted_at", direction: "desc" },
    pagination: { page: 1, pageSize: 5, total: REVIEW_SOURCE_ROWS.length },
    columnVisibility: {},
    columnSizing: {},
  });
  const [confirm, setConfirm]   = useState(null); // { action, row }
  const [saving,  setSaving]    = useState(false);

  const columns = useMemo(() => [
    { key: "employee_code", label: "Code",      sortable: true, width: 120 },
    { key: "full_name",     label: "Name",      sortable: true, width: 180 },
    { key: "team",          label: "Team",      sortable: true, width: 120 },
    { key: "role",          label: "Role",      sortable: true, width: 110 },
    {
      key: "status", label: "Status", sortable: true, width: 120,
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: "submitted_at", label: "Submitted", sortable: true, width: 130 },
  ], []);

  const filterConfig = useMemo(() => createFilterConfig([
    { key: "status", label: "Status", type: TABLE_FILTER_TYPES.SELECT, options: [
      { label: "Pending",  value: "pending"  },
      { label: "Approved", value: "approved" },
      { label: "Rejected", value: "rejected" },
    ]},
  ]), []);

  const actions = useMemo(() => [
    {
      key: "approve", label: "Approve", type: "primary", icon: "check-circle",
      visible: (row) => row.status === "pending",
      onClick: (row) => setConfirm({ action: "approve", row }),
    },
    {
      key: "reject", label: "Reject", type: "danger", icon: "trash",
      visible: (row) => row.status === "pending",
      onClick: (row) => setConfirm({ action: "reject", row }),
    },
  ], []);

  const handleTableChange = useCallback((event) => {
    const t = String(event?.type || "").toLowerCase();
    if (t === "filters") {
      setTableState((prev) => ({ ...prev, filters: event.filters || {}, pagination: { ...prev.pagination, page: 1 } }));
    } else if (t === "sorting") {
      setTableState((prev) => ({ ...prev, sorting: event.sorting || {} }));
    } else if (t === "pagination") {
      setTableState((prev) => ({ ...prev, pagination: { ...prev.pagination, page: Number(event.pagination?.page || 1), pageSize: Number(event.pagination?.pageSize || 5) } }));
    } else if (t === "action") {
      event?.action?.onClick?.(event.row);
    }
  }, []);

  const filteredRows = useMemo(() => {
    const st = tableState.filters?.status;
    return st ? rows.filter((r) => r.status === st) : rows;
  }, [rows, tableState.filters]);

  const pageSize = Number(tableState.pagination?.pageSize || 5);
  const page     = Number(tableState.pagination?.page || 1);
  const tableViewState = useMemo(() => ({
    ...tableState,
    pagination: { ...tableState.pagination, page, pageSize, total: filteredRows.length },
  }), [tableState, page, pageSize, filteredRows.length]);
  const tableRows = useMemo(() => filteredRows.slice((page - 1) * pageSize, page * pageSize), [filteredRows, page, pageSize]);

  const handleConfirmAction = () => {
    setSaving(true);
    window.setTimeout(() => {
      const newStatus = confirm.action === "approve" ? "approved" : "rejected";
      setRows((prev) => prev.map((r) => r.id === confirm.row.id ? { ...r, status: newStatus } : r));
      setSaving(false);
      setConfirm(null);
      if (confirm.action === "approve") toastSuccess(`${confirm.row.full_name} approved.`, "Review");
      else toastError(`${confirm.row.full_name} rejected.`, "Review");
    }, 800);
  };

  return (
    <div className={styles.playBody}>
      <p className={styles.playLabel}>Employee access requests awaiting review. Approve or reject from row actions.</p>
      <TableZ
        data={tableRows}
        columns={columns}
        state={tableViewState}
        filterConfig={filterConfig}
        actions={actions}
        loading={false}
        pageSizeOptions={[5, 10]}
        searchPlaceholder="Search employees..."
        onChange={handleTableChange}
      />
      <Modal
        show={!!confirm}
        onHide={() => setConfirm(null)}
        title={confirm?.action === "approve" ? "Approve Access" : "Reject Access"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant={confirm?.action === "approve" ? "primary" : "danger"}
              loading={saving}
              onClick={handleConfirmAction}
            >
              {confirm?.action === "approve" ? "Yes, Approve" : "Yes, Reject"}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {confirm?.action === "approve"
            ? `Grant system access to ${confirm?.row?.full_name}?`
            : `Reject access request from ${confirm?.row?.full_name}? They will be notified.`}
        </p>
      </Modal>
    </div>
  );
}

const EMPTY_FORM = { full_name: "", email: "", team: null, role: null, status: null };

function BonusAddUserForm() {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const [saving,  setSaving]  = useState(false);

  const errors = {
    full_name: !form.full_name.trim()                           ? "Name is required." : null,
    email:     !form.email.trim()                               ? "Email is required."
             : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ? "Enter a valid email." : null,
    team:      !form.team   ? "Team is required."   : null,
    role:      !form.role   ? "Role is required."   : null,
    status:    !form.status ? "Status is required." : null,
  };
  const isValid = Object.values(errors).every((e) => !e);

  const set = (field, val) => setForm((prev) => ({ ...prev, [field]: val }));
  const touch = (field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const handleSubmit = () => {
    setTouched({ full_name: true, email: true, team: true, role: true, status: true });
    if (!isValid) { toastError("Please fix the errors before submitting.", "Validation"); return; }
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setForm(EMPTY_FORM);
      setTouched({});
      toastSuccess(`User "${form.full_name}" added successfully.`, "Add User");
    }, 900);
  };

  return (
    <div className={styles.playBody}>
      <p className={styles.playLabel}>Realistic Add User form built entirely with shared components.</p>
      <div className={styles.addUserGrid}>

        <div className={styles.addUserField}>
          <label className={styles.fieldLabel}>Full Name <span className={styles.fieldRequired}>*</span></label>
          <Input
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            onBlur={() => touch("full_name")}
            placeholder="e.g. Jordan Patel"
            isInvalid={!!(touched.full_name && errors.full_name)}
          />
          {touched.full_name && errors.full_name && <p className={styles.fieldError}>{errors.full_name}</p>}
        </div>

        <div className={styles.addUserField}>
          <label className={styles.fieldLabel}>Email <span className={styles.fieldRequired}>*</span></label>
          <Input
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={() => touch("email")}
            placeholder="e.g. jordan@psbuniverse.local"
            isInvalid={!!(touched.email && errors.email)}
          />
          {touched.email && errors.email && <p className={styles.fieldError}>{errors.email}</p>}
        </div>

        <div className={styles.addUserField}>
          <label className={styles.fieldLabel}>Team <span className={styles.fieldRequired}>*</span></label>
          <Dropdown drop="up">
            <Dropdown.Toggle
              variant={touched.team && errors.team ? "danger" : "secondary"}
              size="sm"
              style={{ width: "100%", textAlign: "left" }}
            >
              {form.team?.label || "Select Team"}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ width: "100%" }}>
              {FORM_TEAM_OPTIONS.map((o) => (
                <Dropdown.Item key={o.value} onClick={() => { set("team", o); touch("team"); }}>
                  {o.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          {touched.team && errors.team && <p className={styles.fieldError}>{errors.team}</p>}
        </div>

        <div className={styles.addUserField}>
          <label className={styles.fieldLabel}>Role <span className={styles.fieldRequired}>*</span></label>
          <Dropdown drop="up">
            <Dropdown.Toggle
              variant={touched.role && errors.role ? "danger" : "secondary"}
              size="sm"
              style={{ width: "100%", textAlign: "left" }}
            >
              {form.role?.label || "Select Role"}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ width: "100%" }}>
              {FORM_ROLE_OPTIONS.map((o) => (
                <Dropdown.Item key={o.value} onClick={() => { set("role", o); touch("role"); }}>
                  {o.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          {touched.role && errors.role && <p className={styles.fieldError}>{errors.role}</p>}
        </div>

        <div className={styles.addUserField}>
          <label className={styles.fieldLabel}>Status <span className={styles.fieldRequired}>*</span></label>
          <Dropdown drop="up">
            <Dropdown.Toggle
              variant={touched.status && errors.status ? "danger" : "secondary"}
              size="sm"
              style={{ width: "100%", textAlign: "left" }}
            >
              {form.status?.label || "Select Status"}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ width: "100%" }}>
              {FORM_STATUS_OPTIONS.map((o) => (
                <Dropdown.Item key={o.value} onClick={() => { set("status", o); touch("status"); }}>
                  {o.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          {touched.status && errors.status && <p className={styles.fieldError}>{errors.status}</p>}
        </div>

      </div>
      <div className={styles.addUserActions}>
        <Button variant="secondary" onClick={() => { setForm(EMPTY_FORM); setTouched({}); }}>Reset</Button>
        <Button variant="success" loading={saving} onClick={handleSubmit}>Add User</Button>
      </div>
    </div>
  );
}

// Reference tab components
function InputRefContent() {
  const [mode, setMode] = useState("basic");
  return (
    <div className={styles.refBody}>
      <div className={styles.propGrid}>
        <RefPropRow prop="value"      required type="string"   desc="Controlled value." />
        <RefPropRow prop="onChange"   required type="function" desc="(event) => void" />
        <RefPropRow prop="placeholder"         type="string"   desc="Hint text." />
        <RefPropRow prop="isInvalid"            type="boolean"  desc="Red border for validation errors." />
        <RefPropRow prop="disabled"             type="boolean"  desc="Prevents interaction." />
      </div>
      <PatternToggle
        modes={[
          { id: "basic", label: "Basic" },
          { id: "validation", label: "Validation" },
        ]}
        active={mode}
        onChange={setMode}
      />
      {mode === "basic" && <Snippet title="Basic input" code={SNIPPET_INPUT} />}
      {mode === "validation" && <Snippet title="With validation" code={SNIPPET_INPUT_VALIDATION} />}
    </div>
  );
}

function SearchBarRefContent() {
  const [mode, setMode] = useState("basic");
  return (
    <div className={styles.refBody}>
      <div className={styles.propGrid}>
        <RefPropRow prop="value"             required type="string"   desc="Controlled search value." />
        <RefPropRow prop="onDebouncedChange" required type="function" desc="Fired after debounce with the new value." />
        <RefPropRow prop="debounceMs"                 type="number"   desc="Debounce delay in ms. Default 350." />
        <RefPropRow prop="placeholder"                type="string"   desc="Hint text." />
      </div>
      <PatternToggle
        modes={[
          { id: "basic", label: "Basic" },
          { id: "api", label: "With API" },
        ]}
        active={mode}
        onChange={setMode}
      />
      {mode === "basic" && <Snippet title="Basic search" code={SNIPPET_SEARCHBAR} />}
      {mode === "api" && <Snippet title="With API reload" code={SNIPPET_SEARCHBAR_WITH_API} />}
    </div>
  );
}

function ModalRefContent() {
  const [mode, setMode] = useState("basic");
  return (
    <div className={styles.refBody}>
      <div className={styles.propGrid}>
        <RefPropRow prop="show"   required type="boolean"    desc="Controls visibility." />
        <RefPropRow prop="onHide" required type="function"   desc="Called on backdrop/close click." />
        <RefPropRow prop="title"  required type="string"     desc="Header text." />
        <RefPropRow prop="footer"          type="ReactNode"  desc="Footer slot - put Cancel + Save here." />
      </div>
      <PatternToggle
        modes={[
          { id: "basic", label: "Basic" },
          { id: "saveflow", label: "Save Flow" },
        ]}
        active={mode}
        onChange={setMode}
      />
      {mode === "basic" && <Snippet title="Basic modal" code={SNIPPET_MODAL} />}
      {mode === "saveflow" && <Snippet title="With save flow" code={SNIPPET_MODAL_SAVE_FLOW} />}
    </div>
  );
}

function ReferenceTab() {
  const accordionItems = [
    {
      key: "ref-quickstart-recipes",
      title: "Quick Start UI Recipes (Moved From Quick Start Tab)",
      content: <QuickStartUiRecipesContent />,
    },
    {
      key: "ref-table",
      title: "Table",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            The shared Table component is a fully-featured data grid with sorting, filtering, pagination,
            column visibility, drag-to-reorder, row actions, and CSV/Excel export.
            It uses a single <code>onChange</code> event channel for all interactions.
          </p>
          <p className={styles.ruleHeading}>Props Reference</p>
          <div className={styles.propGrid}>
            <RefPropRow prop="data"              required type="Array&lt;object&gt;"  desc="Rows for the current page." />
            <RefPropRow prop="columns"           required type="Array&lt;column&gt;"  desc="key, label, sortable, width, render, defaultVisible." />
            <RefPropRow prop="state"             required type="object"               desc="filters, sorting, pagination, columnVisibility, columnSizing." />
            <RefPropRow prop="filterConfig"      required type="Array&lt;filter&gt;"  desc="Built with createFilterConfig + TABLE_FILTER_TYPES." />
            <RefPropRow prop="actions"           required type="Array&lt;action&gt;"  desc="Row actions. Empty array hides ActionColumn." />
            <RefPropRow prop="onChange"          required type="function"              desc="Single event channel for all table interactions." />
            <RefPropRow prop="loading"           required type="boolean"              desc="Shows loading state in the table body." />
            <RefPropRow prop="rowIdKey"                   type="string"               desc="Unique row identifier key (e.g. 'card_id'). Required for drag-to-reorder." />
            <RefPropRow prop="draggable"                  type="boolean"              desc="Enable drag-to-reorder rows." />
            <RefPropRow prop="onReorder"                  type="function"             desc="(reorderedRows) => void. Called after drag completes." />
            <RefPropRow prop="pageSizeOptions"            type="number[]"             desc="e.g. [10, 20, 50]" />
            <RefPropRow prop="exportFormats"              type="string[]"             desc='["csv"] or ["csv","excel"]' />
            <RefPropRow prop="searchPlaceholder"          type="string"               desc="Search bar hint text." />
            <RefPropRow prop="emptyMessage"               type="string"               desc="Message shown when data is empty." />
          </div>

          <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
          <p className={styles.ruleHeading}>How to Databind Table (End-to-End: Database → Server Action → View → Table)</p>
          <p className={styles.stepNote}>
            This is the <strong>complete flow</strong> for binding a Supabase database table to the shared Table component.
            Real example from: Card Module Setup (table: <code>psb_s_appcard</code>).
          </p>
          <Snippet title="Full Data Binding Flow (DB → Server Action → Page → View → Table)" code={SNIPPET_TABLE_DATABIND} />

          <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
          <p className={styles.ruleHeading}>Column Configuration</p>
          <p className={styles.stepNote}>
            Columns map to database fields. Each column defines how a field is displayed in the table.
          </p>
          <Snippet title="Real column config (from Card Module Setup)" code={SNIPPET_TABLE_COLUMNS} />

          <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
          <p className={styles.ruleHeading}>Row Actions</p>
          <p className={styles.stepNote}>
            Actions appear as a dropdown in the leftmost column. Each action can be conditionally visible/disabled.
          </p>
          <Snippet title="Real actions config (from Card Module Setup)" code={SNIPPET_TABLE_ACTIONS} />

          <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
          <p className={styles.ruleHeading}>onChange Event Handler</p>
          <p className={styles.stepNote}>
            Every table interaction flows through one callback. Switch on <code>event.type</code>.
          </p>
          <Snippet title="onChange handler (all event types)" code={SNIPPET_TABLE_ONCHANGE} />

          <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
          <p className={styles.ruleHeading}>Filter Configuration</p>
          <Snippet title="Hardcoded filters (fixed options)" code={SNIPPET_TABLE_FILTERS_HARDCODE} />
          <Snippet title="Databind filters from API (dynamic options)" code={SNIPPET_TABLE_FILTERS_DATABIND} />

          <hr style={{ margin: "2rem 0", borderColor: "#ddd" }} />
          <p className={styles.ruleHeading}>Table State</p>
          <p className={styles.stepNote}>
            The table is controlled. Your module owns the state object and updates it via onChange.
          </p>
          <Snippet title="Table state structure" code={SNIPPET_TABLE_STATE} />
        </div>
      ),
    },
    {
      key: "ref-button",
      title: "Button",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            Shared button with variant-based styling, loading spinner, and disabled state.
            Used for: save/cancel actions, toolbar buttons, modal footers.
          </p>
          <div className={styles.propGrid}>
            <RefPropRow prop="variant"  required type="string"   desc="primary | secondary | danger | ghost" />
            <RefPropRow prop="onClick"  required type="function" desc="Click handler." />
            <RefPropRow prop="loading"           type="boolean"  desc="Spinner + disables interaction." />
            <RefPropRow prop="disabled"          type="boolean"  desc="Prevents interaction." />
            <RefPropRow prop="size"              type="string"   desc="sm | md (default)" />
          </div>
          <Snippet title="Button usage (real examples from Card Module Setup)" code={SNIPPET_BUTTON} />
        </div>
      ),
    },
    {
      key: "ref-input",
      title: "Input",
      content: <InputRefContent />,
    },
    {
      key: "ref-searchbar",
      title: "SearchBar",
      content: <SearchBarRefContent />,
    },
    {
      key: "ref-dropdown",
      title: "Dropdown (combo box)",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            Dropdown wraps Bootstrap&apos;s Dropdown for menus and combo box selectors.
            Used for: action menus, application selectors, form field selectors.
          </p>
          <div className={styles.propGrid}>
            <RefPropRow prop="children" required type="ReactNode"  desc="Must contain Dropdown.Toggle + Dropdown.Menu." />
            <RefPropRow prop="show"              type="boolean"    desc="Controlled visibility. Omit for uncontrolled." />
            <RefPropRow prop="onToggle"          type="function"   desc="(show: boolean) => void. Called when visibility changes." />
            <RefPropRow prop="drop"              type="string"     desc="'up' | 'down' | 'start' | 'end'. Menu direction." />
          </div>
          <Snippet title="Basic dropdown (static items)" code={SNIPPET_DROPDOWN_BASIC} />
          <Snippet title="Databind from API (real example: Application Selector)" code={SNIPPET_DROPDOWN_DATABIND} />
          <Snippet title="Hardcoded combo items" code={SNIPPET_DROPDOWN_HARDCODE} />
        </div>
      ),
    },
    {
      key: "ref-modal",
      title: "Modal",
      content: <ModalRefContent />,
    },
    {
      key: "ref-badge",
      title: "Badge",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            Badge renders a small colored label. Commonly used inside table column renderers
            to display status (active/inactive/pending) with visual distinction.
          </p>
          <div className={styles.propGrid}>
            <RefPropRow prop="bg"       required type="string"    desc="success | warning | secondary | danger | dark | primary | info" />
            <RefPropRow prop="text"              type="string"    desc="'light' | 'dark'. Text color for contrast." />
            <RefPropRow prop="children" required type="ReactNode" desc="Label text." />
          </div>
          <div className={styles.badgeRow}>
            <StatusBadge status="active" />
            <StatusBadge status="pending" />
            <StatusBadge status="inactive" />
            <StatusBadge status="suspended" />
          </div>
          <Snippet title="StatusBadge in table column renderer (real examples)" code={SNIPPET_BADGE} />
        </div>
      ),
    },
    {
      key: "ref-toast",
      title: "Toast",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            Toast fires a temporary notification in the top-right corner.
            <code>GlobalToastHost</code> is mounted once in the app layout â€” never add it again.
            Just call the function from anywhere.
          </p>
          <div className={styles.propGrid}>
            <RefPropRow prop="message"  required type="string" desc="Notification text." />
            <RefPropRow prop="title"             type="string" desc="Optional header for the toast." />
          </div>
          <div className={styles.actionRow}>
            <Button size="sm" variant="primary"   onClick={() => toastSuccess("Done.", "Success")}>Success</Button>
            <Button size="sm" variant="secondary" onClick={() => toastInfo("FYI.", "Info")}>Info</Button>
            <Button size="sm" variant="secondary" onClick={() => toastWarning("Check.", "Warning")}>Warning</Button>
            <Button size="sm" variant="danger"    onClick={() => toastError("Failed.", "Error")}>Error</Button>
          </div>
          <Snippet title="Toast usage (real examples from Card Module Setup)" code={SNIPPET_TOAST} />
        </div>
      ),
    },
    {
      key: "ref-card",
      title: "Card (surface container)",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            Card wraps content sections with an optional title, subtitle, and toolbar area.
            Used on every setup page to frame tables and form sections.
          </p>
          <div className={styles.propGrid}>
            <RefPropRow prop="title"    type="string"    desc="Card header text." />
            <RefPropRow prop="subtitle" type="string"    desc="Smaller text below title." />
            <RefPropRow prop="toolbar"  type="ReactNode" desc="Right-aligned header content (buttons)." />
            <RefPropRow prop="children" required type="ReactNode" desc="Card body content." />
          </div>
          <Snippet title="Card usage (real example from Card Module Setup)" code={SNIPPET_CARD_SURFACE} />
        </div>
      ),
    },
    {
      key: "ref-inline-edit",
      title: "InlineEditCell",
      content: (
        <div className={styles.refBody}>
          <p className={styles.stepNote}>
            InlineEditCell makes a table cell clickable and editable. When enabled, users can click the cell text
            to turn it into an input field, type a new value, and press Enter to confirm. Used for inline row editing
            across all admin modules (Application Setup, Card Module Setup, etc.).
          </p>
          <div className={styles.propGrid}>
            <RefPropRow prop="value"       required type="string | number" desc="Current value to display in the cell." />
            <RefPropRow prop="onCommit"    required type="function"        desc="(newValue) => void. Called when editing completes (Enter or blur)." />
            <RefPropRow prop="disabled"             type="boolean"         desc="When true, cell is read-only. Default: false" />
            <RefPropRow prop="placeholder"          type="string"          desc="Text shown when value is empty. Default: '--'" />
            <RefPropRow prop="type"                 type="string"          desc="Input type: 'text' | 'number'. Default: 'text'" />
          </div>
          <Snippet title="InlineEditCell usage (real example from Application Setup)" code={`import { InlineEditCell } from "@/shared/components/ui";

// In a TableZ column renderer:
{
  key: "app_name",
  label: "Application Name",
  render: (row) => (
    <InlineEditCell
      value={row?.app_name || ""}
      onCommit={(val) => handleInlineEdit(row, "app_name", val)}
      disabled={String(row?.app_id) !== String(editingAppId)}
    />
  ),
}

// The cell shows as normal text when disabled.
// When enabled (row is in edit mode), it shows a dashed underline.
// Click it to type. Press Enter or click away to confirm.`} />
        </div>
      ),
    },
    {
      key: "ref-rules",
      title: "Rules",
      content: (
        <div className={styles.refBody}>
          <div className={styles.ruleGrid}>
            <div className={styles.ruleCol}>
              <p className={styles.ruleHeading}>DO</p>
              <ul className={styles.ruleList}>
                <li>Import from <code>@/shared/components/ui</code> only.</li>
                <li>Keep all logic in module/controller files.</li>
                <li>Drive behavior through config and props.</li>
                <li>Event flow: UI ? module state ? API ? re-render.</li>
                <li>Own <code>state</code> in your module, not in shared components.</li>
              </ul>
            </div>
            <div className={styles.ruleCol}>
              <p className={styles.ruleHeading}>DO NOT</p>
              <ul className={styles.ruleList}>
                <li>Override shared styles inside module files.</li>
                <li>Create duplicate custom component versions.</li>
                <li>Place API calls or business rules inside shared UI.</li>
                <li>Use reserved key <code>__psb_action_column__</code>.</li>
                <li>Pass actions without <code>key</code>, <code>label</code>, and <code>onClick</code>.</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "ref-tokens",
      title: "Tokens",
      content: (
        <div className={styles.refBody}>
          <Snippet title="Design tokens" code={SNIPPET_TOKENS} />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.tabContent}>
      <div className={styles.refLayout}>
        <nav className={styles.refNav} aria-label="Reference navigation">
          <div className={styles.refNavGroup}>
            <p className={styles.refNavGroupLabel}>GET STARTED</p>
            <span className={styles.refNavItem}>Quick Start</span>
          </div>
          <div className={styles.refNavGroup}>
            <p className={styles.refNavGroupLabel}>BUILDING</p>
            <span className={styles.refNavItem}>Table</span>
            <span className={styles.refNavItem}>Forms</span>
            <span className={styles.refNavItem}>Actions</span>
            <span className={styles.refNavItem}>Feedback</span>
          </div>
          <div className={styles.refNavGroup}>
            <p className={styles.refNavGroupLabel}>PLAYGROUND</p>
            <span className={styles.refNavItem}>Live Demo</span>
          </div>
          <div className={styles.refNavGroup}>
            <p className={styles.refNavGroupLabel}>REFERENCE</p>
            <span className={styles.refNavItem}>Components</span>
            <span className={styles.refNavItem}>Rules</span>
            <span className={styles.refNavItem}>Tokens</span>
          </div>
        </nav>

        <div className={styles.refDocs}>
          <Accordion items={accordionItems} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TableX Tab â€” The Easy Table (for jr devs)
// ---------------------------------------------------------------------------

const TABLEX_SNIPPET_BASIC = `import { TableX } from "@/shared/components/ui";

// That's it. Just tell it which table and which columns.
// It fetches the data, sorts, filters, paginates â€” all automatic.

<TableX
  source="psb_s_user"
  columns={["user_id", "first_name", "last_name", "email"]}
/>`;

const TABLEX_SNIPPET_COLUMNS_STRING = `// SIMPLE WAY: just list the column names as strings
// Labels are created automatically: "first_name" becomes "First Name"

<TableX
  source="psb_s_user"
  columns={["user_id", "first_name", "last_name", "email"]}
/>`;

const TABLEX_SNIPPET_COLUMNS_OBJECT = `// ADVANCED WAY: use objects when you need custom labels or rendering

<TableX
  source="psb_s_user"
  columns={[
    "user_id",
    "first_name",
    { key: "status", label: "User Status", sortable: true },
    {
      key: "is_active",
      label: "Active",
      render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
    },
  ]}
/>

// You can mix strings and objects in the same array!`;

const TABLEX_SNIPPET_FILTERS = `// Filters let users narrow down the table rows.
// Each filter needs: key, type
// For "select" filters, also add: source, display

const userFilters = [
  // SELECT filter â€” dropdown loaded from another table
  {
    key: "status_id",         // column in your table to filter on
    type: "select",           // makes a dropdown
    source: "psb_s_status",   // which table to load options from
    display: "sts_name",      // which column to show as the label
  },

  // TEXT filter â€” free text search on that column
  {
    key: "email",
    type: "text",
  },

  // DATERANGE filter â€” pick a start and end date
  {
    key: "created_at",
    type: "daterange",
    label: "Created Date",    // optional custom label
  },
];

<TableX
  source="psb_s_user"
  columns={["user_id", "first_name", "email", "status_id", "created_at"]}
  filters={userFilters}
/>`;

const TABLEX_SNIPPET_ACTIONS = `// Actions show buttons on each row (Edit, Delete, etc.)
// Each action needs: key, label, type, onClick

const userActions = [
  {
    key: "edit",
    label: "Edit",
    type: "primary",            // blue button
    icon: "pen",               // Font Awesome icon name
    onClick: (row) => {
      console.log("Edit user:", row);
    },
  },
  {
    key: "deactivate",
    label: "Deactivate",
    type: "secondary",          // amber button
    icon: "ban",                // ban icon (soft delete)
    confirm: true,              // shows "Are you sure?" popup
    confirmMessage: (row) => \`Deactivate \${row.first_name}?\`,
    onClick: (row) => {
      console.log("Deactivate user:", row);
    },
  },
];

<TableX
  source="psb_s_user"
  columns={["user_id", "first_name", "last_name"]}
  actions={userActions}
/>

// Action types:
//   "primary"   ? blue button  (for: Edit, View, Preview)
//   "secondary" ? gray button  (for: Duplicate, Export)
//   "danger"    ? red button   (for: Delete, Deactivate)`;

const TABLEX_SNIPPET_FEATURES = `// Features let you turn table powers on or off.
// By default, everything is ON except drag and batch.

const userFeatures = {
  sorting: true,      // click column header to sort (ON by default)
  filtering: true,    // show filter bar (ON by default)
  pagination: true,   // show page controls (ON by default)
  resizing: true,     // drag to resize columns (ON by default)
  drag: false,        // drag rows to reorder (OFF by default)
  batch: false,       // batch edit mode (OFF by default)
};

<TableX
  source="psb_s_user"
  columns={["user_id", "first_name"]}
  features={userFeatures}
/>

// Want a read-only table? Just turn everything off:
<TableX
  source="psb_s_user"
  columns={["user_id", "first_name"]}
  features={{ sorting: false, filtering: false }}
/>`;

const TABLEX_SNIPPET_FULL = `import { TableX } from "@/shared/components/ui";

// FULL EXAMPLE â€” everything together

const userFilters = [
  { key: "status_id", type: "select", source: "psb_s_status", display: "sts_name" },
  { key: "created_at", type: "daterange", label: "Created Date" },
];

const userActions = [
  {
    key: "edit",
    label: "Edit",
    type: "primary",
    icon: "pen",
    onClick: (row) => openEditDialog(row),
  },
  {
    key: "delete",
    label: "Delete",
    type: "danger",
    confirm: true,
    confirmMessage: (row) => \`Permanently delete \${row.first_name} \${row.last_name}? This action cannot be undone.\`,
    onClick: (row) => deleteUser(row.user_id),
  },
];

<TableX
  source="psb_s_user"
  columns={["user_id", "first_name", "last_name", "email", "status_id", "created_at"]}
  filters={userFilters}
  actions={userActions}
  features={{ sorting: true, filtering: true }}
/>`;

const TABLEX_SNIPPET_EXPORT = `// Export is built-in. You don't write any code for it.
// Users can click the "Customize Table" button (side panel),
// then click "Export CSV" or "Export Excel".
//
// What gets exported:
//   - Only visible columns
//   - Respects current filters and sorting
//   - Column headers use the labels you defined
//
// That's it. Nothing to configure.`;

function TableXTab() {
  return (
    <div className={styles.tabContent}>
      <div className={styles.refBody}>
        <h2 className={styles.stepHeading}>TableX â€” The Easy Table</h2>
        <p className={styles.stepNote}>
          TableX is for everyday use. Give it a table name and column list â€” it does everything else.
          No hooks. No state. No fetch logic. Just props.
        </p>
      </div>

      <Accordion items={[
        {
          key: "tablex-basic",
          title: "1. Basic Table (just show data)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                The simplest possible table. Just two props: <code>source</code> (your database table name)
                and <code>columns</code> (which columns to show). It loads the data automatically.
              </p>
              <Snippet title="Code" code={TABLEX_SNIPPET_BASIC} />
              <div className={styles.propGrid}>
                <RefPropRow prop="source" required type="string" desc="The database table name (e.g. psb_s_user)" />
                <RefPropRow prop="columns" required type="string[]" desc="Which columns to show. Order matters â€” left to right." />
              </div>
            </div>
          ),
        },
        {
          key: "tablex-columns",
          title: "2. Columns â€” Strings vs Objects",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                You can pass column names as simple strings (easy) or as objects (when you need custom labels or cell rendering).
              </p>
              <Snippet title="Simple â€” Just Strings" code={TABLEX_SNIPPET_COLUMNS_STRING} />
              <Snippet title="Advanced â€” Objects" code={TABLEX_SNIPPET_COLUMNS_OBJECT} />
              <div className={styles.ruleGrid}>
                <div className={styles.ruleCol}>
                  <p className={styles.ruleHeading}>String Column</p>
                  <ul className={styles.ruleList}>
                    <li>Just the field name</li>
                    <li>Label is auto-generated</li>
                    <li>Sorting is on by default</li>
                  </ul>
                </div>
                <div className={styles.ruleCol}>
                  <p className={styles.ruleHeading}>Object Column</p>
                  <ul className={styles.ruleList}>
                    <li>Custom label, width, render</li>
                    <li>Use render for Badges, icons, etc.</li>
                    <li>Mix with strings in same array</li>
                  </ul>
                </div>
              </div>
            </div>
          ),
        },
        {
          key: "tablex-filters",
          title: "3. Filters (dropdown, text, date range)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Filters appear above the table. Users can narrow down rows.
                For dropdowns, TableX loads the options from the database automatically.
              </p>
              <Snippet title="Code" code={TABLEX_SNIPPET_FILTERS} />
              <div className={styles.propGrid}>
                <RefPropRow prop="key" required type="string" desc="The column name in YOUR table to filter on" />
                <RefPropRow prop="type" required type="string" desc="select | text | date | daterange" />
                <RefPropRow prop="source" required={false} type="string" desc="For select: which table to load dropdown options from" />
                <RefPropRow prop="display" required={false} type="string" desc="For select: which column to show as the label" />
                <RefPropRow prop="label" required={false} type="string" desc="Custom label (default: auto from key name)" />
              </div>
            </div>
          ),
        },
        {
          key: "tablex-actions",
          title: "4. Row Actions (Edit, Delete, etc.)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Actions add buttons to each row. You decide what each button does.
              </p>
              <Snippet title="Code" code={TABLEX_SNIPPET_ACTIONS} />
              <div className={styles.propGrid}>
                <RefPropRow prop="key" required type="string" desc="Unique name for this action" />
                <RefPropRow prop="label" required type="string" desc="Button text" />
                <RefPropRow prop="type" required type="string" desc="primary | secondary | danger" />
                <RefPropRow prop="onClick" required type="function" desc="What happens when clicked. Receives the row data." />
                <RefPropRow prop="icon" required={false} type="string" desc="Font Awesome icon name (e.g. pen, trash, eye)" />
                <RefPropRow prop="confirm" required={false} type="boolean" desc="Show confirmation popup before running onClick" />
                <RefPropRow prop="confirmMessage" required={false} type="function" desc="Custom confirmation text. Receives row." />
                <RefPropRow prop="visible" required={false} type="function" desc="Show/hide per row. (row) => boolean" />
                <RefPropRow prop="disabled" required={false} type="function" desc="Enable/disable per row. (row) => boolean" />
              </div>
            </div>
          ),
        },
        {
          key: "tablex-features",
          title: "5. Features (turn things on/off)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Features control what the table can do. Everything is ON by default except drag and batch.
              </p>
              <Snippet title="Code" code={TABLEX_SNIPPET_FEATURES} />
              <div className={styles.propGrid}>
                <RefPropRow prop="sorting" required={false} type="boolean" desc="Click column headers to sort. Default: true" />
                <RefPropRow prop="filtering" required={false} type="boolean" desc="Show filter bar. Default: true" />
                <RefPropRow prop="pagination" required={false} type="boolean" desc="Show page controls. Default: true" />
                <RefPropRow prop="resizing" required={false} type="boolean" desc="Drag to resize columns. Default: true" />
                <RefPropRow prop="drag" required={false} type="boolean" desc="Drag rows to reorder. Default: false" />
                <RefPropRow prop="batch" required={false} type="boolean" desc="Batch edit mode. Default: false" />
              </div>
            </div>
          ),
        },
        {
          key: "tablex-export",
          title: "6. Export (CSV / Excel)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Export is built-in. No extra code needed. Users click the side panel button to download.
              </p>
              <Snippet title="How It Works" code={TABLEX_SNIPPET_EXPORT} />
            </div>
          ),
        },
        {
          key: "tablex-full",
          title: "7. Full Example (everything together)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Here is a complete, real-world example with columns, filters, actions, and features all in one.
              </p>
              <Snippet title="Full Code" code={TABLEX_SNIPPET_FULL} />
            </div>
          ),
        },
        {
          key: "tablex-props",
          title: "8. All Props (quick reference)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>Every prop TableX accepts, in one place.</p>
              <div className={styles.propGrid}>
                <RefPropRow prop="source" required type="string" desc="Database table name" />
                <RefPropRow prop="columns" required type="(string | object)[]" desc="Column names or column config objects" />
                <RefPropRow prop="filters" required={false} type="object[]" desc="Filter definitions array" />
                <RefPropRow prop="features" required={false} type="object" desc="Feature toggles (sorting, filtering, etc.)" />
                <RefPropRow prop="actions" required={false} type="object[]" desc="Row action buttons" />
              </div>
            </div>
          ),
        },
        {
          key: "tablex-databind",
          title: "9. How It Works Behind the Scenes (Databind)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                TableX is powered by the <strong>databind engine</strong> â€” a set of generic Server Actions in <code>src/shared/utils/databind.actions.js</code>
                that can query, filter, sort, paginate, and export data from <em>any</em> Supabase table.
                You never call these Server Actions directly â€” TableX does it for you.
              </p>
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
                <p className={styles.ruleHeading}>What Happens When You Render a TableX</p>
                <pre style={{ fontSize: "0.85rem", overflow: "auto", margin: 0 }}>{`You write:
  <TableX source="psb_s_user" columns={["user_id", "first_name", "email"]} />

TableX automatically:
  1. Calls databindQuery() Server Action with:
     { table: "psb_s_user", fields: ["user_id","first_name","email"], page: 1, pageSize: 50 }

  2. For select filters, calls databindOptions() with:
     { table: "psb_s_status", key: "status_id", display: "sts_name" }

  3. For export, calls databindExport() with:
     { table: "psb_s_user", format: "csv", columns: [...], filters: {...} }

  4. For column discovery, calls databindSchema() with:\n     { table: "psb_s_user" }`}</pre>
              </div>
              <div style={{ marginTop: "1.5rem" }}>
                <p className={styles.ruleHeading}>When Do You Need Custom Server Actions?</p>
                <div className={styles.ruleGrid}>
                  <div className={styles.ruleCol}>
                    <p style={{ fontWeight: 600, color: "#2e7d32" }}>Use Databind (no custom code)</p>
                    <ul className={styles.ruleList}>
                      <li>Show data from a single table</li>
                      <li>Filter, sort, paginate</li>
                      <li>Export to CSV / Excel</li>
                      <li>Load dropdown options from a table</li>
                    </ul>
                  </div>
                  <div className={styles.ruleCol}>
                    <p style={{ fontWeight: 600, color: "#d32f2f" }}>Write Custom Server Actions</p>
                    <ul className={styles.ruleList}>
                      <li>Multi-step operations (create user + assign role)</li>
                      <li>Complex validation beyond DB constraints</li>
                      <li>Cross-table joins or aggregations</li>
                      <li>Custom business logic (batch save, reorder, etc.)</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px", borderLeft: "4px solid #ffc107" }}>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  <strong>Rule of thumb:</strong> Start with TableX + databind. Only write custom Server Actions when databind cannot do what you need.
                  Most new modules will never need custom Server Actions.
                </p>
              </div>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Tab â€” The Power Table (for senior devs)
// ---------------------------------------------------------------------------

const TABLE_SNIPPET_UNCONTROLLED = `import { TableZ } from "@/shared/components/ui";

// UNCONTROLLED MODE â€” TableZ handles sorting, filtering, pagination internally.
// You just pass data and columns. Good for small, local datasets.

const columns = [
  { key: "group_name",    label: "Group Name",  sortable: true, width: 220 },
  { key: "group_desc",    label: "Description", sortable: false, width: 250 },
  {
    key: "is_active",
    label: "Active",
    width: 100,
    render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
  },
];

const actions = [
  {
    key: "edit",
    label: "Edit",
    type: "primary",
    icon: "pen",
    onClick: (row) => openEditDialog(row),
  },
];

<TableZ
  data={groups}
  columns={columns}
  rowIdKey="group_id"
  actions={actions}
  emptyMessage="No groups found."
/>`;

const TABLE_SNIPPET_CONTROLLED = `import { TableZ, createFilterConfig, TABLE_FILTER_TYPES } from "@/shared/components/ui";

// CONTROLLED MODE â€” You manage the state. TableZ tells you what changed.
// Use this when you need server-side sorting, filtering, pagination.
// You must pass: state + onChange

const [tableState, setTableState] = useState({
  filters: {},
  sorting: { key: "created_at", direction: "desc" },
  pagination: { page: 1, pageSize: 50, total: 0 },
  columnVisibility: {},
  columnSizing: {},
});

const filterConfig = createFilterConfig([
  { key: "status", label: "Status", type: TABLE_FILTER_TYPES.SELECT, options: statusOptions },
  { key: "created_at", label: "Created", type: TABLE_FILTER_TYPES.DATERANGE },
]);

function handleTableChange(event) {
  switch (event.type) {
    case "search":
      setTableState(prev => ({
        ...prev,
        filters: { ...prev.filters, search: event.value },
        pagination: { ...prev.pagination, page: 1 },
      }));
      break;
    case "filters":
      setTableState(prev => ({ ...prev, filters: event.filters, pagination: { ...prev.pagination, page: 1 } }));
      break;
    case "sorting":
      setTableState(prev => ({ ...prev, sorting: event.sorting, pagination: { ...prev.pagination, page: 1 } }));
      break;
    case "pagination":
      setTableState(prev => ({ ...prev, pagination: { ...prev.pagination, ...event.pagination } }));
      break;
    case "action":
      event.action.onClick(event.row);
      break;
  }
}

<TableZ
  data={rows}
  columns={columns}
  state={tableState}
  filterConfig={filterConfig}
  actions={actions}
  loading={loading}
  onChange={handleTableChange}
/>`;

const TABLE_SNIPPET_DRAGGABLE = `// DRAG & DROP â€” let users reorder rows by dragging.
// The table auto-updates the "order" field on each row.
// Use with onReorder to save the new order.

<TableZ
  data={groups}
  columns={groupColumns}
  rowIdKey="group_id"
  actions={groupActions}
  draggable={true}
  onReorder={(reorderedRows) => {
    // reorderedRows = same data, but with updated order values
    setGroups(reorderedRows);
    saveSortOrder(reorderedRows);
  }}
/>`;

const TABLE_SNIPPET_BATCH = `// BATCH EDIT â€” track created, updated, and deleted rows.
// Table highlights changed rows. You save all changes at once.

<TableZ
  data={users}
  columns={userColumns}
  rowIdKey="user_id"
  actions={userActions}
  batchMode={true}
  onBatchChange={(payload) => {
    // payload = { created: [...], updated: [...], deleted: [...] }
    // payload.hasPendingChanges = true if anything changed
    setPendingChanges(payload);
  }}
  onBatchSave={async (payload) => {
    await saveBatchToServer(payload);
  }}
/>`;

const TABLE_SNIPPET_MASTERDETAIL = `// MASTER-DETAIL PATTERN â€” click a row in the left table,
// show related data in the right table.
// Used in: Application Setup, Card Module Setup, Company Department Setup

const [selectedCompany, setSelectedCompany] = useState(null);

// Filter departments by selected company
const departments = allDepartments.filter(
  (d) => d.comp_id === selectedCompany?.comp_id
);

// LEFT TABLE â€” Companies (master)
<TableZ
  data={companies}
  columns={companyColumns}
  rowIdKey="comp_id"
  selectedRowId={selectedCompany?.comp_id}
  onRowClick={(row) => setSelectedCompany(row)}
  actions={companyActions}
/>

// RIGHT TABLE â€” Departments (detail)
<TableZ
  data={departments}
  columns={departmentColumns}
  rowIdKey="dept_id"
  actions={departmentActions}
  emptyMessage={
    selectedCompany
      ? "No departments for this company."
      : "Select a company first."
  }
/>`;

const TABLE_SNIPPET_COLUMNS_FULL = `// COLUMN OPTIONS â€” full list of what you can set on a column

const columns = [
  {
    key: "employee_code",     // (required) field name from your data
    label: "Employee Code",   // (required) column header text
    sortable: true,           // click header to sort by this column
    width: 150,               // starting pixel width
    minWidth: 80,             // won't shrink below this
    defaultVisible: true,     // set false to hide on first load (still in panel)
    render: (row) => (        // custom cell content
      <span style={{ fontWeight: 700 }}>{row.employee_code}</span>
    ),
  },
];`;

const TABLE_SNIPPET_ACTIONS_FULL = `// ACTION OPTIONS â€” full list of what you can set on an action

const actions = [
  {
    key: "edit",                    // (required) unique name
    label: "Edit",                  // (required) button text
    type: "primary",                // (required) primary | secondary | danger
    icon: "pen",                   // Font Awesome icon name
    onClick: (row) => {},           // (required) what happens on click
    visible: (row) => true,         // show/hide per row
    disabled: (row) => false,       // enable/disable per row
    confirm: false,                 // show "Are you sure?" popup
    confirmMessage: (row) =>        // custom confirmation text
      \`Delete \${row.name}?\`,
  },
];`;

const TABLE_SNIPPET_EVENTS = `// TABLE EVENTS â€” what event.type values you will receive in onChange (TableZ)

// "search"           â€” user typed in the search bar
//                      event.value = the search text
//
// "filters"          â€” user changed a filter (dropdown, date, etc.)
//                      event.filters = { filterKey: filterValue }
//
// "sorting"          â€” user clicked a sortable column header
//                      event.sorting = { key: "column", direction: "asc"|"desc" }
//
// "pagination"       â€” user changed page or page size
//                      event.pagination = { page: 2, pageSize: 50 }
//
// "action"           â€” user clicked a row action button
//                      event.action = the action config, event.row = the row data
//
// "export"           â€” user clicked CSV or Excel export
//                      event.format = "csv"|"excel", event.context = { filters, sorting, ... }
//
// "columnVisibility" â€” user toggled a column in the Customize panel
//                      event.columnVisibility = { columnKey: true|false }
//
// "columnResize"     â€” user resized a column by dragging
//                      event.columnSizing = { columnKey: newWidth }`;

function TableZTab() {
  return (
    <div className={styles.tabContent}>
      <div className={styles.refBody}>
        <h2 className={styles.stepHeading}>TableZ â€” The Power Table</h2>
        <p className={styles.stepNote}>
          TableZ is the full engine. Use it when you need complete control â€” server-side state,
          drag-and-drop, batch editing, master-detail, or custom rendering.
          For simple tables, use TableX instead.
        </p>
        <p className={styles.stepNote}>
          Anatomy: the parent-owned <strong>Page/Main Toolbar</strong>, followed by optional
          <strong> Batch Toolbar</strong>, <strong>Filter Toolbar</strong>, <strong>Search Toolbar</strong>,
          the <strong>Table Surface</strong>, and optional <strong>Table Footer</strong>.
          Use <code>hideSearch</code> or <code>hideFooter</code> when the parent or a nested table provides those controls.
        </p>
      </div>

      <Accordion items={[
        {
          key: "table-uncontrolled",
          title: "1. Uncontrolled Mode (easy, local data)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Pass <code>data</code> and <code>columns</code>. TableZ handles sorting, filtering, and pagination inside itself.
                Best for small datasets that are already loaded.
              </p>
              <Snippet title="Code" code={TABLE_SNIPPET_UNCONTROLLED} />
            </div>
          ),
        },
        {
          key: "table-controlled",
          title: "2. Controlled Mode (server-driven)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Pass <code>state</code> and <code>onChange</code>. You manage the state, fetch data from the server,
                and update the state when events come in. Use for large datasets.
              </p>
              <Snippet title="Code" code={TABLE_SNIPPET_CONTROLLED} />
            </div>
          ),
        },
        {
          key: "table-masterdetail",
          title: "3. Master-Detail (click row ? show related data)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Two tables side by side. Click a row in the left table, the right table shows related rows.
                Used in Application Setup, Card Module Setup, Company Department Setup.
              </p>
              <Snippet title="Code" code={TABLE_SNIPPET_MASTERDETAIL} />
            </div>
          ),
        },
        {
          key: "table-draggable",
          title: "4. Drag & Drop Reorder",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Let users drag rows to reorder them. The table updates the order field automatically.
              </p>
              <Snippet title="Code" code={TABLE_SNIPPET_DRAGGABLE} />
            </div>
          ),
        },
        {
          key: "table-batch",
          title: "5. Batch Editing (Draft + Baseline + Diff Pattern)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                Batch editing lets users make multiple changes (add, edit, delete rows) without saving each one individually.
                All changes are collected and saved at once when the user clicks &quot;Save Batch&quot;.
              </p>
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
                <p className={styles.ruleHeading}>How Batch Mode Works (Every Admin Module Uses This)</p>
                <pre style={{ fontSize: "0.85rem", overflow: "auto", margin: 0 }}>{`1. LOAD: Fetch data from API â†’ store as BASELINE (frozen) + DRAFT (working copy)
2. EDIT: User adds/edits/deletes rows â†’ changes go to DRAFT only
3. DIFF: Compare DRAFT vs BASELINE â†’ compute what changed (useMemo)
4. SHOW: Highlight changed rows (green=new, blue=modified, red=deleted)
5. SAVE: User clicks "Save Batch" â†’ send only the changes to API
6. RESET: Reload from server â†’ new BASELINE, DRAFT = clone of BASELINE`}</pre>
              </div>
              <Snippet title="Basic Batch Mode" code={TABLE_SNIPPET_BATCH} />
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px", borderLeft: "4px solid #ffc107" }}>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  <strong>Key concept:</strong> The <code>__batchState</code> field on each row tells the table how to highlight it.
                  Values: <code>&quot;created&quot;</code> (green), <code>&quot;updated&quot;</code> (blue), <code>&quot;deleted&quot;</code> (red strikethrough).
                  Your hook computes this by comparing draft vs baseline.
                </p>
              </div>
            </div>
          ),
        },
        {
          key: "table-inline-edit",
          title: "5.1 Inline Editing with InlineEditCell",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>
                <code>InlineEditCell</code> lets users click a table cell to edit its value directly â€” no modal needed.
                Used in Application Setup, Card Module Setup, and other admin modules for quick field edits.
              </p>
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
                <p className={styles.ruleHeading}>How It Works</p>
                <pre style={{ fontSize: "0.85rem", overflow: "auto", margin: 0 }}>{`1. Cell shows text normally (read-only)
2. User clicks the "Edit" row action â†’ row enters edit mode
3. Cells with InlineEditCell become clickable (dashed underline)
4. User clicks a cell â†’ it becomes an input field
5. User types new value â†’ presses Enter or clicks away
6. onCommit fires â†’ your hook stages the change in the batch
7. User clicks "Done" â†’ row exits edit mode
8. All changes saved together via "Save Batch"`}</pre>
              </div>
              <Snippet title="InlineEditCell in a Column Renderer" code={`import { InlineEditCell } from "@/shared/components/ui";

// Inside your column definition:
{
  key: "app_name",
  label: "Application",
  render: (row) => {
    // Only enable editing for the row currently in edit mode
    const isEditing = String(row?.app_id) === String(editingAppId);

    return (
      <InlineEditCell
        value={row?.app_name || ""}
        onCommit={(newValue) => onInlineEdit(row, "app_name", newValue)}
        disabled={!isEditing}
        placeholder="Enter name"
      />
    );
  },
}`} />
              <div className={styles.propGrid}>
                <RefPropRow prop="value" required type="string | number" desc="Current cell value to display" />
                <RefPropRow prop="onCommit" required type="function" desc="(newValue) => void. Called when user finishes editing." />
                <RefPropRow prop="disabled" required={false} type="boolean" desc="When true, cell is read-only (not clickable). Default: false" />
                <RefPropRow prop="placeholder" required={false} type="string" desc="Shown when value is empty. Default: '--'" />
                <RefPropRow prop="type" required={false} type="string" desc="Input type: 'text' | 'number'. Default: 'text'" />
              </div>
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px", borderLeft: "4px solid #ffc107" }}>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  <strong>Pattern:</strong> The row&apos;s edit mode is controlled by an <code>editingAppId</code> state in the hook.
                  Only one row can be in edit mode at a time. The &quot;Edit&quot; action sets it, the &quot;Done&quot; action clears it.
                  This prevents accidental edits and keeps the UI clean.
                </p>
              </div>
            </div>
          ),
        },
        {
          key: "table-columns-ref",
          title: "6. Column Options (full reference)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>Every option you can set on a column.</p>
              <Snippet title="Code" code={TABLE_SNIPPET_COLUMNS_FULL} />
              <div className={styles.propGrid}>
                <RefPropRow prop="key" required type="string" desc="Field name from your row data" />
                <RefPropRow prop="label" required type="string" desc="Column header text" />
                <RefPropRow prop="sortable" required={false} type="boolean" desc="Enable click-to-sort. Default: false" />
                <RefPropRow prop="width" required={false} type="number" desc="Starting pixel width" />
                <RefPropRow prop="minWidth" required={false} type="number" desc="Minimum width when resizing" />
                <RefPropRow prop="defaultVisible" required={false} type="boolean" desc="Set false to hide initially" />
                <RefPropRow prop="render" required={false} type="function" desc="Custom cell renderer: (row) => ReactNode" />
              </div>
            </div>
          ),
        },
        {
          key: "table-actions-ref",
          title: "7. Action Options (full reference)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>Every option you can set on a row action.</p>
              <Snippet title="Code" code={TABLE_SNIPPET_ACTIONS_FULL} />
            </div>
          ),
        },
        {
          key: "table-events-ref",
          title: "8. Table Events (what onChange receives)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>All the event types the table emits through onChange.</p>
              <Snippet title="Event Types" code={TABLE_SNIPPET_EVENTS} />
            </div>
          ),
        },
        {
          key: "table-props-ref",
          title: "9. All Props (quick reference)",
          content: (
            <div className={styles.refBody}>
              <p className={styles.stepNote}>Every prop the TableZ component accepts.</p>
              <div className={styles.propGrid}>
                <RefPropRow prop="data" required type="array" desc="Array of row objects" />
                <RefPropRow prop="columns" required type="object[]" desc="Column config objects" />
                <RefPropRow prop="rowIdKey" required={false} type="string" desc="Unique ID field per row. Default: id" />
                <RefPropRow prop="actions" required={false} type="object[]" desc="Row action buttons" />
                <RefPropRow prop="state" required={false} type="object" desc="Controlled state (turns on controlled mode)" />
                <RefPropRow prop="onChange" required={false} type="function" desc="Event handler (required with state)" />
                <RefPropRow prop="filterConfig" required={false} type="object[]" desc="Filter definitions (controlled mode)" />
                <RefPropRow prop="loading" required={false} type="boolean" desc="Show loading spinner" />
                <RefPropRow prop="selectedRowId" required={false} type="string | number" desc="Highlight a row (master-detail)" />
                <RefPropRow prop="onRowClick" required={false} type="function" desc="Click handler for row selection" />
                <RefPropRow prop="draggable" required={false} type="boolean" desc="Enable drag-and-drop reorder" />
                <RefPropRow prop="onReorder" required={false} type="function" desc="Callback with reordered rows" />
                <RefPropRow prop="batchMode" required={false} type="boolean" desc="Enable batch editing" />
                <RefPropRow prop="onBatchChange" required={false} type="function" desc="Callback with batch payload" />
                <RefPropRow prop="onBatchSave" required={false} type="function" desc="Callback to save batch" />
                <RefPropRow prop="emptyMessage" required={false} type="string" desc="Message when no rows" />
                <RefPropRow prop="searchPlaceholder" required={false} type="string" desc="Search bar placeholder text" />
              </div>
            </div>
          ),
        },
        {
          key: "table-when-to-use",
          title: "11. When to Use TableZ vs TableX",
          content: (
            <div className={styles.refBody}>
              <div className={styles.ruleGrid}>
                <div className={styles.ruleCol}>
                  <p className={styles.ruleHeading}>Use TableX When</p>
                  <ul className={styles.ruleList}>
                    <li>You just need to show data from a database table</li>
                    <li>You want filters, sorting, pagination to just work</li>
                    <li>You don not need drag, batch, or master-detail</li>
                    <li>You want the simplest possible code</li>
                  </ul>
                </div>
                <div className={styles.ruleCol}>
                  <p className={styles.ruleHeading}>Use TableZ When</p>
                  <ul className={styles.ruleList}>
                    <li>You need full control over state and data fetching</li>
                    <li>You need drag-and-drop reordering</li>
                    <li>You need batch editing (create/update/delete)</li>
                    <li>You need master-detail (click row ? show related)</li>
                    <li>You need custom server-side logic</li>
                  </ul>
                </div>
              </div>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const TABS = [
  { id: "quick-start", label: "Quick Start" },
  { id: "playground",  label: "Playground"  },
  { id: "tablex",      label: "TableX"      },
  { id: "tablez",      label: "TableZ"      },
  { id: "reference",   label: "Reference"   },
];

export default function SharedUiReferencePage() {
  const [activeTab, setActiveTab] = useState("quick-start");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.kicker}>Shared UI Components</p>
          <h1 className={styles.title}>Developer Guide</h1>
          <p className={styles.subtitle}>Scan, copy, move on.</p>
        </div>
        <nav className={styles.tabBar} role="tablist" aria-label="Page sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={[styles.tab, activeTab === tab.id ? styles.tabActive : ""].filter(Boolean).join(" ")}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "quick-start" && <QuickStartTab />}
      {activeTab === "playground"  && <PlaygroundTab />}
      {activeTab === "tablex"      && <TableXTab />}
      {activeTab === "tablez"      && <TableZTab />}
      {activeTab === "reference"   && <ReferenceTab  />}
    </div>
  );
}
