/**
 * Workflow — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and shared orchestration
 * for the workflow configuration pages.
 */

import { saveWorkflowBatch, saveOrgRoleBatch } from "./workflow.actions.js";

// ─── ID / TEXT HELPERS ─────────────────────────────────────

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base", numeric: true });
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
export const TEMP_WORKFLOW_PREFIX = "tmp-wf-";
export const TEMP_STAGE_PREFIX = "tmp-wfs-";
export const TEMP_ORG_ROLE_PREFIX = "tmp-org-";
export const TEMP_USER_ORG_ROLE_PREFIX = "tmp-uor-";
export const TEMP_SP_PREFIX = "tmp-sp-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempWorkflowId(v) { return String(v ?? "").startsWith(TEMP_WORKFLOW_PREFIX); }
export function isTempStageId(v) { return String(v ?? "").startsWith(TEMP_STAGE_PREFIX); }
export function isTempOrgRoleId(v) { return String(v ?? "").startsWith(TEMP_ORG_ROLE_PREFIX); }
export function isTempUserOrgRoleId(v) { return String(v ?? "").startsWith(TEMP_USER_ORG_ROLE_PREFIX); }
export function isTempStageParticipantId(v) { return String(v ?? "").startsWith(TEMP_SP_PREFIX); }

export function createEmptyBatchState() {
  return {
    wfCreates: [], wfUpdates: {}, wfDeactivations: [], wfHardDeletes: [],
    stageCreates: [], stageUpdates: {}, stageDeactivations: [], stageHardDeletes: [],
    participantCreates: [], participantUpdates: {}, participantDeactivations: [], participantHardDeletes: [],
    userRoleCreates: [], userRoleUpdates: {}, userRoleDeactivations: [], userRoleHardDeletes: [],
  };
}

export function createEmptyOrgRoleBatchState() {
  return {
    roleCreates: [], roleUpdates: {}, roleDeactivations: [], roleHardDeletes: [],
    userRoleCreates: [], userRoleUpdates: {}, userRoleDeactivations: [], userRoleHardDeletes: [],
  };
}

// ─── ORDER HELPERS ─────────────────────────────────────────

const ORDER_FIELD_CANDIDATES = ["display_order", "wf_order", "sort_order", "order_no", "stage_order"];

export function getDisplayOrder(record, fallback = 0) {
  const candidates = ORDER_FIELD_CANDIDATES.map((k) => record?.[k]).filter((v) => v !== undefined);
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function buildOrderSignature(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => String(r?.wf_id || "")).join("|");
}

// ─── ROW MAPPERS ───────────────────────────────────────────

export function mapWorkflowRow(wf, index) {
  return {
    ...wf,
    id: wf?.wf_id ?? `wf-${index}`,
    wf_name: wf?.wf_name || "Unknown",
    wf_description: wf?.wf_description || "--",
    comp_id: wf?.comp_id ?? null,
    dept_id: wf?.dept_id ?? null,
    app_id: wf?.app_id ?? null,
    sectin_id: wf?.sectin_id ?? null,
    display_order: getDisplayOrder(wf, index + 1),
    is_active_bool: isActiveBool(wf),
  };
}

export function mapWorkflowStageRow(stage, index) {
  return {
    ...stage,
    id: stage?.wfs_id ?? `wfs-${index}`,
    stage_name: stage?.stage_name || "Unknown",
    stage_description: stage?.stage_description || "--",
    stage_order: getDisplayOrder(stage, index + 1),
    stagetype_id: stage?.stagetype_id ?? null,
    wf_id: stage?.wf_id ?? null,
    is_active_bool: isActiveBool(stage),
  };
}

export function mapOrgRoleRow(role, index) {
  return {
    ...role,
    id: role?.orgrole_id ?? `org-${index}`,
    orgrole_id: role?.orgrole_id ?? `org-${index}`,
    ref_name: role?.name || "Unknown",
    ref_desc: role?.description || "--",
    is_active_bool: isActiveBool(role),
  };
}

export function mapUserOrgRoleRow(ur, index) {
  return {
    ...ur,
    id: ur?.user_orgrole_id ?? `uor-${index}`,
    user_orgrole_id: ur?.user_orgrole_id ?? `uor-${index}`,
    role_id: ur?.role_id ?? null,
    user_id: ur?.user_id ?? null,
    is_active_bool: isActiveBool(ur),
    is_primary: Boolean(ur?.is_primary),
  };
}

export function mapStageParticipantRow(sp, index) {
  return {
    ...sp,
    id: sp?.stageparticipant_id ?? `sp-${index}`,
    stageparticipant_id: sp?.stageparticipant_id ?? `sp-${index}`,
    wfs_id: sp?.wfs_id ?? null,
    orgrole_id: sp?.orgrole_id ?? null,
    approvaltype_id: sp?.approvaltype_id ?? null,
    is_active_bool: isActiveBool(sp),
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

// The whole batch is saved in one server call (saveWorkflowBatch); it used to
// be one call per change. Returns the same shape as before.
export async function executeWorkflowBatchSave(pendingBatch, orderedWorkflows) {
  const result = await saveWorkflowBatch(
    pendingBatch,
    (Array.isArray(orderedWorkflows) ? orderedWorkflows : []).map((wf) => wf?.wf_id),
  );
  return {
    wfIdMap: new Map(Object.entries(result?.wfIdMap || {})),
    deactivatedWfSet: new Set(result?.deactivatedWfIds || []),
    orderedPersistedWfIds: result?.orderedPersistedWfIds || [],
  };
}

// ─── REFERENCE TABLE BATCH SAVE ────────────────────────────

export async function executeReferenceBatchSave(pendingBatch, options) {
  const {
    createAction,
    updateAction,
    deactivateAction,
    hardDeleteAction,
    idMapKey = "id",
    idField = "id",
  } = options || {};

  const idMap = new Map();
  const deactivatedSet = new Set(
    [...(pendingBatch.deactivations || []), ...(pendingBatch.hardDeletes || [])].map((id) => String(id ?? "")),
  );

  for (const entry of pendingBatch.creates || []) {
    const created = await createAction(entry.payload);
    const id = created?.[idField];
    if (id == null || id === "") throw new Error("Created record response is invalid.");
    idMap.set(String(entry.tempId), id);
  }

  for (const [id, updates] of Object.entries(pendingBatch.updates || {})) {
    if (deactivatedSet.has(String(id)) || !Object.keys(updates || {}).length) continue;
    const resolved = idMap.get(String(id)) ?? id;
    await updateAction(resolved, updates);
  }

  for (const id of pendingBatch.deactivations || []) {
    if (String(id ?? "").startsWith("tmp-")) continue;
    await deactivateAction(id);
  }

  for (const id of pendingBatch.hardDeletes || []) {
    if (String(id ?? "").startsWith("tmp-")) continue;
    await hardDeleteAction(id);
  }

  return { [idMapKey]: idMap, deactivatedSet };
}

// ─── ORG ROLE BATCH SAVE ───────────────────────────────────

export async function executeOrgRoleBatchSave(pendingBatch) {
  // The whole batch is saved in one server call (saveOrgRoleBatch); it used to be
  // one call per change. Returns the same shape as before.
  const result = await saveOrgRoleBatch(pendingBatch);
  return {
    roleIdMap: new Map(Object.entries(result?.roleIdMap || {})),
    userRoleIdMap: new Map(Object.entries(result?.userRoleIdMap || {})),
    deactivatedRoleSet: new Set(result?.deactivatedRoleIds || []),
    deactivatedUserRoleSet: new Set(result?.deactivatedUserRoleIds || []),
  };
}
