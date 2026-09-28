/**
 * User Master Setup — Data Layer (client-safe utilities)
 *
 * All client-side form helpers, batch state management, and
 * server action wrappers (replacing old fetch() calls to API routes).
 */

import {
  loadUserMasterLookups, loadUserMasterUsers, loadUserMasterDetail,
  createUserAction, updateUserAction, deleteUserAction,
  createAccessAction, deleteAccessAction,
} from "./userMasterSetup.actions.js";

// ─── CONSTANTS ─────────────────────────────────────────────

export const TABS = [
  { key: "profile", label: "Profile", description: "Core identity and contact details for the selected user." },
  { key: "organization", label: "Organization", description: "Company assignment, department hierarchy, position, and workflow status." },
  { key: "access", label: "Access", description: "Application and role mappings for what the user can access." },
  { key: "account", label: "Account", description: "Authentication account controls and last login activity." },
];

export const EMPTY_LOOKUPS = { companies: [], departments: [], statuses: [], applications: [], roles: [] };

export function createEmptyPendingBatch() {
  return { creates: [], updates: {}, accessUpserts: {}, accessDeletes: {} };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function normalizeText(value) { return String(value ?? "").trim(); }
export function normalizeEmail(value) { return normalizeText(value).toLowerCase() || ""; }
export function normalizeOptionalText(value) { const t = normalizeText(value); return t === "" ? null : t; }
export function asChoiceValue(value) { return value == null ? "" : String(value); }
export function rowIdOf(row) { return String(row?.id ?? row?.user_id ?? ""); }
export function isTemporaryId(value) { return normalizeText(value).startsWith("tmp-"); }

export function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const t = normalizeText(value).toLowerCase();
  if (!t) return false;
  return !(t === "false" || t === "0" || t === "f" || t === "n" || t === "no");
}

export function inferActiveFromStatus(statusId, statuses, fallback = true) {
  const status = (Array.isArray(statuses) ? statuses : []).find((e) => String(e?.status_id) === String(statusId));
  if (!status) return Boolean(fallback);
  const label = normalizeText(status?.label).toLowerCase();
  if (!label) return Boolean(fallback);
  if (/(inactive|deactiv|disable|suspend|closed|terminated)/.test(label)) return false;
  if (/(active|enable|open)/.test(label)) return true;
  return Boolean(fallback);
}

export function formatDateForInput(value) {
  const t = normalizeText(value);
  if (!t) return "";
  return t.includes("T") ? t.split("T")[0] : t;
}

export function formatDateTime(value) {
  const t = normalizeText(value);
  if (!t) return "--";
  const p = new Date(t);
  return Number.isNaN(p.getTime()) ? t : p.toLocaleString();
}

export function buildFullName(form) {
  const first = normalizeText(form?.first_name);
  const middle = normalizeText(form?.middle_name);
  const last = normalizeText(form?.last_name);
  const username = normalizeText(form?.username);
  if (!first && !last) return username;
  return [first, middle, last].filter(Boolean).join(" ").trim() || username;
}

// ─── FORM HELPERS ──────────────────────────────────────────

function hasOwn(source, key) { return Object.prototype.hasOwnProperty.call(source || {}, key); }

export function createEmptyForm(defaultStatusId = null, statuses = []) {
  return {
    employee_id: "",
    username: "", first_name: "", middle_name: "", last_name: "",
    email: "", phone: "", address: "",
    comp_id: null, dept_id: null, position: "", hire_date: "",
    status_id: defaultStatusId ?? null,
    is_active: inferActiveFromStatus(defaultStatusId, statuses, true),
    last_login_at: "",
  };
}

export function createFormFromUser(user, fallbackStatusId, statuses) {
  const statusId = user?.status_id ?? fallbackStatusId ?? null;
  return {
    employee_id: normalizeText(user?.employee_id),
    username: normalizeText(user?.username), first_name: normalizeText(user?.first_name),
    middle_name: normalizeText(user?.middle_name), last_name: normalizeText(user?.last_name),
    email: normalizeText(user?.email), phone: normalizeText(user?.phone),
    address: normalizeText(user?.address),
    comp_id: user?.comp_id ?? null, dept_id: user?.dept_id ?? null,
    position: normalizeText(user?.position), hire_date: formatDateForInput(user?.hire_date),
    status_id: statusId,
    is_active: hasOwn(user, "is_active") ? isTruthy(user?.is_active) : inferActiveFromStatus(statusId, statuses, true),
    last_login_at: normalizeText(user?.last_login_at),
  };
}

export function cloneForm(form) { return { ...form }; }
export function cloneAccessRows(rows) { return (Array.isArray(rows) ? rows : []).map((r) => ({ ...r })); }

export function findLabel(options, idKey, idValue) {
  const matched = (Array.isArray(options) ? options : []).find((item) => String(item?.[idKey]) === String(idValue));
  return normalizeText(matched?.label) || "--";
}

export function summarizeUserRow(form, lookups, previousRow = {}) {
  const fullName = buildFullName(form) || "--";
  const statusLabel = findLabel(lookups?.statuses, "status_id", form?.status_id) || (form?.is_active ? "ACTIVE" : "INACTIVE");
  return {
    ...previousRow,
    id: previousRow?.id ?? previousRow?.user_id, user_id: previousRow?.user_id ?? previousRow?.id,
    employee_id: normalizeText(form?.employee_id) || "--",
    username: normalizeText(form?.username) || "--",
    full_name: fullName, display_name: fullName,
    email: normalizeText(form?.email) || "--",
    company_name: findLabel(lookups?.companies, "comp_id", form?.comp_id),
    department_name: findLabel(lookups?.departments, "dept_id", form?.dept_id),
    status_label: statusLabel.toUpperCase(), status_id: form?.status_id ?? null,
    comp_id: form?.comp_id ?? null, dept_id: form?.dept_id ?? null,
    is_active: Boolean(form?.is_active),
  };
}

export function makeLocalAccessRow(appId, roleId, lookups, current = {}) {
  const generatedKey = `${String(appId)}::${String(roleId)}::${Date.now().toString(36)}`;
  return {
    ...current,
    access_key: current?.access_key || generatedKey,
    app_id: appId, role_id: roleId,
    application_name: findLabel(lookups?.applications, "app_id", appId),
    role_name: findLabel(lookups?.roles, "role_id", roleId),
    is_active: true,
  };
}

// ─── ACCESS DIFF ───────────────────────────────────────────

function toAccessSet(rows) {
  const m = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r) return;
    const a = normalizeText(r?.app_id), ro = normalizeText(r?.role_id);
    if (!a || !ro) return;
    const key = `${a}::${ro}`;
    if (!m.has(key)) m.set(key, { app_id: a, role_id: ro, is_active: isTruthy(r?.is_active) });
  });
  return m;
}

export function diffAccessRows(originalRows, currentRows) {
  const originalSet = toAccessSet(originalRows), currentSet = toAccessSet(currentRows);
  const deletes = []; originalSet.forEach((v, k) => { if (!currentSet.has(k)) deletes.push(v); });
  const upserts = [];
  currentSet.forEach((v, k) => {
    const orig = originalSet.get(k);
    if (!orig) { upserts.push(v); return; }
    if (orig.is_active !== v.is_active) upserts.push(v);
  });
  return { deletes, upserts };
}

// ─── BATCH HELPERS ─────────────────────────────────────────

export function buildUserPayload(form, password) {
  return {
    username: normalizeText(form?.username), email: normalizeEmail(form?.email),
    first_name: normalizeOptionalText(form?.first_name), middle_name: normalizeOptionalText(form?.middle_name),
    last_name: normalizeOptionalText(form?.last_name), phone: normalizeOptionalText(form?.phone),
    address: normalizeOptionalText(form?.address),
    comp_id: normalizeOptionalText(form?.comp_id), dept_id: normalizeOptionalText(form?.dept_id),
    position: normalizeOptionalText(form?.position), hire_date: normalizeOptionalText(form?.hire_date),
    status_id: normalizeOptionalText(form?.status_id), is_active: Boolean(form?.is_active),
    ...(normalizeText(password) ? { password: normalizeText(password) } : {}),
  };
}

export function buildPanelSnapshot(form, accessRows, setNewPassword, password, confirmPassword) {
  const access = (Array.isArray(accessRows) ? accessRows : [])
    .map((r) => ({ app_id: normalizeText(r?.app_id), role_id: normalizeText(r?.role_id), is_active: isTruthy(r?.is_active) }))
    .filter((r) => r.app_id && r.role_id)
    .sort((a, b) => `${a.app_id}:${a.role_id}`.localeCompare(`${b.app_id}:${b.role_id}`));
  return JSON.stringify({
    form: {
      username: normalizeText(form?.username), first_name: normalizeText(form?.first_name),
      middle_name: normalizeText(form?.middle_name), last_name: normalizeText(form?.last_name),
      email: normalizeText(form?.email), phone: normalizeText(form?.phone), address: normalizeText(form?.address),
      comp_id: normalizeText(form?.comp_id), dept_id: normalizeText(form?.dept_id),
      position: normalizeText(form?.position), hire_date: normalizeText(form?.hire_date),
      status_id: normalizeText(form?.status_id), is_active: isTruthy(form?.is_active),
    },
    access,
    password: setNewPassword ? normalizeText(password) : "",
    password_confirm: setNewPassword ? normalizeText(confirmPassword) : "",
  });
}

export function pendingBatchCount(batch) {
  const c = Array.isArray(batch?.creates) ? batch.creates.length : 0;
  const u = Object.keys(batch?.updates || {}).length;
  const au = Object.values(batch?.accessUpserts || {}).reduce((s, r) => s + (r?.length || 0), 0);
  const ad = Object.values(batch?.accessDeletes || {}).reduce((s, r) => s + (r?.length || 0), 0);
  return c + u + au + ad;
}

export function replaceObjectKeyWithArray(source, key, rows) {
  const next = { ...(source || {}) };
  if (!Array.isArray(rows) || rows.length === 0) { delete next[key]; return next; }
  next[key] = rows; return next;
}

export function removeObjectKey(source, key) {
  const next = { ...(source || {}) }; delete next[key]; return next;
}

// ─── SERVER ACTION WRAPPERS (replace old fetch() calls) ────

export async function fetchLookups() {
  return loadUserMasterLookups();
}

export async function fetchUsers() {
  return loadUserMasterUsers();
}

export async function fetchUserDetail(userId) {
  return loadUserMasterDetail(userId);
}

export async function executeBatchSave(pendingBatch) {
  const createdIdMap = new Map();

  for (const entry of pendingBatch.creates || []) {
    const user = await createUserAction(entry?.payload || {});
    const createdId = rowIdOf(user);
    if (!createdId) throw new Error("Created user did not return a valid id.");
    createdIdMap.set(String(entry?.tempId), String(createdId));
    for (const access of entry?.accessRows || []) {
      await createAccessAction(createdId, { app_id: access?.app_id, role_id: access?.role_id });
    }
  }

  for (const [rawId, payload] of Object.entries(pendingBatch.updates || {})) {
    const resolvedId = createdIdMap.get(String(rawId)) || rawId;
    if (!resolvedId || isTemporaryId(resolvedId)) continue;
    await updateUserAction(resolvedId, payload || {});
  }

  for (const [rawId, rows] of Object.entries(pendingBatch.accessDeletes || {})) {
    const resolvedId = createdIdMap.get(String(rawId)) || rawId;
    if (!resolvedId || isTemporaryId(resolvedId)) continue;
    for (const row of rows || []) {
      await deleteAccessAction(resolvedId, { app_id: row?.app_id, role_id: row?.role_id });
    }
  }

  for (const [rawId, rows] of Object.entries(pendingBatch.accessUpserts || {})) {
    const resolvedId = createdIdMap.get(String(rawId)) || rawId;
    if (!resolvedId || isTemporaryId(resolvedId)) continue;
    for (const row of rows || []) {
      await createAccessAction(resolvedId, { app_id: row?.app_id, role_id: row?.role_id });
    }
  }

  return createdIdMap;
}

export async function executeDeactivateUser(userId) {
  const result = await deleteUserAction(userId);
  return Number(result?.revokedAccessCount || 0);
}
