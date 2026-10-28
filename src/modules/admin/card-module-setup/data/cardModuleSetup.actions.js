"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

const GROUP_TABLE =
  String(process.env.USER_MASTER_APP_CARD_GROUP_TABLE || "").trim() || "psb_m_appcardgroup";
const CARD_TABLE =
  String(process.env.USER_MASTER_APP_CARD_TABLE || "").trim() || "psb_s_appcard";
const CARD_ROLE_ACCESS_TABLE =
  String(process.env.USER_MASTER_APP_CARD_ROLE_ACCESS_TABLE || "").trim() || "psb_m_appcardroleaccess";

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

// ─── Load data ─────────────────────────────────────────────

export async function loadCardModuleSetupData() {
  const supabase = getSupabaseAdmin();

  const [{ data: groups, error: gErr }, { data: cards, error: cErr }, { data: apps, error: aErr }] =
    await Promise.all([
      supabase.from(GROUP_TABLE).select("*").order("display_order", { ascending: true }),
      supabase.from(CARD_TABLE).select("*").order("display_order", { ascending: true }),
      supabase.from("psb_s_application").select("*").eq("is_active", true).order("display_order", { ascending: true }),
    ]);

  if (gErr) throw new Error(gErr.message || "Failed to fetch card groups");
  if (cErr) throw new Error(cErr.message || "Failed to fetch cards");

  return {
    cardGroups: Array.isArray(groups) ? groups : [],
    cards: Array.isArray(cards) ? cards : [],
    applications: Array.isArray(apps) ? apps : [],
  };
}

// ─── Card Group Actions ────────────────────────────────────

export async function createCardGroupAction(payload) {
  const supabase = getSupabaseAdmin();
  const groupName = normalizeText(payload?.group_name);
  if (!groupName) throw new Error("Card group name is required.");
  const appId = payload?.app_id;
  if (appId == null || appId === "") throw new Error("Application ID is required.");

  const insertPayload = {
    app_id: appId,
    group_name: groupName,
    group_desc: normalizeText(payload?.group_desc),
    icon: normalizeText(payload?.icon, "layer-group"),
    is_active: payload?.is_active !== undefined ? payload.is_active : true,
  };

  if (payload?.display_order !== undefined) {
    insertPayload.display_order = payload.display_order;
  } else {
    const { data: existing } = await supabase.from(GROUP_TABLE).select("display_order").eq("app_id", appId);
    const maxOrder = (existing || []).reduce((max, r) => Math.max(max, Number(r?.display_order || 0)), 0);
    insertPayload.display_order = maxOrder + 1;
  }

  const { data, error } = await supabase.from(GROUP_TABLE).insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create card group");
  return data;
}

export async function updateCardGroupAction(groupId, updates) {
  if (groupId == null || groupId === "") throw new Error("Card group ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "group_name")) {
    const name = normalizeText(updates.group_name);
    if (!name) throw new Error("Card group name cannot be empty.");
    patch.group_name = name;
  }
  if (hasOwn(updates, "group_desc")) patch.group_desc = normalizeText(updates.group_desc);
  if (hasOwn(updates, "icon")) patch.icon = normalizeText(updates.icon, "layer-group");
  if (hasOwn(updates, "is_active")) patch.is_active = updates.is_active;
  if (hasOwn(updates, "display_order")) patch.display_order = updates.display_order;
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from(GROUP_TABLE).update(patch).eq("group_id", groupId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update card group");
  return data;
}

export async function deactivateCardGroupAction(groupId) {
  if (groupId == null || groupId === "") throw new Error("Card group ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade deactivate linked cards + their role access (one query each, not per card)
  const { data: linkedCards } = await supabase.from(CARD_TABLE).select("card_id").eq("group_id", groupId);
  const linkedCardIds = (linkedCards || []).map((card) => card.card_id);
  if (linkedCardIds.length > 0) {
    await supabase.from(CARD_TABLE).update({ is_active: false }).in("card_id", linkedCardIds);
    await supabase.from(CARD_ROLE_ACCESS_TABLE).update({ is_active: false }).in("card_id", linkedCardIds).then(() => {}).catch(() => {});
  }

  const { data, error } = await supabase.from(GROUP_TABLE).update({ is_active: false }).eq("group_id", groupId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate card group");
  return data;
}

export async function hardDeleteCardGroupAction(groupId) {
  if (groupId == null || groupId === "") throw new Error("Card group ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade delete linked cards + their role access (one query each, not per card)
  const { data: linkedCards } = await supabase.from(CARD_TABLE).select("card_id").eq("group_id", groupId);
  const linkedCardIds = (linkedCards || []).map((card) => card.card_id);
  if (linkedCardIds.length > 0) {
    await supabase.from(CARD_ROLE_ACCESS_TABLE).delete().in("card_id", linkedCardIds).then(() => {}).catch(() => {});
    await supabase.from(CARD_TABLE).delete().in("card_id", linkedCardIds);
  }

  const { error } = await supabase.from(GROUP_TABLE).delete().eq("group_id", groupId);
  if (error) throw new Error(error.message || "Failed to permanently delete card group");
  return { groupId, deletedCardCount: (linkedCards || []).length, permanentlyDeleted: true };
}

// Sets display_order = position (1, 2, …) for `ids`, writing only rows whose
// order actually changes (usually none). Two phases avoid unique-constraint
// collisions: first distinct temporary values, then the final ones. Within a
// phase every value is distinct, so the writes run together.
async function writeChangedOrder(supabase, table, idColumn, ids, errorMessage) {
  const { data: rows, error: loadError } = await supabase.from(table).select(`${idColumn}, display_order`).in(idColumn, ids);
  if (loadError) throw new Error(loadError.message || errorMessage);
  const currentById = new Map((rows || []).map((row) => [String(row?.[idColumn] ?? ""), Number(row?.display_order)]));
  const changed = ids
    .map((id, index) => ({ id, finalOrder: index + 1 }))
    .filter(({ id, finalOrder }) => currentById.get(String(id)) !== finalOrder);

  const offset = 100000;
  const write = (pairs) => Promise.all(pairs.map(async ({ id, value }) => {
    const { error } = await supabase.from(table).update({ display_order: value }).eq(idColumn, id);
    if (error) throw new Error(error.message || errorMessage);
  }));
  await write(changed.map(({ id, finalOrder }) => ({ id, value: offset + finalOrder })));
  await write(changed.map(({ id, finalOrder }) => ({ id, value: finalOrder })));
  return changed.length;
}

export async function saveCardGroupOrderAction(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return { updatedCount: 0 };
  const supabase = getSupabaseAdmin();
  const updatedCount = await writeChangedOrder(supabase, GROUP_TABLE, "group_id", groupIds, "Failed to update card group order");
  return { updatedCount };
}

// ─── Card Actions ──────────────────────────────────────────

export async function createCardAction(payload) {
  const supabase = getSupabaseAdmin();
  const cardName = normalizeText(payload?.card_name);
  if (!cardName) throw new Error("Card name is required.");
  const groupId = payload?.group_id;
  if (groupId == null || groupId === "") throw new Error("Group ID is required.");

  const insertPayload = {
    group_id: groupId,
    app_id: payload?.app_id,
    card_name: cardName,
    card_desc: normalizeText(payload?.card_desc),
    route_path: normalizeText(payload?.route_path, "#"),
    icon: normalizeText(payload?.icon, "table-cells-large"),
    is_active: payload?.is_active !== undefined ? payload.is_active : true,
  };

  if (payload?.display_order !== undefined) {
    insertPayload.display_order = payload.display_order;
  } else {
    const { data: existing } = await supabase.from(CARD_TABLE).select("display_order").eq("group_id", groupId);
    const maxOrder = (existing || []).reduce((max, r) => Math.max(max, Number(r?.display_order || 0)), 0);
    insertPayload.display_order = maxOrder + 1;
  }

  const { data, error } = await supabase.from(CARD_TABLE).insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create card");
  return data;
}

export async function updateCardAction(cardId, updates) {
  if (cardId == null || cardId === "") throw new Error("Card ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "card_name")) {
    const name = normalizeText(updates.card_name);
    if (!name) throw new Error("Card name cannot be empty.");
    patch.card_name = name;
  }
  if (hasOwn(updates, "card_desc")) patch.card_desc = normalizeText(updates.card_desc);
  if (hasOwn(updates, "route_path")) patch.route_path = normalizeText(updates.route_path, "#");
  if (hasOwn(updates, "icon")) patch.icon = normalizeText(updates.icon, "table-cells-large");
  if (hasOwn(updates, "is_active")) patch.is_active = updates.is_active;
  if (hasOwn(updates, "display_order")) patch.display_order = updates.display_order;
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from(CARD_TABLE).update(patch).eq("card_id", cardId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update card");
  return data;
}

export async function deactivateCardAction(cardId) {
  if (cardId == null || cardId === "") throw new Error("Card ID is required.");
  const supabase = getSupabaseAdmin();

  await supabase.from(CARD_ROLE_ACCESS_TABLE).update({ is_active: false }).eq("card_id", cardId).then(() => {}).catch(() => {});

  const { data, error } = await supabase.from(CARD_TABLE).update({ is_active: false }).eq("card_id", cardId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate card");
  return data;
}

export async function hardDeleteCardAction(cardId) {
  if (cardId == null || cardId === "") throw new Error("Card ID is required.");
  const supabase = getSupabaseAdmin();

  await supabase.from(CARD_ROLE_ACCESS_TABLE).delete().eq("card_id", cardId).then(() => {}).catch(() => {});

  const { error } = await supabase.from(CARD_TABLE).delete().eq("card_id", cardId);
  if (error) throw new Error(error.message || "Failed to permanently delete card");
  return { cardId, permanentlyDeleted: true };
}

export async function saveCardOrderAction(cardIds) {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return { updatedCount: 0 };
  const supabase = getSupabaseAdmin();
  const updatedCount = await writeChangedOrder(supabase, CARD_TABLE, "card_id", cardIds, "Failed to update card order");
  return { updatedCount };
}

// ─── Card Role Access Actions ──────────────────────────────

export async function loadCardRoleAccessByApp(appId) {
  if (appId == null || appId === "") return { roleAccess: [], roles: [] };
  const supabase = getSupabaseAdmin();

  const [{ data: access, error: aErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase.from(CARD_ROLE_ACCESS_TABLE).select("*").eq("is_active", true),
    supabase.from("psb_s_role").select("*").eq("app_id", appId).eq("is_active", true).order("role_name", { ascending: true }),
  ]);

  if (aErr) throw new Error(aErr.message || "Failed to fetch card role access");
  if (rErr) throw new Error(rErr.message || "Failed to fetch roles");

  return {
    roleAccess: Array.isArray(access) ? access : [],
    roles: Array.isArray(roles) ? roles : [],
  };
}

export async function upsertCardRoleAccessAction(cardId, roleId) {
  if (cardId == null || cardId === "") throw new Error("Card ID is required.");
  if (roleId == null || roleId === "") throw new Error("Role ID is required.");
  const supabase = getSupabaseAdmin();

  // Check if a row already exists (could be soft-deleted)
  const { data: existing } = await supabase
    .from(CARD_ROLE_ACCESS_TABLE)
    .select("acr_id, is_active")
    .eq("card_id", cardId)
    .eq("role_id", roleId)
    .maybeSingle();

  if (existing?.acr_id) {
    if (existing.is_active) return existing;
    const { data, error } = await supabase
      .from(CARD_ROLE_ACCESS_TABLE)
      .update({ is_active: true })
      .eq("acr_id", existing.acr_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message || "Failed to re-enable card role access");
    return data;
  }

  const { data, error } = await supabase
    .from(CARD_ROLE_ACCESS_TABLE)
    .insert({ card_id: cardId, role_id: roleId, is_active: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to create card role access");
  return data;
}

export async function removeCardRoleAccessAction(cardId, roleId) {
  if (cardId == null || cardId === "") throw new Error("Card ID is required.");
  if (roleId == null || roleId === "") throw new Error("Role ID is required.");
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from(CARD_ROLE_ACCESS_TABLE)
    .update({ is_active: false })
    .eq("card_id", cardId)
    .eq("role_id", roleId);
  if (error) throw new Error(error.message || "Failed to remove card role access");
  return { cardId, roleId, removed: true };
}

// ─── Batch save ────────────────────────────────────────────

// Same prefixes as TEMP_GROUP_PREFIX / TEMP_CARD_PREFIX in cardModuleSetup.data.js.
const TEMP_GROUP_ID_PREFIX = "tmp-grp-";
const TEMP_CARD_ID_PREFIX = "tmp-card-";

// Gives many card ↔ role pairs access at once: existing rows (even switched
// off) are switched back on, missing ones are inserted. Same result as
// upsertCardRoleAccessAction per pair, in about 3 queries in total.
async function addCardRoleAccessRows(supabase, pairs) {
  const byKey = new Map();
  pairs.forEach(({ cardId, roleId }) => byKey.set(`${cardId}|${roleId}`, { cardId: String(cardId), roleId: String(roleId) }));
  const wanted = Array.from(byKey.values());
  if (wanted.length === 0) return;

  const { data: existing, error: loadError } = await supabase
    .from(CARD_ROLE_ACCESS_TABLE)
    .select("acr_id, card_id, role_id, is_active")
    .in("card_id", Array.from(new Set(wanted.map((pair) => pair.cardId))))
    .in("role_id", Array.from(new Set(wanted.map((pair) => pair.roleId))));
  if (loadError) throw new Error(loadError.message || "Failed to load card role access");

  const existingByKey = new Map((existing || []).map((row) => [`${row.card_id}|${row.role_id}`, row]));
  const toEnable = [];
  const toInsert = [];
  wanted.forEach((pair) => {
    const row = existingByKey.get(`${pair.cardId}|${pair.roleId}`);
    if (!row) toInsert.push({ card_id: pair.cardId, role_id: pair.roleId, is_active: true });
    else if (!row.is_active) toEnable.push(row.acr_id);
  });

  if (toEnable.length > 0) {
    const { error } = await supabase.from(CARD_ROLE_ACCESS_TABLE).update({ is_active: true }).in("acr_id", toEnable);
    if (error) throw new Error(error.message || "Failed to re-enable card role access");
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from(CARD_ROLE_ACCESS_TABLE).insert(toInsert);
    if (error) throw new Error(error.message || "Failed to create card role access");
  }
}

/**
 * Saves a whole staged batch in ONE call from the browser (it used to be one
 * call per change). Same order as before: new groups → group edits → new
 * cards → card edits → card, then group deactivations → card, then group
 * permanent deletes → group order → card order → role access added → removed.
 * New groups/cards and edits run one at a time (their display order is worked
 * out from the current highest); deactivations, deletes and access changes
 * within a step run together. `orderedGroupIds` is the screen's group order
 * (temporary ids included); `cardOrders` lists [{ groupId, cardIds }] for the
 * groups whose card order changed on screen.
 */
export async function saveCardModuleBatch(pendingBatch, orderedGroupIds, cardOrders) {
  const supabase = getSupabaseAdmin();
  const batch = pendingBatch || {};
  const groupIdMap = {};
  const cardIdMap = {};
  const isTempGroup = (id) => String(id ?? "").startsWith(TEMP_GROUP_ID_PREFIX);
  const isTempCard = (id) => String(id ?? "").startsWith(TEMP_CARD_ID_PREFIX);
  const resolveGroupId = (id) => groupIdMap[String(id ?? "")] ?? id;
  const resolveCardId = (id) => cardIdMap[String(id ?? "")] ?? id;
  const deactivatedGroupSet = new Set(
    [...(batch.groupDeactivations || []), ...(batch.groupHardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedCardSet = new Set(
    [...(batch.cardDeactivations || []), ...(batch.cardHardDeletes || [])].map((id) => String(id ?? "")),
  );

  for (const entry of batch.groupCreates || []) {
    const created = await createCardGroupAction(entry.payload);
    const id = created?.group_id;
    if (id == null || id === "") throw new Error("Created card group response is invalid.");
    groupIdMap[String(entry.tempId)] = id;
  }

  for (const [gid, updates] of Object.entries(batch.groupUpdates || {})) {
    if (deactivatedGroupSet.has(String(gid)) || !Object.keys(updates || {}).length) continue;
    await updateCardGroupAction(resolveGroupId(gid), updates);
  }

  for (const entry of batch.cardCreates || []) {
    const resolved = resolveGroupId(entry?.payload?.group_id);
    if (!resolved || deactivatedGroupSet.has(String(resolved))) continue;
    const created = await createCardAction({ ...entry.payload, group_id: resolved });
    const realCardId = created?.card_id;
    if (realCardId != null && realCardId !== "" && entry.tempId) cardIdMap[String(entry.tempId)] = String(realCardId);
  }

  for (const [cid, updates] of Object.entries(batch.cardUpdates || {})) {
    if (deactivatedCardSet.has(String(cid)) || !Object.keys(updates || {}).length) continue;
    const resolvedCid = resolveCardId(cid);
    if (isTempCard(resolvedCid)) continue;
    await updateCardAction(resolvedCid, updates);
  }

  await Promise.all((batch.cardDeactivations || []).filter((id) => !isTempCard(id)).map((id) => deactivateCardAction(id)));
  await Promise.all((batch.groupDeactivations || []).filter((id) => !isTempGroup(id)).map((id) => deactivateCardGroupAction(id)));
  await Promise.all((batch.cardHardDeletes || []).filter((id) => !isTempCard(id)).map((id) => hardDeleteCardAction(id)));
  await Promise.all((batch.groupHardDeletes || []).filter((id) => !isTempGroup(id)).map((id) => hardDeleteCardGroupAction(id)));

  const orderedPersistedGroupIds = (Array.isArray(orderedGroupIds) ? orderedGroupIds : [])
    .map((id) => resolveGroupId(id))
    .filter((id) => id != null && id !== "")
    .filter((id) => !deactivatedGroupSet.has(String(id)))
    .filter((id) => !isTempGroup(id));
  if (orderedPersistedGroupIds.length > 0) await saveCardGroupOrderAction(orderedPersistedGroupIds);

  // One group at a time: each group's order write uses the same temporary values.
  for (const entry of Array.isArray(cardOrders) ? cardOrders : []) {
    if (deactivatedGroupSet.has(String(resolveGroupId(entry?.groupId)))) continue;
    if (Array.isArray(entry?.cardIds) && entry.cardIds.length > 0) await saveCardOrderAction(entry.cardIds);
  }

  const accessAdds = [];
  for (const entry of batch.roleAccessAdds || []) {
    const cardId = String(resolveCardId(String(entry?.card_id ?? "")));
    const roleId = String(entry?.role_id ?? "");
    if (!cardId || !roleId || isTempCard(cardId) || deactivatedCardSet.has(cardId)) continue;
    accessAdds.push({ cardId, roleId });
  }
  await addCardRoleAccessRows(supabase, accessAdds);

  await Promise.all((batch.roleAccessRemoves || []).map((entry) => {
    const cardId = String(resolveCardId(String(entry?.card_id ?? "")));
    const roleId = String(entry?.role_id ?? "");
    if (!cardId || !roleId || isTempCard(cardId)) return null;
    return removeCardRoleAccessAction(cardId, roleId);
  }));

  return { groupIdMap, cardIdMap, deactivatedGroupIds: Array.from(deactivatedGroupSet), orderedPersistedGroupIds };
}
