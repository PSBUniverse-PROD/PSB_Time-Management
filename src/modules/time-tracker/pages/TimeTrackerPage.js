/**
 * Server Component — TimeTrackerPage.js
 *
 * Loads the current week's logs and clock status for the logged-in user,
 * then hands that data to the client-side TimeTrackerView as `initialData`.
 *
 * When there is no valid session, `loadTimeTrackerData` reports
 * `status: "no-session"` and this page sends the user to the login screen
 * instead of rendering an empty Time Tracker they cannot use.
 */
import { redirect } from "next/navigation";
import TimeTrackerView from "./TimeTrackerView";
import { loadTimeTrackerData } from "../data/timeTracker.actions";
import { getAppTodayDate } from "../data/timeTracker.data";

export const dynamic = "force-dynamic";

/** Monday of the week containing `date`, at local midnight. */
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local date as YYYY-MM-DD. */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function TimeTrackerPage() {
  // The first render uses Dallas "today", not the server's clock (Vercel runs on UTC).
  const monday = getMondayOfWeek(getAppTodayDate());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const initialData = await loadTimeTrackerData(toDateStr(monday), toDateStr(sunday));

  // The sign-in expired or was never valid. `/login` is rewritten to the
  // PSBUniverse login page, which reads `redirect` to send the user back to
  // the Time Tracker after they sign in again.
  if (initialData.status === "no-session") {
    redirect("/login?redirect=/time-tracker");
  }

  return <TimeTrackerView initialData={initialData} />;
}
