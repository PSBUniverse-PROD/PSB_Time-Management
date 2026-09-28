/**
 * Client Helpers — timeTracker.data.js
 *
 * Constants, utility functions for the Time Tracker module.
 * Mock data has been removed — this is a layout-only shell.
 */

// ─── Corporate Deadline ──────────────────────────────────────
export const DEFAULT_LATE_DEADLINE = "08:15";
export const DEFAULT_GRACE_PERIOD = 15; // minutes

// ─── App Time Zone ───────────────────────────────────────────
//
// Business Rule:
// The whole Time Tracker runs on Dallas, Texas time, whatever time zone the
// employee's device is in. Stored dates/times are Dallas wall-clock values.

export const APP_TIMEZONE = "America/Chicago";
export const APP_TIMEZONE_LABEL = "Central Time (Dallas)";

/**
 * Current (or given) moment as Dallas wall-clock parts.
 * @returns {{dateStr: string, timeStr: string}} "YYYY-MM-DD", "HH:MM:SS"
 */
export function getAppDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

/** Today's date in Dallas as "YYYY-MM-DD". */
export function getAppTodayStr() {
  return getAppDateParts().dateStr;
}

/**
 * Today's Dallas date as a Date at local midnight — a plain calendar carrier
 * for week math (getDay / setDate). Never use it as a real moment in time.
 */
export function getAppTodayDate() {
  return new Date(`${getAppTodayStr()}T00:00:00`);
}

// ─── Display Helpers ─────────────────────────────────────────

/** Format minutes into "Xh Ym" or "Xh" or "Ym" */
export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Format decimal hours to "X.Xh" */
export function formatDecimalHours(minutes) {
  if (!minutes || minutes <= 0) return "0.0h";
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Format time string "HH:mm" to "H:MMam/pm" */
export function formatTime(timeStr) {
  if (!timeStr || timeStr === "—") return "—";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")}${ampm}`;
}

/** Format ISO date string to readable "Mon, Jul 21" */
export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ─── Batch/Form Helpers ──────────────────────────────────────

export function createEmptyAttendanceForm() {
  return {
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    timeIn: "",
    timeOut: "",
    notes: "",
  };
}

export function createAttendanceFormFromRow(row) {
  return {
    employeeId: row.employeeId || "",
    date: row.date || "",
    timeIn: row.timeIn || "",
    timeOut: row.timeOut || "",
    notes: row.notes || "",
  };
}

// ─── Schedule Models ─────────────────────────────────────────
//
// Shared by the Setup UI (live preview + validation) and the server actions
// (final validation + weekly hours), so both always agree.
//
// Business Rule:
// A model day stores times only, never dates, because the same model is
// reused every week. Times are read in order — start, break start, break end,
// end — and any time earlier than the one before it belongs to the NEXT day.
// That is how a night shift like 22:00 → 07:00 works without storing dates.

const MINUTES_PER_DAY = 24 * 60;

/**
 * Round worked minutes to the company's half-hour steps, by the minutes past
 * the last full hour: 0–15 → down to the hour, 16–35 → the half hour,
 * 36–59 → up to the next hour. Seconds are dropped first.
 * e.g. 4h12m → 240, 4h16m → 270, 3h36m → 240.
 */
export function roundWorkMinutes(minutes) {
  const whole = Math.floor(Math.max(minutes, 0));
  const hours = Math.floor(whole / 60);
  const rem = whole - hours * 60;
  if (rem <= 15) return hours * 60;
  if (rem <= 35) return hours * 60 + 30;
  return (hours + 1) * 60;
}

/** Overtime is counted in blocks of this many minutes, rounded down. */
export const OVERTIME_BLOCK_MINUTES = 30;

/** Minutes after the scheduled clock-in that still count as on time. */
export const LATE_GRACE_MINUTES = 10;

/**
 * Minutes deducted for a late clock-in. Split the lateness into full hours
 * and the minutes past them: 0–10 → +0 (grace), 11–45 → +30, 46–59 → +60.
 * e.g. 10 → 0, 11 → 30, 45 → 30, 46 → 60, 70 → 60, 71 → 90, 106 → 120.
 * Early or on time → 0. Seconds are dropped first.
 */
export function lateDeductionMinutes(lateMinutes) {
  const late = Math.floor(lateMinutes);
  if (late <= 0) return 0;
  const hours = Math.floor(late / 60);
  const rem = late - hours * 60;
  if (rem <= LATE_GRACE_MINUTES) return hours * 60;
  if (rem <= LATE_HALF_HOUR_UNTIL_MINUTES) return hours * 60 + 30;
  return (hours + 1) * 60;
}

/** Minutes past a full hour of lateness that still cost only half an hour (11–45). */
export const LATE_HALF_HOUR_UNTIL_MINUTES = 45;

/** ISO weekdays, matching time_s_schedulemodelday.day_of_week (1 = Monday). */
export const SCHEDULE_DAYS = [
  { dayOfWeek: 1, label: "Monday", short: "Mon" },
  { dayOfWeek: 2, label: "Tuesday", short: "Tue" },
  { dayOfWeek: 3, label: "Wednesday", short: "Wed" },
  { dayOfWeek: 4, label: "Thursday", short: "Thu" },
  { dayOfWeek: 5, label: "Friday", short: "Fri" },
  { dayOfWeek: 6, label: "Saturday", short: "Sat" },
  { dayOfWeek: 7, label: "Sunday", short: "Sun" },
];

/** "8:00", "08:00" or "08:00:00" → "08:00". Anything else → "". */
export function toHHMM(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Put a day's times on one timeline, in minutes from midnight of the
 * clock-in day. A value of 1440 or more means "the next day".
 * Missing break times come back as null.
 */
export function resolveScheduleDay({ startTime, breakStart, breakEnd, endTime }) {
  let dayOffset = 0;
  let previous = null;

  const [start, bStart, bEnd, end] = [startTime, breakStart, breakEnd, endTime].map((raw) => {
    const hhmm = toHHMM(raw);
    if (!hhmm) return null;
    let value = toMinutes(hhmm) + dayOffset;
    if (previous != null && value < previous) {
      dayOffset += MINUTES_PER_DAY;
      value += MINUTES_PER_DAY;
    }
    previous = value;
    return value;
  });

  return { start, breakStart: bStart, breakEnd: bEnd, end };
}

/** Returns a short, plain-language error for one working day, or null if it's valid. */
export function validateScheduleDay(day) {
  const startTime = toHHMM(day?.startTime);
  const endTime = toHHMM(day?.endTime);
  const breakStart = toHHMM(day?.breakStart);
  const breakEnd = toHHMM(day?.breakEnd);

  if (!startTime || !endTime) return "Enter a start and end time.";
  if (Boolean(breakStart) !== Boolean(breakEnd)) {
    return "Enter both break times, or leave both empty.";
  }

  const r = resolveScheduleDay({ startTime, breakStart, breakEnd, endTime });

  if (breakStart) {
    if (!(r.start < r.breakStart && r.breakStart < r.breakEnd && r.breakEnd < r.end)) {
      return "Times must go in order: start, break start, break end, end.";
    }
  } else if (!(r.start < r.end)) {
    return "End time must be after the start time.";
  }

  if (r.end - r.start > MINUTES_PER_DAY) {
    return "These times add up to more than 24 hours. Check that they go in order: start, break start, break end, end.";
  }
  return null;
}

/** Scheduled working hours for one day (shift minus break). 0 if the day is invalid. */
export function computeScheduledDayHours(day) {
  if (validateScheduleDay(day)) return 0;
  const r = resolveScheduleDay(day);
  const breakMinutes = r.breakStart != null ? r.breakEnd - r.breakStart : 0;
  return Math.round(((r.end - r.start - breakMinutes) / 60) * 100) / 100;
}

/** Total scheduled hours for a model's working days. */
export function computeScheduledWeeklyHours(days) {
  const total = (days || []).reduce((sum, day) => sum + computeScheduledDayHours(day), 0);
  return Math.round(total * 100) / 100;
}

/** [1,2,3,4,5,7] → "Mon–Fri, Sun" */
export function summarizeScheduleDays(dayNumbers) {
  const sorted = [...new Set(dayNumbers || [])].sort((a, b) => a - b);
  if (!sorted.length) return "No working days";

  const shortOf = (n) => SCHEDULE_DAYS[n - 1]?.short || String(n);
  const groups = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const n = sorted[i];
    if (n === runEnd + 1) {
      runEnd = n;
      continue;
    }
    if (runStart === runEnd) groups.push(shortOf(runStart));
    else if (runEnd === runStart + 1) groups.push(`${shortOf(runStart)}, ${shortOf(runEnd)}`);
    else groups.push(`${shortOf(runStart)}–${shortOf(runEnd)}`);
    runStart = n;
    runEnd = n;
  }
  return groups.join(", ");
}

/**
 * Hours for one clocked-out log, using the employee's schedule model.
 *
 * Business Rule:
 * - The schedule row used is the one for the clock-in date's weekday.
 * - Early clock-in isn't counted; hours start at the scheduled clock-in.
 * - Lateness is deducted by the minutes past each full hour late: 0–10 min
 *   grace, 11–45 min → 0.5 hr, 46–59 min → 1 hr (e.g. 8:40 → counts from
 *   8:30, 9:05 → from 9:00).
 * - The break only reduces counted time past the first half of the day's
 *   scheduled work hours, up to the full break length, so half days keep
 *   their full hours.
 * - Overtime = time after the scheduled clock-out in 30-minute blocks
 *   (OVERTIME_BLOCK_MINUTES), rounded down (e.g. 1h46m → 1.5). Leftover
 *   minutes aren't counted.
 * - Regular time is rounded to half-hour steps by the minutes past the last
 *   full hour (0–15 down, 16–35 → .5, 36–59 up), so every day's total is a
 *   multiple of 0.5. Rest days are rounded the same way.
 * - Rest day or unusable schedule row: everything is regular, no break.
 *
 * All math is in minutes from midnight of the clock-in date, so night
 * shifts that end the next day work the same as day shifts.
 *
 * @param {{clockInDate:string, clockInTime:string, clockOutDate:string, clockOutTime:string}} log
 *   dates "YYYY-MM-DD", times "HH:MM" or "HH:MM:SS"
 * @param {Record<number, {startTime:string, breakStart:string, breakEnd:string, endTime:string}>} rulesByDay
 *   keyed by ISO weekday (1 = Monday)
 * @returns {{grossHours:number, totalHours:number, overtimeHours:number, countedUntilTime:?string}}
 *   grossHours can be negative (clock-out before clock-in) so callers can reject it.
 *   countedUntilTime is the time counting stopped ("HH:MM") when minutes
 *   after it were dropped, otherwise null.
 */
export function computeLogHours({ clockInDate, clockInTime, clockOutDate, clockOutTime }, rulesByDay) {
  const toMin = (value) => {
    const [h = 0, m = 0, s = 0] = String(value || "").split(":").map(Number);
    return h * 60 + m + s / 60;
  };
  const daysBetween = (from, to) => {
    const [y1, m1, d1] = from.split("-").map(Number);
    const [y2, m2, d2] = to.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  };
  const isoWeekday = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return day === 0 ? 7 : day;
  };
  const round2 = (n) => Math.round(n * 100) / 100;

  const inMin = toMin(clockInTime);
  const outMin = daysBetween(clockInDate, clockOutDate) * MINUTES_PER_DAY + toMin(clockOutTime);
  const grossMin = outMin - inMin;

  if (grossMin < 0) {
    return { grossHours: round2(grossMin / 60), totalHours: 0, overtimeHours: 0, countedUntilTime: null };
  }

  const rule = rulesByDay?.[isoWeekday(clockInDate)];
  if (!rule || validateScheduleDay(rule)) {
    return {
      grossHours: round2(grossMin / 60),
      totalHours: round2(roundWorkMinutes(grossMin) / 60),
      overtimeHours: 0,
      countedUntilTime: null,
    };
  }

  const shift = resolveScheduleDay(rule);

  // Clock-in: early time isn't counted. Lateness is deducted by the minutes
  // past each full hour late: 0–10 grace, 11–45 → 0.5 hr, 46–59 → 1 hr
  // (e.g. 8:10 → from 8:00, 8:40 → from 8:30, 8:50 → from 9:00, 9:05 → from 9:00).
  const countedInMin = shift.start + lateDeductionMinutes(inMin - shift.start);

  // Overtime is counted in OVERTIME_BLOCK_MINUTES blocks after the scheduled
  // clock-out, rounded down. Leftover minutes aren't counted at all, so
  // counting stops at the scheduled clock-out plus the full blocks.
  const overtimeStartMin = Math.max(countedInMin, shift.end);
  const rawOvertimeMin = Math.max(outMin - overtimeStartMin, 0);
  const overtimeBlocks = Math.floor(rawOvertimeMin / OVERTIME_BLOCK_MINUTES);
  const countedOutMin = overtimeBlocks > 0
    ? overtimeStartMin + overtimeBlocks * OVERTIME_BLOCK_MINUTES
    : Math.min(outMin, shift.end);

  const countedMin = Math.max(countedOutMin - countedInMin, 0);

  // Break: only counted time inside the scheduled hours is reduced, so the
  // break never eats into overtime or goes below zero.
  const regularMin = Math.max(Math.min(countedOutMin, shift.end) - countedInMin, 0);

  // Half days keep their break time: the break only reduces counted time
  // past the first half of the day's scheduled work hours (shift − break).
  // e.g. 8:00–5:00 with a 1-hr break = 8 work hrs, so the first 4 hrs never
  // lose break time; a full day still loses the full hour.
  const breakLengthMin = shift.breakStart != null ? shift.breakEnd - shift.breakStart : 0;
  const halfDayMin = (shift.end - shift.start - breakLengthMin) / 2;
  const breakMin = Math.min(breakLengthMin, Math.max(regularMin - halfDayMin, 0));

  // Overtime is already whole 30-min blocks; round only the regular part to
  // half-hour steps, so the day's total is always a multiple of 0.5.
  const overtimeMin = overtimeBlocks * OVERTIME_BLOCK_MINUTES;
  const regularNetMin = Math.max(countedMin - breakMin - overtimeMin, 0);
  const totalMin = roundWorkMinutes(regularNetMin) + overtimeMin;

  // For display: where counting stopped, when minutes past it were dropped.
  const minuteOfDay = ((Math.round(countedOutMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const countedUntilTime = outMin > countedOutMin && outMin > shift.end
    ? `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`
    : null;

  return {
    grossHours: round2(grossMin / 60),
    totalHours: round2(totalMin / 60),
    overtimeHours: round2(Math.min(overtimeMin, totalMin) / 60),
    countedUntilTime,
  };
}

/**
 * Group a model's days that share the same times, for display.
 * [{Mon 8-5}, {Tue 8-5}, {Sat 9-1}] → [{ dayNumbers:[1,2], ...times }, { dayNumbers:[6], ...times }]
 * Keeps the order of the first day in each group.
 */
export function groupScheduleDays(days) {
  const groups = [];
  const byKey = new Map();
  [...(days || [])]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .forEach((day) => {
      const key = [day.startTime, day.breakStart || "", day.breakEnd || "", day.endTime].join("|");
      if (!byKey.has(key)) {
        const group = {
          dayNumbers: [],
          startTime: day.startTime,
          breakStart: day.breakStart || "",
          breakEnd: day.breakEnd || "",
          endTime: day.endTime,
        };
        byKey.set(key, group);
        groups.push(group);
      }
      byKey.get(key).dayNumbers.push(day.dayOfWeek);
    });
  return groups;
}