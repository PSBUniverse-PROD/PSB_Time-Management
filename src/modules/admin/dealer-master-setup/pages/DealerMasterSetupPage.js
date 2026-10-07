import { loadDealerMasterSetupData, loadUsStatesAction } from "../data/dealerMasterSetup.actions.js";
import DealerMasterSetupView from "./DealerMasterSetupView.jsx";

/**
 * Server page for Dealer Master Setup.
 *
 * Fetches the full dealer list on the server and hands it to the client
 * view, which stages any edits locally until Save Batch is pressed.
 */
export default async function DealerMasterSetupPage() {
  const [{ dealers }, states] = await Promise.all([loadDealerMasterSetupData(), loadUsStatesAction()]);
  return <DealerMasterSetupView dealers={dealers} states={states} />;
}
