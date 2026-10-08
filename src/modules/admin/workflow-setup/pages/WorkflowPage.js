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
  const data = await loadWorkflowOverviewData();

  return <WorkflowView {...data} />;
}