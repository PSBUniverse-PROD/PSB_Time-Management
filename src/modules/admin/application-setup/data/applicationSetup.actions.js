"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function sanitizeOptionalText(value) {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return !(text === "false" || text === "0" || text === "n" || text === "no" || text === "f");
}

const PROTECTED_APP_NAMES = ["PSBUNIVERSE"];

async function isProtectedApp(supabase, appId) {
  const { data } = await supabase.from("psb_s_application").select("app_name").eq("app_id", appId).maybeSingle();
  const name = normalizeText(data?.app_name).toUpperCase();
  return PROTECTED_APP_NAMES.includes(name);
}

const ORDER_FIELD_CANDIDATES = ["display_order", "app_order", "sort_order", "order_no"];

function validateModuleKey(value) {
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error("Module key must contain only lowercase letters, numbers, and hyphens.");
  }
}

// App URLs are stored as the site address only (scheme + host); the card supplies the path.
function sanitizeBaseUrl(value, label) {
  const text = sanitizeOptionalText(value);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be a full address starting with http:// or https://.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must start with http:// or https://.`);
  }
  return url.origin;
}

function resolveOrderField(applications) {
  const sample = Array.isArray(applications) && applications.length > 0 ? applications[0] : null;
  if (!sample || typeof sample !== "object") return ORDER_FIELD_CANDIDATES[0];
  for (const candidate of ORDER_FIELD_CANDIDATES) {
    if (hasOwn(sample, candidate)) return candidate;
  }
  return ORDER_FIELD_CANDIDATES[0];
}

function getApplicationDisplayOrder(app, fallback = 0) {
  const candidates = [app?.display_order, app?.app_order, app?.sort_order, app?.order_no];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

// ─── DATA LOADING ──────────────────────────────────────────

export async function loadApplicationSetupData() {
  const supabase = getSupabaseAdmin();

  const [appsResult, rolesResult] = await Promise.all([
    supabase.from("psb_s_application").select("*").order("app_id", { ascending: true }),
    supabase.from("psb_s_role").select("*").order("role_name", { ascending: true }),
  ]);

  if (appsResult.error) throw new Error(appsResult.error.message || "Failed to fetch applications");
  if (rolesResult.error) throw new Error(rolesResult.error.message || "Failed to fetch roles");

  const applications = (Array.isArray(appsResult.data) ? appsResult.data : [])
    .sort((a, b) => {
      const d = getApplicationDisplayOrder(a, Number.MAX_SAFE_INTEGER) - getApplicationDisplayOrder(b, Number.MAX_SAFE_INTEGER);
      if (d !== 0) return d;
      return (a.app_name || "").localeCompare(b.app_name || "");
    });

  return {
    applications,
    roles: Array.isArray(rolesResult.data) ? rolesResult.data : [],
  };
}

// ─── APPLICATION ACTIONS ───────────────────────────────────

export async function createApplicationAction(payload) {
  const supabase = getSupabaseAdmin();
  const appName = normalizeText(payload?.app_name);
  const appDesc = sanitizeOptionalText(payload?.app_desc);
  const moduleKey = sanitizeOptionalText(payload?.module_key);
  const devUrl = sanitizeBaseUrl(payload?.dev_url, "Dev URL");
  const prodUrl = sanitizeBaseUrl(payload?.prod_url, "Prod URL");
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;

  if (!appName) throw new Error("Application name is required.");

  if (moduleKey) {
    validateModuleKey(moduleKey);
    const { data: existing } = await supabase.from("psb_s_application").select("module_key").eq("module_key", moduleKey).maybeSingle();
    if (existing) throw new Error(`Module key "${moduleKey}" is already in use.`);
  }

  const { data: apps } = await supabase.from("psb_s_application").select("*").order("app_id", { ascending: true });
  const orderField = resolveOrderField(apps);
  const nextOrder = (Array.isArray(apps) ? apps : []).reduce(
    (max, app) => Math.max(max, getApplicationDisplayOrder(app, 0)), 0,
  ) + 1;

  const insertPayload = { app_name: appName, app_desc: appDesc, is_active: isActive, [orderField]: nextOrder };
  if (moduleKey) insertPayload.module_key = moduleKey;
  if (devUrl) insertPayload.dev_url = devUrl;
  if (prodUrl) insertPayload.prod_url = prodUrl;

  const { data, error } = await supabase.from("psb_s_application")
    .insert(insertPayload)
    .select("*").single();
  if (error) throw new Error(error.message || "Failed to create application");
  return data;
}

export async function updateApplicationAction(appId, updates) {
  const supabase = getSupabaseAdmin();
  if (await isProtectedApp(supabase, appId)) return null;
  const payload = {};
  if (hasOwn(updates, "app_name")) {
    const name = normalizeText(updates.app_name);
    if (!name) throw new Error("Application name is required.");
    payload.app_name = name;
  }
  if (hasOwn(updates, "app_desc")) payload.app_desc = sanitizeOptionalText(updates.app_desc);
  if (hasOwn(updates, "module_key")) {
    const mk = sanitizeOptionalText(updates.module_key);
    if (mk) {
      validateModuleKey(mk);
      const { data: existing } = await supabase.from("psb_s_application").select("module_key").eq("module_key", mk).neq("app_id", appId).maybeSingle();
      if (existing) throw new Error(`Module key "${mk}" is already in use.`);
    }
    payload.module_key = mk;
  }
  if (hasOwn(updates, "dev_url")) payload.dev_url = sanitizeBaseUrl(updates.dev_url, "Dev URL");
  if (hasOwn(updates, "prod_url")) payload.prod_url = sanitizeBaseUrl(updates.prod_url, "Prod URL");
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(payload).length === 0) throw new Error("No valid application updates supplied.");

  const { data, error } = await supabase.from("psb_s_application")
    .update(payload).eq("app_id", appId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update application");
  return data;
}

export async function deactivateApplicationAction(appId) {
  const supabase = getSupabaseAdmin();
  if (await isProtectedApp(supabase, appId)) return { appId, deactivated: false };
  // Cascade deactivate roles
  const { data: roles } = await supabase.from("psb_s_role").select("role_id").eq("app_id", appId);
  for (const role of roles || []) {
    await supabase.from("psb_s_role").update({ is_active: false }).eq("role_id", role.role_id);
  }
  const { error } = await supabase.from("psb_s_application").update({ is_active: false }).eq("app_id", appId);
  if (error) throw new Error(error.message || "Failed to deactivate application");
  return { appId, deactivated: true };
}

export async function hardDeleteApplicationAction(appId) {
  const supabase = getSupabaseAdmin();
  if (await isProtectedApp(supabase, appId)) return { appId, permanentlyDeleted: false };
  // Cascade delete roles
  const { data: roles } = await supabase.from("psb_s_role").select("role_id").eq("app_id", appId);
  for (const role of roles || []) {
    await supabase.from("psb_s_role").delete().eq("role_id", role.role_id);
  }
  const { error } = await supabase.from("psb_s_application").delete().eq("app_id", appId);
  if (error) throw new Error(error.message || "Failed to permanently delete application");
  return { appId, permanentlyDeleted: true };
}

// ─── ROLE ACTIONS ──────────────────────────────────────────

export async function createRoleAction(payload) {
  const supabase = getSupabaseAdmin();
  const appId = payload?.app_id;
  const roleName = normalizeText(payload?.role_name);
  const roleDesc = sanitizeOptionalText(payload?.role_desc);
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;

  if (appId == null || appId === "") throw new Error("Application id is required.");
  if (!roleName) throw new Error("Role name is required.");

  // Verify app exists
  const { error: appErr } = await supabase.from("psb_s_application").select("app_id").eq("app_id", appId).single();
  if (appErr) throw new Error(appErr.message || "Application not found.");

  const { data, error } = await supabase.from("psb_s_role")
    .insert({ app_id: appId, role_name: roleName, role_desc: roleDesc, is_active: isActive })
    .select("*").single();
  if (error) throw new Error(error.message || "Failed to create role");
  return data;
}

export async function updateRoleAction(roleId, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "role_name")) {
    const name = normalizeText(updates.role_name);
    if (!name) throw new Error("Role name is required.");
    payload.role_name = name;
  }
  if (hasOwn(updates, "role_desc")) payload.role_desc = sanitizeOptionalText(updates.role_desc);
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(payload).length === 0) throw new Error("No valid role updates supplied.");

  const { data, error } = await supabase.from("psb_s_role")
    .update(payload).eq("role_id", roleId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update role");
  return data;
}

export async function deactivateRoleAction(roleId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("psb_s_role").update({ is_active: false }).eq("role_id", roleId);
  if (error) throw new Error(error.message || "Failed to deactivate role");
  return { roleId, deactivated: true };
}

export async function hardDeleteRoleAction(roleId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("psb_s_role").delete().eq("role_id", roleId);
  if (error) throw new Error(error.message || "Failed to permanently delete role");
  return { roleId, permanentlyDeleted: true };
}

// ─── ORDER ACTION ──────────────────────────────────────────

export async function saveApplicationOrderAction(appIds) {
  const supabase = getSupabaseAdmin();
  const requestedIds = (Array.isArray(appIds) ? appIds : [])
    .map((id) => (typeof id === "string" && id.trim() !== "" && Number.isFinite(Number(id)) ? Number(id) : id))
    .filter((id) => id != null && id !== "");

  if (requestedIds.length === 0) throw new Error("No applications supplied for ordering.");

  const { data: apps } = await supabase.from("psb_s_application").select("*").order("app_id", { ascending: true });
  const orderField = resolveOrderField(apps);
  const validIds = new Set((apps || []).map((a) => String(a?.app_id ?? "")));
  const invalidIds = requestedIds.filter((id) => !validIds.has(String(id)));
  if (invalidIds.length > 0) throw new Error("One or more applications are invalid for order updates.");

  // Shift to temporary offset values to avoid unique constraint collisions
  const offset = 100000;
  for (let i = 0; i < requestedIds.length; i++) {
    const { error } = await supabase.from("psb_s_application")
      .update({ [orderField]: offset + i + 1 }).eq("app_id", requestedIds[i]);
    if (error) throw new Error(error.message || "Failed to update application order");
  }

  // Now assign final order values
  for (let i = 0; i < requestedIds.length; i++) {
    const { error } = await supabase.from("psb_s_application")
      .update({ [orderField]: i + 1 }).eq("app_id", requestedIds[i]);
    if (error) throw new Error(error.message || "Failed to update application order");
  }

  return { orderField, updatedCount: requestedIds.length };
}

// ─── ROLE USER ACTIONS ─────────────────────────────────────

function computeUserFullName(row) {
  const composed = [row?.first_name, row?.middle_name, row?.last_name].map((v) => normalizeText(v)).filter(Boolean).join(" ");
  return composed || normalizeText(row?.username || row?.user_name) || "--";
}

function normalizeIdList(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadRoleForUsers(supabase, roleId) {
  if (roleId == null || roleId === "") throw new Error("Role id is required.");
  const { data, error } = await supabase.from("psb_s_role").select("*").eq("role_id", roleId).maybeSingle();
  if (error) throw new Error(error.message || "Failed to fetch role");
  if (!data) throw new Error("Role not found.");
  return data;
}

export async function loadRoleUsersAction(roleId) {
  const supabase = getSupabaseAdmin();
  const role = await loadRoleForUsers(supabase, roleId);

  const [accessResult, usersResult] = await Promise.all([
    supabase.from("psb_m_userapproleaccess").select("*").eq("role_id", role.role_id).eq("app_id", role.app_id).eq("is_active", true),
    supabase.from("psb_s_user").select("*").order("user_id", { ascending: true }),
  ]);

  if (accessResult.error) throw new Error(accessResult.error.message || "Failed to fetch role users");
  if (usersResult.error) throw new Error(usersResult.error.message || "Failed to fetch users");

  const users = (Array.isArray(usersResult.data) ? usersResult.data : []).map((row) => ({
    user_id: row?.user_id ?? null,
    full_name: computeUserFullName(row),
    username: normalizeText(row?.username || row?.user_name) || "--",
    email: normalizeText(row?.email || row?.user_email) || "--",
    employee_id: normalizeText(row?.employee_id) || "--",
    is_active: row?.is_active == null ? true : normalizeBoolean(row.is_active),
  }));

  return {
    role: { role_id: role.role_id, app_id: role.app_id, role_name: role.role_name },
    memberUserIds: normalizeIdList((accessResult.data || []).map((row) => row?.user_id)),
    users,
  };
}

export async function saveRoleUsersAction(roleId, changes) {
  const supabase = getSupabaseAdmin();
  // app_id is resolved from the role, never taken from the client
  const role = await loadRoleForUsers(supabase, roleId);

  const removeUserIds = normalizeIdList(changes?.removeUserIds);
  const removeKeys = new Set(removeUserIds.map((id) => String(id)));
  const addUserIds = normalizeIdList(changes?.addUserIds).filter((id) => !removeKeys.has(String(id)));

  if (addUserIds.length > 0) {
    const rows = addUserIds.map((userId) => ({ user_id: userId, app_id: role.app_id, role_id: role.role_id, is_active: true }));
    const { error } = await supabase.from("psb_m_userapproleaccess")
      .upsert(rows, { onConflict: "user_id,app_id,role_id" });
    if (error) throw new Error(error.message || "Failed to add users to role");
  }

  if (removeUserIds.length > 0) {
    const { error } = await supabase.from("psb_m_userapproleaccess")
      .delete().eq("role_id", role.role_id).eq("app_id", role.app_id).in("user_id", removeUserIds);
    if (error) throw new Error(error.message || "Failed to remove users from role");
  }

  return { added: addUserIds.length, removed: removeUserIds.length };
}
