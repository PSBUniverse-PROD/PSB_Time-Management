import { redirect } from "next/navigation";
import DealerAccountWorkspace from "../components/DealerAccountWorkspace";
import { loadDealerAccountData } from "../data/dealerPortal.actions";
import { loadUsStatesAction } from "@/modules/admin/dealer-master-setup/data/dealerMasterSetup.actions.js";
import { DEALER_LOCK_MINUTES, DEALER_MAX_FAILED_ATTEMPTS } from "@/core/dealer/dealerAuth";

export const dynamic = "force-dynamic";

const DALLAS = "America/Chicago";

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", { timeZone: DALLAS, dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { timeZone: DALLAS, dateStyle: "medium" });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "";
}

/**
 * The dealer account area: one page, every section. The session is verified
 * here on the server (the proxy only checks that a dealer cookie is present)
 * and the dealer's record is loaded once; sections then switch in the browser.
 * Dates and money are formatted here so the browser shows exactly what the
 * server rendered.
 */
export default async function DealerAccountPage() {
  const [data, states] = await Promise.all([loadDealerAccountData(), loadUsStatesAction()]);
  if (data.status !== "ok") redirect("/dealer/login");

  return (
    <DealerAccountWorkspace
      dealer={data.dealer}
      username={data.username}
      states={states}
      creditLimitText={formatMoney(data.dealer.credit_limit)}
      dealerSinceText={formatDate(data.dealer.created_at)}
      lastLoginText={formatDateTime(data.lastLoginAt)}
      lockAttempts={DEALER_MAX_FAILED_ATTEMPTS}
      lockMinutes={DEALER_LOCK_MINUTES}
      files={data.files}
      projects={data.projects}
    />
  );
}
