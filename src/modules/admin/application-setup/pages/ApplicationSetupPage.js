import { loadApplicationSetupData } from "../data/applicationSetup.actions.js";
import ApplicationSetupView from "./ApplicationSetupView.jsx";

function parseAppId(value) {
  if (value === undefined || value === null || value === "") return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : String(value);
}

export default async function ApplicationSetupPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const { applications, roles } = await loadApplicationSetupData();
  const initialSelectedAppId = parseAppId(resolvedSearchParams?.app) ?? applications[0]?.app_id ?? null;

  return (
    <ApplicationSetupView
      applications={applications}
      roles={roles}
      initialSelectedAppId={initialSelectedAppId}
    />
  );
}
