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

  // Cascade deactivate linked cards + role access
  const { data: linkedCards } = await supabase.from(CARD_TABLE).select("card_id").eq("group_id", groupId);
  for (const card of linkedCards || []) {
    await supabase.from(CARD_TABLE).update({ is_active: false }).eq("card_id", card.card_id);
    await supabase.from(CARD_ROLE_ACCESS_TABLE).update({ is_active: false }).eq("card_id", card.card_id).then(() => {}).catch(() => {});
  }

  const { data, error } = await supabase.from(GROUP_TABLE).update({ is_active: false }).eq("group_id", groupId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate card group");
  return data;
}

export async function hardDeleteCardGroupAction(groupId) {
  if (groupId == null || groupId === "") throw new Error("Card group ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade delete linked cards + role access
  const { data: linkedCards } = await supabase.from(CARD_TABLE).select("card_id").eq("group_id", groupId);
  for (const card of linkedCards || []) {
    await supabase.from(CARD_ROLE_ACCESS_TABLE).delete().eq("card_id", card.card_id).then(() => {}).catch(() => {});
    await supabase.from(CARD_TABLE).delete().eq("card_id", card.card_id);
  }

  const { error } = await supabase.from(GROUP_TABLE).delete().eq("group_id", groupId);
  if (error) throw new Error(error.message || "Failed to permanently delete card group");
  return { groupId, deletedCardCount: (linkedCards || []).length, permanentlyDeleted: true };
}

export async function saveCardGroupOrderAction(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return { updatedCount: 0 };
  const supabase = getSupabaseAdmin();
  // Shift to temporary offset values to avoid unique constraint collisions
  const offset = 100000;
  for (let i = 0; i < groupIds.length; i++) {
    const { error } = await supabase.from(GROUP_TABLE).update({ display_order: offset + i + 1 }).eq("group_id", groupIds[i]);
    if (error) throw new Error(error.message || "Failed to update card group order");
  }
  for (let i = 0; i < groupIds.length; i++) {
    const { error } = await supabase.from(GROUP_TABLE).update({ display_order: i + 1 }).eq("group_id", groupIds[i]);
    if (error) throw new Error(error.message || "Failed to update card group order");
  }
  return { updatedCount: groupIds.length };
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
  // Shift to temporary offset values to avoid unique constraint collisions
  const offset = 100000;
  for (let i = 0; i < cardIds.length; i++) {
    const { error } = await supabase.from(CARD_TABLE).update({ display_order: offset + i + 1 }).eq("card_id", cardIds[i]);
    if (error) throw new Error(error.message || "Failed to update card order");
  }
  for (let i = 0; i < cardIds.length; i++) {
    const { error } = await supabase.from(CARD_TABLE).update({ display_order: i + 1 }).eq("card_id", cardIds[i]);
    if (error) throw new Error(error.message || "Failed to update card order");
  }
  return { updatedCount: cardIds.length };
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
