import { loadDealerMasterSetupData } from "../data/dealerMasterSetup.actions.js";
import { DEALER_ADMIN_NO_ACCESS, getDealerAdminSession } from "../data/dealerAdminAccess.js";
import DealerMasterSetupView from "./DealerMasterSetupView.jsx";
import { loadPsbContact } from "@/modules/dealer/data/psbContact";

/**
 * Server page for Dealer Master Setup.
 *
 * Only users with the admin-enroll or admin-master role see the dealers;
 * everyone else gets a short notice. Every server action checks the role
 * again on its own.
 */
export default async function DealerMasterSetupPage() {
  if (!(await getDealerAdminSession())) {
    return (
      <main className="container py-4">
        <h4 className="mb-2">Dealer Master Setup</h4>
        <p className="text-muted mb-0">{DEALER_ADMIN_NO_ACCESS}</p>
      </main>
    );
  }

  const [{ dealers }, psbContact] = await Promise.all([loadDealerMasterSetupData(), loadPsbContact()]);
  return <DealerMasterSetupView dealers={dealers} supportEmail={psbContact?.email || ""} />;
}
