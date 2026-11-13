import { loadStatusSetupData } from "../data/statusSetup.actions.js";
import StatusSetupView from "./StatusSetupView.jsx";

export default async function StatusSetupPage() {
  let statuses;
  try {
    ({ statuses } = await loadStatusSetupData());
  } catch (error) {
    return (
      <main className="container py-4">
        <div className="notice-banner notice-banner-danger mb-0">
          <strong className="d-block">Can&apos;t open Status Setup.</strong>
          <span>{error?.message || "Unknown error"}</span>
        </div>
      </main>
    );
  }
  return <StatusSetupView statuses={statuses} />;
}
