/**
 * Server Component — WorkflowPage.js
 *
 * Consolidated entry point for all workflow configuration tables.
 * Loads every table once and passes the data to the tabbed WorkflowView.
 */
import WorkflowView from "./WorkflowView";
import { loadWorkflowOverviewData } from "../data/workflow.actions";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  let data;
  try {
    data = await loadWorkflowOverviewData();
  } catch (error) {
    return (
      <main className="container py-4">
        <div className="notice-banner notice-banner-danger mb-0">
          <strong className="d-block">Can&apos;t open Workflow Setup.</strong>
          <span>{error?.message || "Unknown error"}</span>
        </div>
      </main>
    );
  }

  return <WorkflowView {...data} />;
}