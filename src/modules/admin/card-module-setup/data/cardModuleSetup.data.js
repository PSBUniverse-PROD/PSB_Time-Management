/**
 * Card Module Setup — Data Layer (client-safe utilities)
 *
 * Model helpers, batch state management, and batch save orchestration.
 */

import { saveCardModuleBatch } from "./cardModuleSetup.actions.js";

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

// The whole batch is saved in one server call (saveCardModuleBatch); it used
// to be one call per change. Card order is only sent for groups whose order
// changed on screen. Returns the same shape as before.
export async function executeBatchSave(pendingBatch, appGroups, allCards, persistedCardOrderSignatures) {
  const deactivatedCardSet = new Set(
    [...(pendingBatch.cardDeactivations || []), ...(pendingBatch.cardHardDeletes || [])].map((id) => String(id ?? "")),
  );

  const cardOrders = [];
  for (const group of appGroups) {
    const gid = String(group?.group_id ?? "");
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
    if (orderedCardIds.length > 0) cardOrders.push({ groupId: group?.group_id, cardIds: orderedCardIds });
  }

  const result = await saveCardModuleBatch(pendingBatch, appGroups.map((g) => g?.group_id), cardOrders);
  return {
    groupIdMap: new Map(Object.entries(result?.groupIdMap || {})),
    cardIdMap: new Map(Object.entries(result?.cardIdMap || {})),
    deactivatedGroupSet: new Set(result?.deactivatedGroupIds || []),
    orderedPersistedGroupIds: result?.orderedPersistedGroupIds || [],
  };
}
