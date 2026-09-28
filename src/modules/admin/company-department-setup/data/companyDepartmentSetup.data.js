/**
 * Company Department Setup — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and batch save orchestration.
 */

import {
  createCompanyAction, updateCompanyAction, deactivateCompanyAction, hardDeleteCompanyAction,
  createDepartmentAction, updateDepartmentAction, deactivateDepartmentAction, hardDeleteDepartmentAction,
} from "./companyDepartmentSetup.actions.js";

// ─── MODEL HELPERS ─────────────────────────────────────────

export function isCompanyActive(company) {
  if (company?.is_active === false || company?.is_active === 0) return false;
  const text = String(company?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getCompanyDisplayName(c) { return c?.comp_name || c?.company_name || c?.name || "Unknown"; }
export function getCompanyShortName(c) { return c?.comp_short_name || c?.short_name || c?.comp_short || c?.abbr || "--"; }
export function getCompanyEmail(c) { return c?.comp_email || c?.company_email || c?.email || "--"; }
export function getCompanyPhone(c) { return c?.comp_phone || c?.company_phone || c?.phone || "--"; }

export function isDepartmentActive(dept) {
  if (dept?.is_active === false || dept?.is_active === 0) return false;
  const text = String(dept?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getDepartmentDisplayName(d) { return d?.dept_name || d?.department_name || d?.name || "Unknown"; }
export function getDepartmentShortName(d) { return d?.dept_short_name || d?.short_name || d?.dept_short || d?.abbr || "--"; }

export function mapCompanyRow(company, index) {
  return {
    ...company,
    id: company?.comp_id ?? `company-${index}`,
    comp_name: getCompanyDisplayName(company),
    comp_short_name: getCompanyShortName(company),
    comp_email: getCompanyEmail(company),
    comp_phone: getCompanyPhone(company),
    is_active_bool: isCompanyActive(company),
  };
}

export function mapDepartmentRow(department, index) {
  return {
    ...department,
    id: department?.dept_id ?? `department-${index}`,
    dept_name: getDepartmentDisplayName(department),
    dept_short_name: getDepartmentShortName(department),
    is_active_bool: isDepartmentActive(department),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function parseCompanyId(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const asNumber = Number(text);
  return Number.isFinite(asNumber) ? asNumber : text;
}

export function isSameId(l, r) { return String(l ?? "") === String(r ?? ""); }

export function compareText(l, r) {
  return String(l || "").localeCompare(String(r || ""), undefined, { sensitivity: "base", numeric: true });
}

export function normalizeText(value) { return String(value ?? "").trim(); }

export function removeObjectKey(obj, key) {
  const k = String(key ?? "");
  const next = {};
  Object.entries(obj || {}).forEach(([k2, v]) => { if (k2 !== k) next[k2] = v; });
  return next;
}

export function mergeUpdatePatch(prev, patch) {
  const m = { ...(prev || {}) };
  Object.entries(patch || {}).forEach(([k, v]) => { if (v !== undefined) m[k] = v; });
  return m;
}

export function appendUniqueId(list, value) {
  const v = String(value ?? "");
  if (!v) return Array.isArray(list) ? [...list] : [];
  const arr = Array.isArray(list) ? list : [];
  if (arr.some((e) => isSameId(e, v))) return [...arr];
  return [...arr, v];
}

// ─── CONSTANTS & BATCH STATE ───────────────────────────────

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_COMPANY_PREFIX = "tmp-company-";
export const TEMP_DEPARTMENT_PREFIX = "tmp-department-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempCompanyId(v) { return String(v ?? "").startsWith(TEMP_COMPANY_PREFIX); }
export function isTempDepartmentId(v) { return String(v ?? "").startsWith(TEMP_DEPARTMENT_PREFIX); }

export function createEmptyCompanyChanges() { return { creates: [], updates: {}, deactivations: [], hardDeletes: [] }; }
export function createEmptyDepartmentChanges() { return { creates: [], updates: {}, deactivations: [], hardDeletes: [] }; }

export function remapDepartmentsByCompanyId(departments, companyIdMap) {
  return (Array.isArray(departments) ? departments : []).map((d, i) => {
    const sourceId = d?.comp_id;
    const nextId = companyIdMap.get(String(sourceId ?? "")) ?? sourceId;
    return mapDepartmentRow({ ...d, comp_id: nextId }, i);
  });
}

// ─── BATCH SAVE (calls Server Actions) ─────────────────────

export async function executeBatchSave(companyChanges, departmentChanges, orderedCompanies, selectedCompanyId) {
  const companyIdMap = new Map();
  const deactivatedCompanySet = new Set(
    [...(companyChanges.deactivations || []), ...(companyChanges.hardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedDepartmentSet = new Set(
    [...(departmentChanges.deactivations || []), ...(departmentChanges.hardDeletes || [])].map((id) => String(id ?? "")),
  );

  // Create companies
  for (const entry of companyChanges.creates || []) {
    const created = await createCompanyAction(entry.payload);
    const id = created?.comp_id;
    if (id == null || id === "") throw new Error("Created company response is invalid.");
    companyIdMap.set(String(entry.tempId), id);
  }

  // Update companies
  for (const [companyId, updates] of Object.entries(companyChanges.updates || {})) {
    const resolved = companyIdMap.get(String(companyId)) ?? companyId;
    if (deactivatedCompanySet.has(String(resolved)) || isTempCompanyId(resolved)) continue;
    if (Object.keys(updates || {}).length === 0) continue;
    await updateCompanyAction(resolved, updates);
  }

  // Deactivate companies
  for (const companyId of companyChanges.deactivations || []) {
    const resolved = companyIdMap.get(String(companyId)) ?? companyId;
    if (isTempCompanyId(resolved)) continue;
    await deactivateCompanyAction(resolved);
  }

  // Create departments (remap comp_id for newly created companies)
  for (const entry of departmentChanges.creates || []) {
    const draftCompId = entry?.payload?.comp_id;
    const resolved = companyIdMap.get(String(draftCompId ?? "")) ?? draftCompId;
    if (!resolved || deactivatedCompanySet.has(String(resolved))) continue;
    if (isTempCompanyId(resolved)) throw new Error("Save company batch first before saving departments for a newly created company.");
    await createDepartmentAction({ ...entry.payload, comp_id: resolved });
  }

  // Update departments
  for (const [deptId, updates] of Object.entries(departmentChanges.updates || {})) {
    if (deactivatedDepartmentSet.has(String(deptId)) || isTempDepartmentId(deptId)) continue;
    if (Object.keys(updates || {}).length === 0) continue;
    await updateDepartmentAction(deptId, updates);
  }

  // Deactivate departments
  for (const deptId of departmentChanges.deactivations || []) {
    if (isTempDepartmentId(deptId)) continue;
    await deactivateDepartmentAction(deptId);
  }

  // Hard delete departments
  for (const deptId of departmentChanges.hardDeletes || []) {
    if (isTempDepartmentId(deptId)) continue;
    await hardDeleteDepartmentAction(deptId);
  }

  // Hard delete companies
  for (const companyId of companyChanges.hardDeletes || []) {
    const resolved = companyIdMap.get(String(companyId)) ?? companyId;
    if (isTempCompanyId(resolved)) continue;
    await hardDeleteCompanyAction(resolved);
  }

  const orderedPersistedCompanyIds = orderedCompanies
    .map((c) => companyIdMap.get(String(c?.comp_id ?? "")) ?? c?.comp_id)
    .filter((id) => id != null && id !== "")
    .filter((id) => !deactivatedCompanySet.has(String(id)) && !isTempCompanyId(id));

  const selectedResolved = companyIdMap.get(String(selectedCompanyId ?? "")) ?? selectedCompanyId ?? null;
  const nextSelectedCompanyId = selectedResolved && !deactivatedCompanySet.has(String(selectedResolved)) && !isTempCompanyId(selectedResolved)
    ? selectedResolved : (orderedPersistedCompanyIds[0] ?? null);

  return { companyIdMap, nextSelectedCompanyId };
}
