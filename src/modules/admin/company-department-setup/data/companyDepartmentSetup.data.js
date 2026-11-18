/**
 * Company Department Setup — Data Layer (client-safe utilities)
 *
 * Model helpers and small utilities (client-safe).
 */

// ─── MODEL HELPERS ─────────────────────────────────────────

export function isCompanyActive(company) {
  if (company?.is_active === false || company?.is_active === 0) return false;
  const text = String(company?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getCompanyDisplayName(c) { return c?.comp_name || c?.company_name || c?.name || "Unknown"; }
export function getCompanyShortName(c) { return c?.comp_short_name || c?.short_name || c?.comp_short || c?.abbr || "--"; }
export function getCompanyEmail(c) { return c?.comp_email || c?.company_email || c?.email || "--"; }
export function getCompanyPhone(c) { return c?.comp_phone || c?.company_phone || c?.phone || "--"; }

export function isDepartmentActive(dept) {
  if (dept?.is_active === false || dept?.is_active === 0) return false;
  const text = String(dept?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getDepartmentDisplayName(d) { return d?.dept_name || d?.department_name || d?.name || "Unknown"; }
export function getDepartmentShortName(d) { return d?.dept_short_name || d?.short_name || d?.dept_short || d?.abbr || "--"; }

export function mapCompanyRow(company, index) {
  return {
    ...company,
    id: company?.comp_id ?? `company-${index}`,
    comp_name: getCompanyDisplayName(company),
    comp_short_name: getCompanyShortName(company),
    comp_email: getCompanyEmail(company),
    comp_phone: getCompanyPhone(company),
    is_active_bool: isCompanyActive(company),
  };
}

export function mapDepartmentRow(department, index) {
  return {
    ...department,
    id: department?.dept_id ?? `department-${index}`,
    dept_name: getDepartmentDisplayName(department),
    dept_short_name: getDepartmentShortName(department),
    is_active_bool: isDepartmentActive(department),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function parseCompanyId(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const asNumber = Number(text);
  return Number.isFinite(asNumber) ? asNumber : text;
}

export function isSameId(l, r) { return String(l ?? "") === String(r ?? ""); }

export function compareText(l, r) {
  return String(l || "").localeCompare(String(r || ""), undefined, { sensitivity: "base", numeric: true });
}

export function normalizeText(value) { return String(value ?? "").trim(); }

// ─── CONSTANTS ─────────────────────────────────────────────

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
