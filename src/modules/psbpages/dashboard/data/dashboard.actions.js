"use server";

import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/core/supabase/admin";
import { normalizeRoutePath, resolveAppBaseUrl, resolveCardRoutePath } from "./dashboard.data";

// ── table names ────────────────────────────────────────────
const APP_CARD_GROUP_TABLE =
  String(process.env.USER_MASTER_APP_CARD_GROUP_TABLE || "").trim() || "psb_m_appcardgroup";
const APP_CARD_TABLE =
  String(process.env.USER_MASTER_APP_CARD_TABLE || "").trim() || "psb_s_appcard";
const APP_CARD_ROLE_ACCESS_TABLE =
  String(process.env.USER_MASTER_APP_CARD_ROLE_ACCESS_TABLE || "").trim() || "psb_m_appcardroleaccess";

// "local" | "dev" | "prod" — selects which application URL cards point at.
const APP_ENV = String(process.env.NEXT_PUBLIC_ENV || "local").trim();

// ── pure helpers ───────────────────────────────────────────
function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "false" || text === "0" || text === "f" || text === "n" || text === "no";
}

function isActiveRow(record) {
  return !isInactiveFlag(record?.is_active);
}

function readText(record, fields, fallback = "") {
  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

// normalizeRoutePath imported from dashboard.data.js

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveApplicationOrder(record, fallbackOrder = Number.MAX_SAFE_INTEGER) {
  const candidates = [record?.display_order, record?.app_order, record?.sort_order, record?.order_no, record?.app_id];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackOrder;
}

// ── server helpers ─────────────────────────────────────────
async function resolveDbUser(supabaseAdmin, authUser) {
  const { data: byAuthUser, error: byAuthUserError } = await supabaseAdmin
    .from("psb_s_user")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (!byAuthUserError && byAuthUser) return byAuthUser;
  if (!hasValue(authUser?.email)) return null;

  const { data: byEmailUser, error: byEmailUserError } = await supabaseAdmin
    .from("psb_s_user")
    .select("*")
    .eq("email", authUser.email)
    .maybeSingle();

  if (byEmailUserError || !byEmailUser) return null;

  const existingAuthUserId = String(byEmailUser.auth_user_id || "").trim();
  const shouldSyncAuthUserId = !hasValue(existingAuthUserId) || existingAuthUserId !== authUser.id;

  if (shouldSyncAuthUserId) {
    const { data: updatedUser } = await supabaseAdmin
      .from("psb_s_user")
      .update({ auth_user_id: authUser.id })
      .eq("user_id", byEmailUser.user_id)
      .select("*")
      .maybeSingle();

    if (updatedUser) return updatedUser;
  }

  return byEmailUser;
}

async function resolveUserAccessScope(supabaseAdmin, userId) {
  const { data: mappingRows, error: mappingError } = await supabaseAdmin
    .from("psb_m_userapproleaccess")
    .select("*")
    .eq("user_id", userId);

  if (mappingError || !Array.isArray(mappingRows)) {
    return { appIds: [], appOrderById: new Map(), roleIdsByApp: new Map(), appBaseUrlById: new Map() };
  }

  const activeMappings = mappingRows.filter((row) => row && isActiveRow(row));
  if (activeMappings.length === 0) {
    return { appIds: [], appOrderById: new Map(), roleIdsByApp: new Map(), appBaseUrlById: new Map() };
  }

  const mappedAppIds = Array.from(
    new Set(activeMappings.map((row) => String(row?.app_id || "").trim()).filter(Boolean)),
  );
  const mappedRoleIds = Array.from(
    new Set(activeMappings.map((row) => String(row?.role_id || "").trim()).filter(Boolean)),
  );

  if (mappedAppIds.length === 0 || mappedRoleIds.length === 0) {
    return { appIds: [], appOrderById: new Map(), roleIdsByApp: new Map(), appBaseUrlById: new Map() };
  }

  const [{ data: appRows, error: appError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabaseAdmin.from("psb_s_application").select("*").in("app_id", mappedAppIds).eq("is_active", true),
    supabaseAdmin.from("psb_s_role").select("role_id, app_id, is_active").in("role_id", mappedRoleIds).eq("is_active", true),
  ]);

  if (appError || roleError) {
    return { appIds: [], appOrderById: new Map(), roleIdsByApp: new Map(), appBaseUrlById: new Map() };
  }

  const orderedActiveApps = (Array.isArray(appRows) ? appRows : [])
    .filter((row) => row)
    .sort((left, right) => {
      const orderDiff = resolveApplicationOrder(left) - resolveApplicationOrder(right);
      if (orderDiff !== 0) return orderDiff;
      const leftName = String(left?.app_name || left?.name || "").trim();
      const rightName = String(right?.app_name || right?.name || "").trim();
      return leftName.localeCompare(rightName);
    });

  const activeAppIds = orderedActiveApps.map((row) => String(row?.app_id || "").trim()).filter(Boolean);
  const activeAppSet = new Set(activeAppIds);

  const activeRoleRows = (Array.isArray(roleRows) ? roleRows : []).filter((row) => row && isActiveRow(row));
  const activeRoleIds = new Set(activeRoleRows.map((row) => String(row?.role_id || "").trim()).filter(Boolean));

  const roleIdsByApp = new Map(activeAppIds.map((appId) => [appId, new Set()]));

  activeMappings.forEach((mapping) => {
    const appId = String(mapping?.app_id || "").trim();
    const roleId = String(mapping?.role_id || "").trim();
    if (!activeAppSet.has(appId)) return;
    if (!activeRoleIds.has(roleId)) return;
    if (!roleIdsByApp.has(appId)) roleIdsByApp.set(appId, new Set());
    roleIdsByApp.get(appId).add(roleId);
  });

  const effectiveAppIds = activeAppIds.filter((appId) => {
    const roleSet = roleIdsByApp.get(appId);
    return roleSet instanceof Set && roleSet.size > 0;
  });

  const appOrderById = new Map(
    orderedActiveApps.map((row) => [
      String(row?.app_id || "").trim(),
      resolveApplicationOrder(row, Number.MAX_SAFE_INTEGER),
    ]),
  );

  const appBaseUrlById = new Map(
    orderedActiveApps.map((row) => [String(row?.app_id || "").trim(), resolveAppBaseUrl(row, APP_ENV)]),
  );

  return { appIds: effectiveAppIds, appOrderById, roleIdsByApp, appBaseUrlById };
}

// ── main exports ───────────────────────────────────────────
export async function loadAssignedCardsFromDatabase() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;
    if (!hasValue(accessToken)) return [];

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return [];

    const dbUser = await resolveDbUser(supabaseAdmin, authData.user);
    if (!dbUser?.user_id) return [];

    // The user's access scope and every active application's site address
    // don't depend on each other, so they load together. Site addresses by
    // module_key let a card point at another app with
    // "module:<module_key>/<path>" even when the user has no role in that app.
    const [accessScope, { data: moduleAppRows }] = await Promise.all([
      resolveUserAccessScope(supabaseAdmin, dbUser.user_id),
      supabaseAdmin
        .from("psb_s_application")
        .select("module_key, dev_url, prod_url")
        .eq("is_active", true),
    ]);
    if (!Array.isArray(accessScope.appIds) || accessScope.appIds.length === 0) return [];

    const baseUrlByModuleKey = new Map(
      (Array.isArray(moduleAppRows) ? moduleAppRows : [])
        .filter((row) => hasValue(row?.module_key))
        .map((row) => [String(row.module_key).trim().toLowerCase(), resolveAppBaseUrl(row, APP_ENV)]),
    );

    // Card groups, cards and card-role mappings for ALL the user's apps in one
    // query each (3 round trips in total, however many apps the user has).
    const { data: groupRows, error: groupError } = await supabaseAdmin
      .from(APP_CARD_GROUP_TABLE)
      .select("*")
      .in("app_id", accessScope.appIds)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (groupError || !Array.isArray(groupRows) || groupRows.length === 0) return [];

    // Only groups of apps where the user holds at least one active role.
    const groupById = new Map(
      groupRows
        .filter((row) => row && isActiveRow(row))
        .map((row) => ({
          groupId: String(row?.group_id || row?.app_group_id || row?.card_group_id || "").trim(),
          appId: String(row?.app_id || "").trim(),
          groupName: readText(row, ["group_name", "name", "label"], "Application"),
          groupDescription: readText(row, ["group_desc", "description"], ""),
          groupIcon: readText(row, ["icon"], "layer-group"),
          groupOrder: asNumber(row?.display_order ?? row?.group_order ?? row?.sort_order ?? row?.order_no, 0),
        }))
        .filter((group) => hasValue(group.groupId) && (accessScope.roleIdsByApp.get(group.appId)?.size || 0) > 0)
        .map((group) => [group.groupId, group]),
    );

    if (groupById.size === 0) return [];

    const { data: cardRows, error: cardError } = await supabaseAdmin
      .from(APP_CARD_TABLE)
      .select("*")
      .eq("is_active", true)
      .in("group_id", Array.from(groupById.keys()))
      .order("display_order", { ascending: true });

    if (cardError || !Array.isArray(cardRows) || cardRows.length === 0) return [];

    // A card belongs to its group's app: that app's base URL and roles apply.
    const cards = cardRows
      .filter((row) => row && isActiveRow(row))
      .map((row) => {
        const groupId = String(row?.group_id || row?.app_group_id || row?.card_group_id || "").trim();
        const appId = groupById.get(groupId)?.appId || "";
        return {
          cardId: String(row?.card_id || row?.app_card_id || "").trim(),
          groupId,
          appId,
          cardName: readText(row, ["card_name", "name", "label"], "Module"),
          cardDescription: readText(row, ["card_desc", "description"], "Open module."),
          routePath: resolveCardRoutePath(
            readText(row, ["route_path", "route", "path", "href"], "#"),
            accessScope.appBaseUrlById.get(appId),
            baseUrlByModuleKey,
          ),
          icon: readText(row, ["icon"], "table-cells-large"),
          cardOrder: asNumber(row?.display_order ?? row?.card_order ?? row?.sort_order ?? row?.order_no, 0),
        };
      })
      .filter((card) => hasValue(card.cardId) && groupById.has(card.groupId));

    if (cards.length === 0) return [];

    const { data: cardRoleRows, error: cardRoleError } = await supabaseAdmin
      .from(APP_CARD_ROLE_ACCESS_TABLE)
      .select("*")
      .eq("is_active", true)
      .in("card_id", cards.map((card) => card.cardId));

    if (cardRoleError || !Array.isArray(cardRoleRows)) return [];

    // A card shows when one of the user's roles IN THAT CARD'S APP is mapped to it.
    const appIdByCardId = new Map(cards.map((card) => [card.cardId, card.appId]));
    const visibleCardIds = new Set(
      cardRoleRows
        .filter((row) => row && isActiveRow(row))
        .map((row) => ({
          cardId: String(row?.card_id || row?.app_card_id || "").trim(),
          roleId: String(row?.role_id || "").trim(),
        }))
        .filter((mapping) => {
          if (!mapping.cardId || !mapping.roleId) return false;
          const roleSet = accessScope.roleIdsByApp.get(appIdByCardId.get(mapping.cardId));
          return roleSet instanceof Set && roleSet.has(mapping.roleId);
        })
        .map((mapping) => mapping.cardId),
    );

    const visibleCards = [];
    cards.forEach((card) => {
      if (!visibleCardIds.has(card.cardId)) return;
      const group = groupById.get(card.groupId);
      const appOrder = accessScope.appOrderById.get(card.appId) ?? Number.MAX_SAFE_INTEGER;
      const totalOrder = appOrder * 1000000 + group.groupOrder * 1000 + card.cardOrder;

      visibleCards.push({
        key: `card-${card.cardId}`,
        name: card.cardName,
        description: card.cardDescription || "Open module.",
        path: card.routePath,
        appId: card.appId,
        icon: card.icon || "table-cells-large",
        groupName: group?.groupName || "Applications",
        groupDescription: group?.groupDescription || "",
        groupIcon: group?.groupIcon || "layer-group",
        order: totalOrder,
      });
    });

    return visibleCards.sort((left, right) => left.order - right.order);
  } catch {
    return [];
  }
}

export async function loadAssignedAppsFromDatabase() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;
    if (!hasValue(accessToken)) return [];

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return [];

    const dbUser = await resolveDbUser(supabaseAdmin, authData.user);
    if (!dbUser?.user_id) return [];

    const { data: mappingRows, error: mappingError } = await supabaseAdmin
      .from("psb_m_userapproleaccess")
      .select("*")
      .eq("user_id", dbUser.user_id);

    if (mappingError) return [];

    const appIds = Array.from(
      new Set(
        (Array.isArray(mappingRows) ? mappingRows : [])
          .filter((row) => row && isActiveRow(row))
          .map((row) => String(row.app_id || "").trim())
          .filter(Boolean),
      ),
    );

    if (appIds.length === 0) return [];

    const { data: appRows, error: appRowsError } = await supabaseAdmin
      .from("psb_s_application")
      .select("*")
      .in("app_id", appIds);

    if (appRowsError || !Array.isArray(appRows)) {
      return appIds.map((appId, index) => ({
        key: `app-${appId}`,
        name: `Application ${appId}`,
        description: "Assigned application.",
        path: "#",
        appId,
        icon: "table-cells-large",
        groupName: "Applications",
        groupDescription: "",
        groupIcon: "layer-group",
        order: index + 1,
      }));
    }

    const appById = new Map(appRows.map((row) => [String(row?.app_id || "").trim(), row]));

    return appIds
      .map((appId, index) => {
        const appRecord = appById.get(appId) || null;
        return {
          key: `app-${appId}`,
          name: readText(appRecord, ["app_name", "name", "app_code", "code"], `Application ${appId}`),
          description: readText(appRecord, ["app_desc", "description"], "Assigned application."),
          path: normalizeRoutePath(readText(appRecord, ["route_path", "route", "path", "href", "module_path"], "#")),
          appId,
          icon: readText(appRecord, ["icon", "app_icon"], "table-cells-large"),
          groupName: "Applications",
          groupDescription: "",
          groupIcon: "layer-group",
          order: Number(appRecord?.display_order ?? appRecord?.app_order ?? appRecord?.sort_order ?? appRecord?.order_no ?? index + 1),
        };
      })
      .sort((left, right) => left.order - right.order);
  } catch {
    return [];
  }
}
