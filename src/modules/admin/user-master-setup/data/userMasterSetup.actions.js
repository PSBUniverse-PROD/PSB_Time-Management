"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

function normalizeText(value) { return String(value ?? "").trim(); }
function normalizeEmail(value) { return normalizeText(value).toLowerCase() || null; }
function normalizeOptionalText(value) { const t = normalizeText(value); return t === "" ? null : t; }
function normalizeLookupId(value) { const n = normalizeOptionalText(value); return n === null ? null : String(n); }

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const t = normalizeText(value).toLowerCase();
  if (!t) return false;
  return !(t === "false" || t === "0" || t === "f" || t === "n" || t === "no");
}

function hasOwn(source, key) { return Object.prototype.hasOwnProperty.call(source || {}, key); }
function hasValue(value) { return value !== undefined && value !== null && String(value).trim() !== ""; }
function ensureArray(value) { return Array.isArray(value) ? value : []; }

function normalizePassword(value) { return String(value ?? "").trim(); }

/**
 * Computes the next sequential employee_id scoped to the current year.
 *
 * Format: {year}000001 (e.g. 2026000001). The year occupies the leading
 * digits, and a zero-padded 6-digit sequence occupies the trailing digits,
 * so IDs remain readable and sort chronologically by year.
 *
 * Business rule: the sequence resets implicitly each year because the
 * lookup only scans employee_ids that fall within the current year's range.
 */
async function generateUniqueEmployeeId(supabase) {
  const year = new Date().getFullYear();
  const yearPrefix = year * 1000000; // e.g. 2026000000
  const upperBound = yearPrefix + 999999;

  const { data: maxRow, error: maxErr } = await supabase
    .from("psb_s_user")
    .select("employee_id")
    .gte("employee_id", yearPrefix)
    .lte("employee_id", upperBound)
    .order("employee_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(maxErr.message || "Failed to compute next employee_id.");

  const lastNumber = maxRow?.employee_id ? Number(maxRow.employee_id) - yearPrefix : 0;
  return yearPrefix + lastNumber + 1;
}

function readFirstText(row, fields, fallback = "") {
  for (const field of fields) {
    const value = row?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function isActiveFlag(value) {
  if (value === false || value === 0) return false;
  const t = normalizeText(value).toLowerCase();
  return !(t === "false" || t === "0" || t === "f" || t === "n" || t === "no");
}

function usernameToken(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "").slice(0, 48);
}

function usernameFromEmail(email) {
  const n = normalizeEmail(email);
  if (!n) return "";
  return usernameToken(n.split("@")[0] || "");
}

function deriveDisplayName(source) {
  const first = normalizeText(source?.first_name);
  const middle = normalizeText(source?.middle_name);
  const last = normalizeText(source?.last_name);
  const composed = [first, middle, last].filter(Boolean).join(" ").trim();
  return composed || normalizeText(source?.username || source?.user_name);
}

function computeFullName(row) {
  const first = normalizeText(row?.first_name);
  const middle = normalizeText(row?.middle_name);
  const last = normalizeText(row?.last_name);
  const username = normalizeText(row?.username || row?.user_name);
  const composed = [first, middle, last].filter(Boolean).join(" ").trim();
  if (!first && !last) return username || composed || "--";
  return composed || username || "--";
}

function normalizeDateValue(value) {
  const t = normalizeText(value);
  if (!t) return "";
  return t.includes("T") ? t.split("T")[0] : t;
}

function buildStatusLabel(row) {
  const explicit = readFirstText(row, ["status_name", "sts_name", "status", "label", "status_desc"], "").toUpperCase();
  if (explicit) return explicit;
  return isActiveFlag(row?.is_active) ? "ACTIVE" : "INACTIVE";
}

// ─── Model mappers ────────────────────────────────────────

function mapUserMasterRows(rows) {
  return ensureArray(rows).map((row, index) => ({
    id: row?.user_id ?? `user-${index}`,
    user_id: row?.user_id ?? null,
    employee_id: normalizeText(row?.employee_id) || "--",
    username: normalizeText(readFirstText(row, ["username", "user_name"], "--")) || "--",
    display_name: computeFullName(row),
    full_name: computeFullName(row),
    email: normalizeText(readFirstText(row, ["email", "user_email"], "--")) || "--",
    company_name: normalizeText(readFirstText(row, ["comp_name", "company_name", "company"], "--")) || "--",
    department_name: normalizeText(readFirstText(row, ["dept_name", "department_name", "department"], "--")) || "--",
    status_label: buildStatusLabel(row),
    comp_id: row?.comp_id ?? null, dept_id: row?.dept_id ?? null,
    status_id: row?.status_id ?? null,
    is_active: isActiveFlag(row?.is_active),
  }));
}

function mapUserMasterDetail(row) {
  if (!row || typeof row !== "object") return null;
  const fullName = computeFullName(row);
  return {
    id: row?.user_id ?? "", user_id: row?.user_id ?? null, auth_user_id: row?.auth_user_id ?? null,
    employee_id: normalizeText(row?.employee_id),
    username: normalizeText(readFirstText(row, ["username", "user_name"], "")),
    email: normalizeText(readFirstText(row, ["email", "user_email"], "")),
    full_name: fullName, display_name: fullName,
    first_name: normalizeText(row?.first_name), middle_name: normalizeText(row?.middle_name),
    last_name: normalizeText(row?.last_name), phone: normalizeText(row?.phone),
    address: normalizeText(row?.address),
    comp_id: row?.comp_id ?? null, dept_id: row?.dept_id ?? null,
    position: normalizeText(row?.position), hire_date: normalizeDateValue(row?.hire_date),
    status_id: row?.status_id ?? null, status_label: buildStatusLabel(row),
    is_active: isActiveFlag(row?.is_active),
    company_name: normalizeText(readFirstText(row, ["comp_name", "company_name", "company"], "")),
    department_name: normalizeText(readFirstText(row, ["dept_name", "department_name", "department"], "")),
    last_login_at: normalizeText(readFirstText(row, ["last_login_at", "last_sign_in_at"], "")),
  };
}

function mapCompanies(rows) {
  return ensureArray(rows).map((r) => ({
    comp_id: r?.comp_id ?? null,
    label: normalizeText(readFirstText(r, ["comp_name", "company_name", "name"], "Company")) || "Company",
    is_active: isActiveFlag(r?.is_active),
  }));
}

function mapDepartments(rows) {
  return ensureArray(rows).map((r) => ({
    dept_id: r?.dept_id ?? null, comp_id: r?.comp_id ?? null,
    label: normalizeText(readFirstText(r, ["dept_name", "department_name", "name"], "Department")) || "Department",
    is_active: isActiveFlag(r?.is_active),
  }));
}

function mapStatuses(rows) {
  return ensureArray(rows).map((r) => ({
    status_id: r?.status_id ?? null,
    label: normalizeText(readFirstText(r, ["sts_name", "status_name", "name", "status"], "Status")) || "Status",
    is_active: isActiveFlag(r?.is_active),
  }));
}

function mapApplications(rows) {
  return ensureArray(rows).map((r) => ({
    app_id: r?.app_id ?? null,
    label: normalizeText(readFirstText(r, ["app_name", "name", "app_code", "code"], "Application")) || "Application",
    is_active: isActiveFlag(r?.is_active),
  }));
}

function mapRoles(rows) {
  return ensureArray(rows).map((r) => ({
    role_id: r?.role_id ?? null, app_id: r?.app_id ?? null,
    label: normalizeText(readFirstText(r, ["role_name", "name", "code"], "Role")) || "Role",
    is_active: isActiveFlag(r?.is_active),
  }));
}

function createMapById(rows, idField) {
  const m = new Map();
  ensureArray(rows).forEach((r) => {
    const id = r?.[idField];
    if (id != null && id !== "") m.set(String(id), r);
  });
  return m;
}

function mapUserAccessRows(rows, lookups = {}) {
  const appsById = createMapById(lookups?.applications, "app_id");
  const rolesById = createMapById(lookups?.roles, "role_id");
  return ensureArray(rows)
    .map((row, index) => {
      const appId = row?.app_id ?? null, roleId = row?.role_id ?? null;
      const appLookup = appsById.get(String(appId ?? ""));
      const roleLookup = rolesById.get(String(roleId ?? ""));
      const accessKey = normalizeText(row?.uar_id) || normalizeText(row?.id) || `${String(appId ?? "")}:${String(roleId ?? "")}:${index}`;
      return {
        access_key: accessKey, user_id: row?.user_id ?? null, app_id: appId, role_id: roleId,
        application_name: normalizeText(readFirstText({ ...appLookup, ...row }, ["app_name", "label", "name", "app_code", "code"], "Application")) || "Application",
        role_name: normalizeText(readFirstText({ ...roleLookup, ...row }, ["role_name", "label", "name", "code"], "Role")) || "Role",
        is_active: isActiveFlag(row?.is_active),
      };
    })
    .sort((a, b) => {
      const d = String(a.application_name || "").localeCompare(String(b.application_name || ""));
      return d !== 0 ? d : String(a.role_name || "").localeCompare(String(b.role_name || ""));
    });
}

// ─── Lookup loading ───────────────────────────────────────

async function loadLookupData(supabase) {
  const [{ data: cRows, error: cE }, { data: dRows, error: dE }, { data: sRows, error: sE }, { data: aRows, error: aE }, { data: rRows, error: rE }] =
    await Promise.all([
      supabase.from("psb_s_company").select("*").order("comp_name", { ascending: true }),
      supabase.from("psb_s_department").select("*").order("dept_name", { ascending: true }),
      supabase.from("psb_s_status").select("*").order("status_id", { ascending: true }),
      supabase.from("psb_s_application").select("*").order("display_order", { ascending: true }),
      supabase.from("psb_s_role").select("*").order("role_name", { ascending: true }),
    ]);
  if (cE) throw new Error(cE.message); if (dE) throw new Error(dE.message);
  if (sE) throw new Error(sE.message); if (aE) throw new Error(aE.message);
  if (rE) throw new Error(rE.message);
  return {
    companies: mapCompanies(cRows).filter((r) => r.is_active),
    departments: mapDepartments(dRows).filter((r) => r.is_active),
    statuses: mapStatuses(sRows).filter((r) => r.is_active),
    applications: mapApplications(aRows).filter((r) => r.is_active),
    roles: mapRoles(rRows).filter((r) => r.is_active),
  };
}

function createLookupMaps(lookups) {
  const companyById = new Map(), departmentById = new Map(), statusById = new Map();
  (lookups?.companies || []).forEach((r) => { if (r?.comp_id != null) companyById.set(String(r.comp_id), r); });
  (lookups?.departments || []).forEach((r) => { if (r?.dept_id != null) departmentById.set(String(r.dept_id), r); });
  (lookups?.statuses || []).forEach((r) => { if (r?.status_id != null) statusById.set(String(r.status_id), r); });
  return { companyById, departmentById, statusById };
}

function mergeRowWithLookupLabels(row, maps) {
  const compId = normalizeLookupId(row?.comp_id), deptId = normalizeLookupId(row?.dept_id), statusId = normalizeLookupId(row?.status_id);
  const company = compId ? maps.companyById.get(compId) : null;
  const department = deptId ? maps.departmentById.get(deptId) : null;
  const status = statusId ? maps.statusById.get(statusId) : null;
  return {
    ...row,
    comp_name: company?.label || row?.comp_name || row?.company_name || null,
    dept_name: department?.label || row?.dept_name || row?.department_name || null,
    sts_name: status?.label || row?.sts_name || row?.status_name || row?.status || null,
    status_name: status?.label || row?.status_name || row?.sts_name || row?.status || null,
  };
}

function mergeRowsWithLookupLabels(rows, lookups) {
  const maps = createLookupMaps(lookups);
  return ensureArray(rows).map((r) => mergeRowWithLookupLabels(r, maps));
}

// ─── Auth user helpers ─────────────────────────────────────

const AUTH_LIST_PAGE_SIZE = 200;
const AUTH_LIST_MAX_PAGES = 10;

async function listAuthUsers(supabase) {
  const users = [];
  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_LIST_PAGE_SIZE });
    if (error) throw new Error(error.message || "Failed to load auth users.");
    const pageUsers = ensureArray(data?.users);
    users.push(...pageUsers);
    const lastPage = Number(data?.lastPage);
    if (pageUsers.length < AUTH_LIST_PAGE_SIZE || (Number.isFinite(lastPage) && page >= lastPage)) break;
  }
  return users;
}

async function findAuthUserByEmail(supabase, email) {
  const n = normalizeEmail(email);
  if (!n) return null;
  const authUsers = await listAuthUsers(supabase);
  return authUsers.find((u) => normalizeEmail(u?.email) === n) || null;
}

async function findAuthUserById(supabase, authUserId) {
  const n = normalizeText(authUserId);
  if (!n) return null;
  const { data, error } = await supabase.auth.admin.getUserById(n);
  if (error) return null;
  return data?.user || null;
}

function mergeRowWithAuthUser(row, authUser) {
  if (!authUser) return row;
  const merged = { ...row };
  if (!hasValue(merged.auth_user_id) && hasValue(authUser?.id)) merged.auth_user_id = authUser.id;
  if (!hasValue(merged.email) && hasValue(authUser?.email)) merged.email = authUser.email;
  if (!hasValue(merged.username)) {
    const metaUsername = usernameToken(authUser?.user_metadata?.username || "");
    const emailUsername = usernameFromEmail(authUser?.email);
    if (metaUsername || emailUsername) merged.username = metaUsername || emailUsername;
  }
  if (!hasOwn(merged, "is_active") && hasOwn(authUser?.user_metadata || {}, "is_active"))
    merged.is_active = normalizeBoolean(authUser.user_metadata.is_active);
  if (!hasValue(merged.last_login_at) && hasValue(authUser?.last_sign_in_at))
    merged.last_login_at = authUser.last_sign_in_at;
  return merged;
}

async function enrichSingleRowWithAuthUser(supabase, row) {
  if (!row || typeof row !== "object") return row;
  const byAuthId = await findAuthUserById(supabase, row.auth_user_id);
  const authUser = byAuthId || await findAuthUserByEmail(supabase, row.email) || null;
  if (!authUser) return row;
  let nextRow = mergeRowWithAuthUser(row, authUser);
  if (!hasValue(row.auth_user_id) && hasValue(row.user_id)) {
    try {
      const { data: synced, error } = await supabase.from("psb_s_user").update({ auth_user_id: authUser.id }).eq("user_id", row.user_id).select("*").single();
      if (!error && synced) nextRow = mergeRowWithAuthUser({ ...synced, full_name: computeFullName(synced) }, authUser);
    } catch { nextRow = { ...nextRow, auth_user_id: authUser.id }; }
  }
  return nextRow;
}

// `authUsers` is the list from listAuthUsers, loaded by the caller alongside
// the other queries (an empty list leaves the rows as they are).
async function enrichRowsWithAuthUsers(supabase, rows, authUsers) {
  const safe = ensureArray(rows);
  if (safe.length === 0) return [];
  const authById = new Map(), authByEmail = new Map();
  ensureArray(authUsers).forEach((u) => {
    const id = normalizeText(u?.id), em = normalizeEmail(u?.email);
    if (id) authById.set(id, u);
    if (em) authByEmail.set(em, u);
  });
  // Rows missing their auth link are linked all at once, not one after another.
  return Promise.all(safe.map(async (row) => {
    const authId = normalizeText(row?.auth_user_id), email = normalizeEmail(row?.email);
    const authUser = authById.get(authId) || authByEmail.get(email) || null;
    if (!authUser) return row;
    let nextRow = mergeRowWithAuthUser(row, authUser);
    if (!authId && hasValue(row?.user_id)) {
      try {
        const { data: synced, error } = await supabase.from("psb_s_user").update({ auth_user_id: authUser.id }).eq("user_id", row.user_id).select("*").single();
        if (!error && synced) nextRow = mergeRowWithAuthUser({ ...synced, full_name: computeFullName(synced) }, authUser);
      } catch { nextRow = { ...nextRow, auth_user_id: authUser.id }; }
    }
    return nextRow;
  }));
}

function buildAuthMetadata(payload) {
  const metadata = {};
  if (hasOwn(payload, "username") && hasValue(payload.username)) metadata.username = usernameToken(payload.username);
  const displayName = deriveDisplayName(payload);
  if (displayName) metadata.full_name = displayName;
  if (hasOwn(payload, "first_name") && hasValue(payload.first_name)) metadata.first_name = normalizeText(payload.first_name);
  if (hasOwn(payload, "last_name") && hasValue(payload.last_name)) metadata.last_name = normalizeText(payload.last_name);
  if (hasOwn(payload, "is_active")) metadata.is_active = normalizeBoolean(payload.is_active);
  return metadata;
}

async function syncAuthUserFromPayload(supabase, authUserId, payload, options = {}) {
  const n = normalizeText(authUserId);
  if (!n) return;
  const updatePayload = {};
  const email = hasOwn(payload, "email") ? normalizeEmail(payload.email) : null;
  if (email) updatePayload.email = email;
  const metadata = buildAuthMetadata(payload);
  if (Object.keys(metadata).length > 0) updatePayload.user_metadata = metadata;
  if (options?.syncPassword === true) {
    const pw = normalizePassword(payload?.password);
    if (pw) updatePayload.password = pw;
  }
  if (Object.keys(updatePayload).length === 0) return;
  const { error } = await supabase.auth.admin.updateUserById(n, updatePayload);
  if (error) throw new Error(error.message || "Failed to sync auth user.");
}

async function resolveOrCreateAuthUserId(supabase, payload) {
  const existing = normalizeText(payload?.auth_user_id);
  if (existing) return { authUserId: existing, createdAuthUserId: null };
  const email = normalizeEmail(payload?.email);
  if (!email) return { authUserId: null, createdAuthUserId: null };
  const existingAuth = await findAuthUserByEmail(supabase, email);
  if (existingAuth?.id) return { authUserId: existingAuth.id, createdAuthUserId: null };
  const pw = normalizePassword(payload?.password);
  if (!pw) throw new Error("Password is required to create auth user.");
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: pw, email_confirm: true, user_metadata: buildAuthMetadata(payload),
  });
  if (error || !data?.user?.id) throw new Error(error?.message || "Failed to create auth user.");
  return { authUserId: data.user.id, createdAuthUserId: data.user.id };
}

async function resolveUniqueUsername(supabase, preferred, excludeUserId = null) {
  const base = usernameToken(preferred) || `user_${Date.now().toString(36)}`;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    const { data, error } = await supabase.from("psb_s_user").select("user_id").eq("username", candidate).maybeSingle();
    if (error) throw new Error(error.message || "Failed to validate username uniqueness.");
    if (!data) return candidate;
    if (hasValue(excludeUserId) && String(data.user_id) === String(excludeUserId)) return candidate;
  }
  return `${base}_${Date.now().toString(36).slice(-4)}`;
}

// ─── Writable payload builder ─────────────────────────────

const USER_WRITABLE_FIELDS = [
  "auth_user_id", "email", "username", "first_name", "middle_name", "last_name",
  "phone", "address", "position", "hire_date", "comp_id", "dept_id", "status_id", "is_active",
];

function buildWritablePayload(source, { includeDefaultActive } = {}) {
  const payload = {};
  USER_WRITABLE_FIELDS.forEach((f) => {
    if (!hasOwn(source, f)) return;
    if (f === "is_active") { payload.is_active = normalizeBoolean(source[f]); return; }
    if (f === "email") { payload.email = normalizeEmail(source[f]); return; }
    payload[f] = normalizeOptionalText(source[f]);
  });
  if (includeDefaultActive && !hasOwn(payload, "is_active")) payload.is_active = true;
  return payload;
}

// ─── Exported Server Actions ──────────────────────────────

// Lookup lists, user rows and auth accounts don't depend on each other, so
// they load together: one wait instead of three. A failed user or auth query
// gives no rows / no auth details, as before; a failed lookup still throws.
async function loadUsersWithLookups(supabase) {
  const [lookupData, usersResult, authUsers] = await Promise.all([
    loadLookupData(supabase),
    supabase.from("psb_s_user").select("*").order("user_id", { ascending: true }).limit(200),
    listAuthUsers(supabase).catch(() => []),
  ]);
  let rows = usersResult.error ? [] : ensureArray(usersResult.data).map((r) => ({ ...r, full_name: computeFullName(r) }));
  rows = await enrichRowsWithAuthUsers(supabase, rows, authUsers);
  rows = mergeRowsWithLookupLabels(rows, lookupData);
  return { lookupData, users: mapUserMasterRows(rows) };
}

export async function loadUserMasterSetupData() {
  const { lookupData, users } = await loadUsersWithLookups(getSupabaseAdmin());
  // Lookups go to the screen with the page, so it doesn't load them a second time.
  return { users, totalUsers: users.length, lookups: lookupData };
}

export async function loadUserMasterLookups() {
  const supabase = getSupabaseAdmin();
  return loadLookupData(supabase);
}

export async function loadUserMasterUsers() {
  const { users } = await loadUsersWithLookups(getSupabaseAdmin());
  return users;
}

export async function loadUserMasterDetail(userId) {
  const supabase = getSupabaseAdmin();
  // The user row, lookup lists and access rows (active and inactive) load
  // together; only the auth account lookup needs the user row first.
  const [{ data: record, error }, lookupData, { data: accessData, error: accessErr }] = await Promise.all([
    supabase.from("psb_s_user").select("*").eq("user_id", userId).single(),
    loadLookupData(supabase),
    supabase
      .from("psb_m_userapproleaccess").select("*")
      .eq("user_id", userId)
      .order("app_id", { ascending: true }).order("role_id", { ascending: true }),
  ]);
  if (error) throw new Error(error.message || "Failed to fetch user.");
  const row = { ...record, full_name: computeFullName(record) };
  let enriched = await enrichSingleRowWithAuthUser(supabase, row);
  enriched = mergeRowWithLookupLabels(enriched, createLookupMaps(lookupData));
  const user = mapUserMasterDetail(enriched);

  if (accessErr) throw new Error(accessErr.message || "Failed to fetch access rows.");
  const accessRows = mapUserAccessRows(ensureArray(accessData), { applications: lookupData.applications, roles: lookupData.roles });

  return { user, accessRows };
}

// `skipResultRow`: the batch save only needs the new id, so it skips the
// lookup/auth loads that build the full row for the screen.
export async function createUserAction(payload, { skipResultRow = false } = {}) {
  const supabase = getSupabaseAdmin();
  const createPayload = buildWritablePayload(payload, { includeDefaultActive: true });
  const pw = normalizePassword(payload?.password);
  if (!pw) throw new Error("Password is required for new users.");
  createPayload.email = normalizeEmail(createPayload.email);
  if (!createPayload.email) throw new Error("Email is required.");

  const preferred = usernameToken(createPayload.username) || usernameFromEmail(createPayload.email) || usernameToken(deriveDisplayName(createPayload));
  createPayload.username = await resolveUniqueUsername(supabase, preferred);
  if (!createPayload.username) throw new Error("Username is required.");

  const authRes = await resolveOrCreateAuthUserId(supabase, { ...createPayload, password: pw });
  if (authRes.authUserId) createPayload.auth_user_id = authRes.authUserId;

  let created;
  const MAX_EMPLOYEE_ID_ATTEMPTS = 5;
  try {
    for (let attempt = 1; attempt <= MAX_EMPLOYEE_ID_ATTEMPTS; attempt++) {
      createPayload.employee_id = await generateUniqueEmployeeId(supabase);
      const { data, error } = await supabase.from("psb_s_user").insert(createPayload).select("*").single();
      if (!error) { created = { ...data, full_name: computeFullName(data) }; break; }
      const isDuplicateEmployeeId = error?.code === "23505" && String(error?.message || "").includes("employee_id");
      if (!isDuplicateEmployeeId || attempt === MAX_EMPLOYEE_ID_ATTEMPTS) {
        throw new Error(error.message || "Failed to create user.");
      }
      // duplicate employee_id from a race — loop and regenerate
    }
  } catch (err) {
    if (authRes.createdAuthUserId) await supabase.auth.admin.deleteUser(authRes.createdAuthUserId).catch(() => {});
    throw err;
  }

  if (authRes.authUserId) {
    await syncAuthUserFromPayload(supabase, authRes.authUserId, { ...createPayload, password: pw }, { syncPassword: true });
  }

  if (skipResultRow) return { user_id: created.user_id };

  const lookupData = await loadLookupData(supabase);
  let enriched = await enrichSingleRowWithAuthUser(supabase, created);
  enriched = mergeRowsWithLookupLabels([enriched], lookupData)[0] || enriched;
  return mapUserMasterRows([enriched])[0] || null;
}

// `skipResultRow`: see createUserAction.
export async function updateUserAction(userId, updates, { skipResultRow = false } = {}) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: fetchErr } = await supabase.from("psb_s_user").select("*").eq("user_id", userId).single();
  if (fetchErr) throw new Error(fetchErr.message || "Failed to fetch user.");

  const updatePayload = buildWritablePayload(updates, { includeDefaultActive: false });
  const pw = normalizePassword(updates?.password);

  if (hasOwn(updatePayload, "email")) {
    updatePayload.email = normalizeEmail(updatePayload.email);
    if (!updatePayload.email) throw new Error("Email is required.");
  }

  if (hasOwn(updatePayload, "username")) {
    const preferred = usernameToken(updatePayload.username);
    if (!preferred) throw new Error("Username is required.");
    updatePayload.username = await resolveUniqueUsername(supabase, preferred, userId);
  }

  if (!hasOwn(updatePayload, "username") && !hasValue(existing?.username) && hasOwn(updatePayload, "email")) {
    const preferred = usernameFromEmail(updatePayload.email) || usernameToken(deriveDisplayName({ ...existing, ...updates }));
    updatePayload.username = await resolveUniqueUsername(supabase, preferred, userId);
  }

  if (!hasValue(existing?.auth_user_id) && hasOwn(updatePayload, "email") && updatePayload.email) {
    const existingAuth = await findAuthUserByEmail(supabase, updatePayload.email);
    if (existingAuth?.id) updatePayload.auth_user_id = existingAuth.id;
  }

  if (Object.keys(updatePayload).length === 0) throw new Error("No valid user updates supplied.");

  const { data: updated, error: updErr } = await supabase.from("psb_s_user").update(updatePayload).eq("user_id", userId).select("*").single();
  if (updErr) throw new Error(updErr.message || "Failed to update user.");

  const resolvedAuthId = normalizeText(updated?.auth_user_id) || normalizeText(existing?.auth_user_id) || normalizeText(updatePayload?.auth_user_id);
  if (resolvedAuthId) {
    const syncPayload = { ...existing, ...updatePayload, ...updated };
    if (pw) syncPayload.password = pw;
    await syncAuthUserFromPayload(supabase, resolvedAuthId, syncPayload, { syncPassword: Boolean(pw) });
  }

  if (skipResultRow) return { user_id: updated.user_id };

  const lookupData = await loadLookupData(supabase);
  let enriched = await enrichSingleRowWithAuthUser(supabase, { ...updated, full_name: computeFullName(updated) });
  enriched = mergeRowsWithLookupLabels([enriched], lookupData)[0] || enriched;
  return mapUserMasterRows([enriched])[0] || null;
}

export async function deleteUserAction(userId) {
  const supabase = getSupabaseAdmin();
  // Revoke all active access
  const { data: revokedRows } = await supabase.from("psb_m_userapproleaccess").update({ is_active: false }).eq("user_id", userId).eq("is_active", true).select("*");
  // Soft delete
  const { data: updated, error } = await supabase.from("psb_s_user").update({ is_active: false }).eq("user_id", userId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate user.");
  const resolvedAuthId = normalizeText(updated?.auth_user_id);
  if (resolvedAuthId) {
    await syncAuthUserFromPayload(supabase, resolvedAuthId, { ...updated, is_active: false }, { syncPassword: false });
  }
  return { revokedAccessCount: ensureArray(revokedRows).length };
}

export async function createAccessAction(userId, payload) {
  const supabase = getSupabaseAdmin();
  const appId = normalizeOptionalText(payload?.app_id), roleId = normalizeOptionalText(payload?.role_id);
  if (!appId || !roleId) throw new Error("Application and role are required.");

  // Validate role belongs to app
  const { data: roles } = await supabase.from("psb_s_role").select("*").eq("app_id", appId);
  if (!ensureArray(roles).some((r) => String(r?.role_id) === String(roleId)))
    throw new Error("Selected role does not belong to the selected application.");

  const { data, error } = await supabase.from("psb_m_userapproleaccess")
    .upsert({ user_id: userId, app_id: appId, role_id: roleId, is_active: hasOwn(payload, "is_active") ? normalizeBoolean(payload.is_active) : true }, { onConflict: "user_id,app_id,role_id" })
    .select("*").single();
  if (error) throw new Error(error.message || "Failed to create access row.");

  const lookupData = await loadLookupData(supabase);
  return mapUserAccessRows([data], { applications: lookupData.applications, roles: lookupData.roles })[0] || null;
}

export async function deleteAccessAction(userId, payload) {
  const supabase = getSupabaseAdmin();
  const appId = normalizeOptionalText(payload?.app_id), roleId = normalizeOptionalText(payload?.role_id);
  if (!appId || !roleId) throw new Error("Application and role are required.");

  const { data, error } = await supabase.from("psb_m_userapproleaccess")
    .update({ is_active: false }).eq("user_id", userId).eq("app_id", appId).eq("role_id", roleId).select("*");
  if (error) throw new Error(error.message || "Failed to deactivate access row.");
  if (ensureArray(data).length === 0) throw new Error("Access mapping not found.");
  return { deactivated: true };
}

// ─── Batch save ────────────────────────────────────────────

// Adds (or re-activates) access rows in one upsert, after checking in one
// query that every role belongs to its application. Same rules as
// createAccessAction. Duplicate rows are dropped (an upsert may not touch
// the same key twice).
async function upsertAccessRows(supabase, rows) {
  const byKey = new Map();
  ensureArray(rows).forEach((row) => {
    const userId = normalizeOptionalText(row?.user_id), appId = normalizeOptionalText(row?.app_id), roleId = normalizeOptionalText(row?.role_id);
    if (!userId || !appId || !roleId) throw new Error("Application and role are required.");
    byKey.set(`${userId}|${appId}|${roleId}`, { user_id: userId, app_id: appId, role_id: roleId, is_active: true });
  });
  const uniqueRows = Array.from(byKey.values());
  if (uniqueRows.length === 0) return;

  const roleIds = Array.from(new Set(uniqueRows.map((row) => row.role_id)));
  const { data: roles, error: roleError } = await supabase.from("psb_s_role").select("role_id, app_id").in("role_id", roleIds);
  if (roleError) throw new Error(roleError.message || "Failed to validate roles.");
  const appIdByRoleId = new Map(ensureArray(roles).map((role) => [String(role.role_id), String(role.app_id)]));
  uniqueRows.forEach((row) => {
    if (appIdByRoleId.get(String(row.role_id)) !== String(row.app_id)) {
      throw new Error("Selected role does not belong to the selected application.");
    }
  });

  const { error } = await supabase.from("psb_m_userapproleaccess").upsert(uniqueRows, { onConflict: "user_id,app_id,role_id" });
  if (error) throw new Error(error.message || "Failed to create access row.");
}

/**
 * Saves a whole staged batch in ONE call from the browser (it used to be one
 * call per user and per access row). Same order as before: new users and their
 * access → user updates → access removals → access additions. New users and
 * updates go one at a time (each needs a unique username / employee id);
 * access changes go together. Returns { [tempId]: newUserId }.
 */
export async function saveUserMasterBatch(pendingBatch) {
  const supabase = getSupabaseAdmin();
  const createdIds = {};
  // Staged rows may point at a user created earlier in this batch ("tmp-…" id).
  const resolveUserId = (rawId) => {
    const id = createdIds[String(rawId)] || rawId;
    return id && !normalizeText(id).startsWith("tmp-") ? id : null;
  };

  const newUserAccess = [];
  for (const entry of ensureArray(pendingBatch?.creates)) {
    const created = await createUserAction(entry?.payload || {}, { skipResultRow: true });
    if (!created?.user_id) throw new Error("Created user did not return a valid id.");
    createdIds[String(entry?.tempId)] = String(created.user_id);
    ensureArray(entry?.accessRows).forEach((access) => {
      newUserAccess.push({ user_id: created.user_id, app_id: access?.app_id, role_id: access?.role_id });
    });
  }
  await upsertAccessRows(supabase, newUserAccess);

  for (const [rawId, payload] of Object.entries(pendingBatch?.updates || {})) {
    const userId = resolveUserId(rawId);
    if (userId) await updateUserAction(userId, payload || {}, { skipResultRow: true });
  }

  const removals = [];
  for (const [rawId, rows] of Object.entries(pendingBatch?.accessDeletes || {})) {
    const userId = resolveUserId(rawId);
    if (!userId) continue;
    ensureArray(rows).forEach((row) => {
      removals.push(deleteAccessAction(userId, { app_id: row?.app_id, role_id: row?.role_id }));
    });
  }
  await Promise.all(removals);

  const additions = [];
  for (const [rawId, rows] of Object.entries(pendingBatch?.accessUpserts || {})) {
    const userId = resolveUserId(rawId);
    if (!userId) continue;
    ensureArray(rows).forEach((row) => additions.push({ user_id: userId, app_id: row?.app_id, role_id: row?.role_id }));
  }
  await upsertAccessRows(supabase, additions);

  return createdIds;
}
