/**
 * Application Setup — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and batch save orchestration.
 */

import {
  createApplicationAction,
  updateApplicationAction,
  deactivateApplicationAction,
  hardDeleteApplicationAction,
  createRoleAction,
  updateRoleAction,
  deactivateRoleAction,
  hardDeleteRoleAction,
  saveApplicationOrderAction,
} from "./applicationSetup.actions.js";

// ─── MODEL HELPERS ─────────────────────────────────────────

export function isApplicationActive(app) {
  if (app?.is_active === false || app?.is_active === 0) return false;
  const text = String(app?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getApplicationDisplayName(app) {
  return app?.app_name || app?.name || "Unknown";
}

export function getApplicationDescription(app) {
  return app?.app_desc || app?.description || "--";
}

export function getApplicationModuleKey(app) {
  return app?.module_key || "--";
}

export function normalizeModuleKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function getApplicationDisplayOrder(app, fallback = 0) {
  const candidates = [app?.display_order, app?.app_order, app?.sort_order, app?.order_no];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function isRoleActive(role) {
  if (role?.is_active === false || role?.is_active === 0) return false;
  const text = String(role?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getRoleDisplayName(role) {
  return role?.role_name || role?.name || "Unknown";
}

export function getRoleDescription(role) {
  return role?.role_desc || role?.description || "--";
}

export function mapApplicationRow(app, index) {
  return {
    ...app,
    id: app?.app_id ?? `app-${index}`,
    app_name: getApplicationDisplayName(app),
    app_desc: getApplicationDescription(app),
    module_key: getApplicationModuleKey(app),
    app_order: getApplicationDisplayOrder(app, index + 1),
    is_active_bool: isApplicationActive(app),
  };
}

export function mapRoleRow(role, index) {
  return {
    ...role,
    id: role?.role_id ?? `role-${index}`,
    role_name: getRoleDisplayName(role),
    role_desc: getRoleDescription(role),
    is_active_bool: isRoleActive(role),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function parseAppId(value) {
  if (value === undefined || value === null || value === "") return null;
  const asNumber = Number(String(value).trim());
  return Number.isFinite(asNumber) ? asNumber : String(value).trim();
}

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base", numeric: true });
}

export function buildOrderSignature(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => String(r?.app_id || "")).join("|");
}

export function removeObjectKey(obj, key) {
  const k = String(key ?? "");
  const next = {};
  Object.entries(obj || {}).forEach(([k2, v]) => { if (k2 !== k) next[k2] = v; });
  return next;
}

export function mergeUpdatePatch(prev, patch) {
  const merged = { ...(prev || {}) };
  Object.entries(patch || {}).forEach(([k, v]) => { if (v !== undefined) merged[k] = v; });
  return merged;
}

export function appendUniqueId(list, value) {
  const v = String(value ?? "");
  if (!v) return Array.isArray(list) ? [...list] : [];
  const arr = Array.isArray(list) ? list : [];
  if (arr.some((e) => isSameId(e, v))) return [...arr];
  return [...arr, v];
}

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_APP_PREFIX = "tmp-app-";
export const TEMP_ROLE_PREFIX = "tmp-role-";

export function createEmptyBatchState() {
  return { appCreates: [], appUpdates: {}, appDeactivations: [], appHardDeletes: [], roleCreates: [], roleUpdates: {}, roleDeactivations: [], roleHardDeletes: [] };
}

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempApplicationId(v) { return String(v ?? "").startsWith(TEMP_APP_PREFIX); }
export function isTempRoleId(v) { return String(v ?? "").startsWith(TEMP_ROLE_PREFIX); }

// ─── BATCH SAVE (calls Server Actions) ─────────────────────

export async function executeBatchSave(pendingBatch, orderedApplications) {
  const appIdMap = new Map();
  const deactivatedAppSet = new Set(
    [...(pendingBatch.appDeactivations || []), ...(pendingBatch.appHardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedRoleSet = new Set(
    [...(pendingBatch.roleDeactivations || []), ...(pendingBatch.roleHardDeletes || [])].map((id) => String(id ?? "")),
  );

  for (const entry of pendingBatch.appCreates || []) {
    const created = await createApplicationAction(entry.payload);
    const id = created?.app_id;
    if (id == null || id === "") throw new Error("Created application response is invalid.");
    appIdMap.set(String(entry.tempId), id);
  }

  for (const [appId, updates] of Object.entries(pendingBatch.appUpdates || {})) {
    if (deactivatedAppSet.has(String(appId)) || !Object.keys(updates || {}).length) continue;
    const resolved = appIdMap.get(String(appId)) ?? appId;
    await updateApplicationAction(resolved, updates);
  }

  for (const entry of pendingBatch.roleCreates || []) {
    const draftAppId = entry?.payload?.app_id;
    const resolved = appIdMap.get(String(draftAppId ?? "")) ?? draftAppId;
    if (!resolved || deactivatedAppSet.has(String(resolved))) continue;
    await createRoleAction({ ...entry.payload, app_id: resolved });
  }

  for (const [roleId, updates] of Object.entries(pendingBatch.roleUpdates || {})) {
    if (deactivatedRoleSet.has(String(roleId)) || !Object.keys(updates || {}).length) continue;
    await updateRoleAction(roleId, updates);
  }

  for (const roleId of pendingBatch.roleDeactivations || []) {
    if (isTempRoleId(roleId)) continue;
    await deactivateRoleAction(roleId);
  }

  for (const appId of pendingBatch.appDeactivations || []) {
    if (isTempApplicationId(appId)) continue;
    await deactivateApplicationAction(appId);
  }

  for (const roleId of pendingBatch.roleHardDeletes || []) {
    if (isTempRoleId(roleId)) continue;
    await hardDeleteRoleAction(roleId);
  }

  for (const appId of pendingBatch.appHardDeletes || []) {
    if (isTempApplicationId(appId)) continue;
    await hardDeleteApplicationAction(appId);
  }

  const orderedPersistedAppIds = orderedApplications
    .map((app) => app?.app_id)
    .map((id) => appIdMap.get(String(id ?? "")) ?? id)
    .filter((id) => id != null && id !== "")
    .filter((id) => !deactivatedAppSet.has(String(id)))
    .filter((id) => !isTempApplicationId(id));

  if (orderedPersistedAppIds.length > 0) {
    await saveApplicationOrderAction(orderedPersistedAppIds);
  }

  return { appIdMap, deactivatedAppSet, orderedPersistedAppIds };
}
