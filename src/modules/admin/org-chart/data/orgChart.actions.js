"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { canEditOrg, requireOrgChartViewer } from "@/modules/admin/company-department-setup/data/orgAccess.server.js";

function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.username || user?.email || `User ${user?.user_id}`;
}

// "All" / "All branches" typed into a position's Branch means every branch.
function normalizeBranch(value) {
  const text = String(value ?? "").trim();
  return /^all( branches)?$/i.test(text) ? "" : text;
}

function orderValue(row) {
  const n = Number(row?.display_order);
  return row?.display_order == null || !Number.isFinite(n) ? Number.MAX_SAFE_INTEGER : n;
}

/**
 * Everything the org chart needs, already filtered: active companies, and
 * active positions whose company and department (if any) are active, each
 * with its reporting lines and the active people sitting in it. Positions
 * come sorted by rank order (psb_s_rank), then order inside the rank, then name.
 */
export async function loadOrgChartData() {
  const session = await requireOrgChartViewer();
  const supabase = getSupabaseAdmin();
  const [companiesRes, departmentsRes, positionsRes, reportsRes, seatsRes, usersRes, ranksRes] = await Promise.all([
    supabase.from("psb_s_company").select("comp_id, comp_name, short_name").eq("is_active", true)
      .order("comp_name", { ascending: true }),
    supabase.from("psb_s_department").select("dept_id, comp_id, dept_name").eq("is_active", true),
    supabase.from("psb_s_position").select("position_id, comp_id, dept_id, position_name, branch, chart_level, display_order")
      .eq("is_active", true),
    supabase.from("psb_m_positionreport").select("position_id, reports_to_position_id"),
    supabase.from("psb_m_userposition").select("user_id, position_id, is_primary").eq("is_active", true),
    supabase.from("psb_s_user").select("user_id, username, email, first_name, last_name").eq("is_active", true),
    supabase.from("psb_s_rank").select("rank_id, rank_order"),
  ]);
  const failed = companiesRes.error || departmentsRes.error || positionsRes.error
    || reportsRes.error || seatsRes.error || usersRes.error || ranksRes.error;
  if (failed) throw new Error(failed.message || "Failed to load the org chart.");

  const companies = (companiesRes.data || []).map((c) => ({
    comp_id: c.comp_id,
    comp_name: c.comp_name || "",
    short_name: c.short_name || "",
    label: c.short_name ? `${c.comp_name} (${c.short_name})` : c.comp_name,
  }));
  const companyIds = new Set(companies.map((c) => String(c.comp_id)));
  const deptById = new Map((departmentsRes.data || []).map((d) => [String(d.dept_id), d]));
  const userById = new Map((usersRes.data || []).map((u) => [String(u.user_id), { full_name: displayName(u), email: u.email || "" }]));
  const rankOrderOf = new Map((ranksRes.data || []).map((r) => [String(r.rank_id), Number(r.rank_order) || 0]));
  const rankOf = (p) => rankOrderOf.get(String(p.chart_level)) ?? Number.MAX_SAFE_INTEGER;

  const visible = (positionsRes.data || [])
    .filter((p) => {
      if (!companyIds.has(String(p.comp_id))) return false;
      if (p.dept_id == null) return true;
      const dept = deptById.get(String(p.dept_id));
      return Boolean(dept) && String(dept.comp_id) === String(p.comp_id);
    })
    .sort((a, b) => rankOf(a) - rankOf(b)
      || orderValue(a) - orderValue(b)
      || String(a.position_name || "").localeCompare(String(b.position_name || "")));
  const visibleIds = new Set(visible.map((p) => String(p.position_id)));

  // Group reporting lines and seats once, instead of scanning them for every position.
  const reportsByPosition = new Map();
  (reportsRes.data || []).forEach((r) => {
    if (!visibleIds.has(String(r.reports_to_position_id))) return;
    const key = String(r.position_id);
    reportsByPosition.set(key, [...(reportsByPosition.get(key) || []), r.reports_to_position_id]);
  });
  const seatsByPosition = new Map();
  (seatsRes.data || []).forEach((s) => {
    if (!userById.has(String(s.user_id))) return;
    const key = String(s.position_id);
    seatsByPosition.set(key, [...(seatsByPosition.get(key) || []), s]);
  });

  const positions = visible.map((p) => ({
    position_id: p.position_id,
    comp_id: p.comp_id,
    dept_id: p.dept_id,
    department_name: p.dept_id != null ? deptById.get(String(p.dept_id))?.dept_name || "" : "",
    position_name: p.position_name || "",
    branch: normalizeBranch(p.branch),
    chart_level: p.chart_level,
    reports_to_ids: reportsByPosition.get(String(p.position_id)) || [],
    people: (seatsByPosition.get(String(p.position_id)) || [])
      .map((s) => ({ user_id: s.user_id, ...userById.get(String(s.user_id)), is_primary: Boolean(s.is_primary) }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" })),
  }));

  return { companies, positions, currentUserId: session.userId ?? null, canEdit: await canEditOrg() };
}
