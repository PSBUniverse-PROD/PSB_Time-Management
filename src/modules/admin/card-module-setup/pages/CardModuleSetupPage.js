import { loadCardModuleSetupData } from "../data/cardModuleSetup.actions.js";
import CardModuleSetupView from "./CardModuleSetupView.jsx";

function parseAppId(value) {
  if (value === undefined || value === null || value === "") return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : String(value);
}

export default async function CardModuleSetupPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  let applications, cardGroups, cards;
  try {
    ({ applications, cardGroups, cards } = await loadCardModuleSetupData());
  } catch (error) {
    return (
      <main className="container py-4">
        <div className="notice-banner notice-banner-danger mb-0">
          <strong className="d-block">Can&apos;t open Card Module Setup.</strong>
          <span>{error?.message || "Unknown error"}</span>
        </div>
      </main>
    );
  }
  const initialSelectedAppId = parseAppId(resolvedSearchParams?.app) ?? applications[0]?.app_id ?? null;

  return (
    <CardModuleSetupView
      applications={applications}
      cardGroups={cardGroups}
      cards={cards}
      initialSelectedAppId={initialSelectedAppId}
    />
  );
}
