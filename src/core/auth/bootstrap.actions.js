"use server";

import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/core/supabase/admin";

// ── helpers ────────────────────────────────────────────────
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

function pickDisplayText(record, preferredFields = []) {
  for (const field of preferredFields) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function fallbackUserFromAuth(authUser) {
  return {
    email: authUser?.email || "",
    username:
      String(authUser?.user_metadata?.username || "").trim() ||
      String(authUser?.email || "").split("@")[0] || "",
    first_name: String(authUser?.user_metadata?.first_name || "").trim(),
    last_name: String(authUser?.user_metadata?.last_name || "").trim(),
    phone: "", address: "", comp_name: "", comp_email: "", dept_name: "", status_name: "",
  };
}

async function resolveDbUser(supabaseAdmin, authUser) {
  const { data: byAuthUser, error: byAuthUserError } = await supabaseAdmin
    .from("psb_s_user").select("*").eq("auth_user_id", authUser.id).maybeSingle();
  if (!byAuthUserError && byAuthUser) return byAuthUser;
  if (!hasValue(authUser?.email)) return null;

  const { data: byEmailUser, error: byEmailUserError } = await supabaseAdmin
    .from("psb_s_user").select("*").eq("email", authUser.email).maybeSingle();
  if (byEmailUserError || !byEmailUser) return null;

  const existingAuthUserId = String(byEmailUser.auth_user_id || "").trim();
  if (!hasValue(existingAuthUserId) || existingAuthUserId !== authUser.id) {
    const { data: updatedUser } = await supabaseAdmin
      .from("psb_s_user").update({ auth_user_id: authUser.id })
      .eq("user_id", byEmailUser.user_id).select("*").maybeSingle();
    if (updatedUser) return updatedUser;
  }
  return byEmailUser;
}

async function loadResolvedRoles(supabaseAdmin, userId) {
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("psb_m_userapproleaccess").select("*").eq("user_id", userId);
  if (roleError || !Array.isArray(roleRows)) return [];

  const activeRoleRows = roleRows.filter((row) => isActiveRow(row));
  if (activeRoleRows.length === 0) return [];

  const roleIds = Array.from(new Set(activeRoleRows.map((r) => String(r?.role_id || "").trim()).filter(Boolean)));
  const appIds = Array.from(new Set(activeRoleRows.map((r) => String(r?.app_id || "").trim()).filter(Boolean)));

  const [roleLookupResult, appLookupResult] = await Promise.all([
    roleIds.length > 0
      ? supabaseAdmin.from("psb_s_role").select("*").in("role_id", roleIds)
      : Promise.resolve({ data: [], error: null }),
    appIds.length > 0
      ? supabaseAdmin.from("psb_s_application").select("*").in("app_id", appIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const roleNameById = new Map(
    (Array.isArray(roleLookupResult?.data) ? roleLookupResult.data : []).map((r) => [
      String(r?.role_id || "").trim(),
      pickDisplayText(r, ["role_name", "name", "code", "slug", "key"]),
    ]),
  );
  const appNameById = new Map(
    (Array.isArray(appLookupResult?.data) ? appLookupResult.data : []).map((r) => [
      String(r?.app_id || "").trim(),
      pickDisplayText(r, ["app_name", "name", "code", "app_code", "slug", "key"]),
    ]),
  );

  return activeRoleRows
    .map((row) => ({
      ...row,
      role_name: roleNameById.get(String(row?.role_id || "").trim()) || row?.role_name || "",
      app_name: appNameById.get(String(row?.app_id || "").trim()) || row?.app_name || "",
    }))
    .sort((a, b) => {
      const d = String(a?.app_name || "").localeCompare(String(b?.app_name || ""));
      return d !== 0 ? d : String(a?.role_name || "").localeCompare(String(b?.role_name || ""));
    });
}

async function enrichDbUser(supabaseAdmin, dbUser) {
  if (!dbUser) return null;

  const [companyResult, departmentResult, statusResult] = await Promise.all([
    hasValue(dbUser.comp_id)
      ? supabaseAdmin.from("psb_s_company").select("*").eq("comp_id", dbUser.comp_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(dbUser.dept_id)
      ? supabaseAdmin.from("psb_s_department").select("*").eq("dept_id", dbUser.dept_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(dbUser.status_id)
      ? supabaseAdmin.from("psb_s_status").select("*").eq("status_id", dbUser.status_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    ...dbUser,
    comp_name: pickDisplayText(companyResult?.data, ["comp_name", "company_name", "name"]) || dbUser.comp_name || "",
    comp_email: String(companyResult?.data?.comp_email || dbUser.comp_email || "").trim(),
    dept_name: pickDisplayText(departmentResult?.data, ["dept_name", "department_name", "name"]) || dbUser.dept_name || "",
    status_name: pickDisplayText(statusResult?.data, ["sts_name", "status_name", "name"]) || dbUser.status_name || "",
  };
}

// ── main export ────────────────────────────────────────────
export async function bootstrapAuthState() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;

    if (!hasValue(accessToken)) {
      return { authUser: null, dbUser: null, roles: [] };
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return { authUser: null, dbUser: null, roles: [] };
    }

    const authUser = authData.user;
    const rawDbUser = await resolveDbUser(supabaseAdmin, authUser);
    const dbUser = await enrichDbUser(supabaseAdmin, rawDbUser);
    const roles = dbUser?.user_id ? await loadResolvedRoles(supabaseAdmin, dbUser.user_id) : [];

    return {
      authUser: {
        id: authUser.id,
        email: authUser.email,
        user_metadata: authUser.user_metadata || {},
      },
      dbUser: dbUser || fallbackUserFromAuth(authUser),
      roles,
    };
  } catch {
    return { authUser: null, dbUser: null, roles: [] };
  }
}

/**
 * Lightweight check — returns true if server has a valid session.
 */
export async function hasServerSession() {
  try {
    const result = await bootstrapAuthState();
    return Boolean(result?.authUser?.id);
  } catch {
    return false;
  }
}
