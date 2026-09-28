import { loadCardModuleSetupData } from "../data/cardModuleSetup.actions.js";
import CardModuleSetupView from "./CardModuleSetupView.jsx";

function parseAppId(value) {
  if (value === undefined || value === null || value === "") return null;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : String(value);
}

export default async function CardModuleSetupPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const { applications, cardGroups, cards } = await loadCardModuleSetupData();
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
