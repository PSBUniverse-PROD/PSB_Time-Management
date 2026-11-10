import OrgChartView from "./OrgChartView";
import { loadOrgChartData } from "../data/orgChart.actions.js";

export const dynamic = "force-dynamic";

export default async function OrgChartPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  let companies, positions, currentUserId, canEdit, error;

  try {
    ({ companies, positions, currentUserId, canEdit } = await loadOrgChartData());
  } catch (e) {
    error = e;
  }

  if (error) {
    return (
      <main className="container py-4">
        <div className="notice-banner notice-banner-danger mb-0">
          <strong className="d-block">Failed to load the org chart.</strong>
          <span>{error?.message || "Unknown error"}</span>
        </div>
      </main>
    );
  }

  return (
    <OrgChartView
      companies={companies}
      positions={positions}
      initialCompanyId={resolvedSearchParams?.company ?? null}
      focusMe={resolvedSearchParams?.focus === "me"}
      currentUserId={currentUserId ?? null}
      canEdit={Boolean(canEdit)}
    />
  );
}
