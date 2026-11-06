import "server-only";
import { cache } from "react";
import { getCurrentSession } from "@/core/auth/session.service";
import { getSupabaseAdmin } from "@/core/supabase/admin";

// Who may use Dealer Master Setup: enroll dealers, log in as a dealer,
// activate/deactivate, delete, and view or set dealer logins. Both roles may
// do all of it. Matched case-insensitively against psb_s_role.role_name and
// re-read from the database on every call, so removing a role works at once.
export const DEALER_ADMIN_ROLE_NAMES = ["admin-enroll", "admin-master"];

export const DEALER_ADMIN_NO_ACCESS = "You need the admin-enroll or admin-master role to manage dealers.";

function isActiveRow(record) {
  const value = record?.is_active;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? "").trim().toLowerCase();
  return !["false", "0", "f", "n", "no"].includes(normalized);
}

/** True when the user has an active admin-enroll or admin-master role. Also used by the dealer portal's staff view. */
export async function userHasDealerAdminRole(userId) {
  if (!userId) return false;
  const supabase = getSupabaseAdmin();

  const { data: accessRows, error: accessError } = await supabase
    .from("psb_m_userapproleaccess")
    .select("role_id, is_active")
    .eq("user_id", userId);
  if (accessError) throw new Error(accessError.message || "Failed to check dealer access.");

  const roleIds = [...new Set((accessRows || []).filter(isActiveRow).map((row) => row.role_id).filter(Boolean))];
  if (roleIds.length === 0) return false;

  const { data: roleRows, error: roleError } = await supabase
    .from("psb_s_role")
    .select("role_id, role_name, is_active")
    .in("role_id", roleIds);
  if (roleError) throw new Error(roleError.message || "Failed to check dealer access.");

  return (roleRows || []).some((role) =>
    isActiveRow(role) && DEALER_ADMIN_ROLE_NAMES.includes(String(role?.role_name || "").trim().toLowerCase()),
  );
}

/**
 * The signed-in staff session when it may manage dealers, otherwise null.
 * Cached for the current request only: the page and the actions it calls
 * share one check, while every new request (each save) checks again.
 */
export const getDealerAdminSession = cache(async () => {
  const session = await getCurrentSession();
  if (!session?.userId) return null;
  return (await userHasDealerAdminRole(session.userId)) ? session : null;
});

/** Same as getDealerAdminSession, but throws for anyone who may not manage dealers. */
export async function requireDealerAdmin() {
  const session = await getDealerAdminSession();
  if (!session) throw Object.assign(new Error(DEALER_ADMIN_NO_ACCESS), { expected: true });
  return session;
}
