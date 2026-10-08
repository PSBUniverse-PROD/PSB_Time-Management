/**
 * Workflow — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and shared orchestration
 * for the workflow configuration pages.
 */

import {
  createWorkflowAction,
  updateWorkflowAction,
  deactivateWorkflowAction,
  hardDeleteWorkflowAction,
  createWorkflowStageAction,
  updateWorkflowStageAction,
  deactivateWorkflowStageAction,
  hardDeleteWorkflowStageAction,
  saveWorkflowOrderAction,
  createOrgRoleAction,
  updateOrgRoleAction,
  deactivateOrgRoleAction,
  hardDeleteOrgRoleAction,
  createUserOrgRoleAction,
  updateUserOrgRoleAction,
  deactivateUserOrgRoleAction,
  hardDeleteUserOrgRoleAction,
  createStageParticipantAction,
  updateStageParticipantAction,
  deactivateStageParticipantAction,
  hardDeleteStageParticipantAction,
} from "./workflow.actions.js";

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

export async function executeWorkflowBatchSave(pendingBatch, orderedWorkflows) {
  const wfIdMap = new Map();
  const deactivatedWfSet = new Set(
    [...(pendingBatch.wfDeactivations || []), ...(pendingBatch.wfHardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedStageSet = new Set(
    [...(pendingBatch.stageDeactivations || []), ...(pendingBatch.stageHardDeletes || [])].map((id) => String(id ?? "")),
  );

  for (const entry of pendingBatch.wfCreates || []) {
    const created = await createWorkflowAction(entry.payload);
    const id = created?.wf_id;
    if (id == null || id === "") throw new Error("Created workflow response is invalid.");
    wfIdMap.set(String(entry.tempId), id);
  }

  for (const [wfId, updates] of Object.entries(pendingBatch.wfUpdates || {})) {
    if (deactivatedWfSet.has(String(wfId)) || !Object.keys(updates || {}).length) continue;
    const resolved = wfIdMap.get(String(wfId)) ?? wfId;
    await updateWorkflowAction(resolved, updates);
  }

  const stageIdMap = new Map();

  for (const entry of pendingBatch.stageCreates || []) {
    const draftWfId = entry?.payload?.wf_id;
    const resolved = wfIdMap.get(String(draftWfId ?? "")) ?? draftWfId;
    if (!resolved || deactivatedWfSet.has(String(resolved))) continue;
    const created = await createWorkflowStageAction({ ...entry.payload, wf_id: resolved });
    const stageId = created?.wfs_id;
    if (stageId != null && stageId !== "") {
      stageIdMap.set(String(entry.tempId), stageId);
    }
  }

  for (const [stageId, updates] of Object.entries(pendingBatch.stageUpdates || {})) {
    if (deactivatedStageSet.has(String(stageId)) || !Object.keys(updates || {}).length) continue;
    await updateWorkflowStageAction(stageId, updates);
  }

  for (const stageId of pendingBatch.stageDeactivations || []) {
    if (isTempStageId(stageId)) continue;
    await deactivateWorkflowStageAction(stageId);
  }

  for (const wfId of pendingBatch.wfDeactivations || []) {
    if (isTempWorkflowId(wfId)) continue;
    await deactivateWorkflowAction(wfId);
  }

  for (const stageId of pendingBatch.stageHardDeletes || []) {
    if (isTempStageId(stageId)) continue;
    await hardDeleteWorkflowStageAction(stageId);
  }

  for (const wfId of pendingBatch.wfHardDeletes || []) {
    if (isTempWorkflowId(wfId)) continue;
    await hardDeleteWorkflowAction(wfId);
  }

  const orderedPersistedWfIds = orderedWorkflows
    .map((wf) => wf?.wf_id)
    .map((id) => wfIdMap.get(String(id ?? "")) ?? id)
    .filter((id) => id != null && id !== "")
    .filter((id) => !deactivatedWfSet.has(String(id)))
    .filter((id) => !isTempWorkflowId(id));

  if (orderedPersistedWfIds.length > 0) {
    await saveWorkflowOrderAction(orderedPersistedWfIds);
  }

  // ── Stage Participant batch save ──

  const deactivatedParticipantSet = new Set(
    [...(pendingBatch.participantDeactivations || []), ...(pendingBatch.participantHardDeletes || [])].map((id) => String(id ?? "")),
  );

  for (const entry of pendingBatch.participantCreates || []) {
    const draftWfsId = entry?.payload?.wfs_id;
    const resolvedWfsId = stageIdMap.get(String(draftWfsId ?? "")) ?? draftWfsId;
    if (!resolvedWfsId || deactivatedStageSet.has(String(resolvedWfsId))) continue;
    if (isTempStageId(String(resolvedWfsId))) continue; // can't create participant for a temp stage that hasn't been saved
    await createStageParticipantAction({ ...entry.payload, wfs_id: resolvedWfsId });
  }

  for (const [participantId, updates] of Object.entries(pendingBatch.participantUpdates || {})) {
    if (deactivatedParticipantSet.has(String(participantId)) || !Object.keys(updates || {}).length) continue;
    if (isTempStageParticipantId(String(participantId))) continue;
    await updateStageParticipantAction(participantId, updates);
  }

  for (const participantId of pendingBatch.participantDeactivations || []) {
    if (isTempStageParticipantId(String(participantId))) continue;
    await deactivateStageParticipantAction(participantId);
  }

  for (const participantId of pendingBatch.participantHardDeletes || []) {
    if (isTempStageParticipantId(String(participantId))) continue;
    await hardDeleteStageParticipantAction(participantId);
  }

  // ── User Org Role batch save ──

  const deactivatedUserRoleSet = new Set(
    [...(pendingBatch.userRoleDeactivations || []), ...(pendingBatch.userRoleHardDeletes || [])].map((id) => String(id ?? "")),
  );

  for (const entry of pendingBatch.userRoleCreates || []) {
    await createUserOrgRoleAction(entry.payload);
  }

  for (const [userRoleId, updates] of Object.entries(pendingBatch.userRoleUpdates || {})) {
    if (deactivatedUserRoleSet.has(String(userRoleId)) || !Object.keys(updates || {}).length) continue;
    if (isTempUserOrgRoleId(String(userRoleId))) continue;
    await updateUserOrgRoleAction(userRoleId, updates);
  }

  for (const userRoleId of pendingBatch.userRoleDeactivations || []) {
    if (isTempUserOrgRoleId(String(userRoleId))) continue;
    await deactivateUserOrgRoleAction(userRoleId);
  }

  for (const userRoleId of pendingBatch.userRoleHardDeletes || []) {
    if (isTempUserOrgRoleId(String(userRoleId))) continue;
    await hardDeleteUserOrgRoleAction(userRoleId);
  }

  return { wfIdMap, deactivatedWfSet, orderedPersistedWfIds };
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
  const roleIdMap = new Map();
  const userRoleIdMap = new Map();
  const deactivatedRoleSet = new Set(
    [...(pendingBatch.roleDeactivations || []), ...(pendingBatch.roleHardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedUserRoleSet = new Set(
    [...(pendingBatch.userRoleDeactivations || []), ...(pendingBatch.userRoleHardDeletes || [])].map((id) => String(id ?? "")),
  );

  // 1. Create org roles
  for (const entry of pendingBatch.roleCreates || []) {
    const created = await createOrgRoleAction(entry.payload);
    const id = created?.orgrole_id;
    if (id == null || id === "") throw new Error("Created org role response is invalid.");
    roleIdMap.set(String(entry.tempId), id);
  }

  // 2. Update org roles
  for (const [roleId, updates] of Object.entries(pendingBatch.roleUpdates || {})) {
    if (deactivatedRoleSet.has(String(roleId)) || !Object.keys(updates || {}).length) continue;
    const resolved = roleIdMap.get(String(roleId)) ?? roleId;
    await updateOrgRoleAction(resolved, updates);
  }

  // 3. Create users in charge
  for (const entry of pendingBatch.userRoleCreates || []) {
    const draftRoleId = entry?.payload?.role_id;
    const resolvedRoleId = roleIdMap.get(String(draftRoleId ?? "")) ?? draftRoleId;
    if (!resolvedRoleId || deactivatedRoleSet.has(String(resolvedRoleId))) continue;
    const created = await createUserOrgRoleAction({ ...entry.payload, role_id: resolvedRoleId });
    const id = created?.user_orgrole_id;
    if (id == null || id === "") throw new Error("Created user org role response is invalid.");
    userRoleIdMap.set(String(entry.tempId), id);
  }

  // 4. Update users in charge
  for (const [userRoleId, updates] of Object.entries(pendingBatch.userRoleUpdates || {})) {
    if (deactivatedUserRoleSet.has(String(userRoleId)) || !Object.keys(updates || {}).length) continue;
    const resolved = userRoleIdMap.get(String(userRoleId)) ?? userRoleId;
    if (isTempUserOrgRoleId(String(resolved))) continue;
    await updateUserOrgRoleAction(resolved, updates);
  }

  // 5. Deactivate users in charge
  for (const userRoleId of pendingBatch.userRoleDeactivations || []) {
    if (isTempUserOrgRoleId(String(userRoleId))) continue;
    await deactivateUserOrgRoleAction(userRoleId);
  }

  // 6. Deactivate org roles (cascades to users in charge server-side)
  for (const roleId of pendingBatch.roleDeactivations || []) {
    if (isTempOrgRoleId(String(roleId))) continue;
    await deactivateOrgRoleAction(roleId);
  }

  // 7. Hard delete users in charge
  for (const userRoleId of pendingBatch.userRoleHardDeletes || []) {
    if (isTempUserOrgRoleId(String(userRoleId))) continue;
    await hardDeleteUserOrgRoleAction(userRoleId);
  }

  // 8. Hard delete org roles (cascades to users in charge server-side)
  for (const roleId of pendingBatch.roleHardDeletes || []) {
    if (isTempOrgRoleId(String(roleId))) continue;
    await hardDeleteOrgRoleAction(roleId);
  }

  return { roleIdMap, userRoleIdMap, deactivatedRoleSet, deactivatedUserRoleSet };
}
