/**
 * Client Component — TimeTrackerView.jsx
 *
 * PSB Time Tracker — Logs Page
 * Redesigned with dark teal sidebar, mint-green filter card,
 * and detailed time log table with sub-rows.
 *
 * No mocked data — pure layout shell with live clock.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Button,
  Input,
  Modal,
  StatusBadge,
  TableZ,
  toastError,
  toastSuccess,
  toastWarning,
} from "@/shared/components/ui";
import {
  faArrowsRotate,
  faBolt,
  faChevronLeft,
  faChevronRight,
  faDownload,
  faGear,
  faPlus,
  faTable,
  faClock,
  faFileInvoiceDollar,
  faStamp,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

// Module styles
import "../timeTracker.css";

// Server actions for loading logs + clock in/clock out
import {
  approveTimesheetStage,
  clockIn as clockInAction,
  clockOut as clockOutAction,
  loadApprovalQueue,
  loadApprovalFollowUps,
  loadMissedSubmissions,
  loadSubmissionLogs,
  loadCurrentUserHoursTarget,
  loadCurrentUserPermissionsData,
  loadEditReasons,
  loadEditReasonsAdmin,
  loadEmployeeHoursTargets,
  loadScheduleModels,
  loadTimesheetsForWeek,
  loadTimeTrackerData,
  loadWeekSubmissionStatus,
  recallTimesheet as recallTimesheetAction,
  returnTimesheetStage,
  saveEditReason,
  saveScheduleModel,
  saveTimeLogEntry as saveTimeLogEntryAction,
  setEditReasonActive,
  setScheduleModelActive,
  setUserScheduleModel,
  submitTimesheet as submitTimesheetAction,
} from "../data/timeTracker.actions";
import { getTimeTrackerPermissions } from "../data/timeTracker.permissions";
import {
  APP_TIMEZONE,
  APP_TIMEZONE_LABEL,
  SCHEDULE_DAYS,
  computeScheduledDayHours,
  computeScheduledWeeklyHours,
  getAppDateParts,
  getAppTodayDate,
  getAppTodayStr,
  groupScheduleDays,
  resolveScheduleDay,
  summarizeScheduleDays,
  validateScheduleDay,
} from "../data/timeTracker.data";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

function buildNavItems(permissions) {
  const items = [];
  if (permissions.canViewLogsTab)
    items.push({ key: "logs", label: "Logs", icon: faTable });
  if (permissions.canViewTimesheetsTab) {
    items.push({
      key: "timesheets",
      label: "Timesheets",
      icon: faFileInvoiceDollar,
    });
  }
  if (permissions.canViewApprovalsTab) {
    items.push({ key: "approvals", label: "Approvals", icon: faStamp });
  }
  if (permissions.canViewSetupTab) {
    items.push({ key: "setup", label: "Setup", icon: faGear });
  }
  return items;
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Format a Date into a human-readable clock time (e.g. "08:59 PM").
 * Used to display the most recent clock-in time on the sidebar status card.
 */
function formatClockTime(date) {
  if (!date) return "--";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "SEP 21, 2026" — Timesheets page date-only cells. */
function formatSheetDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

/** "Sat, Sep 26" — weekday + date for detail tables. */
function formatSheetDay(dateStr) {
  if (!dateStr) return "--";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "SEP 26, 2026 | 12:29 PM" — stored Dallas date + time, formatted without any time zone conversion. */
function formatSheetDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "--";
  return `${formatSheetDate(dateStr)} | ${formatTimeDisplay(timeStr)}`;
}

/** Regular / overtime / total from a list of logs (overtime is stored per log). */
function summarizeLogHours(logs) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const total = round2((logs || []).reduce((s, l) => s + (Number(l.total_hours) || 0), 0));
  const overtime = round2((logs || []).reduce((s, l) => s + (Number(l.overtime_hours) || 0), 0));
  return { total, overtime, regular: round2(Math.max(total - overtime, 0)) };
}

/**
 * Whole weeks between this week's Monday and the Monday of the week
 * containing `dateStr` ("YYYY-MM-DD"). Both Mondays are taken at local
 * midnight so the time of day can't skew the result.
 */
function computeWeekOffsetFromToday(dateStr) {
  const mondayOf = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };

  const pickedMonday = mondayOf(new Date(`${dateStr}T00:00:00`));
  const thisMonday = mondayOf(getAppTodayDate());

  const diffDays = Math.round((pickedMonday - thisMonday) / (1000 * 60 * 60 * 24));
  return Math.round(diffDays / 7);
}

/**
 * Local date as YYYY-MM-DD (matches the server actions' date format).
 */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a "YYYY-MM-DD" date string for display (e.g. "Sep 9, 2026").
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return "--";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format an "HH:MM:SS" time string into a 12-hour display (e.g. "8:59 AM").
 */
function formatTimeDisplay(timeStr) {
  if (!timeStr) return "--";
  const [hStr, mStr] = timeStr.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Convert a "h:mm AM/PM" display string (as stored in the logs) into the
 * 24-hour "HH:MM" value expected by <input type="time">. Returns "" for
 * anything that doesn't look like a 12-hour time.
 */
function toTimeInputValue(timeStr) {
  const match = String(timeStr || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "";
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/**
 * Monday of the current Dallas week as "YYYY-MM-DD".
 *
 * Computed in the browser on purpose: the server would use its own timezone,
 * which can put the user on the wrong week late at night.
 */
function getCurrentWeekStartStr() {
  const now = getAppTodayDate();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return toDateStr(monday);
}

/** "2026-09-28", "2026-10-04" → "Sep 28 – Oct 4, 2026" */
function formatWeekLabel(weekStart, weekEnd) {
  const s = new Date(`${weekStart}T00:00:00`);
  const e = new Date(`${weekEnd}T00:00:00`);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/**
 * The amber pill that shows how many things need attention, and opens the
 * list of them. Hidden by the caller when the count is zero.
 */
function KpiButton({ count, label, subLabel, onClick }) {
  return (
    <button type="button" className="tt-kpi-btn" onClick={onClick}>
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <span className="tt-kpi-count">{count}</span>
      <span className="tt-kpi-label">{label}</span>
      {subLabel && <span className="tt-kpi-sub">{subLabel}</span>}
    </button>
  );
}

/** A clickable row inside a KPI modal — clicking jumps the table to that week. */
function KpiListItem({ title, meta, status, onClick }) {
  return (
    <li>
      <button type="button" className="tt-kpi-item" onClick={onClick}>
        <span className="tt-kpi-item-text">
          <span className="tt-kpi-item-title">{title}</span>
          <span className="tt-kpi-item-meta">{meta}</span>
        </span>
        <StatusBadge status={String(status || "").toLowerCase().replace(/\s+/g, "-")} label={status} />
      </button>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useLogsPage
// ═══════════════════════════════════════════════════════════════

function useLogsPage(initialData, permissions) {
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState(
    Number(initialData?.weeklyHoursTarget) || 40,
  );
  const [hasHoursTarget, setHasHoursTarget] = useState(Boolean(initialData?.hasHoursTarget));
  const [schedule, setSchedule] = useState(initialData?.schedule ?? null);
  const navItems = useMemo(() => buildNavItems(permissions), [permissions]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeNav, setActiveNav] = useState(navItems[0]?.key || "logs");
  const [weekOffset, setWeekOffset] = useState(0);

  // Clock session state — seeded from server data, then kept in sync after
  // each clock-in / clock-out action below.
  const [clockedIn, setClockedIn] = useState(Boolean(initialData?.clockedIn));
  const [openLogId, setOpenLogId] = useState(initialData?.openLogId ?? null);
  const [lastClockIn, setLastClockIn] = useState(
    initialData?.lastClockIn ? new Date(initialData.lastClockIn) : null,
  );
  const [toggling, setToggling] = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekLogs, setWeekLogs] = useState(initialData?.logs || []);
  const [submissionStatus, setSubmissionStatus] = useState({
    hasSubmission: false,
    statusName: null,
    submittedAt: null,
    remarks: "",
    canRecall: false,
  });
  const [remarks, setRemarks] = useState("");
  const [submittingTimesheet, setSubmittingTimesheet] = useState(false);
  const [recallingTimesheet, setRecallingTimesheet] = useState(false);

  // Live clock tick
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Pull the hours target fresh from the server into state.
  //
  // Two callers share this: the Logs tab refetch below (so the Summary panel
  // follows edits made in Setup), and the page-level retry, which needs Clock
  // In to unlock at the same moment the menu items come back. Returns false
  // when the read failed so callers can decide what to show.
  const refreshHoursTarget = useCallback(async () => {
    try {
      const data = await loadCurrentUserHoursTarget();
      if (data.status === "load-error") return false;
      setWeeklyHoursTarget(Number(data.weeklyHoursTarget) || 40);
      setHasHoursTarget(Boolean(data.hasHoursTarget));
      setSchedule(data.schedule ?? null);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Keep the Summary panel's hours target in sync with Setup. Refetches
  // whenever the Logs tab becomes active (that's the only place it's
  // shown), skipping the first render since initialData is already fresh.
  const isFirstNavRender = useRef(true);
  useEffect(() => {
    if (isFirstNavRender.current) {
      isFirstNavRender.current = false;
      return;
    }
    if (activeNav !== "logs") return;
    refreshHoursTarget();
  }, [activeNav, refreshHoursTarget]);

  // Compute week date range for the header
  const weekRange = useMemo(() => {
    const now = getAppTodayDate();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + Math.round(weekOffset) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatDate = (d) =>
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    return {
      start: monday,
      end: sunday,
      label: `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      fullLabel: `Time Log for ${formatDate(monday)} - ${formatDate(sunday)}`,
    };
  }, [weekOffset]);

  // The week the user is looking at right now. A refresh that lands after they
  // have moved on compares against this and throws its result away.
  const weekRangeRef = useRef(weekRange);
  weekRangeRef.current = weekRange;

  // Refetch logs whenever the visible week changes. The first render is
  // skipped because that data already arrived from the server via initialData.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setWeekLoading(true);
    loadTimeTrackerData(toDateStr(weekRange.start), toDateStr(weekRange.end))
      .then((data) => {
        if (cancelled) return;
        // An expired sign-in would otherwise blank the table with no
        // explanation. A full reload sends the user to the login screen.
        if (data.status === "no-session") {
          window.location.reload();
          return;
        }
        setWeekLogs(data.logs || []);
      })
      .catch(() => {
        if (!cancelled)
          toastError("Unable to load this week's time logs.", "Time Logs");
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekRange]);

  // Submission status isn't part of initialData, so this fetches on every
  // render including the first, not just on subsequent week changes.
  useEffect(() => {
    let cancelled = false;
    loadWeekSubmissionStatus(toDateStr(weekRange.start))
      .then((data) => {
        if (cancelled) return;
        setSubmissionStatus(data);
        setRemarks(data.remarks || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [weekRange]);

  const [refreshing, setRefreshing] = useState(false);

  // Past weeks that still need submitting — drives the "Unsubmitted Weeks" KPI.
  const [missedWeeks, setMissedWeeks] = useState([]);

  /**
   * Re-count the weeks the employee still owes a submission for.
   * Informational only, so on failure we keep the last known list rather
   * than making the KPI disappear.
   */
  const refreshMissedWeeks = useCallback(async () => {
    try {
      setMissedWeeks(await loadMissedSubmissions({ currentWeekStart: getCurrentWeekStartStr() }));
    } catch {
      // KPI is informational — keep the last known list on failure.
    }
  }, []);

  useEffect(() => {
    if (activeNav === "logs") refreshMissedWeeks();
  }, [activeNav, refreshMissedWeeks]);

  /**
   * Re-read everything the Logs tab shows for the visible week: the logs,
   * clock-in status, hours target + work schedule (Summary), and the
   * submission status. Runs in parallel and applies the results together so
   * the table and the Summary panel always match.
   */
  const refreshLogsPage = useCallback(async () => {
    if (refreshing) return;
    const weekStart = toDateStr(weekRange.start);
    const weekEnd = toDateStr(weekRange.end);

    setRefreshing(true);
    setWeekLoading(true);
    try {
      const [data, status] = await Promise.all([
        loadTimeTrackerData(weekStart, weekEnd),
        loadWeekSubmissionStatus(weekStart),
      ]);

      // The user moved to another week while this was loading — drop it.
      if (toDateStr(weekRangeRef.current.start) !== weekStart) return;

      if (data.status === "no-session") {
        window.location.reload();
        return;
      }
      if (data.status === "load-error") {
        toastError("Unable to refresh your time logs.", "Time Logs");
        return;
      }

      setWeekLogs(data.logs || []);
      setClockedIn(Boolean(data.clockedIn));
      setOpenLogId(data.openLogId ?? null);
      setLastClockIn(data.lastClockIn ? new Date(data.lastClockIn) : null);
      setWeeklyHoursTarget(Number(data.weeklyHoursTarget) || 40);
      setHasHoursTarget(Boolean(data.hasHoursTarget));
      setSchedule(data.schedule ?? null);

      setSubmissionStatus(status);
      // Don't wipe a draft the user is typing unless the week was already submitted.
      if (status.hasSubmission) setRemarks(status.remarks || "");
      // The KPI spans all weeks, so it has to be re-counted alongside this week.
      refreshMissedWeeks();
    } catch {
      toastError("Unable to refresh your time logs.", "Time Logs");
    } finally {
      setWeekLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, weekRange, refreshMissedWeeks]);

  const isSubmissionLocked = useMemo(() => {
    const name = String(submissionStatus.statusName || "").toLowerCase();
    return submissionStatus.hasSubmission && (name === "pending" || name === "approved");
  }, [submissionStatus]);

  // Map the current week's logs onto the seven day rows for the table.
  const weekRows = useMemo(() => {
    const monday = weekRange.start;
    const logsByDate = new Map(weekLogs.map((log) => [log.clock_in_date, log]));
    const today = getAppTodayStr();
    return DAYS_OF_WEEK.map((dayName, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const rowDate = toDateStr(date);
      const log = logsByDate.get(rowDate);
      return {
        id: `day-${index}`,
        isoDate: rowDate,
        dayName,
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        shortDate: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        isToday: rowDate === today,
        clockedInDate: log ? formatDateDisplay(log.clock_in_date) : null,
        clockedInTime: log ? formatTimeDisplay(log.clock_in_time) : null,
        clockOutIsoDate: log?.clock_out_date ?? null,
        clockedOutDate: log?.clock_out_date
          ? formatDateDisplay(log.clock_out_date)
          : null,
        clockedOutTime: log?.clock_out_time
          ? formatTimeDisplay(log.clock_out_time)
          : null,
        hours: log?.total_hours ?? null,
        overtimeHours: Number(log?.overtime_hours) || 0,
        hasData: Boolean(log),
        logId: log?.log_id ?? null,
      };
    });
  }, [weekRange, weekLogs]);

  const totalHours = useMemo(
    () => weekRows.reduce((total, row) => total + (Number(row.hours) || 0), 0),
    [weekRows],
  );

  // Overtime is per-log (time after the scheduled clock-out), so it sums
  // straight from the logs. Regular is simply the remainder of the total.
  const overtimeHours = useMemo(
    () => weekRows.reduce((total, row) => total + row.overtimeHours, 0),
    [weekRows],
  );

  const regularHours = useMemo(
    () => Math.max(totalHours - overtimeHours, 0),
    [totalHours, overtimeHours],
  );

  const goPreviousWeek = useCallback(
    () => setWeekOffset((prev) => prev - 1),
    [],
  );
  const goNextWeek = useCallback(() => setWeekOffset((prev) => prev + 1), []);
  const goThisWeek = useCallback(() => setWeekOffset(0), []);
  const goToWeekOfDate = useCallback(
    (dateStr) => setWeekOffset(computeWeekOffsetFromToday(dateStr)),
    [],
  );

  // Clock in/clock out against the database via server actions.
  const handleClockToggle = useCallback(async () => {
    if (toggling) return;
    if (!clockedIn && !hasHoursTarget) {
      toastWarning(
        "Your weekly hours target hasn't been set up yet. Contact your admin.",
        "Clock In Unavailable",
      );
      return;
    }
    setToggling(true);
    try {
      if (!clockedIn) {
        const result = await clockInAction();
        if (result.success) {
          setClockedIn(true);
          setOpenLogId(result.record.log_id);
          setLastClockIn(
            new Date(
              `${result.record.clock_in_date}T${result.record.clock_in_time}`,
            ),
          );
          setWeekLogs((prev) => [
            ...prev.filter((l) => l.log_id !== result.record.log_id),
            result.record,
          ]);
        } else {
          const message = result.error || "Failed to clock in.";
          if (message.toLowerCase().includes("already")) {
            toastWarning(message, "Clock Status");
          } else {
            toastError(message, "Clock In");
          }
        }
      } else {
        const result = await clockOutAction(openLogId);
        if (result.success) {
          setClockedIn(false);
          setOpenLogId(null);
          setWeekLogs((prev) =>
            prev.map((l) =>
              l.log_id === result.record.log_id ? result.record : l,
            ),
          );
        } else {
          const message = result.error || "Failed to clock out.";
          if (message.toLowerCase().includes("already")) {
            toastWarning(message, "Clock Status");
          } else {
            toastError(message, "Clock Out");
          }
        }
      }
    } catch (err) {
      console.error("Clock toggle failed:", err);
      toastError("Something went wrong. Please try again.", "Time Tracker");
    } finally {
      setToggling(false);
    }
  }, [clockedIn, hasHoursTarget, openLogId, toggling]);

  // Save an edit (or a brand-new manual entry) from EditEntryModal.
  const handleSaveEdit = useCallback(async (formData) => {
    const result = await saveTimeLogEntryAction(formData);
    if (result.success) {
      setWeekLogs((prev) => {
        const exists = prev.some((l) => l.log_id === result.record.log_id);
        return exists
          ? prev.map((l) => (l.log_id === result.record.log_id ? result.record : l))
          : [...prev, result.record];
      });
      toastSuccess("Time entry saved.", "Time Tracker");
    } else {
      toastError(result.error || "Failed to save time entry.", "Time Tracker");
    }
    return result;
  }, []);

  const handleSubmitTimesheet = useCallback(async () => {
    if (submittingTimesheet || isSubmissionLocked) return;
    if (!permissions.isRequestor) {
      toastWarning(
        'You need the "Timesheet Requestor - VA" org role to submit a timesheet.',
        "Submit Timesheet",
      );
      return;
    }
    setSubmittingTimesheet(true);
    try {
      const result = await submitTimesheetAction({
        weekStartDate: toDateStr(weekRange.start),
        weekEndDate: toDateStr(weekRange.end),
        remarks,
      });
      if (result.success) {
        toastSuccess("Timesheet submitted for approval.", "Time Tracker");
        const refreshed = await loadWeekSubmissionStatus(toDateStr(weekRange.start));
        setSubmissionStatus(refreshed);
        // Submitting a past week takes it off the "Unsubmitted Weeks" KPI.
        refreshMissedWeeks();
      } else {
        toastError(result.error || "Failed to submit timesheet.", "Time Tracker");
      }
    } catch (err) {
      console.error("submitTimesheet failed:", err);
      toastError("Something went wrong. Please try again.", "Time Tracker");
    } finally {
      setSubmittingTimesheet(false);
    }
  }, [submittingTimesheet, isSubmissionLocked, permissions.isRequestor, weekRange, remarks, refreshMissedWeeks]);

  // Pull the submission back so the week unlocks for editing. The status is
  // refreshed on failure too, so if an approver beat us to it the panel
  // immediately shows what they did instead of a stale "Pending".
  const handleRecallTimesheet = useCallback(async () => {
    if (recallingTimesheet) return false;
    setRecallingTimesheet(true);
    try {
      const result = await recallTimesheetAction({ weekStartDate: toDateStr(weekRange.start) });
      const refreshed = await loadWeekSubmissionStatus(toDateStr(weekRange.start));
      setSubmissionStatus(refreshed);
      if (result.success) {
        toastSuccess("Timesheet recalled. You can now edit your logs and submit again.", "Time Tracker");
        // A recalled past week goes back on the "Unsubmitted Weeks" KPI.
        refreshMissedWeeks();
        return true;
      }
      toastError(result.error || "Failed to recall the timesheet.", "Time Tracker");
      return false;
    } catch (err) {
      console.error("recallTimesheet failed:", err);
      toastError("Something went wrong. Please try again.", "Time Tracker");
      return false;
    } finally {
      setRecallingTimesheet(false);
    }
  }, [recallingTimesheet, weekRange, refreshMissedWeeks]);

  return {
    currentTime,
    activeNav,
    setActiveNav,
    navItems,
    weekRange,
    weekRows,
    goPreviousWeek,
    goNextWeek,
    goThisWeek,
    goToWeekOfDate,

    weekOffset,
    weekLoading,
    refreshing,
    refreshLogsPage,
    missedWeeks,
    totalHours,
    regularHours,
    overtimeHours,
    weeklyHoursTarget,
    hasHoursTarget,
    schedule,
    refreshHoursTarget,
    clockedIn,
    lastClockIn,
    handleClockToggle,
    handleSaveEdit,
    toggling,
    submissionStatus,
    remarks,
    setRemarks,
    isSubmissionLocked,
    submittingTimesheet,
    handleSubmitTimesheet,
    recallingTimesheet,
    handleRecallTimesheet,
  };
}

/**
 * Non-blocking modal-style loading overlay shown while a clock in / clock out
 * server action is in flight. Uses `pointer-events: none` so the user can keep
 * clicking and working on the page behind the panel while it processes.
 */
/**
 * Reloads one table's data without reloading the page.
 *
 * Shared by every table in this module so they all refresh the same way: the
 * button disables itself while the request is in flight (so a double-click
 * can't stack up loads) and spins its icon to show that work is happening.
 *
 * @param {Function} onClick - the table's own reload callback
 * @param {boolean} loading - true while that table is reloading
 * @param {string} label - accessible name; also the tooltip
 */
function RefreshButton({ onClick, loading, label = "Refresh" }) {
  return (
    <button
      type="button"
      className="tt-refresh-btn"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      title={label}
    >
      <FontAwesomeIcon icon={faArrowsRotate} className={loading ? "tt-spin" : undefined} />
    </button>
  );
}

function LoadingPanel({ message }) {
  return (
    <div className="tt-loading-panel" role="status" aria-live="polite">
      <div className="tt-loading-dialog">
        <span className="tt-loading-spinner" aria-hidden="true" />
        <span className="tt-loading-message">{message}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── Sidebar ──────────────────────────────────────────────────

/**
 * No-op subscription for useSyncExternalStore. We only care that the store
 * reports "client" on the first client render, and nothing ever changes after
 * that, so React never needs a real unsubscribe callback.
 */
const subscribeToNothing = () => () => {};

function Sidebar({
  currentTime,
  activeNav,
  onNavChange,
  clockedIn,
  lastClockIn,
  navItems,
  onToggle,
  disabled,
  hasHoursTarget,
}) {
  // The live clock is only rendered after mount. The server and the browser
  // compute a different second, so rendering it during SSR would produce a
  // hydration mismatch. useSyncExternalStore gives `false` on the server and
  // during hydration, then `true` on the client, without a setState-in-effect.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  const timeStr = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  });

  const dateStr = currentTime.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  });

  return (
    <header className="tt-sidebar">
      <div className="tt-module-identity">
        <span className="tt-module-mark" aria-hidden="true">
          TT
        </span>
        <div>
          <div className="tt-module-title-row">
            <div className="tt-module-title">Time Tracker</div>
          </div>
          <div className="tt-module-caption">Workday activity</div>
        </div>
      </div>

      {mounted && (
        <div className="tt-sidebar-clock" aria-live="off">
          <div className="tt-sidebar-clock-time">{timeStr}</div>
          <div className="tt-sidebar-clock-date">{dateStr}</div>
        </div>
      )}

      <TimeInOutButton
        clockedIn={clockedIn}
        onToggle={onToggle}
        disabled={disabled || (!clockedIn && !hasHoursTarget)}
      />

      {/* Clock Status */}
      <div className="tt-sidebar-status-card">
        <StatusBadge
          status={clockedIn ? "active" : "inactive"}
          label={clockedIn ? "Clocked In" : "Not Clocked In"}
          className="tt-status-badge"
        />
        {!clockedIn && !hasHoursTarget && (
          <p className="tt-sidebar-warning">
            Weekly hours target not set. Contact your admin to enable Clock In.
          </p>
        )}
        <p className="tt-timezone-note">All times in {APP_TIMEZONE_LABEL}</p>
      </div>

      {/* Navigation */}
      <nav className="tt-sidebar-nav">
        <div className="tt-sidebar-nav-label">Navigation</div>
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tt-nav-item ${activeNav === item.key ? "active" : ""}`}
            onClick={() => onNavChange(item.key)}
          >
            <FontAwesomeIcon icon={item.icon} className="tt-nav-icon" />
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function TimeInOutButton({ clockedIn, onToggle, disabled }) {
  return (
    <button
      type="button"
      className={`tt-clock-btn ${clockedIn ? "clocked-in" : ""}`}
      onClick={onToggle}
      disabled={disabled}
    >
      <FontAwesomeIcon icon={faClock} className="tt-clock-btn-icon" />
      {clockedIn ? "Clock Out" : "Clock In"}
    </button>
  );
}

/** Wraps a CSV field in quotes only when it actually needs it. */
function csvField(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Builds a CSV string from the current week's log rows. */
function buildLogsCsv(weekRows) {
  const header = ["Day", "Date", "Clocked In Date", "Clocked In Time", "Clocked Out Date", "Clocked Out Time", "Hours"];
  const lines = weekRows.map((row) => [
    row.dayName,
    row.date,
    row.hasData ? row.clockedInDate || "--" : "--",
    row.hasData ? row.clockedInTime || "--" : "--",
    row.hasData && row.clockedOutDate ? row.clockedOutDate : "--",
    row.hasData && row.clockedOutTime ? row.clockedOutTime : "--",
    row.hasData && row.hours != null ? Number(row.hours).toFixed(2) : "--",
  ].map(csvField).join(","));

  return [header.map(csvField).join(","), ...lines].join("\n");
}

/** Triggers a browser download of `content` as a file named `filename`. */
function downloadTextFile(content, filename, mimeType = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function LogsToolbar({ onExport }) {
  return (
    <div className="tt-logs-toolbar">
      <button type="button" className="tt-btn-export" onClick={onExport}>
        <FontAwesomeIcon icon={faDownload} />
      </button>
    </div>
  );
}

// ─── Time Log Table ───────────────────────────────────────────

// ─── Logs Table Column Definitions (shared TableZ) ─────────────

const LOG_TABLE_COLUMNS = [
  {
    key: "dayName",
    label: "Day",
    minWidth: 150,
    render: (row) => (
      <div className={`tt-day-cell-wrap${row.isToday ? " is-today" : ""}`}>
        <div className="tt-day-cell-line">
          <span className="tt-day-marker" aria-hidden="true" />
          <span className="tt-day-cell">{row.dayName}</span>
          {row.isToday && <span className="tt-today-badge">Today</span>}
        </div>
        <span className="tt-day-date">{row.shortDate}</span>
      </div>
    ),
  },
  {
    key: "clockedIn",
    label: "Clocked In (Date & Time)",
    minWidth: 160,
    render: (row) =>
      row.hasData ? (
        <div className="tt-clock-cell">
          <span className="tt-clock-value">{row.clockedInDate}</span>
          <span className="tt-clock-value">{row.clockedInTime}</span>
        </div>
      ) : (
        <div className="tt-clock-cell">
          <span className="tt-clock-value subtle tt-placeholder">--</span>
          <span className="tt-clock-value subtle tt-placeholder">--</span>
        </div>
      ),
  },
  {
    key: "clockedOut",
    label: "Clocked Out (Date & Time)",
    minWidth: 160,
    render: (row) =>
      row.hasData ? (
        <div className="tt-clock-cell">
          <span className="tt-clock-value">{row.clockedOutDate}</span>
          <span className="tt-clock-value">{row.clockedOutTime}</span>
        </div>
      ) : (
        <div className="tt-clock-cell">
          <span className="tt-clock-value subtle tt-placeholder">--</span>
          <span className="tt-clock-value subtle tt-placeholder">--</span>
        </div>
      ),
  },
  {
    key: "hours",
    label: "Hours",
    minWidth: 100,
    align: "center",
    render: (row) =>
      row.hasData ? (
        <span className="tt-hours-cell">{Number(row.hours).toFixed(2)}</span>
      ) : (
        <span className="tt-hours-cell tt-placeholder">--</span>
      ),
  },
];

function TimeLogTable({
  weekRange,
  weekRows,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onPickWeek,
  weekOffset,
  loading,
  onEdit,
  onRefresh,
  refreshing,
  headerExtra,
}) {
  const weekDateInputRef = useRef(null);

  const handleExportCsv = useCallback(() => {
    const csv = buildLogsCsv(weekRows);
    const filename = `time-log-${toDateStr(weekRange.start)}-to-${toDateStr(weekRange.end)}.csv`;
    downloadTextFile(csv, filename);
  }, [weekRows, weekRange]);

  return (
    <div className="tt-table-card">
      {/* Table Header */}
      <div className="tt-table-header">
        <div className="tt-table-header-left">
          <button
            type="button"
            className="tt-nav-arrow"
            onClick={onPrevWeek}
            aria-label="Previous week"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            type="button"
            className="tt-nav-arrow"
            onClick={onNextWeek}
            aria-label="Next week"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div
            className="tt-week-picker"
            onClick={() => weekDateInputRef.current?.showPicker?.()}
          >
            <h3 className="tt-table-title">
              <span>Time Log for</span>
              <strong>{weekRange.label.replace(" - ", " – ")}</strong>
            </h3>
            <input
              ref={weekDateInputRef}
              type="date"
              className="tt-week-picker-input"
              value={toDateStr(weekRange.start)}
              onChange={(event) => onPickWeek(event.target.value)}
              aria-label="Jump to the week containing this date"
            />
          </div>
        </div>
        <div className="tt-table-header-actions">
          {headerExtra}
          <RefreshButton onClick={onRefresh} loading={refreshing} label="Refresh logs and summary" />
          <button
            type="button"
            className="tt-pill-week"
            onClick={onThisWeek}
            disabled={weekOffset === 0}
          >
            This Week
          </button>
          <LogsToolbar onExport={handleExportCsv} />
        </div>
      </div>

      <TableZ
        data={weekRows}
        columns={LOG_TABLE_COLUMNS}
        rowIdKey="id"
        actions={[
          {
            key: "edit",
            label: "Edit",
            icon: "pen",
            onClick: (row) => onEdit(row),
          },
        ]}
        loading={loading}
        loadingMessage="Loading time logs..."
        emptyMessage="No time logs for this week."
        hideSearch
        hideFooter
      />
    </div>
  );
}

// ─── Timesheet Summary Panel (right column) ───────────────────

function SummaryCard({ icon, iconClass, label, sub, value, valueClass }) {
  return (
    <div className="tt-summary-card">
      <div className={`tt-summary-card-icon ${iconClass || ""}`}>
        <FontAwesomeIcon icon={icon} />
      </div>
      <div className="tt-summary-card-text">
        <div className="tt-summary-card-label">{label}</div>
        <div className="tt-summary-card-sub">{sub}</div>
      </div>
      <span className={`tt-summary-card-value ${valueClass || ""}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * The employee's assigned work schedule, grouped so identical days show once
 * (e.g. "Mon–Fri · 8:00 AM – 5:00 PM · Break 12:00 PM – 1:00 PM").
 */
function WorkScheduleCard({ schedule, weeklyHoursTarget }) {
  if (!schedule || !schedule.days?.length) {
    return (
      <div className="tt-summary-schedule-card is-empty">
        <p className="tt-summary-schedule-empty">
          No work schedule assigned yet. Contact your admin.
        </p>
      </div>
    );
  }

  const groups = groupScheduleDays(schedule.days);
  const workingDayNumbers = schedule.days.map((d) => d.dayOfWeek);
  const restDayNumbers = [1, 2, 3, 4, 5, 6, 7].filter((n) => !workingDayNumbers.includes(n));

  return (
    <div className="tt-summary-schedule-card">
      <div className="tt-summary-schedule-head">
        <span className="tt-summary-schedule-name">{schedule.modelName || "Work Schedule"}</span>
        <span className="tt-summary-schedule-hours">{weeklyHoursTarget.toFixed(2)} hrs/week</span>
      </div>

      <ul className="tt-summary-schedule-list">
        {groups.map((group) => (
          <li key={group.dayNumbers.join("-")} className="tt-summary-schedule-row">
            <span className="tt-summary-schedule-days">{summarizeScheduleDays(group.dayNumbers)}</span>
            <span className="tt-summary-schedule-time">
              {formatTimeDisplay(group.startTime)} – {formatTimeDisplay(group.endTime)}
              {group.breakStart && (
                <span className="tt-summary-schedule-break">
                  Break {formatTimeDisplay(group.breakStart)} – {formatTimeDisplay(group.breakEnd)}
                </span>
              )}
            </span>
          </li>
        ))}
        {restDayNumbers.length > 0 && (
          <li className="tt-summary-schedule-row is-rest">
            <span className="tt-summary-schedule-days">{summarizeScheduleDays(restDayNumbers)}</span>
            <span className="tt-summary-schedule-time">Rest day</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function TimesheetSummary({
  weekRange,
  totalHours,
  regularHours,
  overtimeHours,
  weeklyHoursTarget,
  schedule,
  workedDays,
  submissionStatus,
  remarks,
  onRemarksChange,
  isRequestor,
  isSubmissionLocked,
  submitting,
  onSubmit,
  canRecall,
  recalling,
  onRecall,
}) {
  const [confirmRecall, setConfirmRecall] = useState(false);
  const periodLabel = `${weekRange.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const statusLower = String(submissionStatus.statusName || "").toLowerCase();
  const pillLabel = !submissionStatus.hasSubmission ? "Not Submitted" : submissionStatus.statusName || "Submitted";
  // A recalled week is as editable as a returned one, so it offers Resubmit too.
  const canResubmit =
    submissionStatus.hasSubmission &&
    (statusLower === "returned" || statusLower === "rejected" || statusLower === "recalled");
  const submitDisabled = submitting || !isRequestor || isSubmissionLocked;
  const submitLabel = submitting
    ? "Submitting..."
    : canResubmit
      ? "Resubmit Timesheet for Approval"
      : "Submit Timesheet for Approval";

  return (
    <aside
      className="tt-summary-panel"
      aria-label="Timesheet summary and actions"
    >
      <div className="tt-summary-header">
        <h3 className="tt-summary-title">Timesheet Summary</h3>
        <span className="tt-summary-status-pill">
          <span className="tt-summary-status-dot" aria-hidden="true" />
          {pillLabel}
        </span>
      </div>

      <div className="tt-summary-body">
        <section className="tt-summary-section">
          <h4 className="tt-summary-section-label">Work Schedule</h4>
          <WorkScheduleCard schedule={schedule} weeklyHoursTarget={weeklyHoursTarget} />
        </section>

        {/* Hours Breakdown */}
        <section className="tt-summary-section">
          <h4 className="tt-summary-section-label">Hours Breakdown</h4>
          <p className="tt-summary-period">Period: {periodLabel}</p>

          <SummaryCard
            icon={faClock}
            label="Regular Hours"
            sub={`Scheduled: ${weeklyHoursTarget.toFixed(2)} hrs`}
            value={`${regularHours.toFixed(2)} hrs`}
          />
          <SummaryCard
            icon={faBolt}
            iconClass="tt-summary-icon-overtime"
            label="Overtime"
            sub="30-min blocks after scheduled clock-out"
            value={`${overtimeHours.toFixed(2)} hrs`}
            valueClass="tt-summary-value-overtime"
          />

          <div className="tt-summary-total-card">
            <div className="tt-summary-card-text">
              <div className="tt-summary-total-label">Total Logged</div>
              <div className="tt-summary-total-sub">
                {workedDays} workday{workedDays === 1 ? "" : "s"} recorded
              </div>
            </div>
            <span className="tt-summary-total-value">
              {totalHours.toFixed(2)} hrs
            </span>
          </div>
        </section>

        {/* Approval Workflow */}
        <section className="tt-summary-section">
          <h4 className="tt-summary-section-label">Approval Workflow</h4>
          <div className="tt-summary-state-card">
            <div className="tt-summary-state-row">
              <span className="tt-summary-state-label">Submission State:</span>
              <span className="tt-summary-state-pill">{pillLabel}</span>
            </div>
            <div className="tt-summary-approver">
              <span className="tt-summary-approver-avatar" aria-hidden="true">
                {submissionStatus.approverName ? submissionStatus.approverName.charAt(0).toUpperCase() : "—"}
              </span>
              <div className="tt-summary-approver-text">
                <div className="tt-summary-approver-label">
                  Assigned Approver:
                </div>
                <div className="tt-summary-approver-name">
                  {submissionStatus.approverName || "Unassigned"}
                </div>
                <div className="tt-summary-approver-role">
                  {submissionStatus.approverRoleName || "No approver assigned yet"}
                </div>
              </div>
            </div>

            {submissionStatus.lastActionComment && (
              <div className={`tt-summary-action-comment${statusLower === "returned" ? " is-returned" : ""}`}>
                <span className="tt-summary-action-comment-label">
                  {statusLower === "returned" ? "Reason for Return" : "Approver's Comment"}
                </span>
                <p className="tt-summary-action-comment-text">{submissionStatus.lastActionComment}</p>
                {submissionStatus.lastActionByName && (
                  <span className="tt-summary-action-comment-by">— {submissionStatus.lastActionByName}</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Remarks / Notes */}
        <section className="tt-summary-section">
          <label
            className="tt-summary-remarks-label"
            htmlFor="submission-remarks"
          >
            Remarks / Notes
          </label>
          <textarea
            id="submission-remarks"
            className="tt-summary-remarks"
            rows="3"
            placeholder="e.g., Worked on sprint onboarding and core API integration."
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
            disabled={isSubmissionLocked || submitting}
          />
          <p className="tt-summary-remarks-hint">
            Optional notes for your manager before final submission.
          </p>
        </section>

        <div className="tt-summary-actions-bar">
          <button
            type="button"
            className="tt-btn-submit tt-panel-submit"
            disabled={submitDisabled}
            onClick={onSubmit}
          >
            {submitLabel}
          </button>
          {canRecall && (
            <>
              <button
                type="button"
                className="tt-btn-recall"
                disabled={recalling}
                onClick={() => setConfirmRecall(true)}
              >
                {recalling ? "Recalling..." : "Recall Submission"}
              </button>
              <p className="tt-summary-recall-hint">
                {statusLower === "approved"
                  ? "Need to fix an approved timesheet? Recall it to undo the approval, then submit again."
                  : "Need to fix something? Recall it, then submit again."}
              </p>
            </>
          )}
          {statusLower === "recalled" && (
            <p className="tt-summary-recall-hint is-recalled">
              You recalled this timesheet. Update your logs, then submit it again.
            </p>
          )}
          {!isRequestor && (
            <p className="tt-summary-warning">
              Requires the &quot;Timesheet Requestor - VA&quot; role to submit.
            </p>
          )}
        </div>
      </div>

      {confirmRecall && (
        <Modal
          show
          onHide={() => !recalling && setConfirmRecall(false)}
          title={statusLower === "approved" ? "Recall this approved timesheet?" : "Recall this timesheet?"}
          footer={(
            <>
              <Button type="button" variant="ghost" onClick={() => setConfirmRecall(false)} disabled={recalling}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={recalling}
                onClick={async () => {
                  await onRecall();
                  setConfirmRecall(false);
                }}
              >
                Recall
              </Button>
            </>
          )}
        >
          <p className="tt-recall-confirm-text">
            {statusLower === "approved"
              ? "This timesheet is already approved. Recalling it undoes the approval — you'll need to submit it again, and it will start again from the first approval step."
              : "Your approvers won't be able to review it until you submit it again, and it will start again from the first approval step."}
            {" "}You&apos;ll be able to edit this week&apos;s logs right away.
          </p>
        </Modal>
      )}
    </aside>
  );
}

// ─── Edit Time Entry Modal ────────────────────────────────────

function EditEntryModal({ row, onClose, onSave }) {
  const [clockInDate, setClockInDate] = useState("");
  const [clockOutDate, setClockOutDate] = useState("");
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [reasons, setReasons] = useState([]);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the form fields whenever a new row is opened for editing.
  // Clock Out defaults to the same date as Clock In (the common case) but
  // is independently editable for night shifts that cross midnight.
  useEffect(() => {
    if (!row) return;
    setClockInDate(row.isoDate);
    setClockOutDate(row.clockOutIsoDate || row.isoDate);
    setClockInTime(toTimeInputValue(row.clockedInTime));
    setClockOutTime(toTimeInputValue(row.clockedOutTime));
    setReasonId("");
    setNotes("");
  }, [row]);

  // Load the DB-driven reason list each time the modal opens.
  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    setReasonsLoading(true);
    loadEditReasons()
      .then((data) => {
        if (!cancelled) setReasons(data);
      })
      .finally(() => {
        if (!cancelled) setReasonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  if (!row) return null;

  const canSave = Boolean(reasonId) && Boolean(clockInTime) && !saving;

  const handleSaveClick = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await onSave({
        logId: row.logId,
        clockInDate,
        clockOutDate,
        clockInTime,
        clockOutTime,
        reasonId: Number(reasonId),
        notes,
      });
      if (!result?.success) return; // keep modal open on failure so the user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tt-modal-mask" onClick={onClose} role="presentation">
      <div
        className="tt-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Edit Time Entry"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tt-modal-header">
          <div>
            <h3 className="tt-modal-title">Edit Time Entry</h3>
            <p className="tt-modal-subtitle">
              {row.dayName}, {row.shortDate}
            </p>
          </div>
          <button
            type="button"
            className="tt-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tt-modal-body">
          <div className="tt-modal-grid">
            <label className="tt-modal-field">
              <span className="tt-modal-label">Clock In Date</span>
              <input
                type="date"
                className="tt-modal-input"
                value={clockInDate}
                onChange={(event) => setClockInDate(event.target.value)}
              />
            </label>
            <label className="tt-modal-field">
              <span className="tt-modal-label">Clock In Time</span>
              <input
                type="time"
                className="tt-modal-input"
                value={clockInTime}
                onChange={(event) => setClockInTime(event.target.value)}
              />
            </label>
            <label className="tt-modal-field">
              <span className="tt-modal-label">Clock Out Date</span>
              <input
                type="date"
                className="tt-modal-input"
                value={clockOutDate}
                onChange={(event) => setClockOutDate(event.target.value)}
              />
            </label>
            <label className="tt-modal-field">
              <span className="tt-modal-label">Clock Out Time</span>
              <input
                type="time"
                className="tt-modal-input"
                value={clockOutTime}
                onChange={(event) => setClockOutTime(event.target.value)}
              />
            </label>
          </div>

          <label className="tt-modal-field">
            <span className="tt-modal-label">Reason for Edit <span className="tt-modal-required">*</span></span>
            <select
              className="tt-modal-select"
              value={reasonId}
              onChange={(event) => setReasonId(event.target.value)}
              disabled={reasonsLoading}
            >
              <option value="">{reasonsLoading ? "Loading..." : "Select a reason"}</option>
              {reasons.map((reason) => (
                <option key={reason.status_id} value={reason.status_id}>
                  {reason.status_name}
                </option>
              ))}
            </select>
          </label>

          <label className="tt-modal-field">
            <span className="tt-modal-label">Notes / Memo</span>
            <textarea
              className="tt-modal-textarea"
              rows="2"
              placeholder="Optional clarification..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        <div className="tt-modal-footer">
          <button
            type="button"
            className="tt-modal-btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tt-modal-btn-save"
            onClick={handleSaveClick}
            disabled={!canSave}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Setup: Employee Hours (schedule model assignment) ─────

function formatHours(value) {
  return value == null ? "—" : `${Number(value).toFixed(2)} hrs`;
}

function EmployeeHoursSection() {
  const [rows, setRows] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);

  const fetchAll = useCallback(
    () => Promise.all([loadEmployeeHoursTargets(), loadScheduleModels()]),
    [],
  );

  const reload = useCallback(() => {
    setLoading(true);
    fetchAll()
      .then(([employees, scheduleModels]) => {
        setRows(employees);
        setModels(scheduleModels);
      })
      .catch(() => toastError("Unable to load employee hours.", "Setup"))
      .finally(() => setLoading(false));
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([employees, scheduleModels]) => {
        if (cancelled) return;
        setRows(employees);
        setModels(scheduleModels);
      })
      .catch(() => {
        if (!cancelled) toastError("Unable to load employee hours.", "Setup");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const handleAssign = useCallback(
    async (row, nextModelId) => {
      if (!nextModelId || Number(nextModelId) === row.model_id) return;
      setSavingUserId(row.user_id);
      try {
        const result = await setUserScheduleModel(row.user_id, Number(nextModelId));
        if (result.success) {
          toastSuccess(`Updated ${row.name}'s schedule.`, "Setup");
          reload();
        } else {
          toastError(result.error || "Failed to update.", "Setup");
        }
      } finally {
        setSavingUserId(null);
      }
    },
    [reload],
  );

  const columns = useMemo(() => {
    // Only active models with at least one working day can be picked.
    // A user already on an inactive model still sees it, marked, so the
    // dropdown never shows the wrong value.
    const pickable = models.filter((m) => m.is_active && m.days.length > 0);

    return [
      { key: "name", label: "Employee", minWidth: 220 },
      {
        key: "model_id",
        label: "Schedule Model",
        minWidth: 240,
        render: (row) => {
          const current = models.find((m) => m.model_id === row.model_id);
          const showCurrentSeparately = current && !pickable.includes(current);
          return (
            <select
              className="tt-modal-select tt-setup-model-select"
              value={row.model_id ?? ""}
              disabled={savingUserId === row.user_id || (!pickable.length && !current)}
              onChange={(event) => handleAssign(row, event.target.value)}
            >
              {row.model_id == null && (
                <option value="" disabled>
                  {pickable.length ? "Not assigned — pick a model" : "No models set up yet"}
                </option>
              )}
              {showCurrentSeparately && (
                <option value={current.model_id} disabled>
                  {current.model_name} (inactive)
                </option>
              )}
              {pickable.map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.model_name} · {formatHours(m.weekly_hours)}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        key: "weekly_hours_target",
        label: "Weekly Hours",
        minWidth: 140,
        render: (row) => (
          <span className={row.weekly_hours_target == null ? "tt-setup-muted" : ""}>
            {formatHours(row.weekly_hours_target)}
          </span>
        ),
      },
    ];
  }, [models, savingUserId, handleAssign]);

  return (
    <>
      <div className="tt-setup-toolbar">
        <RefreshButton onClick={reload} loading={loading} label="Refresh employees" />
      </div>

      <p className="tt-setup-hint">
        Pick a schedule model for each employee. Their weekly hours come from the model.
        Employees can&apos;t clock in until they have a model.
      </p>
      <TableZ
        data={rows}
        columns={columns}
        rowIdKey="user_id"
        showActionColumn={false}
        loading={loading}
        loadingMessage="Loading employees..."
        emptyMessage="No employees found for this module."
        hideFooter
      />
    </>
  );
}

// ─── Admin Setup: Schedule Models ────────────────────────────────

/** One editable grid row per weekday; `working` false = rest day. */
function buildEditorDays(savedDays) {
  const byDay = new Map((savedDays || []).map((d) => [d.dayOfWeek, d]));
  return SCHEDULE_DAYS.map(({ dayOfWeek }) => {
    const saved = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      working: Boolean(saved),
      startTime: saved?.startTime || "",
      breakStart: saved?.breakStart || "",
      breakEnd: saved?.breakEnd || "",
      endTime: saved?.endTime || "",
    };
  });
}

const TIME_FIELDS = ["startTime", "breakStart", "breakEnd", "endTime"];
const TIME_FIELD_TO_RESOLVED = {
  startTime: "start",
  breakStart: "breakStart",
  breakEnd: "breakEnd",
  endTime: "end",
};

function ScheduleModelModal({ model, onClose, onSave }) {
  const [modelCode, setModelCode] = useState(model?.model_code || "");
  const [modelName, setModelName] = useState(model?.model_name || "");
  const [displayOrder, setDisplayOrder] = useState(model?.display_order ?? 0);
  const [days, setDays] = useState(() => buildEditorDays(model?.days));
  const [saving, setSaving] = useState(false);

  const updateDay = (dayOfWeek, patch) => {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  };

  // Turning a day on copies the times from the closest earlier working day,
  // so building Mon–Fri only means typing Monday.
  const toggleWorking = (dayOfWeek, working) => {
    setDays((prev) => {
      const target = prev.find((d) => d.dayOfWeek === dayOfWeek);
      const isBlank = TIME_FIELDS.every((f) => !target[f]);
      let copyFrom = null;
      if (working && isBlank) {
        copyFrom = [...prev]
          .reverse()
          .find((d) => d.dayOfWeek < dayOfWeek && d.working && d.startTime && d.endTime)
          || prev.find((d) => d.working && d.startTime && d.endTime);
      }
      return prev.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        if (!copyFrom) return { ...d, working };
        return {
          ...d,
          working,
          startTime: copyFrom.startTime,
          breakStart: copyFrom.breakStart,
          breakEnd: copyFrom.breakEnd,
          endTime: copyFrom.endTime,
        };
      });
    });
  };

  const copyFirstToAll = () => {
    const source = days.find((d) => d.working && d.startTime && d.endTime);
    if (!source) {
      toastWarning("Fill in one working day first.", "Schedule Model");
      return;
    }
    setDays((prev) =>
      prev.map((d) =>
        d.working
          ? {
              ...d,
              startTime: source.startTime,
              breakStart: source.breakStart,
              breakEnd: source.breakEnd,
              endTime: source.endTime,
            }
          : d,
      ),
    );
  };

  const workingDays = days.filter((d) => d.working);
  const dayErrors = useMemo(
    () => new Map(days.filter((d) => d.working).map((d) => [d.dayOfWeek, validateScheduleDay(d)])),
    [days],
  );
  const hasErrors = [...dayErrors.values()].some(Boolean);
  const weeklyHours = computeScheduledWeeklyHours(workingDays);

  const handleSave = async () => {
    if (!modelCode.trim() || !modelName.trim()) {
      toastWarning("Enter a code and a name.", "Schedule Model");
      return;
    }
    if (!workingDays.length) {
      toastWarning("Pick at least one working day.", "Schedule Model");
      return;
    }
    if (hasErrors) {
      toastWarning("Fix the days marked in red first.", "Schedule Model");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        modelId: model?.model_id || null,
        modelCode,
        modelName,
        displayOrder,
        days: workingDays.map(({ dayOfWeek, startTime, breakStart, breakEnd, endTime }) => ({
          dayOfWeek,
          startTime,
          breakStart,
          breakEnd,
          endTime,
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      dialogClassName="tt-schedule-modal"
      title={model ? "Edit Schedule Model" : "Add Schedule Model"}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </>
      )}
    >
      <div className="tt-schedule-header-fields">
        <label className="tt-modal-field">
          <span className="tt-modal-label">Code</span>
          <Input
            value={modelCode}
            onChange={(event) => setModelCode(event.target.value)}
            placeholder="e.g. FULL_TIME_REGULAR"
            maxLength={30}
          />
        </label>
        <label className="tt-modal-field">
          <span className="tt-modal-label">Name</span>
          <Input
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder="e.g. Full Time (Regular)"
            maxLength={50}
          />
        </label>
        <label className="tt-modal-field tt-schedule-order-field">
          <span className="tt-modal-label">Order</span>
          <Input
            type="number"
            value={displayOrder}
            onChange={(event) => setDisplayOrder(event.target.value)}
          />
        </label>
      </div>

      <div className="tt-schedule-grid-head">
        <span className="tt-modal-label">Working Days</span>
        <button type="button" className="tt-schedule-copy-btn" onClick={copyFirstToAll}>
          Copy first day to all working days
        </button>
      </div>

      <div className="tt-schedule-grid-scroll">
        <table className="tt-schedule-grid">
          <thead>
            <tr>
              <th>Day</th>
              <th>Clock In</th>
              <th>Break Start</th>
              <th>Break End</th>
              <th>Clock Out</th>
              <th className="tt-schedule-hours-col">Hours</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const meta = SCHEDULE_DAYS[day.dayOfWeek - 1];
              const error = day.working ? dayErrors.get(day.dayOfWeek) : null;
              const resolved = day.working && !error ? resolveScheduleDay(day) : null;
              return (
                <tr
                  key={day.dayOfWeek}
                  className={`${day.working ? "" : "is-rest"} ${error ? "has-error" : ""}`}
                >
                  <td>
                    <label className="tt-schedule-day-toggle">
                      <input
                        type="checkbox"
                        checked={day.working}
                        onChange={(event) => toggleWorking(day.dayOfWeek, event.target.checked)}
                      />
                      <span>{meta.label}</span>
                    </label>
                  </td>
                  {TIME_FIELDS.map((field) => {
                    const nextDay = resolved?.[TIME_FIELD_TO_RESOLVED[field]] >= 24 * 60;
                    return (
                      <td key={field}>
                        <input
                          type="time"
                          className="tt-modal-input tt-schedule-time"
                          value={day[field]}
                          disabled={!day.working}
                          onChange={(event) => updateDay(day.dayOfWeek, { [field]: event.target.value })}
                          aria-label={`${meta.label} ${field}`}
                        />
                        {nextDay && <span className="tt-schedule-nextday">next day</span>}
                      </td>
                    );
                  })}
                  <td className="tt-schedule-hours-col">
                    {!day.working && <span className="tt-setup-muted">Rest day</span>}
                    {day.working && error && <span className="tt-schedule-error">{error}</span>}
                    {day.working && !error && computeScheduledDayHours(day).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Weekly total</td>
              <td className="tt-schedule-hours-col">{weeklyHours.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="tt-setup-hint tt-schedule-note">
        All times are Central Time (Dallas). Clock-in has a 10-minute grace period; after that,
        each hour late costs 0.5 hr for 11–45 min and 1 hr for 46–59 min. The break is deducted
        only after the first half of the day&apos;s hours, so half
        days keep their full time (leave both break times empty for no break). Work after Clock
        Out counts as overtime in 30-minute blocks.
        For night shifts, a time earlier than the one before it counts as the next day (e.g. Clock
        In 22:00, Clock Out 07:00). Daily hours are rounded to the half hour (0–15 min down,
        16–35 min to :30, 36+ min up).
      </p>
    </Modal>
  );
}

function ScheduleModelsSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalModel, setModalModel] = useState(null); // null = closed, {} = new, row = editing

  const reload = useCallback(() => {
    setLoading(true);
    loadScheduleModels()
      .then((data) => setRows(data))
      .catch(() => toastError("Unable to load schedule models.", "Setup"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadScheduleModels()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) toastError("Unable to load schedule models.", "Setup");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleActive = useCallback(
    async (row, nextActive) => {
      const result = await setScheduleModelActive(row.model_id, nextActive);
      if (result.success) {
        toastSuccess(nextActive ? "Model restored." : "Model deactivated.", "Setup");
        reload();
      } else {
        toastError(result.error || "Failed to update model.", "Setup");
      }
    },
    [reload],
  );

  const columns = useMemo(
    () => [
      { key: "model_code", label: "Code", minWidth: 170 },
      { key: "model_name", label: "Name", minWidth: 200 },
      {
        key: "days",
        label: "Working Days",
        minWidth: 160,
        render: (row) =>
          row.days.length ? (
            summarizeScheduleDays(row.days.map((d) => d.dayOfWeek))
          ) : (
            <span className="tt-schedule-error">Not set up</span>
          ),
      },
      {
        key: "weekly_hours",
        label: "Weekly Hours",
        minWidth: 120,
        align: "center",
        render: (row) => Number(row.weekly_hours).toFixed(2),
      },
      { key: "employee_count", label: "Employees", minWidth: 100, align: "center" },
      {
        key: "is_active",
        label: "Status",
        minWidth: 110,
        render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      { key: "edit", label: "Edit", icon: "pen", onClick: (row) => setModalModel(row) },
      {
        key: "deactivate",
        label: "Deactivate",
        icon: "ban",
        type: "danger",
        confirm: true,
        confirmMessage: (row) => `Deactivate "${row.model_name}"?`,
        visible: (row) => row.is_active,
        onClick: (row) => handleToggleActive(row, false),
      },
      {
        key: "restore",
        label: "Restore",
        icon: "rotate-left",
        visible: (row) => !row.is_active,
        onClick: (row) => handleToggleActive(row, true),
      },
    ],
    [handleToggleActive],
  );

  return (
    <>
      <div className="tt-setup-toolbar">
        <RefreshButton onClick={reload} loading={loading} label="Refresh schedule models" />
        <Button type="button" variant="primary" onClick={() => setModalModel({})}>
          <FontAwesomeIcon icon={faPlus} /> Add Model
        </Button>
      </div>

      <TableZ
        data={rows}
        columns={columns}
        rowIdKey="model_id"
        actions={actions}
        loading={loading}
        loadingMessage="Loading schedule models..."
        emptyMessage="No schedule models yet. Add one to get started."
        hideSearch
        hideFooter
      />

      {modalModel && (
        <ScheduleModelModal
          model={modalModel.model_id ? modalModel : null}
          onClose={() => setModalModel(null)}
          onSave={async (formData) => {
            const result = await saveScheduleModel(formData);
            if (result.success) {
              if (result.warning) toastWarning(result.warning, "Setup");
              else toastSuccess("Schedule model saved.", "Setup");
              setModalModel(null);
              reload();
            } else {
              toastError(result.error || "Failed to save model.", "Setup");
            }
            return result;
          }}
        />
      )}
    </>
  );
}

// ─── Admin Setup: Edit Reasons ──────────────────────────────────

function EditReasonModal({ reason, onClose, onSave }) {
  const [statusCode, setStatusCode] = useState(reason?.status_code || "");
  const [statusName, setStatusName] = useState(reason?.status_name || "");
  const [displayOrder, setDisplayOrder] = useState(reason?.display_order ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        statusId: reason?.status_id || null,
        statusCode,
        statusName,
        displayOrder,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      title={reason ? "Edit Reason" : "Add Reason"}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </>
      )}
    >
      <label className="tt-modal-field">
        <span className="tt-modal-label">Code</span>
        <Input
          value={statusCode}
          onChange={(event) => setStatusCode(event.target.value)}
          placeholder="e.g. FORGOT_CLOCK_OUT"
        />
      </label>
      <label className="tt-modal-field">
        <span className="tt-modal-label">Name</span>
        <Input
          value={statusName}
          onChange={(event) => setStatusName(event.target.value)}
          placeholder="e.g. Forgot to clock out"
        />
      </label>
      <label className="tt-modal-field">
        <span className="tt-modal-label">Display Order</span>
        <Input
          type="number"
          value={displayOrder}
          onChange={(event) => setDisplayOrder(event.target.value)}
        />
      </label>
    </Modal>
  );
}

function EditReasonsSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalReason, setModalReason] = useState(null); // null = closed, {} = new, row = editing

  const reload = useCallback(() => {
    setLoading(true);
    loadEditReasonsAdmin()
      .then((data) => setRows(data))
      .catch(() => toastError("Unable to load edit reasons.", "Setup"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadEditReasonsAdmin()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) toastError("Unable to load edit reasons.", "Setup");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleActive = useCallback(
    async (row, nextActive) => {
      const result = await setEditReasonActive(row.status_id, nextActive);
      if (result.success) {
        toastSuccess(nextActive ? "Reason restored." : "Reason deactivated.", "Setup");
        reload();
      } else {
        toastError(result.error || "Failed to update reason.", "Setup");
      }
    },
    [reload],
  );

  const columns = useMemo(
    () => [
      { key: "status_code", label: "Code", minWidth: 160 },
      { key: "status_name", label: "Name", minWidth: 220 },
      { key: "display_order", label: "Order", minWidth: 90, align: "center" },
      {
        key: "is_active",
        label: "Status",
        minWidth: 120,
        render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} />,
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      { key: "edit", label: "Edit", icon: "pen", onClick: (row) => setModalReason(row) },
      {
        key: "deactivate",
        label: "Deactivate",
        icon: "ban",
        type: "danger",
        confirm: true,
        confirmMessage: (row) => `Deactivate "${row.status_name}"?`,
        visible: (row) => row.is_active,
        onClick: (row) => handleToggleActive(row, false),
      },
      {
        key: "restore",
        label: "Restore",
        icon: "rotate-left",
        visible: (row) => !row.is_active,
        onClick: (row) => handleToggleActive(row, true),
      },
    ],
    [handleToggleActive],
  );

  return (
    <>
      <div className="tt-setup-toolbar">
        <RefreshButton onClick={reload} loading={loading} label="Refresh edit reasons" />
        <Button type="button" variant="primary" onClick={() => setModalReason({})}>
          <FontAwesomeIcon icon={faPlus} /> Add Reason
        </Button>
      </div>

      <TableZ
        data={rows}
        columns={columns}
        rowIdKey="status_id"
        actions={actions}
        loading={loading}
        loadingMessage="Loading reasons..."
        emptyMessage="No edit reasons configured."
        hideSearch
        hideFooter
      />

      {modalReason && (
        <EditReasonModal
          reason={modalReason.status_id ? modalReason : null}
          onClose={() => setModalReason(null)}
          onSave={async (formData) => {
            const result = await saveEditReason(formData);
            if (result.success) {
              toastSuccess("Reason saved.", "Setup");
              setModalReason(null);
              reload();
            } else {
              toastError(result.error || "Failed to save reason.", "Setup");
            }
            return result;
          }}
        />
      )}
    </>
  );
}

// ─── Approvals ──────────────────────────────────────────────────

function ApprovalActionModal({ mode, row, onClose, onSubmit }) {
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const isReturn = mode === "return";
  // Returning an already-approved step undoes the approval, so the dialog
  // says so plainly rather than looking like an ordinary Return.
  const isUndoApproval =
    isReturn && String(row?.stage_status_name || "").toLowerCase() === "approved";
  const canSubmit = !saving && (!isReturn || comments.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit(comments);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show
      onHide={onClose}
      title={
        isUndoApproval
          ? "Return Approved Timesheet"
          : isReturn
            ? "Return Timesheet"
            : "Approve Timesheet"
      }
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={isReturn ? "danger" : "primary"}
            onClick={handleSubmit}
            loading={saving}
            disabled={!canSubmit}
          >
            {isReturn ? "Return" : "Approve"}
          </Button>
        </>
      )}
    >
      <p className="mb-2">
        {row.requestor_name}&apos;s timesheet for {row.week_start_date} – {row.week_end_date}
      </p>
      {isUndoApproval && (
        <p className="tt-approval-undo-warning">
          This timesheet is already approved. Returning it undoes the approval and
          unlocks the week so the employee can make changes and submit again.
        </p>
      )}
      <label className="tt-modal-field">
        <span className="tt-modal-label">{isReturn ? "Reason for return" : "Comment (optional)"}</span>
        <textarea
          className="tt-modal-textarea"
          rows="3"
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          placeholder={isReturn ? "Explain what needs to be corrected..." : "Optional comment..."}
        />
      </label>
    </Modal>
  );
}

const APPROVAL_STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "returned", label: "Returned" },
  { key: "all", label: "All" },
];

/** A week of logs with the hours breakdown — same numbers as the Logs Summary panel. */
function WeekLogsDetail({ logs, weeklyHoursTarget, remarks }) {
  const { total, overtime, regular } = summarizeLogHours(logs);
  return (
    <>
      <table className="tt-approval-detail-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Clocked In</th>
            <th>Clocked Out</th>
            <th>Hours</th>
            <th>Overtime</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={5} className="tt-approval-detail-empty">No logs recorded for this week.</td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.log_id}>
                <td>{formatSheetDay(log.clock_in_date)}</td>
                <td>{log.clock_in_time ? formatSheetDateTime(log.clock_in_date, log.clock_in_time) : "--"}</td>
                <td>{log.clock_out_time ? formatSheetDateTime(log.clock_out_date, log.clock_out_time) : "--"}</td>
                <td>{log.total_hours != null ? Number(log.total_hours).toFixed(2) : "--"}</td>
                <td>{Number(log.overtime_hours || 0).toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="tt-approval-detail-summary">
        <span><strong>Scheduled:</strong> {Number(weeklyHoursTarget || 0).toFixed(2)} hrs</span>
        <span><strong>Regular:</strong> {regular.toFixed(2)} hrs</span>
        <span><strong>Overtime:</strong> {overtime.toFixed(2)} hrs</span>
        <span><strong>Total:</strong> {total.toFixed(2)} hrs</span>
      </div>
      <p className="tt-timezone-note">All times in {APP_TIMEZONE_LABEL}</p>

      <div className="tt-approval-detail-remarks">
        <span className="tt-approval-detail-remarks-label">Remarks / Notes:</span>
        <p className="tt-approval-detail-remarks-text">{remarks || "No remarks provided."}</p>
      </div>
    </>
  );
}

function ApprovalDetailPanel({ row }) {
  const [logs, setLogs] = useState([]);
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState(40);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSubmissionLogs(row.submission_id)
      .then((data) => {
        if (!cancelled) {
          setLogs(data.logs || []);
          setWeeklyHoursTarget(Number(data.weeklyHoursTarget) || 40);
        }
      })
      .catch(() => {
        if (!cancelled) toastError("Unable to load logs.", "Approvals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.submission_id]);

  if (loading) {
    return <div className="tt-approval-detail-loading">Loading logs...</div>;
  }

  return (
    <div className="tt-approval-detail">
      <WeekLogsDetail logs={logs} weeklyHoursTarget={weeklyHoursTarget} remarks={row.remarks} />
    </div>
  );
}

function ApprovalsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDateInputRef = useRef(null);
  const [statusTab, setStatusTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null); // null | { mode, row }
  const [expandedRowId, setExpandedRowId] = useState(null);
  // Bumped on refresh so an open detail panel reloads.
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Follow-ups across ALL weeks, for the "Awaiting Your Approval" KPI.
  const [followUps, setFollowUps] = useState({ needsAction: [], waitingOnEmployee: [] });
  const [followUpsOpen, setFollowUpsOpen] = useState(false);

  const weekRange = useMemo(() => {
    const now = getAppTodayDate();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + Math.round(weekOffset) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const formatDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return {
      start: monday,
      end: sunday,
      fullLabel: `Approvals for ${formatDate(monday)} - ${formatDate(sunday)}`,
    };
  }, [weekOffset]);

  const reload = useCallback(() => {
    setLoading(true);
    loadApprovalQueue(toDateStr(weekRange.start))
      .then((data) => setRows(data))
      .catch(() => toastError("Unable to load approvals.", "Approvals"))
      .finally(() => setLoading(false));
  }, [weekRange]);

  useEffect(() => {
    let cancelled = false;
    loadApprovalQueue(toDateStr(weekRange.start))
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) toastError("Unable to load approvals.", "Approvals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekRange]);

  /**
   * Re-count the approver's follow-ups. Informational only, so on failure we
   * keep the last known counts rather than making the KPI disappear.
   */
  const refreshFollowUps = useCallback(async () => {
    try {
      setFollowUps(await loadApprovalFollowUps());
    } catch {
      // informational only
    }
  }, []);

  // Initial load for the KPI. Uses the same promise-callback shape as the
  // approvals table load below, so a slow response can't setState on a
  // component that has already unmounted.
  useEffect(() => {
    let cancelled = false;
    loadApprovalFollowUps()
      .then((data) => {
        if (!cancelled) setFollowUps(data);
      })
      .catch(() => {
        // informational only — keep the last known counts
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (statusTab === "all") return rows;
    return rows.filter((row) => String(row.stage_status_name || "").toLowerCase() === statusTab);
  }, [rows, statusTab]);

  const columns = useMemo(
    () => [
      { key: "requestor_name", label: "Employee", minWidth: 180 },
      {
        key: "total_hours",
        label: "Hours",
        minWidth: 90,
        align: "center",
        render: (row) => Number(row.total_hours || 0).toFixed(2),
      },
      { key: "stage_name", label: "Stage", minWidth: 160 },
      {
        key: "stage_status_name",
        label: "Status",
        minWidth: 130,
        render: (row) => (
          <StatusBadge status={String(row.stage_status_name || "").toLowerCase()} label={row.stage_status_name} />
        ),
      },
      {
        key: "remarks",
        label: "Remarks",
        minWidth: 200,
        render: (row) => row.remarks || "--",
      },
    ],
    [],
  );

  const handleAction = useCallback(
    async (comments) => {
      const { mode, row } = actionModal;
      const result = mode === "approve"
        ? await approveTimesheetStage(row.stageinstance_id, comments)
        : await returnTimesheetStage(row.stageinstance_id, comments);

      if (result.success) {
        toastSuccess(mode === "approve" ? "Timesheet approved." : "Timesheet returned.", "Approvals");
        setActionModal(null);
        reload();
        // The acted-on row leaves the KPI, so re-count it.
        refreshFollowUps();
      } else {
        toastError(result.error || "Failed to process action.", "Approvals");
      }
    },
    [actionModal, reload, refreshFollowUps],
  );

  const actions = useMemo(
    () => [
      {
        key: "approve",
        label: "Approve",
        icon: "check",
        visible: (row) => row.is_actionable,
        onClick: (row) => setActionModal({ mode: "approve", row }),
      },
      {
        key: "return",
        label: "Return",
        icon: "ban",
        visible: (row) => Boolean(row.can_return),
        onClick: (row) => setActionModal({ mode: "return", row }),
      },
    ],
    [],
  );

  const goPreviousWeek = useCallback(() => {
    setLoading(true);
    setWeekOffset((prev) => prev - 1);
  }, []);
  const goNextWeek = useCallback(() => {
    setLoading(true);
    setWeekOffset((prev) => prev + 1);
  }, []);
  const goThisWeek = useCallback(() => {
    setLoading(true);
    setWeekOffset(0);
  }, []);
  const goToWeekOfDate = useCallback((dateStr) => {
    setLoading(true);
    setWeekOffset(computeWeekOffsetFromToday(dateStr));
  }, []);

  const refreshApprovals = useCallback(() => {
    reload();
    setRefreshNonce((n) => n + 1);
    // The KPI spans all weeks, so it has to be re-counted alongside this week.
    refreshFollowUps();
  }, [reload, refreshFollowUps]);

  return (
    <div className="tt-setup-page-body">
      <div className="tt-table-header">
        <div className="tt-table-header-left">
          <button type="button" onClick={goPreviousWeek} className="tt-nav-arrow" aria-label="Previous week">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button type="button" onClick={goNextWeek} className="tt-nav-arrow" aria-label="Next week">
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div
            className="tt-week-picker"
            onClick={() => weekDateInputRef.current?.showPicker?.()}
          >
            <h3 className="tt-table-title">{weekRange.fullLabel}</h3>
            <input
              ref={weekDateInputRef}
              type="date"
              className="tt-week-picker-input"
              value={toDateStr(weekRange.start)}
              onChange={(event) => goToWeekOfDate(event.target.value)}
              aria-label="Jump to the week containing this date"
            />
          </div>
        </div>
        <div className="tt-table-header-right">
          {(followUps.needsAction.length > 0 || followUps.waitingOnEmployee.length > 0) && (
            <KpiButton
              count={followUps.needsAction.length}
              label="awaiting your approval"
              subLabel={
                followUps.waitingOnEmployee.length
                  ? `+${followUps.waitingOnEmployee.length} waiting on employee`
                  : null
              }
              onClick={() => setFollowUpsOpen(true)}
            />
          )}
          <RefreshButton onClick={refreshApprovals} loading={loading} label="Refresh approvals" />
          <button type="button" onClick={goThisWeek} className="tt-pill-week">
            This Week
          </button>
        </div>
      </div>

      <div className="tt-setup-subtabs">
        {APPROVAL_STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tt-setup-subtab ${statusTab === tab.key ? "active" : ""}`}
            onClick={() => setStatusTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tt-setup-content-scroll">
        <TableZ
          data={filteredRows}
          columns={columns}
          rowIdKey="stageinstance_id"
          actions={actions}
          loading={loading}
          loadingMessage="Loading approvals..."
          emptyMessage={`No ${statusTab === "all" ? "" : `${statusTab} `}timesheets for this week.`}
          hideSearch
          hideFooter
          selectedRowId={expandedRowId}
          onRowClick={(row) =>
            setExpandedRowId((prev) => (prev === row.stageinstance_id ? null : row.stageinstance_id))
          }
          renderDetail={(row) => (
            <ApprovalDetailPanel key={`${row.stageinstance_id}-${refreshNonce}`} row={row} />
          )}
        />
      </div>

      {actionModal && (
        <ApprovalActionModal
          mode={actionModal.mode}
          row={actionModal.row}
          onClose={() => setActionModal(null)}
          onSubmit={handleAction}
        />
      )}

      {followUpsOpen && (
        <Modal show onHide={() => setFollowUpsOpen(false)} title="Approvals Follow-up">
          <p className="tt-kpi-modal-hint">
            These timesheets need your attention across all weeks. Pick one to open it.
          </p>
          {[
            {
              key: "needs",
              title: "Needs your approval",
              rows: followUps.needsAction,
              empty: "Nothing waiting for you.",
            },
            {
              key: "waiting",
              title: "Waiting on employee (Returned / Recalled)",
              rows: followUps.waitingOnEmployee,
              empty: "Nothing waiting on employees.",
            },
          ].map((group) => (
            <section key={group.key} className="tt-kpi-group">
              <h4 className="tt-kpi-group-title">
                {group.title} ({group.rows.length})
              </h4>
              {group.rows.length ? (
                <ul className="tt-kpi-list">
                  {group.rows.map((row) => (
                    <KpiListItem
                      key={row.stageinstance_id}
                      title={row.requestor_name}
                      meta={`${formatWeekLabel(row.week_start_date, row.week_end_date)} · ${Number(row.total_hours || 0).toFixed(2)} hrs`}
                      status={row.is_actionable ? "Pending" : row.stage_status_name}
                      onClick={() => {
                        const status = String(row.stage_status_name || "").toLowerCase();
                        setFollowUpsOpen(false);
                        setStatusTab(
                          row.is_actionable ? "pending" : status === "returned" ? "returned" : "all",
                        );
                        goToWeekOfDate(row.week_start_date);
                        setExpandedRowId(row.stageinstance_id);
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <p className="tt-kpi-modal-hint">{group.empty}</p>
              )}
            </section>
          ))}
        </Modal>
      )}
    </div>
  );
}

function TimesheetsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDateInputRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [employeeDetails, setEmployeeDetails] = useState({});
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  // Bumped on refresh so the detail-fetching effect re-runs.
  const [refreshNonce, setRefreshNonce] = useState(0);

  const filteredEmployees = useMemo(
    () => employees.filter((e) => e.name.toLowerCase().includes(employeeSearch.trim().toLowerCase())),
    [employees, employeeSearch],
  );

  const weekRange = useMemo(() => {
    const now = getAppTodayDate();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + Math.round(weekOffset) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const formatDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return {
      start: monday,
      end: sunday,
      fullLabel: `Timesheets for ${formatDate(monday)} - ${formatDate(sunday)}`,
    };
  }, [weekOffset]);

  useEffect(() => {
    let cancelled = false;
    loadTimesheetsForWeek(toDateStr(weekRange.start))
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch(() => {
        if (!cancelled) toastError("Unable to load timesheets.", "Timesheets");
      })
      .finally(() => {
        if (!cancelled) setLoadingEmployees(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekRange]);

  // Fetch detail (logs + target hours) for any newly-selected employee.
  useEffect(() => {
    selectedUserIds.forEach((userId) => {
      if (employeeDetails[userId]) return;
      const employee = employees.find((e) => e.user_id === userId);
      if (!employee) return;
      loadSubmissionLogs(employee.submission_id)
        .then((data) => {
          const logs = data.logs || [];
          const totalHoursRendered = logs.reduce((sum, log) => sum + (Number(log.total_hours) || 0), 0);
          setEmployeeDetails((prev) => ({
            ...prev,
            [userId]: { logs, weeklyHoursTarget: Number(data.weeklyHoursTarget) || 40, totalHoursRendered },
          }));
        })
        .catch(() => {
          toastError(`Unable to load ${employee.name}'s logs.`, "Timesheets");
          setEmployeeDetails((prev) => ({ ...prev, [userId]: { logs: [], weeklyHoursTarget: 0, totalHoursRendered: 0 } }));
        });
    });
  }, [weekRange, employees, selectedUserIds, employeeDetails, refreshNonce]);

  /**
   * Reload the employee list for the visible week. Keeps selections for
   * employees still in the list, and clears cached details so the selected
   * employees' logs are fetched fresh (the details effect refetches anything
   * missing).
   */
  const refreshTimesheets = useCallback(() => {
    setLoadingEmployees(true);
    loadTimesheetsForWeek(toDateStr(weekRange.start))
      .then((data) => {
        setEmployees(data);
        const stillListed = new Set(data.map((e) => e.user_id));
        setSelectedUserIds((prev) => new Set([...prev].filter((id) => stillListed.has(id))));
        setEmployeeDetails({});
        setRefreshNonce((n) => n + 1);
      })
      .catch(() => toastError("Unable to load timesheets.", "Timesheets"))
      .finally(() => setLoadingEmployees(false));
  }, [weekRange]);

  const toggleEmployee = useCallback((userId) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedUserIds((prev) => {
      const allFilteredSelected =
        filteredEmployees.length > 0 && filteredEmployees.every((e) => prev.has(e.user_id));
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredEmployees.forEach((e) => next.delete(e.user_id));
        return next;
      }
      const next = new Set(prev);
      filteredEmployees.forEach((e) => next.add(e.user_id));
      return next;
    });
  }, [filteredEmployees]);

  const goPreviousWeek = useCallback(() => {
    setLoadingEmployees(true);
    setSelectedUserIds(new Set());
    setEmployeeDetails({});
    setWeekOffset((prev) => prev - 1);
  }, []);
  const goNextWeek = useCallback(() => {
    setLoadingEmployees(true);
    setSelectedUserIds(new Set());
    setEmployeeDetails({});
    setWeekOffset((prev) => prev + 1);
  }, []);
  const goThisWeek = useCallback(() => {
    setLoadingEmployees(true);
    setSelectedUserIds(new Set());
    setEmployeeDetails({});
    setWeekOffset(0);
  }, []);
  const goToWeekOfDate = useCallback((dateStr) => {
    setLoadingEmployees(true);
    setSelectedUserIds(new Set());
    setEmployeeDetails({});
    setWeekOffset(computeWeekOffsetFromToday(dateStr));
  }, []);

  const handlePrintPdf = async () => {
    if (selectedUserIds.size === 0) return;
    setGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      let cursorY = 40;
      const pageHeight = doc.internal.pageSize.getHeight();

      // Document header: the week this printout covers (once, top of page 1).
      doc.setFont(undefined, "bold");
      doc.setFontSize(16);
      doc.text(weekRange.fullLabel, 40, cursorY);
      cursorY += 30;

      Array.from(selectedUserIds).forEach((userId) => {
        const detail = employeeDetails[userId];
        const employee = employees.find((e) => e.user_id === userId);
        if (!detail || !employee) return;

        if (cursorY > pageHeight - 100) {
          doc.addPage();
          cursorY = 40;
        }

        // Employee name.
        doc.setFont(undefined, "bold");
        doc.setFontSize(12);
        doc.text(employee.name, 40, cursorY);
        cursorY += 16;

        // Summary: total hours rendered, plus a blank Rate field filled in by hand.
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
        const { total } = summarizeLogHours(detail.logs);
        doc.text(`Total Hours Rendered: ${total.toFixed(2)}   Rate: ____________`, 40, cursorY);
        cursorY += 10;

        autoTable(doc, {
          startY: cursorY,
          head: [["Day", "Clocked In", "Clocked Out", "Hours", "Overtime"]],
          body: detail.logs.map((log) => [
            formatSheetDay(log.clock_in_date),
            log.clock_in_time ? formatSheetDateTime(log.clock_in_date, log.clock_in_time) : "--",
            log.clock_out_time ? formatSheetDateTime(log.clock_out_date, log.clock_out_time) : "--",
            log.total_hours != null ? Number(log.total_hours).toFixed(2) : "--",
            Number(log.overtime_hours || 0).toFixed(2),
          ]),
          margin: { left: 40, right: 40 },
          styles: { fontSize: 9 },
        });

        cursorY = doc.lastAutoTable.finalY + 24;

        cursorY += 16;
      });

      const { dateStr, timeStr } = getAppDateParts();
      const generated = `Generated ${formatSheetDate(dateStr)} ${formatTimeDisplay(timeStr)} · All times in ${APP_TIMEZONE_LABEL}`;
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p += 1) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.text(generated, 40, doc.internal.pageSize.getHeight() - 20);
      }

      doc.save(`timesheets-${toDateStr(weekRange.start)}.pdf`);
    } catch (err) {
      console.error("Timesheet PDF generation failed:", err);
      toastError("Failed to generate PDF.", "Timesheets");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="tt-setup-page-body">
      <div className="tt-table-header">
        <div className="tt-table-header-left">
          <button type="button" onClick={goPreviousWeek} className="tt-nav-arrow" aria-label="Previous week">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button type="button" onClick={goNextWeek} className="tt-nav-arrow" aria-label="Next week">
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div
            className="tt-week-picker"
            onClick={() => weekDateInputRef.current?.showPicker?.()}
          >
            <h3 className="tt-table-title">{weekRange.fullLabel}</h3>
            <input
              ref={weekDateInputRef}
              type="date"
              className="tt-week-picker-input"
              value={toDateStr(weekRange.start)}
              onChange={(event) => goToWeekOfDate(event.target.value)}
              aria-label="Jump to the week containing this date"
            />
          </div>
        </div>
        <div className="tt-table-header-right">
          <RefreshButton
            onClick={refreshTimesheets}
            loading={loadingEmployees}
            label="Refresh timesheets"
          />
          <button
            type="button"
            className="tt-pill-week"
            onClick={goThisWeek}
            disabled={weekOffset === 0}
          >
            This Week
          </button>
          <button
            type="button"
            className="tt-btn-export"
            onClick={handlePrintPdf}
            disabled={selectedUserIds.size === 0 || generatingPdf}
            aria-label="Print PDF"
            title="Print PDF"
          >
            <FontAwesomeIcon icon={faDownload} />
          </button>
        </div>
      </div>

      <div className="tt-timesheets-layout">
        <aside className="tt-timesheets-employee-list">
          {employees.length > 0 && (
            <div className="tt-timesheets-search-wrap">
              <Input
                type="search"
                placeholder="Search employee..."
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
              />
            </div>
          )}

          {employees.length > 0 && (
            <label className="tt-timesheets-employee-item tt-timesheets-select-all">
              <input
                type="checkbox"
                checked={filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedUserIds.has(e.user_id))}
                onChange={toggleSelectAll}
              />
              <span className="tt-timesheets-employee-name">Select All</span>
            </label>
          )}

          {loadingEmployees ? (
            <p className="tt-timesheets-empty">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="tt-timesheets-empty">No timesheets submitted for this week.</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="tt-timesheets-empty">No employees match your search.</p>
          ) : (
            filteredEmployees.map((employee) => (
              <label key={employee.user_id} className="tt-timesheets-employee-item">
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(employee.user_id)}
                  onChange={() => toggleEmployee(employee.user_id)}
                />
                <span className="tt-timesheets-employee-name" title={employee.name}>
                  {employee.name}
                </span>
                <StatusBadge
                  status={String(employee.status_name || "").toLowerCase()}
                  label={employee.status_name}
                  className="tt-timesheets-employee-badge"
                />
              </label>
            ))
          )}
        </aside>

        <div className="tt-timesheets-detail-pane">
          {selectedUserIds.size === 0 ? (
            <p className="tt-timesheets-empty">Select one or more employees to view their timesheet.</p>
          ) : (
            Array.from(selectedUserIds).map((userId) => {
              const employee = employees.find((e) => e.user_id === userId);
              const detail = employeeDetails[userId];
              if (!employee) return null;

              return (
                <div key={userId} className="tt-approval-detail">
                  <h4>{employee.name}</h4>
                  <StatusBadge status={String(employee.status_name || "").toLowerCase()} label={employee.status_name} />
                  {!detail ? (
                    <div className="tt-approval-detail-loading">Loading...</div>
                  ) : (
                    <WeekLogsDetail logs={detail.logs} weeklyHoursTarget={detail.weeklyHoursTarget} remarks={employee.remarks} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function AdminSetupPage() {
  const [subTab, setSubTab] = useState("hours");

  return (
    <div className="tt-setup-page-body">
      <div className="tt-page-header">
        <div className="tt-page-header-text">
          <h1 className="tt-page-title">Setup</h1>
          <p className="tt-page-subtitle">Admin-only configuration for the Time Tracker module.</p>
        </div>
      </div>

      <div className="tt-setup-subtabs">
        <button
          type="button"
          className={`tt-setup-subtab ${subTab === "hours" ? "active" : ""}`}
          onClick={() => setSubTab("hours")}
        >
          Employee Hours
        </button>
        <button
          type="button"
          className={`tt-setup-subtab ${subTab === "models" ? "active" : ""}`}
          onClick={() => setSubTab("models")}
        >
          Schedule Models
        </button>
        <button
          type="button"
          className={`tt-setup-subtab ${subTab === "reasons" ? "active" : ""}`}
          onClick={() => setSubTab("reasons")}
        >
          Edit Reasons
        </button>
      </div>

      <div className="tt-setup-content-scroll">
        {subTab === "hours" && <EmployeeHoursSection />}
        {subTab === "models" && <ScheduleModelsSection />}
        {subTab === "reasons" && <EditReasonsSection />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

/**
 * Shown when the Time Tracker can't load the signed-in user's access.
 *
 * Why this exists: previously a failed load left a blank page — no menu items,
 * and a Clock In button that did nothing when clicked, with no explanation.
 * This gives the user a plain message and a button that actually retries.
 *
 * `onRetry` re-reads the roles and weekly hours target. If the problem was a
 * short network or database blip, the Time Tracker comes back on its own.
 */
function LoadErrorScreen({ onRetry }) {
  return (
    <div className="tt-load-error">
      <div className="tt-load-error-card">
        <FontAwesomeIcon icon={faClock} className="tt-load-error-icon" />
        <h2 className="tt-load-error-title">We couldn&apos;t load your Time Tracker</h2>
        <p className="tt-load-error-text">
          Something went wrong while loading your access. Please try again — this
          is usually temporary.
        </p>
        <button type="button" className="tt-load-error-btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

export default function TimeTrackerView({ initialData }) {
  const [roles, setRoles] = useState(initialData?.roles || []);
  const [orgRoles, setOrgRoles] = useState(initialData?.orgRoles || []);

  // "ok" shows the Time Tracker, "load-error" shows the retry screen.
  // The server sends "load-error" when the roles/hours-target read fails, and
  // "no-session" never reaches here because the page redirects to login.
  const [loadStatus, setLoadStatus] = useState(
    initialData?.status === "load-error" ? "load-error" : "ok",
  );

  // The "Unsubmitted Weeks" KPI list modal.
  const [missedModalOpen, setMissedModalOpen] = useState(false);

  const permissions = useMemo(
    () => getTimeTrackerPermissions(roles, orgRoles),
    [roles, orgRoles],
  );
  const {
    currentTime,
    activeNav,
    setActiveNav,
    navItems,
    weekRange,
    weekRows,
    goPreviousWeek,
    goToWeekOfDate,

    goNextWeek,
    goThisWeek,
    weekOffset,
    weekLoading,
    refreshing,
    refreshLogsPage,
    missedWeeks,
    totalHours,
    regularHours,
    overtimeHours,
    weeklyHoursTarget,
    hasHoursTarget,
    schedule,
    refreshHoursTarget,
    clockedIn,
    lastClockIn,
    handleClockToggle,
    handleSaveEdit,
    toggling,
    submissionStatus,
    remarks,
    setRemarks,
    isSubmissionLocked,
    submittingTimesheet,
    handleSubmitTimesheet,
    recallingTimesheet,
    handleRecallTimesheet,
  } = useLogsPage(initialData, permissions);

  // Re-read the user's roles and weekly hours target from the server.
  //
  // Why this exists: a temporary database or network problem used to leave the
  // page showing nothing at all, with a Clock In button that silently did
  // nothing. Refreshing both together means the menu items and the Clock In
  // button recover in the same moment, and a genuine failure shows a message
  // the user can act on instead of a blank screen.
  const reloadAccess = useCallback(async () => {
    try {
      const data = await loadCurrentUserPermissionsData();
      if (data.status === "load-error") {
        setLoadStatus("load-error");
        return;
      }
      setRoles(data.roles || []);
      setOrgRoles(data.orgRoles || []);
      // Unlock Clock In at the same time as the tabs, not a moment later.
      await refreshHoursTarget();
      setLoadStatus("ok");
    } catch {
      setLoadStatus("load-error");
    }
  }, [refreshHoursTarget]);

  // Recover when the user comes back to this tab. This covers the common case
  // of signing in again in another tab, or a network blip clearing up.
  useEffect(() => {
    const onFocus = () => reloadAccess();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadAccess]);

  // Keep sidebar tab visibility in sync with role changes made elsewhere
  // (e.g. User Master Setup). Refetches whenever the Logs tab becomes
  // active, skipping the first render since initialData is already fresh.
  const isFirstPermissionsRender = useRef(true);
  useEffect(() => {
    if (isFirstPermissionsRender.current) {
      isFirstPermissionsRender.current = false;
      return;
    }
    if (activeNav !== "logs") return;

    let cancelled = false;
    // Ignore refetch failures — keep showing the current (stale) permissions.
    loadCurrentUserPermissionsData()
      .then((data) => {
        if (cancelled || data.status === "load-error") return;
        setRoles(data.roles || []);
        setOrgRoles(data.orgRoles || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeNav]);

  const [editingRow, setEditingRow] = useState(null);
  const workedDays = weekRows.filter((row) => row.hasData).length;

  // All hooks above run on every render, so the retry screen can be returned
  // here without breaking the Rules of Hooks.
  if (loadStatus === "load-error") {
    return <LoadErrorScreen onRetry={reloadAccess} />;
  }

  return (
    <div className="tt-app-layout">
      {/* Sidebar */}
      <Sidebar
        currentTime={currentTime}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        clockedIn={clockedIn}
        lastClockIn={lastClockIn}
        navItems={navItems}
        onToggle={handleClockToggle}
        disabled={toggling}
        hasHoursTarget={hasHoursTarget}
      />

      {/* Main Content */}
      <main className="tt-main">
        {activeNav === "logs" && (
          <>
            <TimeLogTable
              weekRange={weekRange}
              weekRows={weekRows}
              onPrevWeek={goPreviousWeek}
              onNextWeek={goNextWeek}
              onThisWeek={goThisWeek}
              onPickWeek={goToWeekOfDate}
              weekOffset={weekOffset}
              loading={weekLoading}
              onEdit={setEditingRow}
              onRefresh={refreshLogsPage}
              refreshing={refreshing}
              headerExtra={
                missedWeeks.length > 0 ? (
                  <KpiButton
                    count={missedWeeks.length}
                    label={missedWeeks.length === 1 ? "unsubmitted week" : "unsubmitted weeks"}
                    onClick={() => setMissedModalOpen(true)}
                  />
                ) : null
              }
            />
          </>
        )}

        {activeNav === "timesheets" && <TimesheetsPage />}

        {activeNav === "approvals" && <ApprovalsPage />}

        {activeNav === "setup" && <AdminSetupPage />}
      </main>

      {activeNav === "logs" && (
        <TimesheetSummary
          weekRange={weekRange}
          totalHours={totalHours}
          regularHours={regularHours}
          overtimeHours={overtimeHours}
          weeklyHoursTarget={weeklyHoursTarget}
          schedule={schedule}
          workedDays={workedDays}
          submissionStatus={submissionStatus}
          remarks={remarks}
          onRemarksChange={setRemarks}
          isRequestor={permissions.isRequestor}
          isSubmissionLocked={isSubmissionLocked}
          submitting={submittingTimesheet}
          onSubmit={handleSubmitTimesheet}
          canRecall={Boolean(submissionStatus.canRecall)}
          recalling={recallingTimesheet}
          onRecall={handleRecallTimesheet}
        />
      )}

      <EditEntryModal
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={async (formData) => {
          const result = await handleSaveEdit(formData);
          if (result.success) setEditingRow(null);
          return result;
        }}
      />

      {/* "Unsubmitted Weeks" KPI list. Clicking a week jumps the table to it
          so the employee can review the logs and submit right away. */}
      {missedModalOpen && (
        <Modal show onHide={() => setMissedModalOpen(false)} title="Unsubmitted Weeks">
          <p className="tt-kpi-modal-hint">
            These past weeks have logs but haven&apos;t been submitted for approval. Pick one to
            open it.
          </p>
          <ul className="tt-kpi-list">
            {missedWeeks.map((week) => (
              <KpiListItem
                key={week.weekStart}
                title={formatWeekLabel(week.weekStart, week.weekEnd)}
                meta={`${week.daysLogged} day${week.daysLogged === 1 ? "" : "s"} logged · ${week.totalHours.toFixed(2)} hrs`}
                status={week.statusName}
                onClick={() => {
                  setMissedModalOpen(false);
                  goToWeekOfDate(week.weekStart);
                }}
              />
            ))}
          </ul>
        </Modal>
      )}

      {/* Modal-style loading overlay for clock in / clock out. Non-blocking —
          users can keep clicking / working behind it while processing. */}
      {toggling && (
        <LoadingPanel
          message={clockedIn ? "Clocking out..." : "Clocking in..."}
        />
      )}
    </div>
  );
}