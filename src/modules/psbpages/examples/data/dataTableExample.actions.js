"use server";

// ── mock data ──────────────────────────────────────────────
const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Pending", value: "pending" },
  { label: "Suspended", value: "suspended" },
];

const ROLE_OPTIONS = [
  { label: "Admin", value: "admin" },
  { label: "Manager", value: "manager" },
  { label: "Analyst", value: "analyst" },
  { label: "Viewer", value: "viewer" },
];

const TEAM_OPTIONS = ["Platform", "Finance", "Operations", "Audit", "Risk", "Support"];

const FIRST_NAMES = ["Avery","Jordan","Casey","Taylor","Morgan","Quinn","Reese","Drew","Jamie","Riley","Parker","Emerson"];
const LAST_NAMES = ["Nguyen","Carter","Lopez","Patel","Rivera","Kim","Johnson","Wright","Torres","Walker","Allen","Price"];

const EXPORT_COLUMN_DEFINITIONS = [
  { key: "employee_code", label: "Employee Code" },
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "team", label: "Team" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Created At" },
];

const SORTABLE_KEYS = new Set(EXPORT_COLUMN_DEFINITIONS.map((c) => c.key));
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const MOCK_ROWS = Array.from({ length: 180 }, (_, i) => {
  const id = i + 1;
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(i * 5) % LAST_NAMES.length];
  const status = STATUS_OPTIONS[(i * 7) % STATUS_OPTIONS.length].value;
  const role = ROLE_OPTIONS[(i * 3) % ROLE_OPTIONS.length].value;
  const team = TEAM_OPTIONS[(i * 2) % TEAM_OPTIONS.length];
  const createdAt = new Date(Date.UTC(2025, 0, 1));
  createdAt.setUTCDate(createdAt.getUTCDate() + i * 2);
  return {
    id, employee_code: `EMP-${String(id).padStart(4, "0")}`,
    full_name: `${firstName} ${lastName}`,
    email: `${firstName}.${lastName}${id}@psbuniverse.local`.toLowerCase(),
    team, role, status, created_at: createdAt.toISOString().slice(0, 10),
  };
});

// ── helpers ────────────────────────────────────────────────
function toInt(v, fb) { const p = Number(v); return Number.isFinite(p) ? Math.trunc(p) : fb; }
function normalizeText(v) { return String(v ?? "").trim().toLowerCase(); }
function getOptionLabel(opts, v) { const n = normalizeText(v); const m = opts.find((o) => normalizeText(o.value) === n); return m ? m.label : String(v || ""); }
function parseDateOnly(v) { const t = String(v ?? "").trim(); if (!t) return null; const d = new Date(`${t}T00:00:00Z`); return Number.isFinite(d.getTime()) ? d : null; }

function compareValues(l, r) {
  if (typeof l === "number" && typeof r === "number") return l - r;
  const ld = Date.parse(String(l)); const rd = Date.parse(String(r));
  if (Number.isFinite(ld) && Number.isFinite(rd)) return ld - rd;
  return String(l ?? "").localeCompare(String(r ?? ""), undefined, { sensitivity: "base", numeric: true });
}

function escapeSeparatedValue(v, d) {
  const raw = String(v ?? "");
  if (d === "\t") return raw.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function resolveSortKey(v) { const c = String(v || "").trim(); return c && SORTABLE_KEYS.has(c) ? c : ""; }
function resolveSortDirection(v) { return String(v || "desc").toLowerCase() === "asc" ? "asc" : "desc"; }

function matchesSearch(row, q) {
  if (!q) return true;
  return [row.employee_code, row.full_name, row.email, row.team, row.role, row.status, row.created_at]
    .some((f) => normalizeText(f).includes(q));
}

function matchesDateRange(rowDate, start, end) {
  if (!start && !end) return true;
  const d = parseDateOnly(rowDate); if (!d) return false;
  if (start && d.getTime() < start.getTime()) return false;
  if (end && d.getTime() > end.getTime()) return false;
  return true;
}

function queryRows(
  { search = "", status = "", role = "", createdStart = "", createdEnd = "", sortKey = "", sortDirection = "desc", page = 1, pageSize = DEFAULT_PAGE_SIZE } = {},
  { paginate = true } = {},
) {
  const ns = normalizeText(search), nst = normalizeText(status), nr = normalizeText(role);
  const startDate = parseDateOnly(createdStart), endDate = parseDateOnly(createdEnd);
  const rsk = resolveSortKey(sortKey), rsd = resolveSortDirection(sortDirection);

  const filtered = MOCK_ROWS.filter((row) => {
    if (!matchesSearch(row, ns)) return false;
    if (nst && normalizeText(row.status) !== nst) return false;
    if (nr && normalizeText(row.role) !== nr) return false;
    if (!matchesDateRange(row.created_at, startDate, endDate)) return false;
    return true;
  }).slice();

  if (rsk) filtered.sort((a, b) => { const c = compareValues(a[rsk], b[rsk]); return rsd === "asc" ? c : c * -1; });

  const total = filtered.length;
  const sps = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(pageSize, DEFAULT_PAGE_SIZE)));
  const maxP = Math.max(1, Math.ceil(total / sps));
  const sp = Math.min(maxP, Math.max(1, toInt(page, 1)));
  const paged = paginate ? filtered.slice((sp - 1) * sps, sp * sps) : filtered;
  const rows = paged.map((r) => ({ ...r, status_label: getOptionLabel(STATUS_OPTIONS, r.status), role_label: getOptionLabel(ROLE_OPTIONS, r.role) }));
  return { rows, total, page: sp, pageSize: sps, sort: { key: rsk, direction: rsk ? rsd : "" } };
}

// ── exported server actions ────────────────────────────────
export async function getDataTableFilterOptions() {
  return { statusOptions: STATUS_OPTIONS, roleOptions: ROLE_OPTIONS };
}

export async function queryDataTableRows(params = {}) {
  return queryRows(params, { paginate: true });
}

export async function exportDataTable(params = {}) {
  const format = String(params.format || "csv").toLowerCase() === "excel" ? "excel" : "csv";
  const scope = String(params.scope || "all-filtered").toLowerCase();
  const columnKeys = Array.isArray(params.columns)
    ? params.columns.map((k) => String(k || "").trim()).filter(Boolean) : [];

  const { rows } = queryRows({
    search: params.search || "", status: params.status || "", role: params.role || "",
    createdStart: params.createdStart || "", createdEnd: params.createdEnd || "",
    sortKey: params.sortKey || "", sortDirection: params.sortDirection || "desc",
    page: params.page || 1, pageSize: params.pageSize || 50,
  }, { paginate: scope === "current-page" });

  const delimiter = format === "excel" ? "\t" : ",";
  const allowedColumns = new Set(EXPORT_COLUMN_DEFINITIONS.map((c) => c.key));
  const requested = columnKeys.filter((k) => allowedColumns.has(k));
  const selected = requested.length > 0
    ? EXPORT_COLUMN_DEFINITIONS.filter((c) => requested.includes(c.key))
    : EXPORT_COLUMN_DEFINITIONS;

  const header = selected.map((c) => escapeSeparatedValue(c.label, delimiter)).join(delimiter);
  const data = rows.map((r) => selected.map((c) => escapeSeparatedValue(r[c.key], delimiter)).join(delimiter));
  const ext = format === "excel" ? "xls" : "csv";
  const ts = new Date().toISOString().slice(0, 10);

  return {
    content: [header, ...data].join("\n"),
    fileName: `data-table-export-${ts}.${ext}`,
    mimeType: format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/csv; charset=utf-8",
  };
}
