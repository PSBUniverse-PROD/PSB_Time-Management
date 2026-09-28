/**
 * Card Module Setup — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and batch save orchestration.
 */

import {
  createCardGroupAction, updateCardGroupAction, deactivateCardGroupAction,
  hardDeleteCardGroupAction, saveCardGroupOrderAction,
  createCardAction, updateCardAction, deactivateCardAction,
  hardDeleteCardAction, saveCardOrderAction,
  upsertCardRoleAccessAction, removeCardRoleAccessAction,
} from "./cardModuleSetup.actions.js";

// ─── MODEL HELPERS ─────────────────────────────────────────

export function isCardGroupActive(group) {
  if (group?.is_active === false || group?.is_active === 0) return false;
  const text = String(group?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getCardGroupDisplayName(group) {
  return group?.group_name || group?.name || group?.label || "Unknown";
}

export function getCardGroupDescription(group) {
  return group?.group_desc || group?.description || "";
}

export function getCardGroupIcon(group) {
  return group?.icon || "layer-group";
}

export function getCardGroupDisplayOrder(group, fallback = 0) {
  const candidates = [group?.display_order, group?.group_order, group?.sort_order, group?.order_no];
  for (const c of candidates) { const p = Number(c); if (Number.isFinite(p)) return p; }
  return fallback;
}

export function isCardActive(card) {
  if (card?.is_active === false || card?.is_active === 0) return false;
  const text = String(card?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getCardDisplayName(card) {
  return card?.card_name || card?.name || card?.label || "Unknown";
}

export function getCardDescription(card) {
  return card?.card_desc || card?.description || "";
}

export function getCardRoutePath(card) {
  return card?.route_path || card?.route || card?.path || card?.href || "#";
}

export function getCardIcon(card) {
  return card?.icon || "table-cells-large";
}

export function getCardDisplayOrder(card, fallback = 0) {
  const candidates = [card?.display_order, card?.card_order, card?.sort_order, card?.order_no];
  for (const c of candidates) { const p = Number(c); if (Number.isFinite(p)) return p; }
  return fallback;
}

export function mapGroupRow(group, index) {
  const order = getCardGroupDisplayOrder(group, index + 1);
  return {
    ...group,
    id: group?.group_id ?? `grp-${index}`,
    group_name: getCardGroupDisplayName(group),
    group_desc: getCardGroupDescription(group),
    group_icon: getCardGroupIcon(group),
    display_order: order,
    __originalOrder: order,
    is_active_bool: isCardGroupActive(group),
  };
}

export function mapCardRow(card, index) {
  const order = getCardDisplayOrder(card, index + 1);
  return {
    ...card,
    id: card?.card_id ?? `card-${index}`,
    card_name: getCardDisplayName(card),
    card_desc: getCardDescription(card),
    route_path: getCardRoutePath(card),
    card_icon: getCardIcon(card),
    display_order: order,
    __originalOrder: order,
    is_active_bool: isCardActive(card),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function parseId(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : String(value).trim();
}

export function isSameId(l, r) { return String(l ?? "") === String(r ?? ""); }

export function compareText(l, r) {
  return String(l || "").localeCompare(String(r || ""), undefined, { sensitivity: "base", numeric: true });
}

export function buildOrderSignature(rows, idKey) {
  return (Array.isArray(rows) ? rows : []).map((r) => String(r?.[idKey] || "")).join("|");
}

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
export const TEMP_GROUP_PREFIX = "tmp-grp-";
export const TEMP_CARD_PREFIX = "tmp-card-";

export function createEmptyBatchState() {
  return { groupCreates: [], groupUpdates: {}, groupDeactivations: [], groupHardDeletes: [], cardCreates: [], cardUpdates: {}, cardDeactivations: [], cardHardDeletes: [], roleAccessAdds: [], roleAccessRemoves: [] };
}

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempGroupId(v) { return String(v ?? "").startsWith(TEMP_GROUP_PREFIX); }
export function isTempCardId(v) { return String(v ?? "").startsWith(TEMP_CARD_PREFIX); }

// ─── BATCH SAVE (calls Server Actions) ─────────────────────

export async function executeBatchSave(pendingBatch, appGroups, allCards, persistedCardOrderSignatures) {
  const groupIdMap = new Map();
  const cardIdMap = new Map();
  const deactivatedGroupSet = new Set(
    [...(pendingBatch.groupDeactivations || []), ...(pendingBatch.groupHardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedCardSet = new Set(
    [...(pendingBatch.cardDeactivations || []), ...(pendingBatch.cardHardDeletes || [])].map((id) => String(id ?? "")),
  );

  // Create groups
  for (const entry of pendingBatch.groupCreates || []) {
    const created = await createCardGroupAction(entry.payload);
    const id = created?.group_id;
    if (id == null || id === "") throw new Error("Created card group response is invalid.");
    groupIdMap.set(String(entry.tempId), id);
  }

  // Update groups
  for (const [gid, updates] of Object.entries(pendingBatch.groupUpdates || {})) {
    if (deactivatedGroupSet.has(String(gid)) || !Object.keys(updates || {}).length) continue;
    const resolved = groupIdMap.get(String(gid)) ?? gid;
    await updateCardGroupAction(resolved, updates);
  }

  // Create cards
  for (const entry of pendingBatch.cardCreates || []) {
    const draftGid = entry?.payload?.group_id;
    const resolved = groupIdMap.get(String(draftGid ?? "")) ?? draftGid;
    if (!resolved || deactivatedGroupSet.has(String(resolved))) continue;
    const created = await createCardAction({ ...entry.payload, group_id: resolved });
    const realCardId = created?.card_id;
    if (realCardId != null && realCardId !== "" && entry.tempId) {
      cardIdMap.set(String(entry.tempId), String(realCardId));
    }
  }

  // Update cards
  for (const [cid, updates] of Object.entries(pendingBatch.cardUpdates || {})) {
    if (deactivatedCardSet.has(String(cid)) || !Object.keys(updates || {}).length) continue;
    const resolvedCid = cardIdMap.get(String(cid)) ?? cid;
    if (isTempCardId(resolvedCid)) continue;
    await updateCardAction(resolvedCid, updates);
  }

  // Deactivate cards
  for (const cid of pendingBatch.cardDeactivations || []) {
    if (isTempCardId(cid)) continue;
    await deactivateCardAction(cid);
  }

  // Deactivate groups
  for (const gid of pendingBatch.groupDeactivations || []) {
    if (isTempGroupId(gid)) continue;
    await deactivateCardGroupAction(gid);
  }

  // Hard delete cards
  for (const cid of pendingBatch.cardHardDeletes || []) {
    if (isTempCardId(cid)) continue;
    await hardDeleteCardAction(cid);
  }

  // Hard delete groups
  for (const gid of pendingBatch.groupHardDeletes || []) {
    if (isTempGroupId(gid)) continue;
    await hardDeleteCardGroupAction(gid);
  }

  // Save group order
  const orderedPersistedGroupIds = appGroups
    .map((g) => g?.group_id).map((id) => groupIdMap.get(String(id ?? "")) ?? id)
    .filter((id) => id != null && id !== "")
    .filter((id) => !deactivatedGroupSet.has(String(id))).filter((id) => !isTempGroupId(id));

  if (orderedPersistedGroupIds.length > 0) {
    await saveCardGroupOrderAction(orderedPersistedGroupIds);
  }

  // Save card order per group
  for (const group of appGroups) {
    const gid = String(group?.group_id ?? "");
    const resolvedGid = groupIdMap.get(gid) ?? group?.group_id;
    if (deactivatedGroupSet.has(String(resolvedGid))) continue;
    const groupCards = allCards
      .filter((c) => isSameId(c?.group_id, group?.group_id))
      .sort((a, b) => {
        const od = Number(a.display_order || 0) - Number(b.display_order || 0);
        return od !== 0 ? od : compareText(a.card_name, b.card_name);
      });
    const currentSig = buildOrderSignature(groupCards, "card_id");
    if (currentSig === (persistedCardOrderSignatures[gid] ?? "")) continue;
    const orderedCardIds = groupCards.map((c) => c?.card_id)
      .filter((id) => id != null && id !== "")
      .filter((id) => !deactivatedCardSet.has(String(id))).filter((id) => !isTempCardId(id));
    if (orderedCardIds.length > 0) {
      await saveCardOrderAction(orderedCardIds);
    }
  }

  // Save role access adds
  for (const entry of pendingBatch.roleAccessAdds || []) {
    const rawCardId = String(entry?.card_id ?? "");
    const cardId = cardIdMap.get(rawCardId) ?? rawCardId;
    const roleId = String(entry?.role_id ?? "");
    if (!cardId || !roleId || isTempCardId(cardId)) continue;
    if (deactivatedCardSet.has(cardId)) continue;
    await upsertCardRoleAccessAction(cardId, roleId);
  }

  // Save role access removes
  for (const entry of pendingBatch.roleAccessRemoves || []) {
    const rawCardId = String(entry?.card_id ?? "");
    const cardId = cardIdMap.get(rawCardId) ?? rawCardId;
    const roleId = String(entry?.role_id ?? "");
    if (!cardId || !roleId || isTempCardId(cardId)) continue;
    await removeCardRoleAccessAction(cardId, roleId);
  }

  return { groupIdMap, cardIdMap, deactivatedGroupSet, orderedPersistedGroupIds };
}
