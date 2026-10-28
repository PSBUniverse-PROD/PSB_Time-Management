/**
 * Workflow Reference Tables — Data Layer (client-safe utilities)
 *
 * Generic batch state management for simple reference tables
 * (Stage Types, Approval Types, Org Roles) and mapping tables
 * (Stage Participants, User Org Roles).
 */

import { saveRefTableBatch } from "./workflow.actions.js";

// ─── ID / TEXT HELPERS ─────────────────────────────────────

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base", numeric: true });
}

export function normalizeText(value) {
  return String(value ?? "").trim();
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

// ─── BOOLEAN HELPERS ───────────────────────────────────────

export function isActiveBool(record) {
  if (record?.is_active === false || record?.is_active === 0) return false;
  const text = String(record?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

// ─── TEMP ID HELPERS ───────────────────────────────────────

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_REF_PREFIX = "tmp-ref-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempRefId(v) {
  return String(v ?? "").startsWith(TEMP_REF_PREFIX);
}

export function createEmptyRefChanges() {
  return { creates: [], updates: {}, deactivations: [], hardDeletes: [] };
}

// ─── ROW MAPPERS ───────────────────────────────────────────

export function mapRefRow(row, index, config) {
  const { idField = "id", nameField = "name", descField = "description" } = config || {};
  return {
    ...row,
    id: row?.[idField] ?? `ref-${index}`,
    ref_id: row?.[idField] ?? `ref-${index}`,
    ref_name: row?.[nameField] || "Unknown",
    ref_desc: row?.[descField] || "--",
    is_active_bool: isActiveBool(row),
  };
}

// ─── BATCH MARKERS ─────────────────────────────────────────

export function batchMarker(batchState) {
  if (batchState === "hardDeleted") return { text: "Deleted", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "deleted") return { text: "Deactivated", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "created") return { text: "New", cls: "psb-batch-marker psb-batch-marker-new" };
  if (batchState === "updated") return { text: "Edited", cls: "psb-batch-marker psb-batch-marker-edited" };
  return { text: "", cls: "" };
}

// ─── BATCH SAVE ORCHESTRATION ──────────────────────────────

export async function executeRefBatchSave(changes, actions) {
  await saveRefTableBatch(actions?.refKey, changes);
}

// ─── ACTION RESOLVERS ──────────────────────────────────────

// Which server-side table each screen saves to (see saveRefTableBatch in
// workflow.actions.js, which holds the create/update/delete actions).
export const REF_ACTIONS = {
  stagetype: { refKey: "stagetype", idField: "stagetype_id" },
  approvaltype: { refKey: "approvaltype", idField: "approvaltype_id" },
  status: { refKey: "status", idField: "status_id" },
  orgrole: { refKey: "orgrole", idField: "orgrole_id" },
  stageparticipant: { refKey: "stageparticipant", idField: "stageparticipant_id" },
  userorgrole: { refKey: "userorgrole", idField: "user_orgrole_id" },
};