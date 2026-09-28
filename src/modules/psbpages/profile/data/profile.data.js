export const INACTIVE_STATUS_HINTS = [
  "inactive", "disabled", "suspended", "locked", "deleted", "blocked", "archived",
];
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_NUMBER_OR_SYMBOL_REGEX = /[^A-Za-z]/;

export function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function getLabel(record, preferredFields = []) {
  const candidates = [
    ...preferredFields,
    "sts_name", "comp_name", "dept_name", "status_name",
    "name", "label", "code", "title", "description",
  ];
  for (const field of candidates) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "(Unnamed)";
}

export function buildInitials(firstName, lastName, username) {
  const first = String(firstName || "").trim().charAt(0);
  const last = String(lastName || "").trim().charAt(0);
  if (first || last) return `${first}${last}`.toUpperCase();
  return String(username || "U").trim().charAt(0).toUpperCase() || "U";
}

export function statusIsActive(statusLabel, statusRecord) {
  if (statusRecord?.is_active === false) return false;
  const normalized = String(statusLabel || "").trim().toLowerCase();
  if (!normalized) return true;
  return !INACTIVE_STATUS_HINTS.some((keyword) => normalized.includes(keyword));
}

export function buildRequestUpdateMailto(adminEmail, username) {
  if (!hasText(adminEmail)) return "";
  const subject = encodeURIComponent(`Profile update request - ${String(username || "user").trim()}`);
  const body = encodeURIComponent(["Hi,", "", "Please help update my profile details:", "-", "", "Thanks."].join("\n"));
  return `mailto:${adminEmail}?subject=${subject}&body=${body}`;
}

export function buildProfile(dbUser, authUser) {
  const usernameFromDb = String(dbUser?.username || "").trim();
  const usernameFromMeta = String(authUser?.user_metadata?.username || "").trim();
  const usernameFromEmail = String(dbUser?.email || authUser?.email || "").split("@")[0] || "";
  return {
    username: usernameFromDb || usernameFromMeta || usernameFromEmail,
    email: String(dbUser?.email || authUser?.email || "").trim(),
    first_name: String(dbUser?.first_name || authUser?.user_metadata?.first_name || "").trim(),
    last_name: String(dbUser?.last_name || authUser?.user_metadata?.last_name || "").trim(),
    phone: String(dbUser?.phone || "").trim(),
    address: String(dbUser?.address || "").trim(),
    comp_id: dbUser?.comp_id,
    dept_id: dbUser?.dept_id,
    status_id: dbUser?.status_id,
  };
}

export function buildRelations(dbUser) {
  if (!dbUser) return { company: null, department: null, status: null };
  return {
    company: { comp_name: dbUser.comp_name, company_name: dbUser.company_name, comp_email: dbUser.comp_email },
    department: { dept_name: dbUser.dept_name, department_name: dbUser.department_name },
    status: { sts_name: dbUser.sts_name, status_name: dbUser.status_name, is_active: dbUser.status_is_active },
  };
}

export function buildRoleGroupsByApp(roles) {
  const groupMap = new Map();
  (Array.isArray(roles) ? roles : []).forEach((roleRow) => {
    const appId = String(roleRow?.app_id || "").trim();
    const roleId = String(roleRow?.role_id || "").trim();
    const roleName = String(roleRow?.role_name || `Role ${roleId || "-"}`).trim();
    const appName = String(roleRow?.app_name || (appId ? `App ${appId}` : "Application")).trim();
    if (!roleName) return;
    const groupKey = `${appId}:${appName.toLowerCase()}`;
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, { appId, appName, roles: [] });
    const group = groupMap.get(groupKey);
    const alreadyExists = group.roles.some(
      (entry) => entry.roleId === roleId || entry.roleName.toLowerCase() === roleName.toLowerCase(),
    );
    if (!alreadyExists) group.roles.push({ roleId, roleName });
  });
  return Array.from(groupMap.values())
    .map((group) => ({ ...group, roles: group.roles.sort((l, r) => l.roleName.localeCompare(r.roleName)) }))
    .sort((l, r) => l.appName.localeCompare(r.appName));
}
