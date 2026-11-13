import { loadApplicationSetupData } from "../data/applicationSetup.actions.js";
import ApplicationSetupView from "./ApplicationSetupView.jsx";

function parseAppId(value) {
  if (value === undefined || value === null || value === "") return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : String(value);
}

export default async function ApplicationSetupPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  let applications, roles;
  try {
    ({ applications, roles } = await loadApplicationSetupData());
  } catch (error) {
    return (
      <main className="container py-4">
        <div className="notice-banner notice-banner-danger mb-0">
          <strong className="d-block">Can&apos;t open Application Setup.</strong>
          <span>{error?.message || "Unknown error"}</span>
        </div>
      </main>
    );
  }
  const initialSelectedAppId = parseAppId(resolvedSearchParams?.app) ?? applications[0]?.app_id ?? null;

  return (
    <ApplicationSetupView
      applications={applications}
      roles={roles}
      initialSelectedAppId={initialSelectedAppId}
    />
  );
}
