import "server-only";
import { cache } from "react";
import { getCurrentSession } from "@/core/auth/session.service";
import { userIdCanOpenPage } from "@/core/auth/pageAccess.server.js";
import dealerMasterSetupModule from "../index.js";

// Who may use Dealer Master Setup (enroll dealers, log in as a dealer,
// activate/deactivate, delete, view or set dealer logins) is decided in Card
// Module Setup: a user needs an active role that is given the card opening this
// page. Re-read from the database on every call, so removing it works at once.
export const DEALER_ADMIN_NO_ACCESS =
  `You need access to ${dealerMasterSetupModule?.name || "Dealer Master Setup"}. Ask an admin to give your role its card in Card Module Setup.`;

/** True when the user may manage dealers. Also used by the dealer portal's staff view. */
export async function userHasDealerAdminRole(userId) {
  return userIdCanOpenPage(userId, dealerMasterSetupModule);
}

/**
 * The signed-in staff session when it may manage dealers, otherwise null.
 * Cached for the current request only: the page and the actions it calls
 * share one check, while every new request (each save) checks again.
 */
export const getDealerAdminSession = cache(async () => {
  const session = await getCurrentSession();
  if (!session?.userId) return null;
  return (await userHasDealerAdminRole(session.userId)) ? session : null;
});

/** Same as getDealerAdminSession, but throws for anyone who may not manage dealers. */
export async function requireDealerAdmin() {
  const session = await getDealerAdminSession();
  if (!session) throw Object.assign(new Error(DEALER_ADMIN_NO_ACCESS), { expected: true });
  return session;
}
