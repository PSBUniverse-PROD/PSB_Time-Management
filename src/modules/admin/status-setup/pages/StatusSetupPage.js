import { loadStatusSetupData } from "../data/statusSetup.actions.js";
import StatusSetupView from "./StatusSetupView.jsx";

export default async function StatusSetupPage() {
  const { statuses } = await loadStatusSetupData();
  return <StatusSetupView statuses={statuses} />;
}
