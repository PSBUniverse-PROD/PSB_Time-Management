import "server-only";
import { cache } from "react";
import { getCurrentSession } from "@/core/auth/session.service";
import { getSupabaseAdmin } from "@/core/supabase/admin";
import companyDepartmentSetupModule from "../index.js";
import userMasterSetupModule from "@/modules/admin/user-master-setup/index.js";

// Who may use a page's server actions is decided in Card Module Setup, not in
// code: a user needs an active role that is given an active card opening that
// page. Same tables (and env overrides) as Card Module Setup.
const CARD_TABLE =
  String(process.env.USER_MASTER_APP_CARD_TABLE || "").trim() || "psb_s_appcard";
const CARD_ROLE_ACCESS_TABLE =
  String(process.env.USER_MASTER_APP_CARD_ROLE_ACCESS_TABLE || "").trim() || "psb_m_appcardroleaccess";

export const ORG_SIGNED_OUT = "Your session has ended. Sign in again.";

function isActiveRow(record) {
  const value = record?.is_active;
  if (value === false || value === 0) return false;
  return !["false", "0", "f", "n", "no"].includes(String(value ?? "").trim().toLowerCase());
}

// "admin/org-chart", "/admin/org-chart/", "https://host/admin/org-chart?x=1" → "/admin/org-chart"
function pathOf(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "#") return "";
  try {
    return new URL(text, "http://local/").pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

const getSession = cache(async () => {
  const session = await getCurrentSession();
  return session?.userId ? session : null;
});

/** True when one of the user's active roles is given an active card that opens routePath. Cached per request. */
const userCanOpenPage = cache(async (userId, routePath) => {
  const target = pathOf(routePath);
  if (!userId || !target) return false;
  const supabase = getSupabaseAdmin();

  const [cardsRes, accessRes] = await Promise.all([
    supabase.from(CARD_TABLE).select("*").eq("is_active", true),
    supabase.from("psb_m_userapproleaccess").select("role_id, is_active").eq("user_id", userId),
  ]);
  if (cardsRes.error) throw new Error(cardsRes.error.message || "Failed to check access.");
  if (accessRes.error) throw new Error(accessRes.error.message || "Failed to check access.");

  const cardIds = (cardsRes.data || [])
    .filter((card) => isActiveRow(card)
      && pathOf(card?.route_path ?? card?.route ?? card?.path ?? card?.href) === target)
    .map((card) => card?.card_id ?? card?.app_card_id)
    .filter((id) => id != null && id !== "")
    .map(String);
  const roleIds = [...new Set((accessRes.data || [])
    .filter(isActiveRow).map((row) => row.role_id).filter((id) => id != null && id !== "").map(String))];
  if (!cardIds.length || !roleIds.length) return false;

  const [mappingsRes, rolesRes] = await Promise.all([
    supabase.from(CARD_ROLE_ACCESS_TABLE).select("*").in("card_id", cardIds).in("role_id", roleIds),
    supabase.from("psb_s_role").select("role_id, is_active").in("role_id", roleIds),
  ]);
  if (mappingsRes.error) throw new Error(mappingsRes.error.message || "Failed to check access.");
  if (rolesRes.error) throw new Error(rolesRes.error.message || "Failed to check access.");

  const activeRoleIds = new Set((rolesRes.data || []).filter(isActiveRow).map((role) => String(role.role_id)));
  return (mappingsRes.data || []).some((row) => isActiveRow(row) && activeRoleIds.has(String(row.role_id)));
});

async function requirePageAccess(pageModule) {
  const session = await getSession();
  if (!session) throw new Error(ORG_SIGNED_OUT);
  const routePath = pageModule?.routes?.[0]?.path;
  if (!(await userCanOpenPage(session.userId, routePath))) {
    const name = pageModule?.name || "this page";
    throw new Error(`You don't have access to ${name}. Ask an admin to give your role its card in Card Module Setup.`);
  }
  return session;
}

export async function requireOrgEditor() {
  return requirePageAccess(companyDepartmentSetupModule);
}

export async function requireUserMasterEditor() {
  return requirePageAccess(userMasterSetupModule);
}

/** Org Chart: any signed-in user may view it (read-only). Returns the session. */
export async function requireOrgChartViewer() {
  const session = await getSession();
  if (!session) throw new Error(ORG_SIGNED_OUT);
  return session;
}

/** True when the signed-in user may use Organization Setup (to show its link). */
export async function canEditOrg() {
  const session = await getSession();
  if (!session) return false;
  return userCanOpenPage(session.userId, companyDepartmentSetupModule?.routes?.[0]?.path);
}
