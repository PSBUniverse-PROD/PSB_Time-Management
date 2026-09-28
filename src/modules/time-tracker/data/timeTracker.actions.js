/**
 * Server Actions — timeTracker.actions.js
 * Server-side data loading + clock in/clock out for the Time Tracker module.
 */
"use server";

import { getCurrentSession } from "@/core/auth/session.service";
import { getSupabaseAdmin } from "@/core/supabase/admin";
import { getTimeTrackerPermissions } from "./timeTracker.permissions";
import {
  APP_TIMEZONE,
  DEFAULT_LATE_DEADLINE,
  DEFAULT_GRACE_PERIOD,
  SCHEDULE_DAYS,
  computeLogHours,
  computeScheduledWeeklyHours,
  toHHMM,
  validateScheduleDay,
} from "./timeTracker.data";

const STATUS_CLOCKED_IN = "CLOCKED_IN";
const STATUS_CLOCKED_OUT = "CLOCKED_OUT";

/**
 * Turn a Supabase error into a single readable string for the server log.
 * Postgrest errors keep their `message` on a non-enumerable property, so
 * logging the raw object often prints nothing useful (e.g. `{}`). Surfaces
 * message/code/details/hint so the real cause is visible in the terminal.
 */
function describeError(err) {
  const parts = [];
  if (err?.message) parts.push(err.message);
  if (err?.code) parts.push(`code=${err.code}`);
  if (err?.details) parts.push(`details=${err.details}`);
  if (err?.hint) parts.push(`hint=${err.hint}`);
  return parts.length ? parts.join(" | ") : JSON.stringify(err);
}

// ── Helpers ──────────────────────────────────────────────────

/** Resolve the business user id from the active SSO session. */
async function getSessionUserId() {
  const session = await getCurrentSession();
  return session?.userId || null;
}

const TIME_TRACKER_APP_ID = 10;

/**
 * Load the Time Tracker app roles and organization roles for a user.
 *
 * Errors are thrown instead of being swallowed. An earlier version returned an
 * empty list on failure, which was indistinguishable from "this user has no
 * roles" and left the page blank with no menu items and no log entry.
 */
async function loadTimeTrackerRoles(supabase, userId) {
  const { data: accessRows, error: accessError } = await supabase
    .from("psb_m_userapproleaccess")
    .select("role_id")
    .eq("user_id", userId)
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("is_active", true);
  if (accessError) throw new Error(`role access: ${describeError(accessError)}`);

  const roleIds = [...new Set((accessRows || []).map((row) => row.role_id).filter(Boolean))];

  const [rolesRes, orgAccessRes] = await Promise.all([
    roleIds.length
      ? supabase
        .from("psb_s_role")
        .select("role_id, role_name, app_id, is_active")
        .in("role_id", roleIds)
        .eq("app_id", TIME_TRACKER_APP_ID)
        .eq("is_active", true)
      : { data: [] },
    supabase
      .from("wfk_m_userorgrole")
      .select("role_id")
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);
  if (rolesRes.error) throw new Error(`roles: ${describeError(rolesRes.error)}`);
  if (orgAccessRes.error) throw new Error(`org access: ${describeError(orgAccessRes.error)}`);

  const orgRoleIds = [...new Set((orgAccessRes.data || []).map((row) => row.role_id).filter(Boolean))];
  const orgRes = orgRoleIds.length
    ? await supabase
      .from("wfk_s_orgrole")
      .select("orgrole_id, name, description")
      .in("orgrole_id", orgRoleIds)
      .eq("is_active", true)
    : { data: [] };
  if (orgRes.error) throw new Error(`org roles: ${describeError(orgRes.error)}`);

  return {
    roles: Array.isArray(rolesRes.data) ? rolesRes.data : [],
    orgRoles: Array.isArray(orgRes.data) ? orgRes.data : [],
  };
}

const DEFAULT_WEEKLY_HOURS_TARGET = 40;

/**
 * Look up a user's weekly hours target. `hasHoursTarget` is false when no
 * active row exists — used to gate Clock In until an admin sets one up.
 *
 * Business Rule:
 * This used `.maybeSingle()`, which returns an error whenever a user has more
 * than one active row. That made a correctly configured user look like they
 * had no target, so Clock In stayed disabled. Reading the most recently
 * updated row is more forgiving and reads correctly even if duplicate rows
 * already exist from earlier data problems.
 *
 * Throws on a real database error so the caller can tell the user their access
 * could not be loaded, rather than silently showing "target not set".
 */
async function loadHoursTargetInfo(supabase, userId) {
  const { data, error } = await supabase
    .from("time_m_userhourstarget")
    .select("weekly_hours_target")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) throw new Error(`hours target: ${describeError(error)}`);

  const row = data?.[0];
  if (!row) {
    return { weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET, hasHoursTarget: false };
  }
  return {
    weeklyHoursTarget: Number(row.weekly_hours_target) || DEFAULT_WEEKLY_HOURS_TARGET,
    hasHoursTarget: true,
  };
}

/**
 * Refetch just the current user's Time Tracker roles/org-roles — used to
 * keep sidebar tab visibility in sync after an Admin changes role access
 * elsewhere, without re-fetching the whole week's logs.
 *
 * Returns `status: "no-session"` when the sign-in has expired, and
 * `status: "load-error"` when the database could not be read, so the page can
 * show a retry message instead of an empty screen.
 */
export async function loadCurrentUserPermissionsData() {
  const userId = await getSessionUserId();
  if (!userId) return { roles: [], orgRoles: [], status: "no-session" };

  try {
    const result = await loadTimeTrackerRoles(getSupabaseAdmin(), userId);
    return { ...result, status: "ok" };
  } catch (err) {
    console.error("loadCurrentUserPermissionsData:", userId, err.message);
    return { roles: [], orgRoles: [], status: "load-error" };
  }
}

/** Monday of the week containing a "YYYY-MM-DD" date string. */
function getMondayOfWeekStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** "YYYY-MM-DD" + n days → "YYYY-MM-DD" (calendar math, no timezone drift). */
function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const LOCKED_SUBMISSION_STATUSES = new Set(["pending", "approved"]);

/**
 * Whether the week containing `clockInDate` is locked from editing — i.e.
 * it has a submitted timesheet whose workflow instance is currently
 * Pending or Approved. Reads wfk_* tables read-only; Time Tracker never
 * writes to the workflow engine's own setup or transactional tables.
 */
async function isWeekLocked(supabase, userId, clockInDate) {
  const weekStart = getMondayOfWeekStr(clockInDate);

  const { data: submission } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("submission_id")
    .eq("user_id", userId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  if (!submission) return { locked: false, statusName: null };

  const { data: instance } = await supabase
    .from("wfk_t_workflowinstance")
    .select("status_id")
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("document_id", submission.submission_id)
    .maybeSingle();

  if (!instance?.status_id) return { locked: false, statusName: null };

  const { data: status } = await supabase
    .from("wfk_s_status")
    .select("status_name")
    .eq("status_id", instance.status_id)
    .maybeSingle();

  const statusName = String(status?.status_name || "").trim();
  const locked = LOCKED_SUBMISSION_STATUSES.has(statusName.toLowerCase());
  return { locked, statusName };
}

/** Look up the numeric id for a status code (e.g. "CLOCKED_IN"). */
async function getStatusId(supabase, statusCode) {
  const { data, error } = await supabase
    .from("time_s_status")
    .select("status_id")
    .eq("status_code", statusCode)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Unable to resolve status_id for ${statusCode}`);
  }
  return data.status_id;
}

const FALLBACK_TZ = "UTC";

/**
 * Validate a browser-reported IANA timezone, falling back to UTC if it is
 * missing or invalid so an unexpected value can't break the date formatter.
 */
function safeTimezone(timezone) {
  if (!timezone) return FALLBACK_TZ;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    console.warn(`Invalid timezone "${timezone}", falling back to ${FALLBACK_TZ}`);
    return FALLBACK_TZ;
  }
}

/** Local date as YYYY-MM-DD in the given IANA timezone. */
function dateStrInTz(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Local time as HH:MM:SS in the given IANA timezone. */
function timeStrInTz(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimezone(timezone),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

// ── Reads ────────────────────────────────────────────────────

/**
 * The safe, empty shape the page starts from whenever data can't be loaded.
 *
 * Business Rule:
 * A user with no Time Tracker roles should see a page with no tabs, not a
 * broken one. Spreading this constant means callers only need to add `status`
 * to describe *why* the data is empty.
 */
const EMPTY_DATA = {
  logs: [],
  roles: [],
  orgRoles: [],
  weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET,
  hasHoursTarget: false,
  schedule: null,
  clockedIn: false,
  openLogId: null,
  lastClockIn: null,
  config: { lateDeadline: DEFAULT_LATE_DEADLINE, gracePeriod: DEFAULT_GRACE_PERIOD },
};

/**
 * Load this week's logs + current clock status for the logged-in user.
 * @param {string} weekStartDate - "YYYY-MM-DD"
 * @param {string} weekEndDate - "YYYY-MM-DD"
 *
 * `status` tells the page what happened, so it can react instead of silently
 * rendering an empty screen:
 *   "no-session" - nobody is signed in (or the session expired). The page
 *                 sends the user to the login screen.
 *   "load-error" - signed in, but the database read failed. The page shows a
 *                 retry message.
 *   "ok"         - data loaded normally, even if the user simply has no roles.
 */
export async function loadTimeTrackerData(weekStartDate, weekEndDate) {
  const userId = await getSessionUserId();

  if (!userId) {
    return { ...EMPTY_DATA, status: "no-session" };
  }

  const supabase = getSupabaseAdmin();

  let roles, orgRoles, weeklyHoursTarget, hasHoursTarget, schedule;
  try {
    ({ roles, orgRoles } = await loadTimeTrackerRoles(supabase, userId));
    ({ weeklyHoursTarget, hasHoursTarget } = await loadHoursTargetInfo(supabase, userId));
    schedule = await loadUserScheduleModel(supabase, userId);
  } catch (err) {
    console.error("loadTimeTrackerData:", userId, err.message);
    return { ...EMPTY_DATA, status: "load-error" };
  }

  const { data: logs, error: logsError } = await supabase
    .from("time_t_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("clock_in_date", weekStartDate)
    .lte("clock_in_date", weekEndDate)
    .order("clock_in_date", { ascending: true });

  if (logsError) console.error("loadTimeTrackerData logs error:", describeError(logsError));

  const { data: openLog, error: openLogError } = await supabase
    .from("time_t_logs")
    .select("*")
    .eq("user_id", userId)
    .is("clock_out_time", null)
    .order("clock_in_date", { ascending: false })
    .order("clock_in_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openLogError) console.error("loadTimeTrackerData openLog error:", describeError(openLogError));

  return {
    logs: logs || [],
    roles,
    orgRoles,
    weeklyHoursTarget,
    hasHoursTarget,
    schedule,
    clockedIn: Boolean(openLog),
    openLogId: openLog?.log_id ?? null,
    lastClockIn: openLog ? `${openLog.clock_in_date}T${openLog.clock_in_time}` : null,
    config: { lateDeadline: DEFAULT_LATE_DEADLINE, gracePeriod: DEFAULT_GRACE_PERIOD },
    status: "ok",
  };
}

/**
 * Refetch just the current user's hours-target info — used to keep the
 * Logs tab's Summary panel in sync after an Admin edits it in Setup,
 * without re-fetching the whole week's logs.
 *
 * Also part of the retry path: the page calls this alongside the roles refresh
 * so a restored sign-in unlocks Clock In at the same moment the menu items
 * come back. `status` follows the same rules as `loadTimeTrackerData`.
 */
export async function loadCurrentUserHoursTarget() {
  const userId = await getSessionUserId();
  if (!userId) {
    return {
      weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET,
      hasHoursTarget: false,
      schedule: null,
      status: "no-session",
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    // Both come from the same Setup screen, so refetching them together keeps
    // the Summary card and the Clock In gate in step after an Admin edits them.
    const [hoursResult, schedule] = await Promise.all([
      loadHoursTargetInfo(supabase, userId),
      loadUserScheduleModel(supabase, userId),
    ]);
    return { ...hoursResult, schedule, status: "ok" };
  } catch (err) {
    console.error("loadCurrentUserHoursTarget:", userId, err.message);
    return {
      weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET,
      hasHoursTarget: false,
      schedule: null,
      status: "load-error",
    };
  }
}

// ── Writes ───────────────────────────────────────────────────

/**
 * Clock in the current user. One session per Dallas calendar day.
 * Times are recorded in Dallas time (APP_TIMEZONE), regardless of the user's device.
 */
export async function clockIn() {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const supabase = getSupabaseAdmin();

  // The hours-target read now throws on a real database error rather than
  // pretending the target is missing, so it needs its own handling here.
  let hasHoursTarget;
  try {
    ({ hasHoursTarget } = await loadHoursTargetInfo(supabase, userId));
  } catch (err) {
    console.error("clockIn hours target error:", err.message);
    return { success: false, error: "Unable to check your hours target. Please try again." };
  }

  if (!hasHoursTarget) {
    return {
      success: false,
      error: "Your weekly hours target hasn't been set up yet. Contact your admin.",
    };
  }

  const now = new Date();
  const today = dateStrInTz(now, APP_TIMEZONE);

  const { data: existingToday } = await supabase
    .from("time_t_logs")
    .select("log_id, clock_out_time")
    .eq("user_id", userId)
    .eq("clock_in_date", today)
    .maybeSingle();

  if (existingToday) {
    return {
      success: false,
      error: existingToday.clock_out_time ? "Already logged a session today." : "Already clocked in today.",
    };
  }

  const statusId = await getStatusId(supabase, STATUS_CLOCKED_IN);

  const { data, error } = await supabase
    .from("time_t_logs")
    .insert({
      user_id: userId,
      status_id: statusId,
      clock_in_date: today,
      clock_in_time: timeStrInTz(now, APP_TIMEZONE),
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("clockIn error:", describeError(error));
    return { success: false, error: "Failed to clock in." };
  }

  return { success: true, record: data };
}

/**
 * Clock out the current user's open session.
 * Times are recorded in Dallas time (APP_TIMEZONE), regardless of the user's device.
 */
export async function clockOut(logId) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const supabase = getSupabaseAdmin();

  const { data: openLog, error: fetchError } = await supabase
    .from("time_t_logs")
    .select("*")
    .eq("log_id", logId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !openLog) return { success: false, error: "Open session not found." };
  if (openLog.clock_out_time) return { success: false, error: "Already clocked out." };

  const statusId = await getStatusId(supabase, STATUS_CLOCKED_OUT);
  const now = new Date();
  const clockOutDate = dateStrInTz(now, APP_TIMEZONE);
  const clockOutTime = timeStrInTz(now, APP_TIMEZONE);

  let rulesByDay;
  try {
    rulesByDay = await loadScheduleRulesForUser(supabase, userId);
  } catch (err) {
    console.error("clockOut schedule error:", err.message);
    return { success: false, error: "Unable to load your work schedule. Please try again." };
  }

  const { totalHours, overtimeHours } = computeLogHours(
    {
      clockInDate: openLog.clock_in_date,
      clockInTime: openLog.clock_in_time,
      clockOutDate,
      clockOutTime,
    },
    rulesByDay,
  );

  const { data, error } = await supabase
    .from("time_t_logs")
    .update({
      status_id: statusId,
      clock_out_date: clockOutDate,
      clock_out_time: clockOutTime,
      total_hours: totalHours,
      overtime_hours: overtimeHours,
      updated_at: now.toISOString(),
      updated_by: userId,
    })
    .eq("log_id", logId)
    .select("*")
    .single();

  if (error) {
    console.error("clockOut error:", describeError(error));
    return { success: false, error: "Failed to clock out." };
  }

  return { success: true, record: data };
}

/** Load the "Reason for Edit" dropdown options: time_s_status rows tagged 'edit_reason'. */
export async function loadEditReasons() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("time_s_status")
    .select("status_id, status_name")
    .eq("tag", "edit_reason")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("loadEditReasons error:", describeError(error));
    return [];
  }
  return data || [];
}

// ── Admin Setup: shared helpers ─────────────────────────────

/**
 * Confirm the caller is signed in AND is a Time Tracker Admin.
 * Returns { userId, supabase } on success, or { error } to hand back to the UI.
 */
async function requireTimeTrackerAdmin() {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Not authenticated." };

  const supabase = getSupabaseAdmin();
  const isAdmin = await checkIsTimeTrackerAdmin(supabase, userId);
  if (!isAdmin) return { error: "Only Time Tracker admins can change setup." };

  return { userId, supabase };
}

const MODEL_DAY_COLUMNS = "day_of_week, start_time, break_start, break_end, end_time";

/** DB day row → the shape used by the UI and the shared helpers. */
function mapModelDayRow(row) {
  return {
    dayOfWeek: Number(row.day_of_week),
    startTime: toHHMM(row.start_time),
    breakStart: toHHMM(row.break_start),
    breakEnd: toHHMM(row.break_end),
    endTime: toHHMM(row.end_time),
  };
}

async function loadModelDays(supabase, modelId) {
  const { data, error } = await supabase
    .from("time_s_schedulemodelday")
    .select(MODEL_DAY_COLUMNS)
    .eq("model_id", modelId)
    .order("day_of_week", { ascending: true });

  if (error) throw new Error(`model days: ${describeError(error)}`);
  return (data || []).map(mapModelDayRow);
}

/**
 * The employee's assigned schedule model with its working days.
 * Returns null when no model is assigned. Throws on a real database error.
 */
async function loadUserScheduleModel(supabase, userId) {
  const { data, error } = await supabase
    .from("time_m_userhourstarget")
    .select("model_id, model:time_s_schedulemodel (model_code, model_name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) throw new Error(`schedule model: ${describeError(error)}`);
  const row = data?.[0];
  if (!row?.model_id) return null;

  const days = await loadModelDays(supabase, row.model_id);
  return {
    modelId: row.model_id,
    modelCode: row.model?.model_code ?? null,
    modelName: row.model?.model_name ?? null,
    days,
  };
}

/**
 * The employee's schedule as { [isoWeekday]: day }, for computeLogHours.
 * Empty object = no model / no days → every day is treated as a rest day.
 */
async function loadScheduleRulesForUser(supabase, userId) {
  const schedule = await loadUserScheduleModel(supabase, userId);
  return Object.fromEntries((schedule?.days || []).map((day) => [day.dayOfWeek, day]));
}

// ── Admin Setup: Schedule Models ────────────────────────────

/**
 * Every schedule model (active and inactive) with its working days,
 * scheduled weekly hours, and how many employees use it.
 */
export async function loadScheduleModels() {
  const supabase = getSupabaseAdmin();

  const [modelsRes, daysRes, assignmentsRes] = await Promise.all([
    supabase
      .from("time_s_schedulemodel")
      .select("model_id, model_code, model_name, display_order, is_active")
      .order("display_order", { ascending: true })
      .order("model_name", { ascending: true }),
    supabase
      .from("time_s_schedulemodelday")
      .select(`model_id, ${MODEL_DAY_COLUMNS}`)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("time_m_userhourstarget")
      .select("model_id")
      .eq("is_active", true),
  ]);

  const failed = modelsRes.error || daysRes.error || assignmentsRes.error;
  if (failed) {
    console.error("loadScheduleModels error:", describeError(failed));
    throw new Error("Unable to load schedule models.");
  }

  const daysByModel = new Map();
  for (const row of daysRes.data || []) {
    if (!daysByModel.has(row.model_id)) daysByModel.set(row.model_id, []);
    daysByModel.get(row.model_id).push(mapModelDayRow(row));
  }

  const employeesByModel = new Map();
  for (const row of assignmentsRes.data || []) {
    employeesByModel.set(row.model_id, (employeesByModel.get(row.model_id) || 0) + 1);
  }

  return (modelsRes.data || []).map((model) => {
    const days = daysByModel.get(model.model_id) || [];
    return {
      model_id: model.model_id,
      model_code: model.model_code,
      model_name: model.model_name,
      display_order: model.display_order,
      is_active: model.is_active,
      days,
      weekly_hours: computeScheduledWeeklyHours(days),
      employee_count: employeesByModel.get(model.model_id) || 0,
    };
  });
}

/**
 * Create (modelId null) or update a schedule model and its working days.
 *
 * Business Rule:
 * The days sent here are the COMPLETE list of working days — any weekday not
 * included becomes a rest day. Existing day rows are replaced, and every
 * employee on this model gets their weekly_hours_target refreshed so the
 * Summary panel, PDF, and Approvals show the new scheduled hours.
 *
 * Note: Supabase JS has no multi-statement transaction, so everything is
 * validated BEFORE the first write to keep partial saves unlikely.
 */
export async function saveScheduleModel({ modelId, modelCode, modelName, displayOrder, days }) {
  const auth = await requireTimeTrackerAdmin();
  if (auth.error) return { success: false, error: auth.error };
  const { userId, supabase } = auth;

  const code = String(modelCode || "").trim().toUpperCase().replace(/\s+/g, "_");
  const name = String(modelName || "").trim();
  const order = Number(displayOrder) || 0;

  if (!code || !name) return { success: false, error: "Code and Name are required." };
  if (code.length > 30) return { success: false, error: "Code must be 30 characters or less." };
  if (name.length > 50) return { success: false, error: "Name must be 50 characters or less." };

  // ── Validate every working day before writing anything ──
  const inputDays = Array.isArray(days) ? days : [];
  const seen = new Set();
  const cleanDays = [];

  for (const day of inputDays) {
    const dayOfWeek = Number(day?.dayOfWeek);
    const label = SCHEDULE_DAYS[dayOfWeek - 1]?.label;
    if (!label) return { success: false, error: "One of the days is not valid." };
    if (seen.has(dayOfWeek)) return { success: false, error: `${label} is listed twice.` };
    seen.add(dayOfWeek);

    const clean = {
      dayOfWeek,
      startTime: toHHMM(day.startTime),
      breakStart: toHHMM(day.breakStart),
      breakEnd: toHHMM(day.breakEnd),
      endTime: toHHMM(day.endTime),
    };
    const dayError = validateScheduleDay(clean);
    if (dayError) return { success: false, error: `${label}: ${dayError}` };
    cleanDays.push(clean);
  }

  if (!cleanDays.length) {
    return { success: false, error: "Pick at least one working day." };
  }

  // ── Save the model header ──
  let savedModelId = modelId || null;
  const now = new Date().toISOString();

  if (savedModelId) {
    const { error } = await supabase
      .from("time_s_schedulemodel")
      .update({
        model_code: code,
        model_name: name,
        display_order: order,
        updated_at: now,
        updated_by: userId,
      })
      .eq("model_id", savedModelId);

    if (error) {
      console.error("saveScheduleModel update error:", describeError(error));
      if (error.code === "23505") return { success: false, error: `The code "${code}" is already used.` };
      return { success: false, error: "Failed to save the schedule model." };
    }
  } else {
    const { data, error } = await supabase
      .from("time_s_schedulemodel")
      .insert({ model_code: code, model_name: name, display_order: order, created_by: userId })
      .select("model_id")
      .single();

    if (error) {
      console.error("saveScheduleModel insert error:", describeError(error));
      if (error.code === "23505") return { success: false, error: `The code "${code}" is already used.` };
      return { success: false, error: "Failed to create the schedule model." };
    }
    savedModelId = data.model_id;
  }

  // ── Replace the working days ──
  const { error: deleteError } = await supabase
    .from("time_s_schedulemodelday")
    .delete()
    .eq("model_id", savedModelId);

  if (deleteError) {
    console.error("saveScheduleModel delete days error:", describeError(deleteError));
    return { success: false, error: "Saved the model, but failed to update its days. Please save again." };
  }

  const { error: insertDaysError } = await supabase.from("time_s_schedulemodelday").insert(
    cleanDays.map((day) => ({
      model_id: savedModelId,
      day_of_week: day.dayOfWeek,
      start_time: day.startTime,
      break_start: day.breakStart || null,
      break_end: day.breakEnd || null,
      end_time: day.endTime,
      created_by: userId,
    })),
  );

  if (insertDaysError) {
    console.error("saveScheduleModel insert days error:", describeError(insertDaysError));
    return { success: false, error: "Saved the model, but failed to save its days. Please save again." };
  }

  // ── Keep assigned employees' weekly targets in step with the schedule ──
  const weeklyHours = computeScheduledWeeklyHours(cleanDays);
  const { error: syncError } = await supabase
    .from("time_m_userhourstarget")
    .update({ weekly_hours_target: weeklyHours, updated_at: now, updated_by: userId })
    .eq("model_id", savedModelId);

  if (syncError) {
    // The model itself saved fine — only the employees' weekly totals are stale.
    console.error("saveScheduleModel target sync error:", describeError(syncError));
    return {
      success: true,
      modelId: savedModelId,
      warning: "Model saved, but employees' weekly hours didn't refresh. Save again to retry.",
    };
  }

  return { success: true, modelId: savedModelId };
}

/**
 * Activate or deactivate a schedule model.
 * A model still assigned to employees can't be deactivated — move them first,
 * so nobody is left on a schedule that no longer shows in the dropdown.
 */
export async function setScheduleModelActive(modelId, isActive) {
  const auth = await requireTimeTrackerAdmin();
  if (auth.error) return { success: false, error: auth.error };
  const { userId, supabase } = auth;

  if (!isActive) {
    const { count, error: countError } = await supabase
      .from("time_m_userhourstarget")
      .select("target_id", { count: "exact", head: true })
      .eq("model_id", modelId)
      .eq("is_active", true);

    if (countError) {
      console.error("setScheduleModelActive count error:", describeError(countError));
      return { success: false, error: "Unable to check who uses this model." };
    }
    if (count > 0) {
      return {
        success: false,
        error: `${count} employee${count === 1 ? " uses" : "s use"} this model. Move them to another model first.`,
      };
    }
  }

  const { error } = await supabase
    .from("time_s_schedulemodel")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString(), updated_by: userId })
    .eq("model_id", modelId);

  if (error) {
    console.error("setScheduleModelActive error:", describeError(error));
    return { success: false, error: "Failed to update the model's status." };
  }
  return { success: true };
}

// ── Admin Setup: Employee Hours (model assignment) ──────────

/**
 * Every active platform user with their assigned schedule model.
 * Users with no row yet come back with model_id null ("Not assigned").
 */
export async function loadEmployeeHoursTargets() {
  const supabase = getSupabaseAdmin();

  const [usersRes, targetsRes] = await Promise.all([
    supabase
      .from("psb_s_user")
      .select("user_id, first_name, last_name, username")
      .eq("is_active", true),
    supabase
      .from("time_m_userhourstarget")
      .select("user_id, model_id, weekly_hours_target, updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false }),
  ]);

  const failed = usersRes.error || targetsRes.error;
  if (failed) {
    console.error("loadEmployeeHoursTargets error:", describeError(failed));
    throw new Error("Unable to load employee hours.");
  }

  // Rows are newest-first, so the first row seen per user is the current one.
  const targetByUser = new Map();
  for (const t of targetsRes.data || []) {
    if (!targetByUser.has(t.user_id)) targetByUser.set(t.user_id, t);
  }

  return (usersRes.data || [])
    .map((u) => {
      const target = targetByUser.get(u.user_id);
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username;
      return {
        user_id: u.user_id,
        name,
        model_id: target?.model_id ?? null,
        weekly_hours_target: target ? Number(target.weekly_hours_target) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Assign a schedule model to an employee.
 *
 * Business Rule:
 * The weekly hours target is no longer typed in by hand — it is the model's
 * total scheduled hours. It's stored on the user's row so the Summary panel,
 * PDF, and Approvals keep reading the same column they always have.
 * Creating this row is also what unlocks Clock In for a new employee.
 */
export async function setUserScheduleModel(targetUserId, modelId) {
  const auth = await requireTimeTrackerAdmin();
  if (auth.error) return { success: false, error: auth.error };
  const { userId, supabase } = auth;

  const { data: model, error: modelError } = await supabase
    .from("time_s_schedulemodel")
    .select("model_id, model_name, is_active")
    .eq("model_id", modelId)
    .maybeSingle();

  if (modelError) {
    console.error("setUserScheduleModel model error:", describeError(modelError));
    return { success: false, error: "Unable to load that schedule model." };
  }
  if (!model) return { success: false, error: "That schedule model no longer exists." };
  if (!model.is_active) return { success: false, error: `"${model.model_name}" is inactive.` };

  let days;
  try {
    days = await loadModelDays(supabase, model.model_id);
  } catch (err) {
    console.error("setUserScheduleModel days error:", err.message);
    return { success: false, error: "Unable to load that model's working days." };
  }
  if (!days.length) {
    return { success: false, error: `"${model.model_name}" has no working days yet. Set them up in Schedule Models.` };
  }

  const weeklyHours = computeScheduledWeeklyHours(days);
  const now = new Date().toISOString();

  const { data: existingRows, error: lookupError } = await supabase
    .from("time_m_userhourstarget")
    .select("target_id")
    .eq("user_id", targetUserId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (lookupError) {
    console.error("setUserScheduleModel lookup error:", describeError(lookupError));
    return { success: false, error: "Failed to look up the employee's current schedule." };
  }

  const existing = existingRows?.[0];

  if (existing) {
    const { error } = await supabase
      .from("time_m_userhourstarget")
      .update({
        model_id: model.model_id,
        weekly_hours_target: weeklyHours,
        is_active: true,
        updated_at: now,
        updated_by: userId,
      })
      .eq("target_id", existing.target_id);

    if (error) {
      console.error("setUserScheduleModel update error:", describeError(error));
      return { success: false, error: "Failed to assign the schedule model." };
    }
    return { success: true, weeklyHours };
  }

  const { error } = await supabase.from("time_m_userhourstarget").insert({
    user_id: targetUserId,
    model_id: model.model_id,
    weekly_hours_target: weeklyHours,
    created_by: userId,
  });

  if (error) {
    console.error("setUserScheduleModel insert error:", describeError(error));
    return { success: false, error: "Failed to assign the schedule model." };
  }
  return { success: true, weeklyHours };
}

// ── Admin Setup: Edit Reasons ────────────────────────────────

/** All edit_reason-tagged rows (active AND inactive) for admin management. */
export async function loadEditReasonsAdmin() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("time_s_status")
    .select("status_id, status_code, status_name, display_order, is_active")
    .eq("tag", "edit_reason")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("loadEditReasonsAdmin error:", describeError(error));
    return [];
  }
  return data || [];
}

/** Create (statusId null) or update an edit_reason row. */
export async function saveEditReason({ statusId, statusCode, statusName, displayOrder }) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const code = String(statusCode || "").trim().toUpperCase().replace(/\s+/g, "_");
  const name = String(statusName || "").trim();
  const order = Number(displayOrder) || 0;

  if (!code || !name) {
    return { success: false, error: "Code and Name are required." };
  }

  const supabase = getSupabaseAdmin();

  if (statusId) {
    const { data, error } = await supabase
      .from("time_s_status")
      .update({ status_code: code, status_name: name, display_order: order })
      .eq("status_id", statusId)
      .eq("tag", "edit_reason")
      .select("*")
      .single();

    if (error) {
      console.error("saveEditReason update error:", describeError(error));
      return { success: false, error: "Failed to save reason." };
    }
    return { success: true, record: data };
  }

  const { data, error } = await supabase
    .from("time_s_status")
    .insert({ status_code: code, status_name: name, display_order: order, tag: "edit_reason" })
    .select("*")
    .single();

  if (error) {
    console.error("saveEditReason insert error:", describeError(error));
    return { success: false, error: "Failed to create reason." };
  }
  return { success: true, record: data };
}

/** Activate or deactivate an edit_reason row — never touches session_status-tagged rows. */
export async function setEditReasonActive(statusId, isActive) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("time_s_status")
    .update({ is_active: Boolean(isActive) })
    .eq("status_id", statusId)
    .eq("tag", "edit_reason")
    .select("*")
    .single();

  if (error) {
    console.error("setEditReasonActive error:", describeError(error));
    return { success: false, error: "Failed to update reason status." };
  }
  return { success: true, record: data };
}

/**
 * Create or update a time_t_logs entry from the Edit Time Entry modal.
 * Clock-in and clock-out dates are independent so night shifts that cross
 * midnight can be recorded correctly (e.g. clock in Sep 17 08:35 PM →
 * clock out Sep 18 02:19 AM).
 *
 * @param {Object} params
 * @param {number|null} params.logId - existing log to update, or null to create a new entry.
 * @param {string} params.clockInDate - "YYYY-MM-DD" the entry's clock-in belongs to.
 * @param {string} [params.clockOutDate] - "YYYY-MM-DD" of the clock-out, required when clockOutTime is set.
 * @param {string} params.clockInTime - "HH:MM" (24-hour, from <input type="time">).
 * @param {string} params.clockOutTime - "HH:MM" (24-hour) or "" if not clocked out.
 * @param {number} params.reasonId - required time_s_status.status_id tagged 'edit_reason'.
 * @param {string} [params.notes] - optional free-text note.
 */
export async function saveTimeLogEntry({ logId, clockInDate, clockOutDate, clockInTime, clockOutTime, reasonId, notes }) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };
  if (!reasonId) return { success: false, error: "A reason for edit is required." };
  if (!clockInDate) return { success: false, error: "Clock In date is required." };
  if (!clockInTime) return { success: false, error: "Clock In time is required." };

  const supabase = getSupabaseAdmin();

  const { locked, statusName } = await isWeekLocked(supabase, userId, clockInDate);
  if (locked) {
    return {
      success: false,
      error: `This week's timesheet is ${statusName} and can no longer be edited.`,
    };
  }

  // The FK on edit_reason_id can't enforce the tag split by itself (it's a
  // shared lookup table with session-status rows too), so re-validate the
  // submitted reason actually belongs to the edit_reason list server-side
  // before trusting it, rather than relying on the client having sent a
  // value that only came from the correctly-filtered dropdown.
  const { data: reasonRow, error: reasonError } = await supabase
    .from("time_s_status")
    .select("status_id")
    .eq("status_id", reasonId)
    .eq("tag", "edit_reason")
    .eq("is_active", true)
    .maybeSingle();

  if (reasonError || !reasonRow) {
    return { success: false, error: "Invalid reason for edit." };
  }

  const hasClockOut = Boolean(clockOutTime);
  if (hasClockOut && !clockOutDate) {
    return { success: false, error: "Clock Out date is required." };
  }

  // App-level guard (replaces the dropped DB constraint): block a second
  // session landing on the same clock_in_date for this user. Excludes the
  // row being edited itself, so saving an existing entry without changing
  // its date doesn't falsely collide with itself.
  let conflictQuery = supabase
    .from("time_t_logs")
    .select("log_id")
    .eq("user_id", userId)
    .eq("clock_in_date", clockInDate);

  if (logId) {
    conflictQuery = conflictQuery.neq("log_id", logId);
  }

  const { data: conflictRow } = await conflictQuery.maybeSingle();

  if (conflictRow) {
    return { success: false, error: "Another session already exists for that Clock In date." };
  }

  const statusId = await getStatusId(supabase, hasClockOut ? STATUS_CLOCKED_OUT : STATUS_CLOCKED_IN);

  // Business Rule: logs are Dallas wall-clock times, and nobody can log time
  // that hasn't happened yet.
  const nowDateStr = dateStrInTz(new Date(), APP_TIMEZONE);
  const nowTimeStr = timeStrInTz(new Date(), APP_TIMEZONE);
  const nowDallas = `${nowDateStr}T${nowTimeStr}`;
  const [nh, nm] = nowTimeStr.split(":").map(Number);
  const nowLabel = `${nh % 12 || 12}:${String(nm).padStart(2, "0")} ${nh >= 12 ? "PM" : "AM"}`;
  const inAt = `${clockInDate}T${clockInTime.length === 5 ? `${clockInTime}:00` : clockInTime}`;
  if (inAt > nowDallas) {
    return { success: false, error: `Clock In can't be later than now (${nowLabel} Central Time).` };
  }
  if (hasClockOut) {
    const outAt = `${clockOutDate}T${clockOutTime.length === 5 ? `${clockOutTime}:00` : clockOutTime}`;
    if (outAt > nowDallas) {
      return { success: false, error: `Clock Out can't be later than now (${nowLabel} Central Time).` };
    }
  }

  let totalHours = null;
  let overtimeHours = 0;

  if (hasClockOut) {
    let rulesByDay;
    try {
      rulesByDay = await loadScheduleRulesForUser(supabase, userId);
    } catch (err) {
      console.error("saveTimeLogEntry schedule error:", err.message);
      return { success: false, error: "Unable to load your work schedule. Please try again." };
    }

    const hours = computeLogHours(
      {
        clockInDate,
        clockInTime: `${clockInTime}:00`,
        clockOutDate,
        clockOutTime: `${clockOutTime}:00`,
      },
      rulesByDay,
    );

    // Check the raw span, not the net hours: net is clamped at 0.
    if (hours.grossHours < 0) {
      return { success: false, error: "Clock Out must be after Clock In." };
    }
    totalHours = hours.totalHours;
    overtimeHours = hours.overtimeHours;
  }

  const payload = {
    status_id: statusId,
    clock_in_date: clockInDate,
    clock_in_time: `${clockInTime}:00`,
    clock_out_date: hasClockOut ? clockOutDate : null,
    clock_out_time: hasClockOut ? `${clockOutTime}:00` : null,
    total_hours: totalHours,
    overtime_hours: overtimeHours,
    edit_reason_id: reasonId,
    notes: notes || null,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  if (logId) {
    const { data, error } = await supabase
      .from("time_t_logs")
      .update(payload)
      .eq("log_id", logId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      console.error("saveTimeLogEntry update error:", describeError(error));
      return { success: false, error: "Failed to save changes." };
    }
    return { success: true, record: data };
  }

  const { data, error } = await supabase
    .from("time_t_logs")
    .insert({ ...payload, user_id: userId, created_by: userId })
    .select("*")
    .single();

  if (error) {
    console.error("saveTimeLogEntry insert error:", describeError(error));
    return { success: false, error: "Failed to create entry." };
  }
  return { success: true, record: data };
}

const WORKFLOW_STATUS_PENDING = "Pending";

/**
 * Set when an employee pulls a submission back for editing before any
 * approver has looked at it. The week unlocks so they can fix their logs and
 * submit again, rather than waiting to be Returned.
 */
const WORKFLOW_STATUS_RECALLED = "Recalled";

/** Look up a workflow status_id by name (wfk_s_status). */
async function getWorkflowStatusId(supabase, statusName) {
  const { data, error } = await supabase
    .from("wfk_s_status")
    .select("status_id")
    .eq("status_name", statusName)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Unable to resolve workflow status_id for "${statusName}"`);
  }
  return data.status_id;
}

/**
 * Read the current submission + workflow status for a given week, for
 * display (Timesheet Summary badge) — not a gate, just a read.
 */
export async function loadWeekSubmissionStatus(weekStartDate) {
  const userId = await getSessionUserId();
  if (!userId) {
    return {
      hasSubmission: false, statusName: null, submittedAt: null, remarks: "",
      approverName: null, approverRoleName: null,
      lastActionComment: null, lastActionByName: null, canRecall: false,
    };
  }

  const supabase = getSupabaseAdmin();

  const { data: submission } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("submission_id, submitted_at, remarks")
    .eq("user_id", userId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();

  if (!submission) {
    return {
      hasSubmission: false, statusName: null, submittedAt: null, remarks: "",
      approverName: null, approverRoleName: null,
      lastActionComment: null, lastActionByName: null, canRecall: false,
    };
  }

  const { data: instance } = await supabase
    .from("wfk_t_workflowinstance")
    .select("instance_id, status_id, current_wfs_id, wf_id")
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("document_id", submission.submission_id)
    .maybeSingle();

  let statusName = null;
  if (instance?.status_id) {
    const { data: status } = await supabase
      .from("wfk_s_status")
      .select("status_name")
      .eq("status_id", instance.status_id)
      .maybeSingle();
    statusName = status?.status_name || null;
  }

  // Recall is offered while Pending (at any stage) or Approved. Recalling an
  // Approved timesheet undoes the approval so the employee can fix and resubmit.
  const statusLowerForRecall = String(statusName || "").toLowerCase();
  const canRecall = statusLowerForRecall === "pending" || statusLowerForRecall === "approved";

  let approverName = null;
  let approverRoleName = null;

  if (instance?.current_wfs_id) {
    const { data: participant } = await supabase
      .from("wfk_m_stageparticipant")
      .select("orgrole_id")
      .eq("wfs_id", instance.current_wfs_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (participant?.orgrole_id) {
      const [{ data: orgRole }, { data: userOrgRoles }] = await Promise.all([
        supabase
          .from("wfk_s_orgrole")
          .select("name")
          .eq("orgrole_id", participant.orgrole_id)
          .maybeSingle(),
        supabase
          .from("wfk_m_userorgrole")
          .select("user_id, is_primary")
          .eq("role_id", participant.orgrole_id)
          .eq("is_active", true)
          .order("is_primary", { ascending: false })
          .limit(1),
      ]);

      approverRoleName = orgRole?.name || null;
      const approverUserId = userOrgRoles?.[0]?.user_id;

      if (approverUserId) {
        const { data: approverUser } = await supabase
          .from("psb_s_user")
          .select("first_name, last_name, username")
          .eq("user_id", approverUserId)
          .maybeSingle();

        approverName = approverUser
          ? `${approverUser.first_name || ""} ${approverUser.last_name || ""}`.trim() || approverUser.username
          : null;
      }
    }
  }

  let lastActionComment = null;
  let lastActionByName = null;

  if (instance?.instance_id) {
    const { data: lastActedStage } = await supabase
      .from("wfk_t_stageinstance")
      .select("comments, acted_by, acted_at")
      .eq("instance_id", instance.instance_id)
      .not("acted_at", "is", null)
      .order("acted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastActedStage?.comments) {
      lastActionComment = lastActedStage.comments;

      if (lastActedStage.acted_by) {
        const { data: actor } = await supabase
          .from("psb_s_user")
          .select("first_name, last_name, username")
          .eq("user_id", lastActedStage.acted_by)
          .maybeSingle();

        lastActionByName = actor
          ? `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || actor.username
          : null;
      }
    }
  }

  return {
    hasSubmission: true,
    statusName,
    submittedAt: submission.submitted_at,
    remarks: submission.remarks || "",
    approverName,
    approverRoleName,
    lastActionComment,
    lastActionByName,
    canRecall,
  };
}

/**
 * Submit (or resubmit) a week's timesheet for approval.
 * @param {Object} params
 * @param {string} params.weekStartDate - "YYYY-MM-DD", must be a Monday.
 * @param {string} params.weekEndDate - "YYYY-MM-DD".
 * @param {string} [params.remarks] - optional note for the approver.
 */
export async function submitTimesheet({ weekStartDate, weekEndDate, remarks }) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const supabase = getSupabaseAdmin();

  const { roles, orgRoles } = await loadTimeTrackerRoles(supabase, userId);
  const { isRequestor } = getTimeTrackerPermissions(roles, orgRoles);
  if (!isRequestor) {
    return {
      success: false,
      error: 'You don\'t have the "Timesheet Requestor - VA" org role required to submit a timesheet.',
    };
  }

  const { data: existingSubmission } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();

  if (existingSubmission) {
    const { locked, statusName } = await isWeekLocked(supabase, userId, weekStartDate);
    if (locked) {
      return {
        success: false,
        error: `This week's timesheet is already ${statusName} and doesn't need to be submitted again.`,
      };
    }
  }

  const { data: logs } = await supabase
    .from("time_t_logs")
    .select("total_hours, overtime_hours")
    .eq("user_id", userId)
    .gte("clock_in_date", weekStartDate)
    .lte("clock_in_date", weekEndDate);

  // Overtime is now per-log (time after the scheduled clock-out), not derived
  // from the weekly target, so these are summed straight from the logs.
  const round2 = (n) => Math.round(n * 100) / 100;
  const totalHours = round2((logs || []).reduce((sum, l) => sum + (Number(l.total_hours) || 0), 0));
  const overtimeHours = round2((logs || []).reduce((sum, l) => sum + (Number(l.overtime_hours) || 0), 0));
  const regularHours = round2(totalHours - overtimeHours);

  const { data: workflow, error: workflowError } = await supabase
    .from("wfk_s_workflow")
    .select("wf_id")
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (workflowError || !workflow) {
    return { success: false, error: "No active approval workflow is configured for Time Tracker." };
  }

  const { data: firstStage, error: stageError } = await supabase
    .from("wfk_s_workflowstages")
    .select("wfs_id")
    .eq("wf_id", workflow.wf_id)
    .eq("is_active", true)
    .order("stage_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stageError || !firstStage) {
    return { success: false, error: "The approval workflow has no stages configured." };
  }

  const pendingStatusId = await getWorkflowStatusId(supabase, WORKFLOW_STATUS_PENDING);
  const now = new Date().toISOString();

  let submission;
  if (existingSubmission) {
    const { data, error } = await supabase
      .from("time_t_timesheetsubmissions")
      .update({
        week_end_date: weekEndDate,
        total_hours: totalHours,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        remarks: remarks || null,
        submitted_at: now,
        updated_at: now,
        updated_by: userId,
      })
      .eq("submission_id", existingSubmission.submission_id)
      .select("*")
      .single();

    if (error) {
      console.error("submitTimesheet update submission error:", describeError(error));
      return { success: false, error: "Failed to resubmit timesheet." };
    }
    submission = data;
  } else {
    const { data, error } = await supabase
      .from("time_t_timesheetsubmissions")
      .insert({
        user_id: userId,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
        total_hours: totalHours,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        remarks: remarks || null,
        submitted_at: now,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error) {
      console.error("submitTimesheet insert submission error:", describeError(error));
      return { success: false, error: "Failed to submit timesheet." };
    }
    submission = data;
  }

  await supabase
    .from("time_t_logs")
    .update({ submission_id: submission.submission_id })
    .eq("user_id", userId)
    .gte("clock_in_date", weekStartDate)
    .lte("clock_in_date", weekEndDate);

  const { data: existingInstance } = await supabase
    .from("wfk_t_workflowinstance")
    .select("instance_id")
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("document_id", submission.submission_id)
    .maybeSingle();

  let instanceId;
  if (existingInstance) {
    const { error } = await supabase
      .from("wfk_t_workflowinstance")
      .update({ status_id: pendingStatusId, current_wfs_id: firstStage.wfs_id, completed_at: null })
      .eq("instance_id", existingInstance.instance_id);

    if (error) {
      console.error("submitTimesheet update instance error:", describeError(error));
      return { success: false, error: "Failed to restart the approval workflow." };
    }
    instanceId = existingInstance.instance_id;
  } else {
    const { data, error } = await supabase
      .from("wfk_t_workflowinstance")
      .insert({
        app_id: TIME_TRACKER_APP_ID,
        wf_id: workflow.wf_id,
        status_id: pendingStatusId,
        current_wfs_id: firstStage.wfs_id,
        document_id: submission.submission_id,
        started_at: now,
        created_by: userId,
      })
      .select("instance_id")
      .single();

    if (error) {
      console.error("submitTimesheet insert instance error:", describeError(error));
      return { success: false, error: "Failed to start the approval workflow." };
    }
    instanceId = data.instance_id;
  }

  // Exactly one stage instance row per document, forever — reset it in
  // place on every (re)submit instead of inserting a new one.
  const { data: existingStageInstance } = await supabase
    .from("wfk_t_stageinstance")
    .select("stageinstance_id")
    .eq("instance_id", instanceId)
    .maybeSingle();

  const stageInstancePayload = {
    wfs_id: firstStage.wfs_id,
    status_id: pendingStatusId,
    comments: null,
    acted_at: null,
    acted_by: null,
    is_active: true,
  };

  if (existingStageInstance) {
    const { error: stageInstanceError } = await supabase
      .from("wfk_t_stageinstance")
      .update(stageInstancePayload)
      .eq("stageinstance_id", existingStageInstance.stageinstance_id);

    if (stageInstanceError) {
      console.error("submitTimesheet update stage instance error:", describeError(stageInstanceError));
      return { success: false, error: "Failed to reset the approval step." };
    }
  } else {
    const { error: stageInstanceError } = await supabase
      .from("wfk_t_stageinstance")
      .insert({ instance_id: instanceId, ...stageInstancePayload });

    if (stageInstanceError) {
      console.error("submitTimesheet insert stage instance error:", describeError(stageInstanceError));
      return { success: false, error: "Failed to create the first approval step." };
    }
  }

  return { success: true, record: submission };
}

/**
 * Recall the signed-in employee's own submitted timesheet for a week.
 *
 * Business Rule:
 * Allowed while Pending (any stage) or Approved. Recalling an Approved
 * timesheet undoes the approval. Resubmitting restarts from the first
 * approval step. The week then unlocks so the employee can fix their logs and
 * submit again.
 *
 * The stage update is conditional on the state we expect — `acted_by is null`
 * while Pending, or the stage row still being Approved — so if an approver
 * acts at the same moment, only one of the two wins.
 *
 * @param {Object} params
 * @param {string} params.weekStartDate - "YYYY-MM-DD" (Monday).
 */
export async function recallTimesheet({ weekStartDate }) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const supabase = getSupabaseAdmin();

  const { data: submission, error: submissionError } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("submission_id")
    .eq("user_id", userId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();

  if (submissionError) {
    console.error("recallTimesheet submission error:", describeError(submissionError));
    return { success: false, error: "Unable to load your timesheet. Please try again." };
  }
  if (!submission) return { success: false, error: "There is no submitted timesheet for this week." };

  const { data: instance, error: instanceError } = await supabase
    .from("wfk_t_workflowinstance")
    .select("instance_id, status_id, current_wfs_id, wf_id")
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("document_id", submission.submission_id)
    .maybeSingle();

  if (instanceError || !instance) {
    if (instanceError) console.error("recallTimesheet instance error:", describeError(instanceError));
    return { success: false, error: "Unable to find the approval request for this week." };
  }

  let pendingStatusId;
  let approvedStatusId;
  let recalledStatusId;
  try {
    [pendingStatusId, approvedStatusId, recalledStatusId] = await Promise.all([
      getWorkflowStatusId(supabase, WORKFLOW_STATUS_PENDING),
      getWorkflowStatusId(supabase, "Approved"),
      getWorkflowStatusId(supabase, WORKFLOW_STATUS_RECALLED),
    ]);
  } catch (err) {
    console.error("recallTimesheet setup error:", err.message);
    return { success: false, error: "Recall isn't available right now. Please contact your admin." };
  }

  const isPending = instance.status_id === pendingStatusId;
  const isApproved = instance.status_id === approvedStatusId;
  if (!isPending && !isApproved) {
    return { success: false, error: "This timesheet is already open for editing, so it can't be recalled." };
  }

  const now = new Date().toISOString();

  // Conditional on the state we expect, so a recall can't overwrite an
  // approver's action made at the same moment:
  // - Pending: the current step hasn't been acted on yet.
  // - Approved: the (single) stage row is still Approved.
  let stageUpdate = supabase
    .from("wfk_t_stageinstance")
    .update({
      status_id: recalledStatusId,
      acted_at: now,
      acted_by: userId,
      comments: null,
      is_active: false,
    })
    .eq("instance_id", instance.instance_id);

  stageUpdate = isPending
    ? stageUpdate.eq("wfs_id", instance.current_wfs_id).is("acted_by", null)
    : stageUpdate.eq("status_id", approvedStatusId);

  const { data: recalledRows, error: stageError } = await stageUpdate.select("stageinstance_id");

  if (stageError) {
    console.error("recallTimesheet stage error:", describeError(stageError));
    return { success: false, error: "Failed to recall the timesheet. Please try again." };
  }
  if (!recalledRows?.length) {
    return {
      success: false,
      error: "An approver just acted on this timesheet. Refresh to see the latest status.",
    };
  }

  // Conditional on the status we read (Pending or Approved), so a recall can't
  // overwrite a status that changed while we were working.
  const { error: updateInstanceError } = await supabase
    .from("wfk_t_workflowinstance")
    .update({ status_id: recalledStatusId, completed_at: null })
    .eq("instance_id", instance.instance_id)
    .eq("status_id", instance.status_id);

  if (updateInstanceError) {
    console.error("recallTimesheet instance update error:", describeError(updateInstanceError));
    return {
      success: false,
      error: "Recorded the recall, but failed to update the overall status. Please try again.",
    };
  }

  return { success: true };
}

/**
 * Past weeks the signed-in employee still needs to submit.
 *
 * Business Rule:
 * Only weeks that actually have logs are considered, so weeks before the
 * employee started using the app never show up. The current week is left
 * out because it's still in progress. A week is listed when it was never
 * submitted, or when it came back as Returned or Recalled. Weeks that are
 * Pending or Approved with an approver are left alone.
 *
 * @param {Object} params
 * @param {string} params.currentWeekStart - "YYYY-MM-DD" Monday of the user's
 *   current week (from the browser, so it matches their local week).
 * @returns {Promise<Array<{weekStart:string, weekEnd:string, daysLogged:number, totalHours:number, statusName:string}>>}
 */
export async function loadMissedSubmissions({ currentWeekStart }) {
  const userId = await getSessionUserId();
  if (!userId || !currentWeekStart) return [];

  const supabase = getSupabaseAdmin();
  const lookbackStart = addDaysStr(currentWeekStart, -7 * 52);

  const { data: logs, error: logsError } = await supabase
    .from("time_t_logs")
    .select("clock_in_date, total_hours")
    .eq("user_id", userId)
    .gte("clock_in_date", lookbackStart)
    .lt("clock_in_date", currentWeekStart);

  if (logsError) {
    console.error("loadMissedSubmissions logs error:", describeError(logsError));
    throw new Error("Unable to load unsubmitted weeks.");
  }
  if (!logs?.length) return [];

  const weeks = new Map();
  for (const log of logs) {
    const weekStart = getMondayOfWeekStr(log.clock_in_date);
    if (!weeks.has(weekStart)) {
      weeks.set(weekStart, { weekStart, weekEnd: addDaysStr(weekStart, 6), days: new Set(), totalHours: 0 });
    }
    const week = weeks.get(weekStart);
    week.days.add(log.clock_in_date);
    week.totalHours += Number(log.total_hours) || 0;
  }

  const weekStarts = [...weeks.keys()];
  const { data: submissions, error: subError } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("submission_id, week_start_date")
    .eq("user_id", userId)
    .in("week_start_date", weekStarts);

  if (subError) {
    console.error("loadMissedSubmissions submissions error:", describeError(subError));
    throw new Error("Unable to load unsubmitted weeks.");
  }

  const submissionByWeek = new Map((submissions || []).map((s) => [s.week_start_date, s]));
  const submissionIds = (submissions || []).map((s) => s.submission_id);

  const statusBySubmission = new Map();
  if (submissionIds.length) {
    const { data: instances } = await supabase
      .from("wfk_t_workflowinstance")
      .select("document_id, status_id")
      .eq("app_id", TIME_TRACKER_APP_ID)
      .in("document_id", submissionIds);

    const statusIds = [...new Set((instances || []).map((i) => i.status_id).filter(Boolean))];
    const { data: statuses } = statusIds.length
      ? await supabase.from("wfk_s_status").select("status_id, status_name").in("status_id", statusIds)
      : { data: [] };
    const nameById = new Map((statuses || []).map((s) => [s.status_id, s.status_name]));

    for (const instance of instances || []) {
      statusBySubmission.set(instance.document_id, nameById.get(instance.status_id) || null);
    }
  }

  const NEEDS_SUBMIT = new Set(["returned", "recalled"]);

  return [...weeks.values()]
    .map((week) => {
      const submission = submissionByWeek.get(week.weekStart);
      const statusName = submission ? statusBySubmission.get(submission.submission_id) : null;
      const needsSubmit = !submission || !statusName || NEEDS_SUBMIT.has(String(statusName).toLowerCase());
      if (!needsSubmit) return null;
      return {
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        daysLogged: week.days.size,
        totalHours: Math.round(week.totalHours * 100) / 100,
        statusName: submission && statusName ? statusName : "Not Submitted",
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

/**
 * Approver's follow-ups across ALL weeks, for the Approvals KPI.
 *
 * Business Rule:
 * needsAction = waiting for this approver (Pending, not yet acted on) — these
 * are the ones the KPI counts. waitingOnEmployee = Returned or Recalled, which
 * the employee has to fix and resubmit, so they are listed but not counted.
 */
export async function loadApprovalFollowUps() {
  const rows = await loadApprovalQueue(null);
  const needsAction = [];
  const waitingOnEmployee = [];

  for (const row of rows) {
    const status = String(row.stage_status_name || "").toLowerCase();
    if (row.is_actionable) needsAction.push(row);
    else if (status === "returned" || status === "recalled") waitingOnEmployee.push(row);
  }

  const byWeekDesc = (a, b) => (a.week_start_date < b.week_start_date ? 1 : -1);
  return { needsAction: needsAction.sort(byWeekDesc), waitingOnEmployee: waitingOnEmployee.sort(byWeekDesc) };
}

// ── Timesheets (Admin) ──────────────────────────────────────

/** List every employee who submitted a timesheet for the given week, Admin-only. */
export async function loadTimesheetsForWeek(weekStartDate) {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const supabase = getSupabaseAdmin();

  const isAdmin = await checkIsTimeTrackerAdmin(supabase, userId);
  if (!isAdmin) return [];

  const { data: submissions, error } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("submission_id, user_id, total_hours, remarks")
    .eq("week_start_date", weekStartDate)
    .order("user_id", { ascending: true });

  if (error) {
    console.error("loadTimesheetsForWeek error:", describeError(error));
    return [];
  }
  if (!submissions?.length) return [];

  const userIds = [...new Set(submissions.map((s) => s.user_id))];
  const submissionIds = submissions.map((s) => s.submission_id);

  const [{ data: users }, { data: instances }] = await Promise.all([
    supabase.from("psb_s_user").select("user_id, first_name, last_name, username").in("user_id", userIds),
    supabase
      .from("wfk_t_workflowinstance")
      .select("document_id, status_id")
      .eq("app_id", TIME_TRACKER_APP_ID)
      .in("document_id", submissionIds),
  ]);
  const userById = new Map((users || []).map((u) => [u.user_id, u]));

  const statusIdByDoc = new Map((instances || []).map((i) => [i.document_id, i.status_id]));
  const statusIds = [...new Set((instances || []).map((i) => i.status_id).filter(Boolean))];
  const { data: statuses } = statusIds.length
    ? await supabase.from("wfk_s_status").select("status_id, status_name").in("status_id", statusIds)
    : { data: [] };
  const statusNameById = new Map((statuses || []).map((s) => [s.status_id, s.status_name]));

  return submissions
    .map((s) => {
      const user = userById.get(s.user_id);
      const name = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username : "Unknown";
      const statusId = statusIdByDoc.get(s.submission_id);
      return {
        submission_id: s.submission_id,
        user_id: s.user_id,
        name,
        total_hours: s.total_hours,
        remarks: s.remarks,
        status_name: statusNameById.get(statusId) || "--",
      };
    })
    .filter((employee) => employee.status_name.toLowerCase() === "approved");
}

// ── Approvals ────────────────────────────────────────────────

/**
 * The wfk_* authorization chain — read-only, unchanged logic, just extracted
 * for reuse/parallelizing.
 */
async function checkIsAuthorizedApprover(supabase, userId, submissionId) {
  const { data: instance } = await supabase
    .from("wfk_t_workflowinstance")
    .select("instance_id")
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("document_id", submissionId)
    .maybeSingle();
  if (!instance) return false;

  const { data: stageInstances } = await supabase
    .from("wfk_t_stageinstance")
    .select("wfs_id")
    .eq("instance_id", instance.instance_id);
  const wfsIds = [...new Set((stageInstances || []).map((si) => si.wfs_id).filter(Boolean))];
  if (!wfsIds.length) return false;

  const { data: participants } = await supabase
    .from("wfk_m_stageparticipant")
    .select("orgrole_id")
    .in("wfs_id", wfsIds)
    .eq("is_active", true);
  const orgRoleIds = [...new Set((participants || []).map((p) => p.orgrole_id).filter(Boolean))];
  if (!orgRoleIds.length) return false;

  const { data: userOrgRole } = await supabase
    .from("wfk_m_userorgrole")
    .select("user_orgrole_id")
    .eq("user_id", userId)
    .in("role_id", orgRoleIds)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return Boolean(userOrgRole);
}

/** Lean Admin check — only fetches app-role data, unlike loadTimeTrackerRoles which also fetches unused org roles. */
async function checkIsTimeTrackerAdmin(supabase, userId) {
  const { data: accessRows } = await supabase
    .from("psb_m_userapproleaccess")
    .select("role_id")
    .eq("user_id", userId)
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("is_active", true);
  const roleIds = [...new Set((accessRows || []).map((r) => r.role_id).filter(Boolean))];
  if (!roleIds.length) return false;

  const { data: roles } = await supabase
    .from("psb_s_role")
    .select("role_name")
    .in("role_id", roleIds)
    .eq("app_id", TIME_TRACKER_APP_ID)
    .eq("is_active", true);
  return (roles || []).some((r) => String(r.role_name || "").trim().toLowerCase() === "admin");
}

/**
 * Read-only daily logs for a submitted timesheet, for the Approvals detail
 * row. Authorized only for the submission's own owner, an approver on any
 * stage of its workflow, or an Admin — not just anyone who guesses an id.
 */
export async function loadSubmissionLogs(submissionId) {
  const userId = await getSessionUserId();
  if (!userId) return { logs: [], weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET };

  const supabase = getSupabaseAdmin();

  const { data: submission } = await supabase
    .from("time_t_timesheetsubmissions")
    .select("user_id")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (!submission) return { logs: [], weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET };

  const isOwner = submission.user_id === userId;

  if (!isOwner) {
    const [isAuthorizedApprover, isAdmin] = await Promise.all([
      checkIsAuthorizedApprover(supabase, userId, submissionId),
      checkIsTimeTrackerAdmin(supabase, userId),
    ]);

    if (!isAuthorizedApprover && !isAdmin) {
      return { logs: [], weeklyHoursTarget: DEFAULT_WEEKLY_HOURS_TARGET };
    }
  }

  const [logsResult, hoursTargetResult] = await Promise.all([
    supabase
      .from("time_t_logs")
      .select("*")
      .eq("submission_id", submissionId)
      .order("clock_in_date", { ascending: true }),
    loadHoursTargetInfo(supabase, submission.user_id),
  ]);

  if (logsResult.error) {
    console.error("loadSubmissionLogs error:", describeError(logsResult.error));
    return { logs: [], weeklyHoursTarget: hoursTargetResult.weeklyHoursTarget };
  }

  return { logs: logsResult.data || [], weeklyHoursTarget: hoursTargetResult.weeklyHoursTarget };
}

/**
 * Load this user's approval queue. There is exactly one wfk_t_stageinstance
 * row per document (updated in place through its whole lifecycle), so the
 * query is simply "stage instances at stages my org roles participate in" —
 * one current row per document, nothing to deduplicate.
 */
export async function loadApprovalQueue(weekStartDate) {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const supabase = getSupabaseAdmin();

  const { data: userOrgRoleRows } = await supabase
    .from("wfk_m_userorgrole")
    .select("role_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  const orgRoleIds = [...new Set((userOrgRoleRows || []).map((r) => r.role_id).filter(Boolean))];
  if (!orgRoleIds.length) return [];

  const { data: participantRows } = await supabase
    .from("wfk_m_stageparticipant")
    .select("wfs_id")
    .in("orgrole_id", orgRoleIds)
    .eq("is_active", true);
  const participantWfsIds = [...new Set((participantRows || []).map((r) => r.wfs_id).filter(Boolean))];
  if (!participantWfsIds.length) return [];

  const { data: stageInstances, error: siError } = await supabase
    .from("wfk_t_stageinstance")
    .select("*")
    .in("wfs_id", participantWfsIds);

  if (siError || !stageInstances?.length) return [];

  const instanceIds = [...new Set(stageInstances.map((si) => si.instance_id).filter(Boolean))];
  const wfsIds = [...new Set(stageInstances.map((si) => si.wfs_id).filter(Boolean))];

  const [{ data: workflowInstances }, { data: stages }] = await Promise.all([
    instanceIds.length
      ? supabase.from("wfk_t_workflowinstance").select("*").in("instance_id", instanceIds).eq("app_id", TIME_TRACKER_APP_ID)
      : { data: [] },
    wfsIds.length
      ? supabase.from("wfk_s_workflowstages").select("wfs_id, stage_name").in("wfs_id", wfsIds)
      : { data: [] },
  ]);

  const instanceById = new Map((workflowInstances || []).map((wi) => [wi.instance_id, wi]));
  const stageById = new Map((stages || []).map((s) => [s.wfs_id, s]));

  const relevant = stageInstances.filter((si) => instanceById.has(si.instance_id));
  if (!relevant.length) return [];

  const documentIds = [...new Set(relevant.map((si) => instanceById.get(si.instance_id).document_id).filter(Boolean))];

  const { data: submissions } = documentIds.length
    ? await supabase.from("time_t_timesheetsubmissions").select("*").in("submission_id", documentIds)
    : { data: [] };
  const submissionById = new Map((submissions || []).map((s) => [s.submission_id, s]));

  const requestorUserIds = [...new Set((submissions || []).map((s) => s.user_id).filter(Boolean))];
  const { data: requestors } = requestorUserIds.length
    ? await supabase.from("psb_s_user").select("user_id, first_name, last_name, username").in("user_id", requestorUserIds)
    : { data: [] };
  const requestorById = new Map(
    (requestors || []).map((u) => [u.user_id, `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username]),
  );

  const stageStatusIds = [...new Set(relevant.map((si) => si.status_id).filter(Boolean))];
  const { data: stageStatuses } = stageStatusIds.length
    ? await supabase.from("wfk_s_status").select("status_id, status_name").in("status_id", stageStatusIds)
    : { data: [] };
  const stageStatusById = new Map((stageStatuses || []).map((s) => [s.status_id, s.status_name]));

  return relevant
    .map((si) => {
      const instance = instanceById.get(si.instance_id);
      const submission = submissionById.get(instance?.document_id);
      if (!submission) return null;
      if (weekStartDate && submission.week_start_date !== weekStartDate) return null;

      return {
        stageinstance_id: si.stageinstance_id,
        instance_id: si.instance_id,
        submission_id: submission.submission_id,
        requestor_name: requestorById.get(submission.user_id) || "Unknown",
        week_start_date: submission.week_start_date,
        week_end_date: submission.week_end_date,
        total_hours: submission.total_hours,
        remarks: submission.remarks,
        stage_name: stageById.get(si.wfs_id)?.stage_name || "--",
        stage_status_name: stageStatusById.get(si.status_id) || "--",
        is_actionable: si.acted_by === null,
        // Return is offered while a step waits for review, and also on the
        // step that gave the final approval so an approver can undo it.
        can_return:
          si.acted_by === null ||
          String(stageStatusById.get(si.status_id) || "").toLowerCase() === "approved",
        acted_at: si.acted_at,
        comments: si.comments,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.is_actionable === b.is_actionable ? 0 : a.is_actionable ? -1 : 1));
}

/** Approve the given stage instance, advancing to the next stage or completing the request. */
export async function approveTimesheetStage(stageinstanceId, comments) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const supabase = getSupabaseAdmin();

  const { data: stageInstance, error: siError } = await supabase
    .from("wfk_t_stageinstance")
    .select("*")
    .eq("stageinstance_id", stageinstanceId)
    .maybeSingle();

  if (siError || !stageInstance) return { success: false, error: "Approval step not found." };
  if (stageInstance.acted_by) return { success: false, error: "This step has already been acted on." };

  const { data: stageDef } = await supabase
    .from("wfk_s_workflowstages")
    .select("wfs_id, wf_id, stage_order")
    .eq("wfs_id", stageInstance.wfs_id)
    .maybeSingle();
  if (!stageDef) return { success: false, error: "Workflow stage not found." };

  const { data: participant } = await supabase
    .from("wfk_m_stageparticipant")
    .select("orgrole_id")
    .eq("wfs_id", stageDef.wfs_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!participant) return { success: false, error: "No approver is configured for this stage." };

  const { data: userOrgRole } = await supabase
    .from("wfk_m_userorgrole")
    .select("user_orgrole_id")
    .eq("user_id", userId)
    .eq("role_id", participant.orgrole_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!userOrgRole) return { success: false, error: "You are not authorized to approve this stage." };

  const approvedStatusId = await getWorkflowStatusId(supabase, "Approved");
  const pendingStatusId = await getWorkflowStatusId(supabase, WORKFLOW_STATUS_PENDING);
  const now = new Date().toISOString();

  const { data: nextStage } = await supabase
    .from("wfk_s_workflowstages")
    .select("wfs_id")
    .eq("wf_id", stageDef.wf_id)
    .eq("is_active", true)
    .gt("stage_order", stageDef.stage_order)
    .order("stage_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextStage) {
    // Same row, advanced in place to the next stage — no new row inserted.
    const { error: updateSiError } = await supabase
      .from("wfk_t_stageinstance")
      .update({
        wfs_id: nextStage.wfs_id,
        status_id: pendingStatusId,
        comments: null,
        acted_at: null,
        acted_by: null,
        is_active: true,
      })
      .eq("stageinstance_id", stageinstanceId);

    if (updateSiError) {
      console.error("approveTimesheetStage advance error:", describeError(updateSiError));
      return { success: false, error: "Approved this step, but failed to advance to the next one." };
    }

    const { error: instanceError } = await supabase
      .from("wfk_t_workflowinstance")
      .update({ current_wfs_id: nextStage.wfs_id })
      .eq("instance_id", stageInstance.instance_id);

    if (instanceError) {
      console.error("approveTimesheetStage update instance error:", describeError(instanceError));
      return { success: false, error: "Approved this step, but failed to update the request." };
    }
  } else {
    // Final stage — this row's terminal state.
    const { error: updateSiError } = await supabase
      .from("wfk_t_stageinstance")
      .update({
        status_id: approvedStatusId,
        acted_at: now,
        acted_by: userId,
        comments: comments || null,
        is_active: false,
      })
      .eq("stageinstance_id", stageinstanceId);

    if (updateSiError) {
      console.error("approveTimesheetStage final update error:", describeError(updateSiError));
      return { success: false, error: "Failed to record approval." };
    }

    const { error: completeError } = await supabase
      .from("wfk_t_workflowinstance")
      .update({ status_id: approvedStatusId, completed_at: now })
      .eq("instance_id", stageInstance.instance_id);

    if (completeError) {
      console.error("approveTimesheetStage complete instance error:", describeError(completeError));
      return { success: false, error: "Approved this step, but failed to finalize the request." };
    }
  }

  return { success: true };
}

/**
 * Return a stage instance to the requestor. Requires a comment.
 *
 * Business Rule:
 * Normally a step is returned while it is still waiting for review. But a step
 * that was the FINAL approval can also be returned, which undoes the approval:
 * the request goes back to Returned and the employee can edit and resubmit.
 * Anything else (already returned, or recalled by the employee) is refused.
 *
 * The update is conditional on the state we expect, so if the timesheet
 * changes while the approver has the dialog open, nothing is written.
 */
export async function returnTimesheetStage(stageinstanceId, comments) {
  const userId = await getSessionUserId();
  if (!userId) return { success: false, error: "Not authenticated." };

  const trimmedComments = String(comments || "").trim();
  if (!trimmedComments) return { success: false, error: "A comment is required when returning a timesheet." };

  const supabase = getSupabaseAdmin();

  const { data: stageInstance, error: siError } = await supabase
    .from("wfk_t_stageinstance")
    .select("*")
    .eq("stageinstance_id", stageinstanceId)
    .maybeSingle();
  if (siError || !stageInstance) return { success: false, error: "Approval step not found." };

  const [returnedStatusId, approvedStatusId] = await Promise.all([
    getWorkflowStatusId(supabase, "Returned"),
    getWorkflowStatusId(supabase, "Approved"),
  ]);

  // Business Rule: a step can be returned while it's still waiting for review,
  // OR after it was the final approval (to undo an approval). Anything else
  // (already returned, recalled by the employee) can't be returned.
  const isAwaitingReview = !stageInstance.acted_by;
  const isFinalApproved = stageInstance.status_id === approvedStatusId;
  if (!isAwaitingReview && !isFinalApproved) {
    return { success: false, error: "This step has already been acted on." };
  }

  const { data: participant } = await supabase
    .from("wfk_m_stageparticipant")
    .select("orgrole_id")
    .eq("wfs_id", stageInstance.wfs_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!participant) return { success: false, error: "No approver is configured for this stage." };

  const { data: userOrgRole } = await supabase
    .from("wfk_m_userorgrole")
    .select("user_orgrole_id")
    .eq("user_id", userId)
    .eq("role_id", participant.orgrole_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!userOrgRole) return { success: false, error: "You are not authorized to act on this stage." };

  const now = new Date().toISOString();

  // Conditional on the state we checked above, so a change made while the
  // approver had the dialog open (e.g. the employee recalled it) is detected.
  let stageUpdate = supabase
    .from("wfk_t_stageinstance")
    .update({ status_id: returnedStatusId, acted_at: now, acted_by: userId, comments: trimmedComments, is_active: true })
    .eq("stageinstance_id", stageinstanceId);

  stageUpdate = isAwaitingReview
    ? stageUpdate.is("acted_by", null)
    : stageUpdate.eq("status_id", approvedStatusId);

  const { data: returnedRows, error: updateSiError } = await stageUpdate.select("stageinstance_id");

  if (updateSiError) {
    console.error("returnTimesheetStage update stage instance error:", describeError(updateSiError));
    return { success: false, error: "Failed to record the return." };
  }
  if (!returnedRows?.length) {
    return { success: false, error: "This timesheet changed while you were reviewing it. Refresh and try again." };
  }

  // Undo the approval: clear completed_at so the request is live again.
  const { error: updateInstanceError } = await supabase
    .from("wfk_t_workflowinstance")
    .update({ status_id: returnedStatusId, completed_at: null })
    .eq("instance_id", stageInstance.instance_id);
  if (updateInstanceError) {
    console.error("returnTimesheetStage update instance error:", describeError(updateInstanceError));
    return { success: false, error: "Recorded the return, but failed to update the overall request status." };
  }

  return { success: true };
}

// `deleteAttendanceRecord`, `saveSchedule`, `updateConfig` are unrelated to
// clock in/clock out or time-entry editing and still stubbed — not touched here.
export async function deleteAttendanceRecord(id) {
  return { success: true, id };
}
export async function saveSchedule(scheduleChanges) {
  return { success: true, changes: scheduleChanges.length };
}
export async function updateConfig(config) {
  return { success: true, config };
}